import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireTeamRole } from "@board/lib/authz";
import { loadTeamWorkItem } from "@board/lib/work-items";
import { getLinksForWorkItem } from "@board/lib/work-item-links";
import { LINK_FORM_OPTIONS } from "@board/lib/link-types";
import { connectDB } from "@board/lib/mongodb";
import { WorkItem } from "@board/models/WorkItem";
import { WorkItemLink } from "@board/models/WorkItemLink";

// ORG-6: cross-team linking, same mechanism as IT-2 extended across Team
// boundaries. GET returns every link touching this item from either
// direction — visible from both sides (see src/lib/work-item-links.ts).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const authz = await requireTeamRole(teamId, "viewer");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const item = await loadTeamWorkItem(teamId, itemId);
  if (!item) {
    return NextResponse.json({ error: "Work Item not found." }, { status: 404 });
  }

  const links = await getLinksForWorkItem(itemId, authz.member);
  return NextResponse.json({ links });
}

const postSchema = z.object({
  targetItemId: z.string().trim().min(1),
  relation: z.enum(LINK_FORM_OPTIONS.map((o) => o.value) as [string, ...string[]]),
});

// Team Member and above may link Work Items (matches create/edit floor in
// the Roles & Permissions Matrix). The requester must also have at least
// Viewer on the *target* item's Team — you can't link to a Team you can't
// see (Non-Negotiable #4/#9, same authz.ts entry point every other route
// uses).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const authz = await requireTeamRole(teamId, "member");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const sourceItem = await loadTeamWorkItem(teamId, itemId);
  if (!sourceItem) {
    return NextResponse.json({ error: "Work Item not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  if (!mongoose.isValidObjectId(parsed.data.targetItemId)) {
    return NextResponse.json({ error: "That Work Item doesn't exist." }, { status: 400 });
  }
  if (parsed.data.targetItemId === itemId) {
    return NextResponse.json({ error: "A Work Item can't be linked to itself." }, { status: 400 });
  }

  await connectDB();
  const targetItem = await WorkItem.findById(parsed.data.targetItemId).lean<{
    _id: mongoose.Types.ObjectId;
    teamId: mongoose.Types.ObjectId;
  }>();
  if (!targetItem) {
    return NextResponse.json({ error: "That Work Item doesn't exist." }, { status: 400 });
  }

  const targetAuthz = await requireTeamRole(String(targetItem.teamId), "viewer");
  if (!targetAuthz.ok) {
    return NextResponse.json(
      { error: "You don't have access to the target Work Item's Team." },
      { status: 403 }
    );
  }

  const option = LINK_FORM_OPTIONS.find((o) => o.value === parsed.data.relation)!;
  const fromWorkItemId = option.swap ? parsed.data.targetItemId : itemId;
  const toWorkItemId = option.swap ? itemId : parsed.data.targetItemId;

  const existing = await WorkItemLink.findOne({
    fromWorkItemId,
    toWorkItemId,
    type: option.type,
  }).lean();
  if (existing) {
    return NextResponse.json({ error: "That link already exists." }, { status: 400 });
  }

  const link = await WorkItemLink.create({
    organizationId: authz.member.organizationId,
    fromWorkItemId,
    toWorkItemId,
    type: option.type,
    createdBy: authz.member._id,
  });

  const links = await getLinksForWorkItem(itemId, authz.member);
  return NextResponse.json({ link, links }, { status: 201 });
}
