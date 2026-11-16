import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin } from "@board/lib/authz";
import { getCurrentMember } from "@board/lib/get-current-member";
import { uniqueSlugFor } from "@board/lib/teams";
import { connectDB } from "@board/lib/mongodb";
import { Team } from "@board/models/Team";
import { getWorkItemTemplateDefs } from "@board/lib/work-item-templates";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  await connectDB();
  const teams = await Team.find({ organizationId: member.organizationId })
    .sort({ name: 1 })
    .lean();

  return NextResponse.json({ teams });
}

const createTeamSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60),
  // Phase 16 (Design 3): a Team-creation-time template picker — previously
  // every Team was created as "task" and had to be switched afterward via
  // PATCH. Optional here (defaults to "task" exactly as before) so this
  // stays a purely additive change.
  primaryWorkItemType: z.string().trim().toLowerCase().min(1).max(40).optional(),
});

export async function POST(request: NextRequest) {
  const authz = await requireOrgAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = createTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid team name." },
      { status: 400 }
    );
  }

  const slug = await uniqueSlugFor(parsed.data.name);
  if (!slug) {
    return NextResponse.json({ error: "Invalid team name." }, { status: 400 });
  }

  let primaryWorkItemType = "task";
  if (parsed.data.primaryWorkItemType !== undefined) {
    const templates = await getWorkItemTemplateDefs(authz.member.organizationId);
    if (!templates.some((t) => t.key === parsed.data.primaryWorkItemType)) {
      return NextResponse.json({ error: "That Work Item template doesn't exist." }, { status: 400 });
    }
    primaryWorkItemType = parsed.data.primaryWorkItemType;
  }

  await connectDB();
  const team = await Team.create({
    name: parsed.data.name,
    slug,
    active: true,
    primaryWorkItemType,
    organizationId: authz.member.organizationId,
    createdBy: authz.member._id,
  });

  return NextResponse.json({ team }, { status: 201 });
}
