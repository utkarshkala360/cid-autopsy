import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamRole } from "@board/lib/authz";
import { loadTeamWorkItem } from "@board/lib/work-items";
import { connectDB } from "@board/lib/mongodb";
import { GuestGrant, type GuestGrantDoc } from "@board/models/GuestGrant";
import { Member } from "@board/models/Member";

/**
 * Roles & Permissions Matrix: "Grant Guest access to a Work Item/Initiative"
 * — Team Admin may grant on any of their Team's items; a Team Member only
 * on items they own (reporter). Neither Team Viewer nor Guest may grant.
 */
async function requireGrantPermission(teamId: string, itemId: string) {
  const authz = await requireTeamRole(teamId, "member");
  if (!authz.ok) return authz;

  const item = await loadTeamWorkItem(teamId, itemId);
  if (!item) return { ok: false as const, status: 404 as const, message: "Work Item not found." };

  if (authz.role === "member" && String(item.reporter) !== String(authz.member._id)) {
    return {
      ok: false as const,
      status: 403 as const,
      message: "Team Members may only grant Guest access to items they reported.",
    };
  }

  return { ok: true as const, member: authz.member, item };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const access = await requireGrantPermission(teamId, itemId);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  await connectDB();
  const grants = await GuestGrant.find({ workItemId: itemId })
    .populate("memberId", "name email")
    .sort({ createdAt: 1 })
    .lean<(GuestGrantDoc & { memberId: { _id: unknown; name: string; email: string } | null })[]>();

  return NextResponse.json({
    grants: grants
      .filter((g) => g.memberId)
      .map((g) => ({ id: String(g._id), memberName: g.memberId!.name, memberEmail: g.memberId!.email })),
  });
}

const grantSchema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const access = await requireGrantPermission(teamId, itemId);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  await connectDB();
  const target = await Member.findOne({
    email: parsed.data.email,
    organizationId: access.member.organizationId,
  });
  if (!target) {
    return NextResponse.json({ error: "No Member with that email." }, { status: 404 });
  }

  const grant = await GuestGrant.findOneAndUpdate(
    { memberId: target._id, workItemId: itemId },
    {
      memberId: target._id,
      workItemId: itemId,
      teamId,
      scope: "work_item",
      organizationId: access.member.organizationId,
      grantedBy: access.member._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return NextResponse.json(
    { grant: { id: String(grant._id), memberName: target.name, memberEmail: target.email } },
    { status: 201 }
  );
}
