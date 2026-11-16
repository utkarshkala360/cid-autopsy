import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { SavedView } from "@board/models/SavedView";

// Its creator can always edit/delete their own View; a Team Admin (or Org
// Admin, via the same inheritance every other Team permission uses) can
// also manage a "team" View someone else made — same "someone needs to be
// able to clean up shared state" reasoning as Team Admin managing
// Workflow/Custom Fields.
async function requireViewOwnerOrAdmin(teamId: string, viewId: string) {
  const authz = await requireTeamRole(teamId, "viewer");
  if (!authz.ok) return authz;

  await connectDB();
  const view = await SavedView.findOne({ _id: viewId, teamId });
  if (!view) {
    return { ok: false as const, status: 404 as const, message: "View not found." };
  }

  const isOwner = String(view.createdBy) === String(authz.member._id);
  const isAdmin = authz.role === "admin";
  if (!isOwner && !isAdmin) {
    return { ok: false as const, status: 403 as const, message: "You can only manage your own Views." };
  }

  return { ok: true as const, member: authz.member, view };
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  visibility: z.enum(["self", "team"]).optional(),
  config: z
    .object({
      filters: z.object({ groups: z.array(z.unknown()) }),
      sort: z.array(z.unknown()),
      groupBy: z.string().nullable(),
    })
    .optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; viewId: string }> }
) {
  const { teamId, viewId } = await params;
  const access = await requireViewOwnerOrAdmin(teamId, viewId);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  if (parsed.data.name !== undefined) access.view.name = parsed.data.name;
  if (parsed.data.visibility !== undefined) access.view.visibility = parsed.data.visibility;
  if (parsed.data.config !== undefined) access.view.config = parsed.data.config;
  await access.view.save();

  return NextResponse.json({
    view: {
      id: String(access.view._id),
      name: access.view.name,
      visibility: access.view.visibility,
      config: access.view.config,
      mine: String(access.view.createdBy) === String(access.member._id),
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; viewId: string }> }
) {
  const { teamId, viewId } = await params;
  const access = await requireViewOwnerOrAdmin(teamId, viewId);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  await access.view.deleteOne();
  return NextResponse.json({ ok: true });
}
