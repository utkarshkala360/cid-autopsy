import { NextResponse } from "next/server";
import { getCurrentMember } from "@board/lib/get-current-member";
import { listNotificationsForMember } from "@board/lib/notifications";

// Always scoped to the caller's own recipientId — no Team-role check is
// needed or meaningful here, which is exactly what makes this route safe
// for a Guest with no Team role anywhere (MB-5: identical path for everyone).
export async function GET() {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { notifications, unreadCount } = await listNotificationsForMember(member._id);
  return NextResponse.json({ notifications, unreadCount });
}
