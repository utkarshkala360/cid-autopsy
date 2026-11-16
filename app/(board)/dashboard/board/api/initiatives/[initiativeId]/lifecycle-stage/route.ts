import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireOrgAdmin } from "@board/lib/authz";
import { recordInitiativeStageChange } from "@board/lib/work-item-history";
import { connectDB } from "@board/lib/mongodb";
import { Initiative } from "@board/models/Initiative";
import { getStageTrack } from "@board/lib/stage-tracks";

const patchSchema = z.object({
  lifecycleStage: z.string().trim().min(1).max(40).nullable(),
});

// PL-1: "editable only by Org Admin" — a stricter floor than the rest of
// Initiative's fields (name/description are requireAnyTeamAdmin, Phase 7),
// so this gets its own route rather than folding into the existing PATCH
// /api/initiatives/[initiativeId].
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ initiativeId: string }> }
) {
  const authz = await requireOrgAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const { initiativeId } = await params;
  if (!mongoose.isValidObjectId(initiativeId)) {
    return NextResponse.json({ error: "Initiative not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid stage." },
      { status: 400 }
    );
  }

  await connectDB();
  const track = await getStageTrack(authz.member.organizationId, "initiative");
  if (!track?.enabled) {
    return NextResponse.json(
      { error: "The Product Lifecycle Stage Track is not enabled for this Organization." },
      { status: 400 }
    );
  }
  if (
    parsed.data.lifecycleStage !== null &&
    !track.stages.some((s) => s.key === parsed.data.lifecycleStage)
  ) {
    return NextResponse.json({ error: "Not a valid stage for this Stage Track." }, { status: 400 });
  }

  const initiative = await Initiative.findOne({
    _id: initiativeId,
    organizationId: authz.member.organizationId,
  });
  if (!initiative) {
    return NextResponse.json({ error: "Initiative not found." }, { status: 404 });
  }

  const oldValue = initiative.lifecycleStage ?? null;
  const newValue = parsed.data.lifecycleStage;
  if (oldValue !== newValue) {
    initiative.lifecycleStage = newValue;
    await initiative.save();
    await recordInitiativeStageChange({
      initiativeId: initiative._id,
      memberId: authz.member._id,
      oldValue,
      newValue,
    });
  }

  return NextResponse.json({ initiative });
}
