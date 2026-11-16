import { NextRequest, NextResponse } from "next/server";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { TeamMembership } from "@board/models/TeamMembership";

// Team Admin-only, same as POST /api/teams/[teamId]/members.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; memberId: string }> }
) {
  const { teamId, memberId } = await params;
  const authz = await requireTeamRole(teamId, "admin");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  await connectDB();
  await TeamMembership.deleteOne({ teamId, memberId });

  return NextResponse.json({ ok: true });
}
