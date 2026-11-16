# 360 Cloud Board
## Requirements Document — v0.5 (Consolidated)

**Owner:** Prateek Narayan  
**Date:** August 13, 2026  
**Status:** Draft — consolidates v0.1 through v0.4 into one authoritative document. Every requirement below is fully defined in place. No section depends on cross-referencing an earlier version.

---

### Document History (Context only — the rest of this document is self-contained)

| Version | What changed |
| :--- | :--- |
| **v0.1 (Aug 7)** | Single-team, Jira-style issue tracker: one Workspace → Project → Issue. |
| **v0.2 (Aug 13)** | Expanded to multi-team: Workspace → Organization, added Team layer, generalized Issue → Work Item (Task/Ticket templates), added Guest and Customer, added Org dashboard. |
| **v0.3 (Aug 13)** | Corrected scope to internal-tool (removed billing/plans/seats, merged Owner into Org Admin, simplified Guest to a plain low-privilege role). Fixed six gaps found in review: added Initiative tag, cross-team linking, status/priority normalization, and a per-Team display-label layer. |
| **v0.4 (Aug 13)** | Formalized the customer and product lifecycles as two optional Modules rather than fixed cross-team fields, preserving each Team's own local process underneath. |
| **v0.5 (this document)** | Full consolidation. No prior version needs to be read separately from here on. |

---

## Table of Contents
1. Purpose & Audience
2. Product Vision
3. Goals & Non-Goals
4. Target Users & Personas
5. Scope Recommendation
6. Architecture: Core Platform vs. Modules
7. Core Platform — Functional Requirements
8. Module A: Customer Journey
9. Module B: Product Lifecycle
10. Cross-Module Mechanics
11. Stage Track Governance (formerly Module Governance)
12. Explicitly Out of Scope for v1
13. Success Metrics (v1)
14. Open Questions
15. Appendix: Glossary

---

## 1. Purpose & Audience

This is a kickoff-style requirements document, not a locked spec — it exists to align the team on scope, priorities, and open decisions before design or engineering work starts, and it's expected to change as real usage validates or challenges these assumptions.

The central question it answers: can one system give every function that touches product or customers — Marketing, Sales, Customer Success, Customer Support, QA, Dev, BA, Scrum/Program — a shared view of work and of the customer relationship, without forcing any of them to work identically to the others? Every architectural choice below (the Core/Module split, the generic Work Item engine, per-Team workflows) exists in service of that question.

---

## 2. Product Vision

360 Cloud Board is an internal system of record for work and customer interaction, used across every team in the company. Each team tracks its own work in its own vocabulary, on its own board shape — a Marketing user should never have to learn what a "Sprint" is to log a task. Two mechanisms turn eight separate team tools into one shared product instead of eight tools sitting side by side:

1. **Any two Teams can link related work directly** — a Support Ticket linked to the Dev Task that caused it.
2. **Two specific cross-team arcs are each visible as a single thread:** a customer's relationship with the company (Lead through onboarding, active use, and renewal) and a piece of product work's path (idea through development, release, and maintenance) — without requiring the teams along either thread to run identical processes.

We are not out-featuring best-in-class point tools per team on day one — no full CRM, no campaign analytics suite, no SLA engine, no billing system. We're building the shared skeleton those attach to later, plus the minimum connective tissue that makes "one dashboard" actually mean something.

---

## 3. Goals & Non-Goals

### 3.1 Goals (v1)
- Let a Team create, assign, and track Work Items through a workflow it configures itself.
- Support Kanban boards for every Team, and Scrum boards with sprint planning for Teams that want them — backed by the same underlying Work Item data.
- Let Team Admins configure workflows and custom fields without engineering involvement.
- Give every Team basic visibility into its own progress (burndown, velocity, cycle time, open/closed counts).
- Support more than one Team inside one Organization, each addable by configuration, not engineering.
- Let any Work Item, in any Team, be tagged to a shared Initiative so cross-team effort is trackable without a full program-management tool.
- Let Work Items in different Teams be linked directly to each other.
- Maintain a single, Org-level Customer record that Sales, CS, and Support can all reference.
- Give Org Admins and Execs one dashboard with counts that are genuinely comparable across Teams, not just concatenated.
- Let each Team set its own display vocabulary (Task/Deal/Campaign Task/Ticket) so no team has to learn another team's terms.
- Operate securely from day one: every permission enforced server-side, a full and immutable change history on every Work Item.

### 3.2 Non-Goals (v1)
See §12 for the complete, consolidated list. In short: no third-party integrations beyond basic webhooks, no automation/rules engine, no native mobile apps, no full CRM or campaign analytics, no SLA automation, no billing/plans/seats (this is an internal tool), and no more than one Project per Team.

---

## 4. Target Users & Personas

### 4.1 Role Archetypes
Five roles exist in the system. Four are granted per-Team; Guest is granted per-item and sits outside that hierarchy.

| Role | Scope | Primary Need |
| :--- | :--- | :--- |
| **Org Admin** | Whole Organization | Team creation & config, org-wide user management, org dashboard, audit log, module toggles |
| **Team Admin** | One Team | Workflow/field/display-label configuration, sprint or pipeline planning, Team membership |
| **Team Member** | One Team | Fast Work Item creation, minimal clicks to update status |
| **Team Viewer** | One Team, read-only | Full visibility into their Team's boards/reports, no editing |
| **Guest** | Specific Work Items or one Initiative only | Follow or contribute to a narrow slice of work without joining the full Team |

