import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireOrgAdmin } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { StageTrack } from "@board/models/StageTrack";
import { Customer } from "@board/models/Customer";
import { Initiative } from "@board/models/Initiative";
import { Team } from "@board/models/Team";
import { WorkItem } from "@board/models/WorkItem";
import type { StageTrackEntityType } from "@board/lib/stage-track-types";

const stageSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "Stage key must be lowercase letters, numbers, or underscores."),
  label: z.string().trim().min(1).max(60),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  enabled: z.boolean().optional(),
  stages: z.array(stageSchema).optional(),
});

// A Team-Admin-configured stageNudge (Workflow.statuses[].stageNudge, XM-3)
// can also reference a `customer`/`initiative` stage key — this mirrors the
// PUT /api/teams/[teamId]/workflow route, which validates against
// getStageTracks() live, so no separate check is needed here; a stage
// removed here simply stops matching any future nudge (same as any other
// stale reference).
async function countLiveUsage(entityType: StageTrackEntityType, organizationId: unknown, key: string) {
  switch (entityType) {
    case "customer":
      return Customer.countDocuments({ organizationId, journeyStage: key });
    case "initiative":
      return Initiative.countDocuments({ organizationId, lifecycleStage: key });
    case "team":
      return Team.countDocuments({ organizationId, macroStage: key });
    case "work_item":
      return WorkItem.countDocuments({ organizationId, macroStage: key });
  }
}

// No POST/DELETE — the 4 rows are fixed by entityType (StageTrack docs are
// only ever created by the self-healing seed in getStageTracks()); only
// name/enabled/stages are editable, Org Admin only (Design 1).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) {
  const authz = await requireOrgAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const { trackId } = await params;
  if (!mongoose.isValidObjectId(trackId)) {
    return NextResponse.json({ error: "Stage Track not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (
    !parsed.success ||
    (parsed.data.name === undefined && parsed.data.enabled === undefined && parsed.data.stages === undefined)
  ) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await connectDB();
  const track = await StageTrack.findOne({
    _id: trackId,
    organizationId: authz.member.organizationId,
  });
  if (!track) {
    return NextResponse.json({ error: "Stage Track not found." }, { status: 404 });
  }

  if (parsed.data.stages !== undefined) {
    const keys = new Set(parsed.data.stages.map((s) => s.key));
    if (keys.size !== parsed.data.stages.length) {
      return NextResponse.json({ error: "Stage keys must be unique." }, { status: 400 });
    }

    // Referential check: a stage key removed here can't still be in live
    // use by an entity of this track's type — same "409 + count" style
    // Workflow's transition validation and WorkItemTemplateDef's delete
    // route already use, rather than silently orphaning data.
    const oldKeys = (track.stages ?? []).map((s: { key: string }) => s.key);
    const removedKeys = oldKeys.filter((k: string) => !keys.has(k));
    if (removedKeys.length > 0) {
      const counts = await Promise.all(
        removedKeys.map((key: string) =>
          countLiveUsage(track.entityType as StageTrackEntityType, authz.member.organizationId, key)
        )
      );
      const totalInUse = counts.reduce((a, b) => a + b, 0);
      if (totalInUse > 0) {
        return NextResponse.json(
          {
            error: `${totalInUse} ${totalInUse === 1 ? "record" : "records"} still use a stage you're removing — move ${
              totalInUse === 1 ? "it" : "them"
            } to a different stage first.`,
          },
          { status: 409 }
        );
      }
    }
    track.stages = parsed.data.stages;
  }

  if (parsed.data.name !== undefined) track.name = parsed.data.name;
  if (parsed.data.enabled !== undefined) track.enabled = parsed.data.enabled;
  await track.save();

  return NextResponse.json({ track });
}
