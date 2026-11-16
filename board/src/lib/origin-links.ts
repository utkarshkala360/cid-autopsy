import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@board/lib/mongodb";
import { Customer } from "@board/models/Customer";
import { WorkItem } from "@board/models/WorkItem";
import { resolveTeamRole } from "@board/lib/authz";
import type { MemberDoc } from "@board/models/Member";
import { type OriginKind } from "@board/lib/origin-types";

export type OriginView = {
  kind: OriginKind;
  id: string;
  viewable: boolean;
  label: string;
  href: string | null;
};

/**
 * XM-1: resolves an "originated from" reference for display — the same
 * "restricted, not a leak or a broken link" treatment ORG-6 cross-team
 * links already give a Work Item on a Team the requester can't see
 * (src/lib/work-item-links.ts). A Customer origin has no such boundary —
 * every non-Guest role has read access to Customer records (Phase 6).
 */
export async function resolveOrigin(
  kind: OriginKind | null | undefined,
  id: mongoose.Types.ObjectId | string | null | undefined,
  requester: MemberDoc
): Promise<OriginView | null> {
  if (!kind || !id) return null;
  await connectDB();

  if (kind === "customer") {
    const customer = await Customer.findOne(
      { _id: id, organizationId: requester.organizationId },
      "name"
    ).lean<{ _id: mongoose.Types.ObjectId; name: string }>();
    if (!customer) {
      return { kind, id: String(id), viewable: false, label: "Deleted Customer", href: null };
    }
    return {
      kind,
      id: String(customer._id),
      viewable: true,
      label: customer.name,
      href: `/dashboard/board/customers/${customer._id}`,
    };
  }

  const item = await WorkItem.findOne(
    { _id: id, organizationId: requester.organizationId },
    "title key teamId"
  ).lean<{ _id: mongoose.Types.ObjectId; title: string; key: string; teamId: mongoose.Types.ObjectId }>();
  if (!item) {
    return { kind, id: String(id), viewable: false, label: "Deleted Work Item", href: null };
  }

  const role = await resolveTeamRole(requester, String(item.teamId));
  if (!role) {
    return {
      kind,
      id: String(item._id),
      viewable: false,
      label: "Restricted Work Item — no access to its Team",
      href: null,
    };
  }

  return {
    kind,
    id: String(item._id),
    viewable: true,
    label: `${item.key} — ${item.title}`,
    href: `/dashboard/board/teams/${item.teamId}/work-items/${item._id}`,
  };
}

/**
 * Validates an incoming { originatedFromKind, originatedFromId } pair at
 * the API boundary (same pattern as customerId/initiativeId — the schema
 * stays generic, ORG-4). A "work_item" origin requires the requester to
 * have at least Viewer on the origin item's own Team — you can't mark
 * something as originating from a Work Item you can't see, same rule
 * cross-team linking (ORG-6) already enforces on creation. `selfId`
 * excludes the owning Work Item itself as a valid origin target.
 */
export async function validateOriginInput(
  kind: OriginKind | null | undefined,
  id: string | null | undefined,
  requester: MemberDoc,
  selfId?: string
): Promise<{ ok: true; kind: OriginKind | null; id: string | null } | { ok: false; error: string }> {
  if (!kind || !id) return { ok: true, kind: null, id: null };

  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, error: "Invalid origin reference." };
  }

  await connectDB();

  if (kind === "customer") {
    const customer = await Customer.findOne({
      _id: id,
      organizationId: requester.organizationId,
    }).lean();
    if (!customer) return { ok: false, error: "That Customer doesn't exist." };
    return { ok: true, kind, id };
  }

  if (selfId && id === selfId) {
    return { ok: false, error: "A Work Item can't originate from itself." };
  }
  const item = await WorkItem.findOne(
    { _id: id, organizationId: requester.organizationId },
    "teamId"
  ).lean<{ _id: mongoose.Types.ObjectId; teamId: mongoose.Types.ObjectId }>();
  if (!item) return { ok: false, error: "That Work Item doesn't exist." };
  const role = await resolveTeamRole(requester, String(item.teamId));
  if (!role) {
    return { ok: false, error: "You don't have access to that Work Item's Team." };
  }
  return { ok: true, kind, id };
}
