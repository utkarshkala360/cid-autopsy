import { NextRequest, NextResponse } from "next/server";
import { requireWorkItemAccess } from "@board/lib/guest-access";
import { connectDB } from "@board/lib/mongodb";
import { ChangeHistory } from "@board/models/ChangeHistory";

// GET only, deliberately. There is no PATCH/PUT/DELETE handler in this file
// or anywhere else in the codebase for ChangeHistory — Non-Negotiable #5.
// Same Guest-grant bypass as the item route itself (MB-4/MB-5) — a Guest
// needs to read this item's activity feed to see the status changes and
// comments they're being notified about.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const access = await requireWorkItemAccess(teamId, itemId);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  await connectDB();
  const history = await ChangeHistory.find({ workItemId: itemId, teamId })
    .sort({ createdAt: 1 })
    .lean();

  return NextResponse.json({ history });
}
