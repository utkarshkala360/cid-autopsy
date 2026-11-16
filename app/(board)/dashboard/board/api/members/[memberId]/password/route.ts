import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireSelfOrOrgAdmin } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Member } from "@board/models/Member";

const passwordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
});

// Changing your own password requires the current one (verified below) —
// unless you don't have one yet (an OAuth-only Member setting a password
// for the first time, nothing to verify against). An Org Admin changing
// someone ELSE's password never needs the target's current password —
// that's the whole point of the escape hatch.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params;
  const authz = await requireSelfOrOrgAdmin(memberId);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = passwordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  await connectDB();
  const member = await Member.findOne({
    _id: memberId,
    organizationId: authz.member.organizationId,
  });
  if (!member) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  if (authz.isSelf && member.passwordHash) {
    if (!parsed.data.currentPassword) {
      return NextResponse.json(
        { error: "Current password is required." },
        { status: 400 }
      );
    }
    const valid = await bcrypt.compare(parsed.data.currentPassword, member.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
  }

  member.passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await member.save();

  return NextResponse.json({ ok: true });
}
