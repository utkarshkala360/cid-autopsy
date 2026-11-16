import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentMember } from "@board/lib/get-current-member";
import { connectDB } from "@board/lib/mongodb";
import { Notification } from "@board/models/Notification";

// Mark-as-read only — scoped to recipientId so a Member can only ever touch
// their own notifications, never another Member's (including a Guest's).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { notificationId } = await params;
  if (!mongoose.isValidObjectId(notificationId)) {
    return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  }

  await connectDB();
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipientId: member._id },
    { read: true },
    { new: true }
  );
  if (!notification) {
    return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