Guest uses the exact same login as everyone else — there is no separate Guest identity or authentication flow. What makes it the lowest-privilege tier is scope, not a different mechanism: a Guest grant attaches to one Work Item or one Initiative, never to a whole Team. Typical use: an Exec following one Initiative without joining four Teams; someone on one Team who needs visibility into a single item owned by another Team; a limited contractor scoped to a handful of items.

### 4.2 Team Types (v1 seed list)
Org Admin can rename, add, or deactivate Teams — this is a starting point, not a fixed set.

| Team | Primary Work Item Template (v1) | Typical Board Shape | Default Display Label |
| :--- | :--- | :--- | :--- |
| **Dev** | Task | Kanban + Scrum (sprints) | "Task" |
| **QA** | Task (+ Steps to Reproduce, Environment fields) | Kanban, linked to Dev Tasks | "Defect" |
| **BA** | Task (+ Source Requirement field) | Kanban | "Requirement" |
| **Scrum / Program** | (see Open Question 1) | N/A in v1 | — |
| **Customer Support** | Ticket (linked to Customer) | Kanban / queue, no sprints | "Ticket" |
| **Customer Success** | Ticket or Task (linked to Customer) | Kanban / queue, no sprints | "Ticket" |
| **Sales** | Task (+ Deal Value, Stage fields) | Kanban | "Deal" |
| **Marketing** | Task (+ Channel, Campaign fields) | Kanban | "Campaign Task" |

---

## 5. Scope Recommendation

All of the Core Platform requirements in §7 were marked v1 must-haves, but building all of it — plus both Modules — at once, for all eight Teams simultaneously, is how a project like this stalls for 6-12+ months. Two sequencing recommendations:

- **Teams:** build the skeleton once, prove it with **Dev and Support** as the two launch Teams — they're the most different from each other (one runs sprints and links to code, the other has no sprints and links to Customers) — then turn on the remaining Team types by configuration, not new engineering. If enabling a new Team type ever requires new backend code, that's a signal the underlying abstraction wasn't generic enough; fix the abstraction rather than special-casing the Team.
- **Modules:** the Core Platform (§7) should be solid and in use before either Module (§8-§9) is layered on. Module A pairs naturally with Sales/CS/Support; Module B pairs naturally with BA/Dev/QA. Given the Dev+Support launch pair above, Module A is the more natural first Module — see Open Question 9.

---

## 6. Architecture: Core Platform vs. Modules

