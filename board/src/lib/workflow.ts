import "server-only";
import { cache } from "react";
import { connectDB } from "@board/lib/mongodb";
import { Workflow } from "@board/models/Workflow";
import type { StatusCategory } from "@board/lib/status-categories";
import type { StageNudgeEntity } from "@board/lib/stage-nudge-types";

export type WorkflowStatus = {
  key: string;
  label: string;
  category: StatusCategory;
  // XM-3: optional Team-Admin-configured suggestion — see
  // src/lib/stage-nudge.ts for how/when it's surfaced.
  stageNudge?: { entity: StageNudgeEntity; stage: string } | null;
  // BD-5: optional soft WIP limit for this status's board column — see
  // kanban-board.tsx for where it's read.
  wipLimit?: number | null;
};
export type WorkflowTransition = {
  from: string;
  to: string;
  // WF-4: field keys (src/lib/transition-requirements.ts's REQUIRABLE_FIELDS)
  // that must already be filled in before this transition is allowed.
  requiredFields?: string[];
};
export type EffectiveWorkflow = {
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  isDefault: boolean;
};

const DEFAULT_STATUSES: WorkflowStatus[] = [
  { key: "todo", label: "To Do", category: "todo" },
  { key: "in_progress", label: "In Progress", category: "in_progress" },
  { key: "done", label: "Done", category: "done" },
];

export function allPairTransitions(
  statuses: { key: string }[]
): WorkflowTransition[] {
  const transitions: WorkflowTransition[] = [];
  for (const from of statuses) {
    for (const to of statuses) {
      if (from.key !== to.key) transitions.push({ from: from.key, to: to.key });
    }
  }
  return transitions;
}

const DEFAULT_WORKFLOW: EffectiveWorkflow = {
  statuses: DEFAULT_STATUSES,
  transitions: allPairTransitions(DEFAULT_STATUSES),
  isDefault: true,
};

/**
 * A Team is usable before anyone configures a workflow — absence of a stored
 * Workflow row for (teamId, type) falls back to the default 3-status
 * template (WF-3) rather than blocking Work Item creation.
 *
 * Memoized per-request via React's cache() (Phase 11) — (teamId, type) is
 * looked up repeatedly wherever a status label/category is needed (board,
 * detail page, dashboard's per-combo loop), so this dedupes the Workflow
 * lookup within one request. Never shared across requests/users.
 */
export const getEffectiveWorkflow = cache(
  async (teamId: string, type: string): Promise<EffectiveWorkflow> => {
    await connectDB();
    const stored = await Workflow.findOne({ teamId, type }).lean<{
      statuses: WorkflowStatus[];
      transitions: WorkflowTransition[];
    }>();

    if (!stored) return DEFAULT_WORKFLOW;

    return {
      statuses: stored.statuses,
      transitions: stored.transitions,
      isDefault: false,
    };
  }
);

export function isValidStatus(
  workflow: EffectiveWorkflow,
  status: string
): boolean {
  return workflow.statuses.some((s) => s.key === status);
}

export function isValidTransition(
  workflow: EffectiveWorkflow,
  from: string,
  to: string
): boolean {
  if (from === to) return true;
  return workflow.transitions.some((t) => t.from === from && t.to === to);
}

export { DEFAULT_STATUSES };
