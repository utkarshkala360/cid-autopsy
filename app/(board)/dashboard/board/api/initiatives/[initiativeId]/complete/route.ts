import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Initiative } from "@board/models/Initiative";
import { completeSprint } from "@board/lib/sprints";

// BD-4: same body/gate shape as the old POST /api/teams/[teamId]/sprints/[sprintId]/complete.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ initiativeId: string }> }
) {
  const { initiativeId } = await params;
  if (!mongoose.isValidObjectId(initiativeId)) {
    return NextResponse.json({ error: "Sprint not found." }, { status: 404 });
  }

  await connectDB();
  const initiative = await Initiative.findById(initiativeId).lean<{ teamId: mongoose.Types.ObjectId | null }>();
  if (!initiative?.teamId) {
    return NextResponse.json({ error: "Sprint not found." }, { status: 404 });
  }

  const authz = await requireTeamRole(String(initiative.teamId), "member");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const error = await completeSprint(String(initiative.teamId), initiativeId, authz.member._id);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
