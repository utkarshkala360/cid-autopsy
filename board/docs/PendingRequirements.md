# Remaining REQUIREMENTS.md Work — Sequential Plan

## Context

REQUIREMENTS.md v0.5 and ARCHITECTURE.md's Build Log were both read in full. The codebase is already far along: Phases 1–10 (Core Platform + both Modules), Phase 11 (nav/data-fetch perf), Phase 12 (UI component library), and a large "Post-v1 Iteration" pass (permanent IDs, sub-tasks, collaborators, org-wide mentions, Team-scoped search, profile pages, Saved Views/filter/group-by) are all committed and present in `src/`. Nearly every **Must** requirement in the spec has a real implementation.

This plan exists to close the gap between "v1 feature-complete" (as ARCHITECTURE.md currently claims) and what REQUIREMENTS.md v0.5 actually specifies. Verifying against the spec directly (not the Build Log's own account of itself) surfaced a set of requirements — including one **Must** — that are genuinely unbuilt, plus several **Should**/**Could** items. Each was confirmed missing by grep against `src/`, not inferred from the Build Log's silence alone:

- No `originated_from` (or equivalent) link type anywhere — `WorkItemLink.type` only has `blocks`/`relates_to`/`duplicates`.
- No `Timeline` component/view.
- No WIP-limit, swimlane, bulk-edit, CSV-export, epic, or org-audit-log code anywhere.
- No transition-required-field enforcement in the workflow engine.
- No Team-status→macro-stage mapping config.
- `src/lib/dashboard.ts` has no assignee breakdown.

The plan below groups these into four themed phases, following this project's own "one concern per phase, config over bespoke code, verify against real Atlas data" convention (AGENTS.md Non-Negotiables). Each phase is sized and scoped the way Phases 9–12 were, so you can hand them off one at a time. Ordering is by REQUIREMENTS.md priority: the one Must first, then Should items grouped by area, then Could items last.

---

## Phase 13 — Cross-Module Mechanics Completion (XM-1, XM-2, XM-3)

The one **Must**-priority gap lives here, so this phase goes first.

- **XM-1 (Must) — "Originated from" link type.** Add a 4th `WorkItemLink.type` value (or a parallel lightweight mechanism if a Customer/feedback source — not just another Work Item — needs to be the origin) marking that an Initiative or Work Item explicitly originated from a specific Customer, Ticket, or piece of feedback. Reuse the existing `WorkItemLink` model/routes/permission checks (`src/lib/work-item-links.ts`, `src/lib/link-types.ts`) rather than a new collection — this is a new stored type, not a new mechanism, matching how `blocks`/`relates_to`/`duplicates` already work as one directional row with an inverse label resolved at read time.
- **XM-2 (Should) — Real Timeline view.** Customer and Initiative detail pages currently show only a stage-change history list (Phase 10). Build the actual XM-2 Timeline: a single chronological feed per Customer/Initiative merging stage-change `ChangeHistory` rows with activity from every linked/originated Work Item (status changes, comments) — explicitly "no new data store; a filtered read of what's already being logged," per the spec's own text.
- **XM-3 (Should) — Status→macro-stage mapping.** Let a Team Admin configure "when this Team's local status is set, suggest advancing the linked Customer's/Initiative's macro stage" (e.g., Dev marking a Task "Done" nudging an Initiative toward "Released"). Must stay a suggestion/manual action, never an automatic trigger — CJ-3/PL-3's "no automation" rule is absolute. Store the mapping next to the existing `Workflow` config (`src/models/Workflow.ts`), surfaced as a banner/prompt on the relevant Customer/Initiative page, not a background job.

---

## Phase 14 — Dashboard & Reporting Completion (RP-3, RP-4, RP-5, CT-7)

- **RP-4 (Must, partially met) — items-by-assignee.** `computeDashboard()` (`src/lib/dashboard.ts`) currently buckets by open/closed and priority but has no assignee breakdown, even though the Work Items list already supports grouping by assignee via Saved Views. Add the missing breakdown so the dashboard itself literally satisfies RP-4, not just an adjacent feature.
- **RP-5 (Should) — CSV export.** Add CSV export for the Org/Team dashboard's report data and the Sprint burndown/velocity data (`src/lib/sprint-reports.ts`) — plain server-generated CSV, no new dependency needed.
- **CT-7 (Should) — Org-wide audit log.** A new Org-Admin-only view reading directly from `ChangeHistory` across every Team, filterable by user/Team/date range — the same "one audit engine, just a different read" principle Phase 10's Module A/B stage-history views already established for a narrower slice.
- **RP-3 (Could) — Cycle time / lead time.** Reconstructable from existing `field: "status"` `ChangeHistory` entries, the same technique `computeBurndown()` already uses — add per-Work-Item-type cycle time to the Team dashboard/reporting surface.

---

## Phase 15 — Work Item List & Workflow Power Features (IT-5, WF-4, IT-8, BD-5)

- **IT-5 (Should) — Bulk edit.** Multi-select rows on the Work Items list view (which already has `ViewToolbar`/filtering from the Saved Views work) and bulk-PATCH status/assignee/sprint through the existing `PATCH .../work-items/[itemId]` route, one call per item so each still goes through normal validation and `ChangeHistory` diffing — no new bulk-mutation endpoint needed.
- **WF-4 (Should) — Required-field transitions.** Extend `Workflow.transitions` (`src/models/Workflow.ts`) with an optional "requires these fields filled" rule per transition, enforced in the same place `isValidTransition` already runs server-side.
- **IT-8 (Should) — Epics.** Group multiple Work Items and roll up progress (open/closed counts). Given `WorkItem.parentId` and sub-tasks already exist (Post-v1 item 6, capped one level deep, same-Team only), the cleanest fit is an `isEpic` flag on a parent-capable Work Item plus a progress rollup computed from its children — avoids inventing a second parent/child mechanism alongside sub-tasks.
- **BD-5 (Should) — WIP limits.** Optional per-column limit on the Kanban board (`src/components/work-items/kanban-board.tsx`), configurable by a Team Admin on the existing workflow config screen, enforced as a visual/soft warning (spec says "optional enforcement") rather than a hard block.

---

## Phase 16 — Remaining Could-Priority Polish (BD-6, WF-3 templates, CU-4)

- **BD-6 (Could) — Swimlanes.** By assignee, epic, or priority, on the existing `KanbanBoard` component.
- **WF-3 gap (Should, documented but never closed since Phase 9)** — the "standard Scrum" and "bug-tracking" default workflow *templates* were never built; every non-Dev Team was hand-configured instead. Add these two as selectable starting points (alongside the existing 3-status default) on `/settings/teams/[teamId]/work-item-config` so a new Team isn't always starting from a blank slate.
- **CU-4 (Could) — Contact-level export/delete.** Export/delete for an individual Customer contact's personal data, distinct from org-level data export.

---

## Verification (every phase)

Follow this project's own established pattern (every Build Log entry since Phase 3):
1. `npm run build` and `npm run lint` clean.
2. Real HTTP verification against a running dev server + live Atlas — not just code-reading — including an explicit attempt to hit the new/changed route as an unauthorized role and confirm a real 403/401 (Non-Negotiable #1).
3. Grep-based structural proof for anything claiming "no bespoke code path" (Non-Negotiable #6), the same technique Phase 9's Team rollout and Phase 10's Module A/B used.
4. Update ARCHITECTURE.md's Data Model / Build Log at the end of each phase, per AGENTS.md's build methodology — this is the living contract, not optional documentation.

Note: several earlier phases (9, 11, 12, and most of the Post-v1 Iteration) explicitly flagged themselves as **unverified against live Atlas data** due to connectivity issues at the time. Before starting Phase 13, it's worth a quick real-data smoke pass over those flagged areas (Sprint rollover, Module A/B stage changes, Saved Views persistence) so new work in Phase 13+ isn't built on top of an unverified foundation.
