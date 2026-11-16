import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getMember, memberEmail } from "@/lib/auth";
import { connectDB } from "@board/lib/mongodb";
import { bootstrapMember } from "@board/lib/org-bootstrap";
import { Member, type MemberDoc } from "@board/models/Member";

/**
 * Resolves the Board Member for whoever is signed in to the portal. Board has no login of its own:
 * the portal session (`@/lib/auth`, re-checked against the database) says who it is, the portal
 * member's `apps` say whether they may use Board, and their email links them to a Board Member,
 * created on first visit. Returns null when nobody is signed in; a signed-in member without Board
 * access gets a 404, the same as other gated portal pages. Memoized per request via cache().
 */
export const getCurrentMember = cache(async (): Promise<MemberDoc | null> => {
  const portal = await getMember();
  if (!portal) return null;
  const email = memberEmail(portal);
  if (!portal.apps.includes("board") || !email) notFound();

  await connectDB();
  const existing = await Member.findOne({ email }).lean<MemberDoc>();
  if (existing) return existing;
  const created = await bootstrapMember({ name: portal.fullName, email });
  return created.toObject() as MemberDoc;
});

export type BoardSession = {
  user: { name: string; email: string; orgRole: MemberDoc["orgRole"] };
} | null;

export function boardSession(member: MemberDoc | null): BoardSession {
  return member ? { user: { name: member.name, email: member.email, orgRole: member.orgRole } } : null;
}