~~Original v0.4/v0.5 scope: Core Platform (§7) plus exactly two fixed Modules (§8–§9), each adding one macro stage field — a short, Org-Admin-edited-but-otherwise-fixed list — to exactly one Organization-level entity (Customer or Initiative).~~ — **overridden by direct user request, August 17, 2026** (see ARCHITECTURE.md's "Phase 16 — Modules Generalization, Sprint/Initiative Unification, Configurable Templates, Settings Reorg" Build Log entry). Modules generalize into **Stage Tracks**: a Stage Track is a named, fully editable list of stages an Org Admin can add/rename/reorder/remove, targeting any entity type the platform defines — v1 ships four tracks (`customer`, `initiative`, `team`, `work_item`), one per entity, each independently toggleable. The `customer` and `initiative` tracks are the direct continuation of the former Module A (Customer Journey) and Module B (Product Lifecycle) — same default stage content, same default enabled/disabled state — so an existing installation sees zero behavior change until an Org Admin edits a track's stages or turns on one of the two new ones. §11 (renamed "Stage Track Governance") describes the generalized mechanism.

- **Core Platform (§7):** Organization, Team, Member, the generic Work Item engine (Task/Ticket templates — see §7.9 for how the template list itself is now Org-Admin-managed rather than fixed —, per-Team custom workflows and fields), RBAC, immutable change history, cross-team linking, the Initiative tag (which, per the updated §7.6/ORG-5, can also carry Sprint-style time-boxing when owned by a Team), Guest access, per-Team display labels, and the Org-wide dashboard. Every Team can operate on the Core Platform alone, with no Stage Track ever touching it.
- **A Stage Track (§8–§11) adds, at most:**
  - One macro stage field on the entity type it targets (Customer, Initiative, Team, or Work Item) — an editable, Org-Admin-managed list of stages.
  - Stage-change logging, using the same change-history mechanism Work Items already use — no separate audit engine.

A Stage Track never changes how a Team's own workflow, custom fields, or board works — every Team keeps full ownership of its local process (§7.3) whether a Track is on or off. Stage Tracks are toggled independently, org-wide, by Org Admin, and their stage lists are themselves editable, not fixed constants — the architecture doesn't hardcode any particular stage list or "exactly two Modules" (§11, MG-3, now realized literally: a third and fourth track already exist).

---

## 7. Core Platform — Functional Requirements

### 7.1 Work Item Core
"Work Item" is the general term for a unit of work (earlier drafts called this "Issue" — same concept, generalized name). It's instantiated via a template (Task, Ticket — see §7.9) and displayed under whatever label a Team has configured (§7.6, ORG-8).

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **IT-1** | A user can create a Work Item with: title, description (rich text), a template-driven type (Task or Ticket by default; further sub-typed via custom fields per Team, e.g. Bug/Story/Epic within Dev's Task usage), assignee, reporter, priority, status, labels, due date. | Must |
| **IT-2** | A user can link Work Items to each other (blocks / is blocked by / relates to / duplicates). | Must |
| **IT-3** | A user can comment on a Work Item; comments support @mentions. | Must |
| **IT-4** | A Work Item has a change history — see §7.5 for full requirements. | Must |
| **IT-5** | A user can bulk-edit Work Items (status, assignee, sprint) from a list view. | Should |
| **IT-6** | Full-text search across Work Items within a Team; filter by any field. (Search across all Teams at once is out of scope for v1 — see DB-4.) | Must |
| **IT-7** | Sub-tasks / checklist items within a parent Work Item. | Should |
| **IT-8** | Epics group multiple Work Items and roll up progress. | Should |
| **IT-9** | A user can attach files and images directly to a Work Item (not just in comments), with thumbnail preview for images. | Must |
| **IT-10** | A user can drag-and-drop or paste an image directly into the description or a comment field. | Should |
| **IT-11** | Attachments are versioned — replacing a file keeps prior versions accessible, not silently overwritten. | Could |
| **IT-12** | A Work Item can render its own nested Board, scoped to its sub-tasks (reusing the existing one-level `parentId` hierarchy from IT-7/IT-8, not a second hierarchy) — a List/Board toggle next to the sub-tasks panel, columns sourced from the same Team's Workflow. Added August 17, 2026 alongside the Sprint/Initiative unification (see ARCHITECTURE.md's Phase 16 Build Log entry). | Should |

#### User story — attachments
As a Team Member: I want to attach a screenshot or log file directly to a Work Item, so that whoever picks it up has the evidence they need without me hunting down a Slack thread later.

**Acceptance criteria:**
- The attach control on the Work Item detail view accepts common image types (PNG/JPG/GIF) and common doc types (PDF, TXT, CSV, ZIP) up to a defined size limit (e.g., 25MB/file — confirm with team).
- Images render as inline thumbnails; clicking opens full size without leaving the item.
- Non-image files show filename, size, uploader, and upload date, with a download link.
- Attachment add/remove is captured in the item's change history (§7.5).
- Attachments respect the same permission model as the Work Item itself (§7.7) — a Team Viewer or Guest can download but not delete.

---

### 7.2 Boards & Sprints

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **BD-1** | Kanban board per Team, with configurable columns mapped to workflow statuses. | Must |
| **BD-2** | Drag-and-drop Work Item cards between columns; status updates automatically. | Must |
| **BD-3** | ~~Scrum board with backlog view, sprint creation (name, start/end date, goal), and ability to move items in/out of a sprint — optional per Team.~~ — **overridden by direct user request, August 17, 2026** (Sprint/Initiative unification; see ARCHITECTURE.md's Phase 16 Build Log entry). A **Team-run Initiative** — an ordinary Initiative (§7.6/ORG-5) extended with an optional `teamId`, start/end dates, and a sprint goal — is now the time-boxing container, created from a Team's own Initiatives view/tab. Backlog view and drag-in/out of a Team-run Initiative work exactly as Sprint did. Teams that never create a Team-run Initiative see no sprint-style UI at all, per the display-label layer (ORG-8) — unchanged end-user behavior, new underlying model. | Must (for Teams that opt in) |
| **BD-4** | Start/complete actions on a Team-run Initiative; incomplete items roll over to the next `planned` Team-run Initiative for that Team, or to the backlog, on close — same rollover invariant Sprint had (one `active` per Team, only `done`-category items stay assigned to a closed one). | Must |
| **BD-5** | WIP limits per column (configurable, optional enforcement). | Should |
| **BD-6** | Swimlanes (by assignee, epic, or priority). | Could |
| **BD-7** | Backlog view supports drag-to-reorder for prioritization — unchanged; the Backlog now reads/writes `WorkItem.teamInitiativeId` (renamed from the retired `WorkItem.sprintId`) instead of a separate `Sprint` document. | Must |

---

### 7.3 Custom Workflows & Fields
This is the single most important mechanism in the product — it's what lets Marketing, Sales, QA, and BA each shape the same Work Item to their needs with zero new engineering, and it's the reason the two Modules in §8-§9 don't need to dictate how any Team actually works.

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **WF-1** | A Team Admin can define a workflow per Work Item type: a set of statuses and allowed transitions between them, scoped to their own Team. | Must |
| **WF-2** | A Team Admin can add custom fields (text, number, dropdown, multi-select, date, user-picker) scoped to their Team or Work Item type. | Must |
| **WF-3** | Default workflow templates are provided (simple 3-status, standard Scrum, bug-tracking) so a new Team isn't forced to configure from scratch. | Must |
| **WF-4** | Transition rules can require a field to be filled before moving status (e.g., resolution required to close). | Should |
| **WF-5** | Workflow/field changes don't break or orphan existing Work Items already using the old configuration. | Must |

---

### 7.4 Reporting & Dashboards (Team level)
See §7.10 for the Org-level dashboard, which aggregates across Teams.

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **RP-1** | Burndown chart (remaining work vs. time) for a Team-run Initiative (§7.6/ORG-5's unified Sprint/Initiative shape, August 17, 2026) — same chart, same computation, now reading `Initiative` documents filtered by `teamId`/`sprintStatus` instead of a separate `Sprint` collection. | Must |
| **RP-2** | Velocity chart across the last N completed Team-run Initiatives for a Team. | Should |
| **RP-3** | Cycle time / lead time per Work Item type. | Could |
| **RP-4** | Team-level dashboard: open vs. closed Work Items, items by assignee, items by priority. | Must |
| **RP-5** | Export report data to CSV. | Should |

---

### 7.5 Change Tracking / Audit Trail
Every Work Item needs a full, field-level history — not just a generic "activity happened" log. Customers will ask "who changed this and when," and support/eng need it to debug data issues. This same mechanism is reused, unchanged, by both Modules (§8-§9) for stage-change logging — there's exactly one audit engine in the whole product.

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **CT-1** | Every field change on a Work Item (status, assignee, priority, custom fields, etc.) is logged with: field name, old value, new value, user, timestamp. | Must |
| **CT-2** | Comment and attachment add/edit/delete events are logged in the same history feed. | Must |
| **CT-3** | History is shown in a chronological feed on the Work Item detail view, readable without leaving the page. | Must |
| **CT-4** | History entries are immutable — cannot be edited or deleted by any role, including Org Admin. | Must |
| **CT-5** | Board/Team-run-Initiative-level events (item added, moved between columns, Initiative started/completed as a Sprint) are logged against both the item and the Team-run Initiative (`ChangeHistory.field: "teamInitiativeId"`, renamed from `"sprintId"` August 17, 2026 — same append-only mechanism, no new event type). | Should |
| **CT-6** | Change history is retained for the lifetime of the account and included in data export (ties to RBAC and data-export requirements below). | Must |
| **CT-7** | Org Admins can view an org-wide audit log (not just per-item), filterable by user, Team, and date range. | Should |

---

### 7.6 Organization & Team Structure

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **ORG-1** | Organization is the top-level container. v1 provisions exactly one Organization — the company itself, since this is an internal tool, not a product sold externally. The concept is kept in the schema for architectural cleanliness (a future business unit or spin-off wouldn't require a rewrite), not because v1 needs it active. | Must |
| **ORG-2** | An Organization contains one or more Teams. Org Admin can create, rename, deactivate, and reorder Teams. §4.2's list is a seed default. | Must |
| **ORG-3** | Each Team has exactly one default Project/Board in v1. Multi-project-per-Team is deferred to v1.1. | Must |
| **ORG-4** | All Teams share the same Work Item / Workflow / Custom Field / Change History engine. No Team-specific code path is needed to add a new Team type. | Must |
| **ORG-5** | Initiative: any Work Item in any Team can optionally be tagged with a shared Initiative (a simple label, e.g. "Q4 Launch"). Initiatives are Org-level, creatable by any Team Admin or Org Admin, and are the mechanism for following something across Teams without a full roadmap tool. **Unified with Sprint, August 17, 2026** — overridden by direct user request (see ARCHITECTURE.md's Phase 16 Build Log entry): an Initiative can *additionally* be "Team-run" — given a `teamId`, `startDate`/`endDate`, and a `sprintGoal`, it becomes a time-boxed container one Team plans work into (the role the now-retired `Sprint` model used to play) while remaining a fully valid cross-team tag at the same time. A Work Item may reference **two** Initiatives at once, independently: `initiativeId` (the cross-team tag it's part of, unchanged) and `teamInitiativeId` (renamed from `sprintId` — the Team-run Initiative it's currently planned into). | Must |
| **ORG-6** | Cross-team linking: a Work Item in one Team can be directly linked to a Work Item in another Team (e.g., a Support Ticket linked to the Dev Task that caused it), using the same link-type mechanism as IT-2, extended across Team boundaries. | Must |
| **ORG-7** | Status/priority normalization: each Team names its own statuses and priority labels freely (WF-1/WF-2), but every custom status must map to one of a small, fixed set of Org-level categories (e.g., To Do / In Progress / Done), and every Team's priority scale must map to a shared Org-level scale. This is what makes the Org dashboard's cross-team counts (§7.10) mean something instead of comparing unrelated scales. | Must |
| **ORG-8** | Display-label layer: Team Admins set what things are called in their Team's UI — e.g., "Work Item" displays as "Task" for Dev, "Deal" for Sales, "Campaign Task" for Marketing, "Ticket" for Support (defaults in §4.2). Teams that don't use sprints never see sprint-related UI or terminology at all. This is a label mapping only — it does not change the underlying data model. | Must |

---

### 7.7 Members & Roles (RBAC)

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **MB-1** | A Member is a single Org-level user account, belonging to zero or more Teams, each with its own Team role (Admin/Member/Viewer) independent of role on other Teams. | Must |
| **MB-2** | Org Admin role is inherited at the Team level unless explicitly overridden. | Must |
| **MB-3** | Guest is the lowest-privilege tier, not a separate principal type or login flow (§4.1). A Guest grant is scoped to specific Work Items or one Initiative, narrower than Team membership. Uses the same login as every other role. | Must |
| **MB-4** | Guests cannot see any Work Item, board, or report outside what's explicitly shared with them — enforced server-side, same principle as every other role boundary in this document: a Team Viewer or Guest hitting the API directly must still be blocked, not just hidden in the UI. | Must |
| **MB-5** | Guests get the same notification treatment as any other role for items they have access to (@mentions, assignment, status changes) — not a separate, lesser notification path. | Must |

#### Roles & Permissions Matrix

| Action | Org Admin | Team Admin | Team Member | Team Viewer | Guest |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Create / rename / deactivate Teams** | Yes | No | No | No | No |
| **Configure Team workflow, fields & display labels** | Yes | Yes (own Team) | No | No | No |
| **Create Initiatives** | Yes | Yes | No | No | No |
| **Create / edit / delete Work Items** | Yes | Yes | Yes | No | Only items shared with them |
| **Change status / move on board** | Yes | Yes | Yes | No | No |
| **Comment** | Yes | Yes | Yes | No | Only on items shared with them |
| **Add / remove attachments** | Yes | Yes | Yes | No | Add only, on items shared with them |
| **View Team's items, boards, reports** | Yes | Yes | Yes | Yes | No — only items shared with them |
| **Create / manage sprints** | Yes | Yes | Yes (if Project Lead) | No | No |
| **Invite/remove Members, assign Team roles** | Yes (org-wide) | Yes (own Team) | No | No | No |
| **Grant Guest access to a Work Item/Initiative** | Yes | Yes (own Team's items) | Yes (items they own) | No | No |
| **Manage Customer records** | Yes | Yes (own Team, if applicable) | View only | View only | No |
| **Toggle a Module on/off org-wide** | Yes | No | No | No | No |
| **Advance a Customer's or Initiative's macro stage** | Yes | Yes (own Team, if relevant) | Yes (if authorized on relevant Team) | No | No |
| **View Org-wide dashboard** | Yes | No (Team dashboard only) | No | No | No |
| **View Org-wide audit log** | Yes | No | No | No | No |

*Note: Every row above is enforced server-side on every request, not just hidden in the UI.*

---

### 7.8 Customers

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **CU-1** | A Customer record is a single, Org-level record — Sales, CS, and Support all reference the same record rather than creating separate copies. Name, primary contact(s), linked Work Items (Tickets). Whichever Teams handle Customers can view/edit shared fields; Team-specific notes stay scoped via comments on linked Work Items. | Must |
| **CU-2** | Whether an external customer ever gets direct login access (vs. Support/CS always working Tickets on their behalf via email/phone) is undecided — v1 does not build or assume a customer-facing login. See Open Question 4. | Open |
| **CU-3** | Deal/opportunity fields, health scores, revenue data, deal stages — deferred to v1.1. | Won't (v1) |
| **CU-4** | Customer contact records may hold personal data of individuals outside the company. Export/delete on request for an individual contact (distinct from the org's own account-level data) is reasonable practice to support, but isn't compliance-driven the way it would be for a product sold externally. | Could |

---

### 7.9 Work Item Type Templates

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **WT-1** | ~~v1 ships two Work Item templates, usable by any Team: Task (general internal work) and Ticket (customer-facing, may optionally link a Customer — not required).~~ — **overridden by direct user request, August 17, 2026** (see ARCHITECTURE.md's Phase 16 Build Log entry). The Work Item template list is now an Org-Admin-managed registry (`WorkItemTemplateDef`: `key`, `label`, `requiresCustomer`), not a fixed two-value list. v1 seeds it with the same two rows byte-for-byte — `task` (general internal work, `requiresCustomer: false`) and `ticket` (customer-facing, `requiresCustomer: true`, and even then a Customer link is optional at the Work Item level, never required to save) — so existing behavior is unchanged until an Org Admin adds, renames, or removes a template. Both get a default display label per §4.2, overridable per ORG-8. | Must |
| **WT-2** | Team Admins choose which template a Team uses by default (`Team.primaryWorkItemType`, now validated against the live template registry rather than a fixed enum, selectable at Team-creation time too) and add custom fields per WF-2 (QA's "Steps to Reproduce," Sales's "Deal Value," etc.). Adding a wholly new template (e.g. "Deal") is itself Org-Admin configuration at `/settings/templates`, not engineering — realizing this requirement's original "until dedicated templates ship" phrasing rather than deferring it. | Should |
| **WT-3** | Dedicated Deal/Opportunity and Campaign/Content templates with stage-specific boards — deferred to v1.1. | Won't (v1) |

---

### 7.10 Org-Wide Dashboard

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **DB-1** | An Org-level dashboard shows, per Team: open vs. closed counts, items by priority, items overdue — using the normalized status/priority categories from ORG-7 so the numbers are actually comparable across Teams. Filterable by Initiative (ORG-5). | Must |
| **DB-2** | Org Admins see the Org dashboard by default; Team Members see their own Team's dashboard. | Must |
| **DB-3** | ~~Customizable widgets~~ — **overridden by direct user request, August 17, 2026, deepened same day** (see ARCHITECTURE.md's "Dashboard Views" Build Log entries). A Dashboard View lets any Member add, configure (its own filter + group-by per widget instance, Asana-style), and reorder report widgets — including Burndown/Velocity — and save it privately or shared. Available on **both** the Org Dashboard (`/dashboard`, shared = every Member in the Org) and each Team's own Dashboard (`/teams/[teamId]/dashboard`, new this same day, shared = that Team's Members only). The override stays narrow: a Burndown/Velocity widget still only ever renders one Team's own Sprint history at a time, never an aggregate/cross-Team comparison — that half of DB-3, and drill-down analytics, remain deferred to v1.1. | Won't (v1) — partially overridden |
| **DB-4** | Org-wide search (across all Teams at once) — deferred to v1.1; v1 search stays scoped within a Team (IT-6). | Won't (v1) |

---

### 7.11 Cross-Cutting Requirements
- **Single Organization in v1 (the company itself):** The Team-level RBAC boundary (§7.7) is what governs day-to-day access — tenant isolation isn't an active concern when there's only one tenant.
- **Authentication:** email/password + Google SSO for v1. SAML/SCIM may move up in priority if internal IT requires it.
- **No billing, plans, or seats:** Not applicable to an internal tool.
- **Notifications:** in-app and email for @mentions, assignment, and status changes on watched items — applies identically to every role including Guest (MB-5).
- **Data export/delete:** basic org-data export/delete is reasonable practice to support, but not a hard compliance requirement (no external customers being sold to). Customer-contact-specific handling — see CU-4.

---

### 7.12 Time Tracking & Worklogs
Added August 18, 2026, by direct user request — overrides the former "Time tracking / worklogs" non-goal (§12). Unlike a tool that only shows time spent once a task is closed, this tracks utilization per calendar day, as the work happens, and keeps Estimate and Actual as two independent numbers rather than reconciling them automatically (no automation engine, consistent with §12's still-standing non-goal).

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **WL-1** | A Team Admin picks exactly one time-tracking unit per Team — Story Points or Hours/Minutes — off by default. A Team that never turns this on never sees an Estimate field or a time log anywhere in its UI, same "invisible, not disabled" precedent Sprints (BD-3) already set. Once the Team has logged any time, the unit is locked (a change would make historical totals unsummable). | Must |
| **WL-2** | A Work Item carries an Estimate in the Team's configured unit, independent of Actual — set/edited by any Team Member+, with no automatic reconciliation between the two. | Must |
| **WL-3** | Any Team Member+ can log time against a Work Item for a specific calendar day, not just the assignee. Multiple log entries per person, per item, per day are allowed (a person can log more than one chunk of work on the same item on the same day). A logged entry can be edited or deleted by whoever logged it, or by a Team Admin. | Must |
| **WL-4** | The Actual total for a Work Item is recomputed and persisted automatically, in real time, every time a log entry is added, edited, or deleted — not a scheduled/cron recompute and not merely a live aggregate computed on read. | Must |
| **WL-5** | Team-level management visibility: an Estimate-vs-Actual report per Work Item (Team Dashboard widget) and a CSV export of a Team's logged time over a date range. | Should |

---

## 8. Module A: Customer Journey

**Purpose:** give Sales, CS, and Support one shared view of where a Customer sits, while each keeps its own process underneath.

**Macro stage (shared, Org-level, on the Customer record):**  
`Lead` → `Onboarding` → `Active` → `Renewal/Expansion` → `Offboarding`.  
This is the default list; Org Admin can edit it, but it's meant to stay short — five or six stages, not a place to encode any one team's internal steps.

**What stays local to each Team (same mechanism as §7.3, just applied here):**
- **Sales** runs its own deal process as Work Items (Task + custom fields, per WT-2), scoped under the "Lead" stage.
- **CS** runs its own onboarding process — an "Onboarding Plan" Work Item with a checklist (reusing IT-7), scoped under the "Onboarding" stage.
- **Support** runs its existing Ticket queue, scoped under the "Active" stage, exactly as already defined in §7.

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **CJ-1** | Customer gets a macro Journey Stage field (default list above), Org-level, editable only by Org Admin. | Must |
| **CJ-2** | Every stage change is logged through the existing change-history mechanism (§7.5) — same immutability rule as everywhere else. | Must |
| **CJ-3** | Stage changes are manual, made by an authorized Member on a Team with access to that Customer (e.g., Sales moves Lead → Onboarding when a deal is won). No automatic or triggered transitions in v1 — consistent with the standing "no automation engine" non-goal. | Must |
| **CJ-4** | Each Team touching Customers keeps its own local workflow underneath a stage, using the existing per-Team Work Item and workflow engine — no new mechanism, just applied here. | Must |
| **CJ-5** | This Module can be turned off org-wide by Org Admin. If off, Customer stays a flat record with no macro stage (CU-1 still applies). | Must |
| **CJ-6** | Dedicated Deal/Opportunity template, health scoring, churn prediction, forecasting — unchanged, still deferred (CU-3). | Won't (v1) |

---

## 9. Module B: Product Lifecycle

**Purpose:** give BA, Dev, QA, and (at the edges) Marketing and Support one shared view of where a body of work sits, from idea to shipped to maintained.

**Macro stage (shared, Org-level, on the Initiative):**  
`Idea` → `Planned` → `In Development` → `QA` → `Released` → `Maintenance`.

**What stays local to each Team:**
- **BA** runs its own requirement-gathering and approval process, scoped under "Idea"/"Planned."
- **Dev** runs its existing sprint/board workflow, scoped under "In Development" — exactly what's already defined in §7.
- **QA** runs its own defect/test-case workflow, scoped under "QA."
- **Support's** post-release fix work (linked Tickets → Dev Tasks, via ORG-6) sits under "Maintenance."
- **Marketing's** involvement, if any, is at "Released" (launch communications) — using its own Task-based workflow, unchanged. Marketing is not required to participate in this Module at all.

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **PL-1** | Initiative gets a macro Lifecycle Stage field (default list above), Org-level, editable only by Org Admin. | Must |
| **PL-2** | Stage changes logged through the same change-history mechanism as everywhere else (§7.5). | Must |
| **PL-3** | Stage changes are manual, made by an authorized Member on a Team with access to the Initiative. No automation/triggers in v1. | Must |
| **PL-4** | Each Team contributing to an Initiative keeps its own local workflow underneath a stage — no new mechanism, just applied here. | Must |
| **PL-5** | This Module can be turned off org-wide by Org Admin. If off, Initiative stays a flat tag with no macro stage (ORG-5 still applies). | Must |
| **PL-6** | Release automation, dependency scheduling, Gantt/roadmap views — unchanged, still deferred. | Won't (v1) |

---

## 10. Cross-Module Mechanics
The two pieces that connect the two journeys into one loop, rather than two parallel lists sitting near each other.

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **XM-1** | An "originated from" link type, distinct from the general relates-to/blocks/duplicates set (ORG-6) — marks that an Initiative or a Work Item explicitly originated from a specific Customer, Ticket, or piece of feedback. This is the "customer feedback became an idea" connection. | Must |
| **XM-2** | A Timeline view, per Customer and per Initiative — a chronological feed built entirely from existing change-history records (stage changes plus linked Work Item activity). No new data store; a filtered read of what's already being logged. | Should |
| **XM-3** | Where a Team wants its own local workflow status to signal a macro stage change (e.g., Dev marking a Task "Done" nudging the Initiative toward "Released"), that mapping is configured by the Team Admin, the same way status/priority normalization already works (ORG-7) — never hardcoded into the platform. | Should |

---

## 11. Stage Track Governance (formerly "Module Governance")

~~MG-1 through MG-3 as originally scoped to exactly two fixed Modules~~ — **overridden by direct user request, August 17, 2026** (see ARCHITECTURE.md's Phase 16 Build Log entry): Modules generalize into Stage Tracks, described below and in §6.

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| **MG-1** | Stage Tracks are additive and fully independent of each other and of any Team's own configuration. A Team can run entirely on the Core Platform without any Stage Track ever touching it. | Must |
| **MG-2** | Turning a Stage Track on never changes an existing Team's workflow, custom fields, board, or data. It only adds the macro stage field to the entity type it targets (Customer, Initiative, Team, or Work Item), plus — for Customer/Initiative — the link type and timeline view in §10. | Must |
| **MG-3** | The architecture doesn't hardcode "exactly two Modules" — realized literally as of this revision: v1 ships **four** Stage Tracks (`customer`, `initiative`, `team`, `work_item`), one per entity type, each with its own independently editable stage list (add/rename/reorder/remove a stage) and enabled flag, managed by Org Admin at `/settings/modules`. A future entity type follows the same shape: one more `StageTrack` row, reusing the existing change-history and per-Team workflow engine — no new subsystem required. | Should |

---

## 12. Explicitly Out of Scope for v1

### Integrations & Automation
- Third-party integrations (GitHub/GitLab/Slack) beyond basic webhooks.
- An automation/rules engine.
- Automatic or triggered macro stage transitions (CJ-3, PL-3) — manual only in v1.

### Depth per Function
- Full CRM functionality for Sales (deal pipelines, forecasting, revenue reporting) — dedicated Deal template (CU-3, WT-3).
- Marketing-specific analytics (campaign attribution, channel performance, audience segmentation).
- SLA automation for Support (business-hours timers, auto-escalation, breach alerts).
- Customer health scoring, renewal/churn workflows for CS.
- Cross-team Program/roadmap view (beyond the lightweight Initiative tag).
- A branded, white-labeled self-service customer portal; external customer login at all (CU-2, Open Question 4).

### Platform & Access
- Billing, plans, seats, trial/paid distinction — not applicable to an internal tool.
- Org-wide search across Teams (DB-4).
- Multiple Organizations — v1 provisions exactly one.
- More than one Project per Team.
- Native mobile apps (responsive web only).
- On-premise/self-hosted deployment.
- ~~Time tracking / worklogs.~~ — **overridden by direct user request, August 18, 2026** (see ARCHITECTURE.md's "Time Tracking (WL-1–WL-5)" Build Log entry). Per-day, per-person work logs against a Work Item are now in scope — see §7.12.

### Modules
- A third Module beyond Customer Journey and Product Lifecycle (architecture supports it later — MG-3 — none is being built now).
- Per-Team exceptions to the shared macro stage list (see Open Question 7) — v1 assumes the list stays uniform.

---

## 13. Success Metrics (v1)

- A new team can go from onboarding to a configured board in under 10 minutes, unassisted.
- Core actions (create Work Item, move card, comment) complete in under 300ms p95.
- Zero cross-Team or cross-Guest data leaks — tested explicitly, not assumed.
- At least 3 pilot Teams actively using boards (and sprints, where applicable) for 2+ consecutive sprints before wider release.
- A brand-new Team type can be created and made usable purely through Org Admin/Team Admin configuration, with zero new engineering.
- An Org Admin can see open/closed/overdue counts across every Team within one click of login, filterable by Initiative, with numbers that are actually comparable across Teams (proves ORG-5/ORG-7).
- A Support Ticket can be linked directly to the Dev Task that caused it, visible from both sides (proves ORG-6).
- A Team Admin can rename what a Work Item is called in their Team's UI with zero engineering support (proves ORG-8).
- A Guest granted access to one Work Item gets notified when it changes and sees nothing else in that Team (proves MB-3–MB-5).
- Turning a Module off leaves every existing Team's board, workflow, and data completely untouched — verified by toggling it after both Modules are in active use, not just by reading the toggle's code path.
- A Customer's full Timeline (Lead through wherever they are now) can be read as one chronological feed without querying more than one view.
- Sales, CS, and Support can each point to a moment where they run their process differently from one another under the same macro stage — proving a Module didn't quietly standardize their workflows.

---

## 14. Open Questions

1. **"Scrum" as a Team:** assumed to mean a Program/Scrum Master function coordinating ceremonies and sprint cadence across Teams, not a delivery Team producing its own Work Items — it may end up being a dashboard view rather than a seeded Team. Confirm before locking §4.2.
2. **Launch Team pair:** this document recommends Dev + Support as the two proof-of-concept Teams (§5). Confirm, or pick differently if there's a specific internal commitment driving order.
3. **Seed list scope:** should all eight Team types in §4.2 exist at launch, or ship with 2–3 pre-provisioned and let Org Admin add the rest? Leaning toward the latter for a simpler first-login experience.
4. **External customer access:** does Support or CS ever need to give an actual customer direct login access to view their own Tickets, or does the company always work Tickets on the customer's behalf (email, phone, etc.)? This determines whether Guest ever gets used for anyone outside the company, or stays purely internal (CU-2).
5. **Single Organization:** is one Organization a safe permanent assumption, or should we expect subsidiaries/separate business units that might eventually want their own Organization? Schema already supports more than one if needed — worth confirming this isn't quietly needed sooner than "later."
6. **Automation timing:** v1 assumes every macro stage transition is a manual action by a person. If any team already relies on an automatic trigger (e.g., a won deal auto-advancing a Customer), confirm manual-only doesn't break something they depend on today.
7. **Stage list uniformity:** should the macro stage list be strictly uniform across every Team touching that entity, or should a Team be able to propose an exception (e.g., CS wanting an "At Risk" stage Sales never sees)? This document assumes uniform, since a forked list would undercut the point of a shared view — worth confirming explicitly.
8. **Module scope at launch:** is Marketing meaningfully "in" Module B (contributing at Released), or should it be left out of the Module entirely for v1?
9. **Module launch order:** do both Modules ship together, or does one go first? Module A pairs naturally with the Dev + Support launch Teams (§5) only if Sales/CS are also part of the initial rollout — confirm this matches the actual sequencing plan.

---

## 15. Appendix: Glossary

| Term | Definition |
| :--- | :--- |
| **Organization** | The top-level container. v1 has exactly one — the company itself. |
| **Team** | A sub-unit of the Organization representing a function (Dev, QA, Sales, Marketing, etc.). An RBAC boundary, not a separate tenant. |
| **Project** | A container for Work Items within a Team, 1:1 with the Team in v1. |
| **Work Item** | The generic unit of work (earlier drafts: "Issue"). Instantiated via a template (Task, Ticket) and displayed under a per-Team label. |
| **Task** | The default Work Item template for internal work. |
| **Ticket** | A Work Item template for customer-facing work; requires a linked Customer record. |
| **Workflow** | The set of statuses and allowed transitions a Work Item template follows, configurable per Team. |
| **Initiative** | A shared, Org-level tag that groups Work Items across Teams around one cross-team effort — optionally also **Team-run**: given a `teamId`, start/end dates, and a sprint goal, the same Initiative becomes a time-boxed container one Team plans work into (the role formerly played by the separate **Sprint** concept, retired and folded into Initiative by direct user request, August 17, 2026 — see ARCHITECTURE.md's Phase 16 Build Log entry; a time-boxed iteration containing a subset of a Team's backlog Work Items is now just an Initiative with `teamId` set, not a distinct model). |
| **Member** | An Org-level user account belonging to zero or more Teams, each with a role. |
| **Guest** | The lowest-privilege role; grants access to specific Work Items or one Initiative rather than a whole Team. Uses the same login as any Member. |
| **Customer** | A single, Org-level record for an external company or individual, referenced (not duplicated) by any Team that works with them. |
| **Stage Track** | An org-wide, Org-Admin-editable named list of stages targeting one entity type (Customer, Initiative, Team, or Work Item) — the generalized form of the former **Module** concept (retired and folded into this, August 17, 2026 — see §6/§11 and ARCHITECTURE.md's Phase 16 Build Log entry). Toggleable independently per entity type; never alters any Team's own workflow. |
| **Macro stage** | The current value of an entity's Stage Track field — visible across Teams, distinct from any Team's own local workflow statuses. |
| **Local workflow** | A Team's own statuses and process for its Work Items — the mechanism defined in WF-1–WF-5, unaffected by any Stage Track. |
