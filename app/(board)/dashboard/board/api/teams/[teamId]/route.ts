import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireOrgAdmin } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Team } from "@board/models/Team";
import { getWorkItemTemplateDefs } from "@board/lib/work-item-templates";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  active: z.boolean().optional(),
  // Which WT-1 template (Task/Ticket, or any Org-Admin-added template) this
  // Team's Work Items pages/board query by default (ORG-4) — enabling a new
  // Team type is this one field, no new page or component. Phase 16
  // (Design 3): validated against the live WorkItemTemplateDef registry
  // below instead of a fixed Zod enum.
  primaryWorkItemType: z.string().trim().toLowerCase().min(1).max(40).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const authz = await requireOrgAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const { teamId } = await params;
  if (!mongoose.isValidObjectId(teamId)) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (
    !parsed.success ||
    (parsed.data.name === undefined &&
      parsed.data.active === undefined &&
      parsed.data.primaryWorkItemType === undefined)
  ) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await connectDB();
  const team = await Team.findOne({
    _id: teamId,
    organizationId: authz.member.organizationId,
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  if (parsed.data.name !== undefined) team.name = parsed.data.name;
  if (parsed.data.active !== undefined) team.active = parsed.data.active;
  if (parsed.data.primaryWorkItemType !== undefined) {
    const templates = await getWorkItemTemplateDefs(authz.member.organizationId);
    if (!templates.some((t) => t.key === parsed.data.primaryWorkItemType)) {
      return NextResponse.json({ error: "That Work Item template doesn't exist." }, { status: 400 });
    }
    team.primaryWorkItemType = parsed.data.primaryWorkItemType;
  }
  await team.save();

  return NextResponse.json({ team });
}
