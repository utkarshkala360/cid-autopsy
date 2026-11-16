import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamRole } from "@board/lib/authz";
import { loadTeamWorkItem } from "@board/lib/work-items";
import { recordFieldChanges } from "@board/lib/work-item-history";
import { connectDB } from "@board/lib/mongodb";
import { Member } from "@board/models/Member";

// Team Member and above may add/remove Collaborators — deliberately not
// restricted to the reporter the way Guest access grants are (guests/route.ts),
// since a Collaborator gets no access, just notifications (same reach as an
// @mention). Team Viewer and Guest may not manage the list.
async function requireCollaboratorPermission(teamId: string, itemId: string) {
  const authz = await requireTeamRole(teamId, "member");
  if (!authz.ok) return authz;

  const item = await loadTeamWorkItem(teamId, itemId);
  if (!item) return { ok: false as const, status: 404 as const, message: "Work Item not found." };

  return { ok: true as const, member: authz.member, item };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const access = await requireCollaboratorPermission(teamId, itemId);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  await connectDB();
  const members = access.item.collaborators?.length
    ? await Member.find({ _id: { $in: access.item.collaborators } }, "name email").lean()
    : [];

  return NextResponse.json({
    collaborators: members.map((m) => ({ id: String(m._id), name: m.name, email: m.email })),
  });
}

const addSchema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const access = await requireCollaboratorPermission(teamId, itemId);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
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

  const item = access.item;
  const before = (item.collaborators ?? []).map(String);
  if (before.includes(String(target._id))) {
    return NextResponse.json(
      { collaborator: { id: String(target._id), name: target.name, email: target.email } },
      { status: 200 }
    );
  }

  item.collaborators = [...(item.collaborators ?? []), target._id];
  await item.save();

  await recordFieldChanges({
    workItemId: item._id,
    teamId,
    memberId: access.member._id,
    diffs: [{ field: "collaborators", oldValue: before, newValue: [...before, String(target._id)] }],
  });

  return NextResponse.json(
    { collaborator: { id: String(target._id), name: target.name, email: target.email } },
    { status: 201 }
  );
}
