import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSelfOrOrgAdmin } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Member } from "@board/models/Member";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

// A Member may edit their own profile; an Org Admin may edit anyone's
// (requireSelfOrOrgAdmin) — no other role may touch someone else's.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params;
  const authz = await requireSelfOrOrgAdmin(memberId);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
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

  if (parsed.data.name !== undefined) member.name = parsed.data.name;
  await member.save();

  return NextResponse.json({
    member: { id: String(member._id), name: member.name, email: member.email, avatarUrl: member.avatarUrl },
  });
}
