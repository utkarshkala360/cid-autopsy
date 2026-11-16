import { redirect } from "next/navigation";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { StageTrackManager } from "@board/components/settings/stage-track-manager";
import { getCurrentMember } from "@board/lib/get-current-member";
import { getStageTracks } from "@board/lib/stage-tracks";

// Design 1 (Phase 16): replaces the fixed two-Module toggle screen with a
// generalized Stage Track manager — 4 rows (Customer/Initiative/Team/Work
// Item), each independently enabled and editable, rather than exactly two
// hardcoded Modules with fixed stage lists (MG-3, realized literally).
export default async function ModulesSettingsPage() {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  if (member.orgRole !== "org_admin") {
    return (
      <ForbiddenState message="Turning Stage Tracks on or off org-wide, and editing their stages, is an Org Admin action (MG-1/MG-2). Ask your Org Admin for access." />
    );
  }

  const tracks = await getStageTracks(member.organizationId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Modules</h1>
        <p className="mt-1 text-xs text-slate">
          Optional, additive macro-stage layers on top of the Core Platform — Stage Tracks. Turning
          one on never changes any Team&apos;s own workflow, custom fields, board, or data (MG-2) —
          it only adds an editable stage field to the entity it targets.
        </p>
      </div>

      <StageTrackManager
        initialTracks={tracks.map((t) => ({
          id: t.id,
          entityType: t.entityType,
          name: t.name,
          enabled: t.enabled,
          stages: t.stages,
        }))}
      />
    </div>
  );
}
