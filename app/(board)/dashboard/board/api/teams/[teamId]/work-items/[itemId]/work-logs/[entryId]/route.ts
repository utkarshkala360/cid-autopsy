import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { WorkLog } from "@board/models/WorkLog";
import { recordWorkLogChange } from "@board/lib/work-item-history";
import { recomputeWorkItemActualTotal } from "@board/lib/work-log-reports";

function startOfUtcDay(input: string): Date | null {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// WL-3: a logged entry may be corrected by whoever logged it, or by a Team
// Admin (the same "owner or admin" correction-rights floor used nowhere
// else quite this way in the codebase — comments/attachments aren't
// user-editable at all — but it's the natural reading of "any Team Member+
// can log time" plus normal admin override).
async function loadEntryForWrite(teamId: string, itemId: string, entryId: string) {
  await connectDB();
  const entry = await WorkLog.findOne({ _id: entryId, workItemId: itemId, teamId });
  return entry;
}

const patchSchema = z.object({
  date: z.string().optional(),
  amount: z.number().positive().finite().optional(),
  note: z.string().max(500).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string; entryId: string }> }
) {
  const { teamId, itemId, entryId } = await params;
  const authz = await requireTeamRole(teamId, "member");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const entry = await loadEntryForWrite(teamId, itemId, entryId);
  if (!entry) {
    return NextResponse.json({ error: "Log entry not found." }, { status: 404 });
  }
  const isOwner = String(entry.memberId) === String(authz.member._id);
  if (!isOwner && authz.role !== "admin") {
    return NextResponse.json(
      { error: "Only the person who logged this entry, or a Team Admin, can edit it." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  if (parsed.data.date !== undefined) {
    const date = startOfUtcDay(parsed.data.date);
    if (!date) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }
    entry.date = date;
  }
  if (parsed.data.amount !== undefined) entry.amount = parsed.data.amount;
  if (parsed.data.note !== undefined) entry.note = parsed.data.note;

  await entry.save();

  const [history, actualTotal] = await Promise.all([
    recordWorkLogChange({
      workItemId: itemId,
      teamId,
      memberId: authz.member._id,
      action: "edited",
      entryId: entry._id,
      amount: entry.amount,
      unit: entry.unit,
      date: entry.date,
    }),
    recomputeWorkItemActualTotal(itemId),
  ]);

  return NextResponse.json({ entry, history, actualTotal });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string; entryId: string }> }
) {
  const { teamId, itemId, entryId } = await params;
  const authz = await requireTeamRole(teamId, "member");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const entry = await loadEntryForWrite(teamId, itemId, entryId);
  if (!entry) {
    return NextResponse.json({ error: "Log entry not found." }, { status: 404 });
  }
  const isOwner = String(entry.memberId) === String(authz.member._id);
  if (!isOwner && authz.role !== "admin") {
    return NextResponse.json(
      { error: "Only the person who logged this entry, or a Team Admin, can delete it." },
      { status: 403 }
    );
  }

  await entry.deleteOne();

  const [history, actualTotal] = await Promise.all([
    recordWorkLogChange({
      workItemId: itemId,
      teamId,
      memberId: authz.member._id,
      action: "removed",
      entryId: entry._id,
      amount: entry.amount,
      unit: entry.unit,
      date: entry.date,
    }),
    recomputeWorkItemActualTotal(itemId),
  ]);

  return NextResponse.json({ ok: true, history, actualTotal });
}
