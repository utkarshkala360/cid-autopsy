import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Team } from "@board/models/Team";

const patchSchema = z.object({
  // null/omitted-to-empty clears the override, falling back to the
  // template default (TEMPLATE_LABEL[primaryWorkItemType]) — see labelForTeam().
  displayLabel: z.string().trim().min(1).max(40).nullable(),
});

// ORG-8: Team Admin (or Org Admin, inherited) only — same gate as workflow
// and custom-field configuration (WF-1/WF-2), on the same config screen.
// Presentation only: this never touches WorkItem.type or any API field name.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "admin");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid label." },
      { status: 400 }
    );
  }

  await connectDB();
  const team = await Team.findById(teamId);
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  team.displayLabel = parsed.data.displayLabel;
  await team.save();

  return NextResponse.json({ team });
}
