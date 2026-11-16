import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamRole } from "@board/lib/authz";
import { loadTeamWorkItem } from "@board/lib/work-items";
import { connectDB } from "@board/lib/mongodb";
import { Team } from "@board/models/Team";
import { WorkLog } from "@board/models/WorkLog";
import { recordWorkLogChange } from "@board/lib/work-item-history";
import { recomputeWorkItemActualTotal } from "@board/lib/work-log-reports";

function startOfUtcDay(input: string): Date | null {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// WL-3: any Team Viewer+ (including a Guest granted this item — matches the
// "View Team's items, boards, reports" row of the Roles & Permissions
// Matrix) can read the log; only Team Member+ can write (POST below).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const authz = await requireTeamRole(teamId, "viewer");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  await connectDB();
  const entries = await WorkLog.find({ workItemId: itemId, teamId })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  return NextResponse.json({ entries });
}

const postSchema = z.object({
  date: z.string(),
  amount: z.number().positive().finite(),
  note: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const authz = await requireTeamRole(teamId, "member");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const item = await loadTeamWorkItem(teamId, itemId);
  if (!item) {
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

  await connectDB();
  const team = await Team.findById(teamId, "timeTrackingUnit").lean<{
    timeTrackingUnit: "story_points" | "hours_minutes" | null;
  }>();
  if (!team?.timeTrackingUnit) {
    return NextResponse.json(
      { error: "This Team hasn't turned on time tracking." },
      { status: 400 }
    );
  }

  const date = startOfUtcDay(parsed.data.date);
  if (!date) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  const entry = await WorkLog.create({
    organizationId: authz.member.organizationId,
    teamId,
    workItemId: itemId,
    memberId: authz.member._id,
    date,
    amount: parsed.data.amount,
    unit: team.timeTrackingUnit,
    note: parsed.data.note ?? "",
  });

  const [history, actualTotal] = await Promise.all([
    recordWorkLogChange({
      workItemId: itemId,
      teamId,
      memberId: authz.member._id,
      action: "added",
      entryId: entry._id,
      amount: entry.amount,
      unit: entry.unit,
      date: entry.date,
    }),
    // WL-4: real-time, automatic — recomputed and persisted to WorkItem
    // right here, not on a schedule and not left as a read-time aggregate.
    recomputeWorkItemActualTotal(itemId),
  ]);

  return NextResponse.json({ entry, history, actualTotal }, { status: 201 });
}
