import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Member } from "@board/models/Member";
import { TeamMembership, TEAM_ROLES } from "@board/models/TeamMembership";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "viewer");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  await connectDB();
  const memberships = await TeamMembership.find({ teamId })
    .populate("memberId", "name email")
    .sort({ createdAt: 1 })
    .lean();

  return NextResponse.json({ memberships });
}

const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(TEAM_ROLES),
});

// Team Admin-only (Roles & Permissions Matrix: "Invite/remove Members,
// assign Team roles" — Org Admin org-wide, Team Admin own Team).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "admin");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or role." }, { status: 400 });
  }

  await connectDB();
  const target = await Member.findOne({
    email: parsed.data.email,
    organizationId: authz.member.organizationId,
  });
  if (!target) {
    return NextResponse.json({ error: "No Member with that email." }, { status: 404 });
  }

  const membership = await TeamMembership.findOneAndUpdate(
    { teamId, memberId: target._id },
    { role: parsed.data.role },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate("memberId", "name email");

  return NextResponse.json({ membership }, { status: 201 });
}
