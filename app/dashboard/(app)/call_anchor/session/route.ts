import { getMember } from "@/lib/auth";
import { getCallAnchorSession } from "@/lib/callanchor/session";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const member = await getMember();
  if (!member) return Response.json({ status: "signed-out" }, { status: 401, headers: NO_STORE });
  const { status } = await getCallAnchorSession(member.id);
  return Response.json({ status }, { headers: NO_STORE });
}
