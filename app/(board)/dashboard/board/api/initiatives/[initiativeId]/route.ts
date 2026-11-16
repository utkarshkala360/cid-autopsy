import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireAnyTeamAdmin, requireTeamRole } from "@board/lib/authz";
import { getCurrentMember } from "@board/lib/get-current-member";
import { connectDB } from "@board/lib/mongodb";
import { Initiative } from "@board/models/Initiative";
import { validateOriginInput } from "@board/lib/origin-links";
import { ORIGIN_KINDS } from "@board/lib/origin-types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ initiativeId: string }> }
) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { initiativeId } = await params;
  if (!mongoose.isValidObjectId(initiativeId)) {
    return NextResponse.json({ error: "Initiative not found." }, { status: 404 });
  }

  await connectDB();
  const initiative = await Initiative.findOne({
    _id: initiativeId,
    organizationId: member.organizationId,
  }).lean();
  if (!initiative) {
    return NextResponse.json({ error: "Initiative not found." }, { status: 404 });
  }

  return NextResponse.json({ initiative });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  // XM-1: "originated from" — same coupled-pair rule as WorkItem's PATCH.
  originatedFromKind: z.enum(ORIGIN_KINDS).nullable().optional(),
  originatedFromId: z.string().nullable().optional(),
  // Phase 16 (Design 2): only meaningful on a Team-run Initiative
  // (`teamId` set), and — same rule Sprint's own PATCH always had —
  // editable only while `sprintStatus: "planned"`; once started, the
  // planned window is history, not a draft. Gated separately below,
  // stricter than name/description's requireAnyTeamAdmin().
  sprintGoal: z.string().trim().max(2000).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ initiativeId: string }> }
) {
  const authz = await requireAnyTeamAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const { initiativeId } = await params;
  if (!mongoose.isValidObjectId(initiativeId)) {
    return NextResponse.json({ error: "Initiative not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (
    !parsed.success ||
    (parsed.data.name === undefined &&
      parsed.data.description === undefined &&
      parsed.data.originatedFromKind === undefined &&
      parsed.data.originatedFromId === undefined &&
      parsed.data.sprintGoal === undefined &&
      parsed.data.startDate === undefined &&
      parsed.data.endDate === undefined)
  ) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await connectDB();
  const initiative = await Initiative.findOne({
    _id: initiativeId,
    organizationId: authz.member.organizationId,
  });
  if (!initiative) {
    return NextResponse.json({ error: "Initiative not found." }, { status: 404 });
  }

  if (parsed.data.name !== undefined) initiative.name = parsed.data.name;
  if (parsed.data.description !== undefined) initiative.description = parsed.data.description;

  if (
    parsed.data.sprintGoal !== undefined ||
    parsed.data.startDate !== undefined ||
    parsed.data.endDate !== undefined
  ) {
    if (!initiative.teamId) {
      return NextResponse.json(
        { error: "Only a Team-run Initiative has a Sprint goal or dates." },
        { status: 400 }
      );
    }
    if (initiative.sprintStatus !== "planned") {
      return NextResponse.json(
        { error: "A Sprint's window can only be edited while it's still planned." },
        { status: 400 }
      );
    }
    // Stricter than name/description: editing a Team-run Initiative's
    // Sprint fields requires Team Admin on ITS OWN Team, not just
    // "admin somewhere" (requireAnyTeamAdmin above is the floor for the
    // ordinary-tag fields only).
    const teamAuthz = await requireTeamRole(String(initiative.teamId), "admin");
    if (!teamAuthz.ok) {
      return NextResponse.json({ error: teamAuthz.message }, { status: teamAuthz.status });
    }
    if (parsed.data.sprintGoal !== undefined) initiative.sprintGoal = parsed.data.sprintGoal;
    if (parsed.data.startDate !== undefined) {
      const d = new Date(parsed.data.startDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
      }
      initiative.startDate = d;
    }
    if (parsed.data.endDate !== undefined) {
      const d = new Date(parsed.data.endDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid end date." }, { status: 400 });
      }
      initiative.endDate = d;
    }
  }

  if (parsed.data.originatedFromKind !== undefined || parsed.data.originatedFromId !== undefined) {
    const kind = parsed.data.originatedFromKind ?? null;
    const id = parsed.data.originatedFromId ?? null;
    if ((kind === null) !== (id === null)) {
      return NextResponse.json(
        { error: "Origin type and reference must be set or cleared together." },
        { status: 400 }
      );
    }
    const validated = await validateOriginInput(kind, id, authz.member);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    initiative.originatedFromKind = validated.kind;
    initiative.originatedFromId = validated.id;
  }

  await initiative.save();

  return NextResponse.json({ initiative });
}
