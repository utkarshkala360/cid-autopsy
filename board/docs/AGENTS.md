<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Ground Truth & Architectural Guidelines

This repository represents **360 Cloud Board**, an internal system of record for work and customer interaction.

## Authoritative Specification
The complete single source of truth for requirements, domain architecture, roles/RBAC, and workflows is codified in:
- [REQUIREMENTS.md](file:///c:/Users/Utkarsh/OneDrive%20-%20360%20DEGREE%20CLOUD%20TECHNOLOGIES%20PRIVATE%20LIMITED/Documents/Github/360-Cloud-Board/REQUIREMENTS.md) (v0.5 Consolidated)

---

## Core Architectural Truths

1. **Domain Hierarchy**:
   - `Organization` (top-level container; v1 has exactly one).
   - `Team` (sub-unit representing a function: Dev, QA, BA, Customer Support, Customer Success, Sales, Marketing).
   - `Project` (1:1 with Team in v1).
   - `Work Item` (generic unit of work instantiated as Task or Ticket; customizable with per-team workflows, custom fields, and display labels).
   - `Customer` (single Org-level record shared across Sales, CS, and Support).
   - `Initiative` (Org-level tag grouping Work Items across Teams).

2. **Core Platform vs. Modules Architecture**:
   - **Core Platform**: All teams operate on the generic Work Item engine, RBAC, audit trail, cross-team linking, Initiative tags, and display labels.
   - **Modules (additive, toggleable org-wide by Org Admin)**:
     - **Module A (Customer Journey)**: Adds macro stage (`Lead` → `Onboarding` → `Active` → `Renewal/Expansion` → `Offboarding`) to Customer entity.
     - **Module B (Product Lifecycle)**: Adds macro stage (`Idea` → `Planned` → `In Development` → `QA` → `Released` → `Maintenance`) to Initiative entity.
     - Modules **never** alter or dictate local team workflows or custom fields.

3. **RBAC & Security**:
   - 5 Roles: `Org Admin`, `Team Admin`, `Team Member`, `Team Viewer`, `Guest`.
   - `Guest` is scoped per-item or per-Initiative using standard login credentials.
   - All role boundaries and permissions must be strictly enforced server-side.

4. **Audit Trail**:
   - Single immutable field-level change history mechanism across all Work Items, Customers, and Initiatives.

5. **Scope Guardrails (v1 Non-Goals)**:
   - No billing/plans/seats (internal tool).
   - No external third-party integrations beyond basic webhooks.
   - No automation/rules engine (macro stage transitions are manual in v1).
   - Single Project per Team in v1.
   - Team-scoped search in v1.

---

## Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js (App Router) + TypeScript |
| **Database** | MongoDB (Atlas) |
| **Hosting** | Vercel |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Auth** | NextAuth.js |
| **Validation** | Zod |
| **File Storage** | Vercel Blob (Phase 10) |

---

## Build Methodology

- The project is built in **sequential phases** (Phase 1 through Phase 10+). Each phase assumes all prior phases are complete and deployed.
- Every phase must leave the repo in a **deployable state** (`npm run build` passes cleanly).
- The living contract is **ARCHITECTURE.md** — created in Phase 1, updated at the end of every phase. It holds:
  - Non-Negotiables (below)
  - Data Model (every Mongo collection/schema)
  - Design System (tokens from Phase 1, reused everywhere)
  - Environment Variables (every var the app needs)
  - Build Log (dated entry per phase: what was added, what must not break)

### Prerequisites (before Phase 1)
- A MongoDB Atlas cluster with a connection string.
- A GitHub repo for the project.
- A Vercel project linked to that repo.
- (Phase 2) A Google Cloud OAuth client ID/secret for Google Sign-In.
- Real values supplied as environment variables in Vercel and local `.env.local` (gitignored). **Never invent or hardcode credentials.**

---

## Non-Negotiables

These rules are **absolute** and checked against at the end of every phase:

1. **Server-side permission checks**: Every permission check happens server-side (API route / server action). A direct API call from an unauthorized role must fail exactly like a blocked UI action would.
2. **No secrets in source control**: All credentials via environment variables; `.env.example` lists names only, never real values.
3. **Passwords hashed (bcrypt)**: Never stored or logged in plaintext.
4. **Org+Team scoped queries**: Every query returning Team, Work Item, or Customer data is scoped by Organization and Team, even though v1 has one Organization — write every query as if there were many.
5. **Append-only change history**: No route may update or delete a history record, for any role, including Org Admin.
6. **Generic engine, no bespoke paths**: New Team types or Work Item templates are added through the existing generic engine (config), never a hard-coded path for one team.
7. **Real UI states**: Every UI view ships with real loading, empty, and error states — no screen may show nothing or spin forever.
8. **Clean build**: `npm run build` passes cleanly before a phase is considered done.
