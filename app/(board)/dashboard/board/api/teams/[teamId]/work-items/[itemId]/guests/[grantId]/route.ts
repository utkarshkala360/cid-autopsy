import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireTeamRole } from "@board/lib/authz";
import { loadTeamWorkItem } from "@board/lib/work-items";
import { connectDB } from "@board/lib/mongodb";
import { GuestGrant } from "@board/models/GuestGrant";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string; grantId: string }> }
) {
  const { teamId, itemId, grantId } = await params;
  const authz = await requireTeamRole(teamId, "member");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const item = await loadTeamWorkItem(teamId, itemId);
  if (!item) {
    return NextResponse.json({ error: "Work Item not found." }, { status: 404 });
  }
  if (authz.role === "member" && String(item.reporter) !== String(authz.member._id)) {
    return NextResponse.json(
      { error: "Team Members may only manage Guest access on items they reported." },
      { status: 403 }
    );
  }

  if (!mongoose.isValidObjectId(grantId)) {
    return NextResponse.json({ error: "Grant not found." }, { status: 404 });
  }

  await connectDB();
  const deleted = await GuestGrant.findOneAndDelete({ _id: grantId, workItemId: itemId });
  if (!deleted) {
    return NextResponse.json({ error: "Grant not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
