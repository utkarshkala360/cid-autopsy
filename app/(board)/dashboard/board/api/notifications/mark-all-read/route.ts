import { NextResponse } from "next/server";
import { getCurrentMember } from "@board/lib/get-current-member";
import { connectDB } from "@board/lib/mongodb";
import { Notification } from "@board/models/Notification";

export async function POST() {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  await connectDB();
  await Notification.updateMany({ recipientId: member._id, read: false }, { read: true });

  return NextResponse.json({ ok: true });
}
