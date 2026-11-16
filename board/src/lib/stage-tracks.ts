import "server-only";
import { cache } from "react";
import { connectDB } from "@board/lib/mongodb";
import { StageTrack, type StageTrackDoc } from "@board/models/StageTrack";
import { Organization } from "@board/models/Organization";
import {
  STAGE_TRACK_ENTITY_TYPES,
  SEED_STAGE_TRACKS,
  type StageTrackEntityType,
  type StageDef,
} from "@board/lib/stage-track-types";

export type StageTrackLite = {
  id: string;
  entityType: StageTrackEntityType;
  name: string;
  enabled: boolean;
  stages: StageDef[];
};

function toLite(doc: StageTrackDoc): StageTrackLite {
  return {
    id: String(doc._id),
    entityType: doc.entityType as StageTrackEntityType,
    name: doc.name,
    enabled: doc.enabled,
    stages: (doc.stages ?? []).map((s) => ({ key: s.key, label: s.label })),
  };
}

/**
 * Memoized per-request via React's cache() — same pattern
 * getWorkItemTemplateDefs()/getEffectiveWorkflow() use. Self-heals all 4
 * rows into existence for an Organization that has fewer than 4 (a brand
 * new org, or — for every existing installation at the moment this phase
 * ships — one that predates this model entirely). The `customer`/
 * `initiative` rows additionally migrate Organization.moduleJourneyEnabled/
 * moduleLifecycleEnabled's current value into `enabled` at that moment, so
 * an existing installation's Module on/off state carries over exactly once,
 * byte-for-byte, with no separate migration script required.
 */
export const getStageTracks = cache(
  async (organizationId: string | { toString(): string }): Promise<StageTrackLite[]> => {
    await connectDB();
    let docs = await StageTrack.find({ organizationId }).lean<StageTrackDoc[]>();
    const existingTypes = new Set(docs.map((d) => d.entityType));
    const missing = STAGE_TRACK_ENTITY_TYPES.filter((t) => !existingTypes.has(t));
    if (missing.length > 0) {
      const org = await Organization.findById(organizationId).lean<{
        moduleJourneyEnabled?: boolean;
        moduleLifecycleEnabled?: boolean;
      }>();
      await Promise.all(
        missing.map((entityType) => {
          const seed = SEED_STAGE_TRACKS[entityType];
          const enabled =
            entityType === "customer"
              ? !!org?.moduleJourneyEnabled
              : entityType === "initiative"
                ? !!org?.moduleLifecycleEnabled
                : false;
          return StageTrack.findOneAndUpdate(
            { organizationId, entityType },
            {
              $setOnInsert: {
                organizationId,
                entityType,
                name: seed.name,
                enabled,
                stages: seed.stages,
              },
            },
            { upsert: true }
          );
        })
      );
      docs = await StageTrack.find({ organizationId }).lean<StageTrackDoc[]>();
    }
    return docs
      .map(toLite)
      .sort(
        (a, b) =>
          STAGE_TRACK_ENTITY_TYPES.indexOf(a.entityType) - STAGE_TRACK_ENTITY_TYPES.indexOf(b.entityType)
      );
  }
);

export async function getStageTrack(
  organizationId: string | { toString(): string },
  entityType: StageTrackEntityType
): Promise<StageTrackLite | null> {
  const tracks = await getStageTracks(organizationId);
  return tracks.find((t) => t.entityType === entityType) ?? null;
}

export function stageLabel(track: StageTrackLite | null | undefined, key: string | null | undefined): string {
  if (!key) return "—";
  return track?.stages.find((s) => s.key === key)?.label ?? "—";
}
