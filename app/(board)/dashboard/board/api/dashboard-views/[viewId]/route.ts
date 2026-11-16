import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMember } from "@board/lib/get-current-member";
import { requireAnyTeamAdmin, requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { DashboardView } from "@board/models/DashboardView";
import { widgetInstanceSchema } from "@board/lib/dashboard-view-schema";

// Its creator can always edit/delete their own View. Cleaning up a shared
// View someone else made differs by scope, mirroring each surface's own
// precedent exactly: a TEAM-level View (teamId set) follows SavedView's
// "creator or Team Admin on this Team" rule; an ORG-level View (teamId
// null) follows requireAnyTeamAdmin() (Team Admin on any Team, or Org
// Admin via inheritance) — the same floor Customer/Initiative cleanup
// already uses for an Org-level entity with no single owning Team. Neither
// floor applies at create time (see route.ts's POST) — only here.
async function requireDashboardViewOwnerOrAdmin(viewId: string) {
  const member = await getCurrentMember();
  if (!member) {
    return { ok: false as const, status: 401 as const, message: "Not authenticated." };
  }

  await connectDB();
  const view = await DashboardView.findOne({ _id: viewId, organizationId: member.organizationId });
  if (!view) {
    return { ok: false as const, status: 404 as const, message: "View not found." };
  }

  const isOwner = String(view.createdBy) === String(member._id);
  if (isOwner) {
    return { ok: true as const, member, view };
  }

  if (view.teamId) {
    const teamAuthz = await requireTeamRole(String(view.teamId), "admin");
    if (!teamAuthz.ok) {
      return { ok: false as const, status: 403 as const, message: "You can only manage your own Views." };
    }
    return { ok: true as const, member, view };
  }

  const adminCheck = await requireAnyTeamAdmin();
  if (!adminCheck.ok) {
    return { ok: false as const, status: 403 as const, message: "You can only manage your own Views." };
  }
  return { ok: true as const, member, view };
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  visibility: z.enum(["self", "shared"]).optional(),
  config: z.object({ widgets: z.array(widgetInstanceSchema) }).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  const { viewId } = await params;
  const access = await requireDashboardViewOwnerOrAdmin(viewId);
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

  // Sharing a TEAM-level View still requires Member+ (the Team-visibility
  // rule this feature never overrode) — a Viewer who somehow still owns the
  // View (e.g. was demoted after creating it) can't upgrade it to shared.
  if (parsed.data.visibility === "shared" && access.view.teamId) {
    const teamAuthz = await requireTeamRole(String(access.view.teamId), "member");
    if (!teamAuthz.ok) {
      return NextResponse.json(
        { error: "Team Member or Admin access required to share a View with everyone." },
        { status: 403 }
      );
    }
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
  { params }: { params: Promise<{ viewId: string }> }
) {
  const { viewId } = await params;
  const access = await requireDashboardViewOwnerOrAdmin(viewId);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  await access.view.deleteOne();
  return NextResponse.json({ ok: true });
}
