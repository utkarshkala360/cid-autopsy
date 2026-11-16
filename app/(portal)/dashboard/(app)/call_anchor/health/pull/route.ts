import { NextResponse, type NextRequest } from "next/server";
import { getMember } from "@/lib/auth";
import { readPullJob, startPullJob } from "@/lib/callanchor/pull-job";
import { storedCookie } from "@/lib/callanchor/session";

// The background pull (owner, 2026-11-13): POST starts it and answers at once, GET reports how far
// it got. A plain fetch, not a server action, so it never sits in the router's queue with a page
// change. The job itself runs after the POST's response, inside this route's time limit.
export const maxDuration = 300;

const ID_PATTERN = /^[\w-]{1,100}$/;
const clientOf = (request: NextRequest) => {
  const id = request.nextUrl.searchParams.get("client");
  return id && ID_PATTERN.test(id) ? id : null;
};
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  if (!(await getMember())) return NextResponse.json({ error: "signed out" }, { status: 401, headers: noStore });
  return NextResponse.json({ status: await readPullJob(clientOf(request)) }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  // Only this site's pages start a pull.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "cross-site" }, { status: 403, headers: noStore });
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "signed out" }, { status: 401, headers: noStore });
  const cookie = await storedCookie(member.id);
  if (!cookie) return NextResponse.json({ verify: true }, { headers: noStore });
  const clientId = clientOf(request);
  // `?force=1` is the Refresh button: past the 5-minute wait, at most once in 30 seconds.
  const state = await startPullJob(cookie, clientId, request.nextUrl.searchParams.get("force") === "1");
  return NextResponse.json({ state, status: await readPullJob(clientId) }, { headers: noStore });
}
