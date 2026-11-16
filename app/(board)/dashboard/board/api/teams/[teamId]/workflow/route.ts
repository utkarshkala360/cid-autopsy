import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamRole } from "@board/lib/authz";
import { getEffectiveWorkflow } from "@board/lib/workflow";
import { connectDB } from "@board/lib/mongodb";
import { Workflow } from "@board/models/Workflow";
import { STATUS_CATEGORIES } from "@board/lib/status-categories";
import { STAGE_NUDGE_ENTITIES } from "@board/lib/stage-nudge-types";
import { getStageTrack } from "@board/lib/stage-tracks";
import { REQUIRABLE_FIELDS } from "@board/lib/transition-requirements";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "viewer");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const type = (request.nextUrl.searchParams.get("type") || "task").toLowerCase();
  const workflow = await getEffectiveWorkflow(teamId, type);
  return NextResponse.json({ workflow, type });
}

// XM-3: an optional, Team-Admin-configured suggestion — "when this status
// is set, suggest advancing the linked Customer's/Initiative's macro
// stage." Shape validated here; the actual stage KEY is checked against the
// live StageTrack further down in PUT (Phase 16 — was a fixed
// JOURNEY_STAGE_KEYS/LIFECYCLE_STAGE_KEYS array, now dynamic, so this can't
// be a synchronous Zod refine anymore). Applied (never auto-applied —
// CJ-3/PL-3) in the Work Item PATCH route.
const stageNudgeSchema = z
  .object({
    entity: z.enum(STAGE_NUDGE_ENTITIES),
    stage: z.string().trim().min(1).max(40),
  })
  .nullable()
  .optional();

const statusSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "Status key must be lowercase letters, numbers, or underscores."),
  label: z.string().trim().min(1).max(60),
  category: z.enum(STATUS_CATEGORIES),
  stageNudge: stageNudgeSchema,
  // BD-5: optional soft column limit — null/undefined means "no limit."
  wipLimit: z.number().int().min(1).max(999).nullable().optional(),
});

const putSchema = z.object({
  type: z.string().trim().toLowerCase().min(1).max(40),
  statuses: z.array(statusSchema).min(1, "At least one status is required."),
  transitions: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      // WF-4: unknown values are dropped rather than rejected, so this
      // route never has to change if a future phase adds another
      // requirable field to the fixed set below without a matching schema
      // bump here.
      requiredFields: z
        .array(z.string())
        .default([])
        .transform((values) => values.filter((v) => (REQUIRABLE_FIELDS as readonly string[]).includes(v))),
    })
  ),
});

// Team Admin (or Org Admin, inherited) only — WF-1.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "admin");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid workflow." },
      { status: 400 }
    );
  }
  const { type, statuses, transitions } = parsed.data;

  const keys = new Set(statuses.map((s) => s.key));
  if (keys.size !== statuses.length) {
    return NextResponse.json({ error: "Status keys must be unique." }, { status: 400 });
  }
  for (const t of transitions) {
    if (!keys.has(t.from) || !keys.has(t.to)) {
      return NextResponse.json(
        { error: "Transitions can only reference defined statuses." },
        { status: 400 }
      );
    }
  }

  const nudges = statuses.map((s) => s.stageNudge).filter((n): n is NonNullable<typeof n> => !!n);
  if (nudges.length > 0) {
    const [customerTrack, initiativeTrack] = await Promise.all([
      getStageTrack(authz.member.organizationId, "customer"),
      getStageTrack(authz.member.organizationId, "initiative"),
    ]);
    for (const n of nudges) {
      const track = n.entity === "journeyStage" ? customerTrack : initiativeTrack;
      if (!track?.stages.some((s) => s.key === n.stage)) {
        return NextResponse.json({ error: "Not a valid stage for that entity." }, { status: 400 });
      }
    }
  }

  await connectDB();
  const workflow = await Workflow.findOneAndUpdate(
    { teamId, type },
    { teamId, type, statuses, transitions },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return NextResponse.json({ workflow });
}
