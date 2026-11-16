import { NextResponse } from "next/server";
import { getCurrentMember } from "@board/lib/get-current-member";
import { getStageTracks } from "@board/lib/stage-tracks";

// Design 1 (Phase 16): any Member may read the 4 Stage Tracks — every
// macro-stage picker across the app (Customer/Initiative/Team/Work Item)
// needs to know the live stage list and enabled flag; only an Org Admin may
// edit one (PATCH /api/stage-tracks/[trackId]). Same "read is open, write
// is Org Admin" shape /api/organization/modules used to have.
export async function GET() {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const tracks = await getStageTracks(member.organizationId);
  return NextResponse.json({ tracks });
}
