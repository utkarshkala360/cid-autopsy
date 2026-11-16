import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireAnyTeamAdmin } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Initiative } from "@board/models/Initiative";
import { GuestGrant, type GuestGrantDoc } from "@board/models/GuestGrant";
import { Member } from "@board/models/Member";

// Initiative isn't owned by one Team, so grant permission mirrors Initiative
// creation itself (Phase 7 precedent): Org Admin, or any Team Admin.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ initiativeId: string }> }
) {
  const { initiativeId } = await params;
  const authz = await requireAnyTeamAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  await connectDB();
  const grants = await GuestGrant.find({ initiativeId })
    .populate("memberId", "name email")
    .sort({ createdAt: 1 })
    .lean<(GuestGrantDoc & { memberId: { _id: unknown; name: string; email: string } | null })[]>();

  return NextResponse.json({
    grants: grants
      .filter((g) => g.memberId)
      .map((g) => ({ id: String(g._id), memberName: g.memberId!.name, memberEmail: g.memberId!.email })),
  });
}

const grantSchema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ initiativeId: string }> }
) {
  const { initiativeId } = await params;
  const authz = await requireAnyTeamAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }
  if (!mongoose.isValidObjectId(initiativeId)) {
    return NextResponse.json({ error: "Initiative not found." }, { status: 404 });
  }

  await connectDB();
  const initiative = await Initiative.findOne({
    _id: initiativeId,
    organizationId: authz.member.organizationId,
  });
  if (!initiative) {
    return NextResponse.json({ error: "Initiative not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  const target = await Member.findOne({
    email: parsed.data.email,
    organizationId: authz.member.organizationId,
  });
  if (!target) {
    return NextResponse.json({ error: "No Member with that email." }, { status: 404 });
  }

  const grant = await GuestGrant.findOneAndUpdate(
    { memberId: target._id, initiativeId },
    {
      memberId: target._id,
      initiativeId,
      scope: "initiative",
      organizationId: authz.member.organizationId,
      grantedBy: authz.member._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return NextResponse.json(
    { grant: { id: String(grant._id), memberName: target.name, memberEmail: target.email } },
    { status: 201 }
  );
}
