import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAnyTeamAdmin } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { GuestGrant } from "@board/models/GuestGrant";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ initiativeId: string; grantId: string }> }
) {
  const { initiativeId, grantId } = await params;
  const authz = await requireAnyTeamAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }
  if (!mongoose.isValidObjectId(grantId)) {
    return NextResponse.json({ error: "Grant not found." }, { status: 404 });
  }

  await connectDB();
  const deleted = await GuestGrant.findOneAndDelete({ _id: grantId, initiativeId });
  if (!deleted) {
    return NextResponse.json({ error: "Grant not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
