import "server-only";
import { cache } from "react";
import { connectDB } from "@board/lib/mongodb";
import { WorkItemTemplateDef } from "@board/models/WorkItemTemplateDef";

// WT-1 (Phase 16, Design 3): the Work Item template list is now an
// Org-Admin-managed registry (WorkItemTemplateDef), not a fixed
// WORK_ITEM_TEMPLATES const array. This file is now server-only (a client
// component that used to import the old constants directly — team-row.tsx —
// now receives the live list as a prop from its server-rendered parent
// instead, same "server fetches, client renders" split every other
// registry-backed picker in this codebase already uses).
export type TemplateDefLite = { key: string; label: string; requiresCustomer: boolean };

// Seeded on Organization bootstrap (src/lib/org-bootstrap.ts) — byte-for-
// byte preserves the original WT-1 two-template behavior so an existing
// installation sees zero change until an Org Admin visits /settings/templates.
export const SEED_WORK_ITEM_TEMPLATES: TemplateDefLite[] = [
  { key: "task", label: "Task", requiresCustomer: false },
  { key: "ticket", label: "Ticket", requiresCustomer: true },
];

/**
 * Memoized per-request via React's cache() — same pattern resolveTeamRole()/
 * getEffectiveWorkflow() use — so a page resolving several Teams'/Work
 * Items' template labels in one request only hits Mongo once.
 */
export const getWorkItemTemplateDefs = cache(
  async (organizationId: string | { toString(): string }): Promise<TemplateDefLite[]> => {
    await connectDB();
    let defs = await WorkItemTemplateDef.find({ organizationId })
      .sort({ key: 1 })
      .lean<TemplateDefLite[]>();
    if (defs.length === 0) {
      // Self-healing seed: an Organization that predates this registry
      // (every existing installation, at the moment this phase ships) gets
      // the same two default templates on first read — upsert-by-key so a
      // race between two concurrent first-reads can't create duplicates.
      // Byte-for-byte preserves today's WT-1 behavior with zero migration
      // script required.
      await Promise.all(
        SEED_WORK_ITEM_TEMPLATES.map((t) =>
          WorkItemTemplateDef.findOneAndUpdate(
            { organizationId, key: t.key },
            { $setOnInsert: { ...t, organizationId } },
            { upsert: true }
          )
        )
      );
      defs = await WorkItemTemplateDef.find({ organizationId })
        .sort({ key: 1 })
        .lean<TemplateDefLite[]>();
    }
    return defs.map((d) => ({ key: d.key, label: d.label, requiresCustomer: d.requiresCustomer }));
  }
);

export function getTemplateDef(
  type: string,
  templates: TemplateDefLite[]
): TemplateDefLite | undefined {
  return templates.find((t) => t.key === type);
}

export function labelForType(type: string, templates: TemplateDefLite[]): string {
  return getTemplateDef(type, templates)?.label ?? type.charAt(0).toUpperCase() + type.slice(1);
}

// ORG-8: the per-Team display-label layer, unchanged behavior — a Team
// Admin's override (Team.displayLabel) wins; otherwise falls back to the
// live template's label instead of a fixed TEMPLATE_LABEL map. Presentation
// only: never reads or writes WorkItem.type or any API field name.
export function labelForTeam(
  team: { displayLabel?: string | null; primaryWorkItemType: string },
  templates: TemplateDefLite[]
): string {
  return team.displayLabel?.trim() || labelForType(team.primaryWorkItemType, templates);
}
