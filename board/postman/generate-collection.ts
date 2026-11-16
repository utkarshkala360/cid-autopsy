/**
 * Generates the 360 Cloud Board Postman collection + companion environment
 * from a structured endpoint list, rather than hand-authoring ~90 deeply
 * nested JSON objects. Run with:
 *
 *   npx tsx postman/generate-collection.ts
 *
 * Regenerate this file's output any time a route under src/app/api/** is
 * added, removed, or has its Zod schema / authz gate changed — the
 * endpoint list below is the single source of truth for the collection.
 *
 * Coverage note: every src/app/api/**\/route.ts export in this repo is
 * represented below EXCEPT src/app/api/auth/[...nextauth]/route.ts, which is
 * NextAuth's own handler (no custom Zod schema or authz gate to document).
 * Its three practically-useful endpoints (csrf/callback/session) are
 * hand-built in the Auth folder below instead, since they're NextAuth
 * framework endpoints rather than app routes with their own schema.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type JsonBody = { type: "json"; value: unknown };
type UrlEncodedBody = {
  type: "urlencoded";
  value: { key: string; value: string; description?: string }[];
};
type FormDataBody = {
  type: "formdata";
  value: {
    key: string;
    value?: string;
    src?: string;
    type: "text" | "file";
    description?: string;
  }[];
};
type NoBody = { type: "none" };
type Body = JsonBody | UrlEncodedBody | FormDataBody | NoBody;

type QueryParam = {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
};

type Endpoint = {
  method: Method;
  /** Folder path this request lives under, e.g. ["Work Items", "Nested Resources"]. */
  folder: string[];
  name: string;
  /** URL path segments AFTER /api, using {{var}} for path params. */
  path: string[];
  query?: QueryParam[];
  /** One-line description: what it does + which authz.ts gate it requires. */
  description: string;
  body?: Body;
};

// ---------------------------------------------------------------------------
// Endpoint catalogue — one entry per exported HTTP method across every
// route.ts under src/app/api/** (see coverage note above for the one
// deliberate exception).
// ---------------------------------------------------------------------------

const endpoints: Endpoint[] = [
  // ---- Health ----------------------------------------------------------
  {
    method: "GET",
    folder: ["Health"],
    name: "Health Check",
    path: ["health"],
    description:
      "Pings the actual MongoDB connection and returns 200 if reachable, 503 if not. Public — no authentication required.",
  },

  // ---- Members & Profile -------------------------------------------------
  {
    method: "PATCH",
    folder: ["Members & Profile"],
    name: "Update Member Profile",
    path: ["members", "{{memberId}}"],
    description:
      "Update a Member's display name. Requires self or Org Admin (requireSelfOrOrgAdmin) — a Member may always edit their own profile; an Org Admin may edit anyone's.",
    body: { type: "json", value: { name: "Jane Doe" } },
  },
  {
    method: "POST",
    folder: ["Members & Profile"],
    name: "Change Password",
    path: ["members", "{{memberId}}", "password"],
    description:
      "Change a Member's password (bcrypt-hashed). Requires self or Org Admin (requireSelfOrOrgAdmin). currentPassword is required when changing your own password if you already have one set (omit it for an OAuth-only Member setting a password for the first time, or when an Org Admin is changing someone ELSE's password).",
    body: {
      type: "json",
      value: { currentPassword: "OldPassword123", newPassword: "NewPassword456" },
    },
  },
  {
    method: "POST",
    folder: ["Members & Profile"],
    name: "Upload Avatar",
    path: ["members", "{{memberId}}", "avatar"],
    description:
      "Upload a new avatar image to Vercel Blob (PNG/JPEG/WebP/GIF, max 4 MB). Requires self or Org Admin (requireSelfOrOrgAdmin). Body: multipart/form-data with a 'file' field.",
    body: {
      type: "formdata",
      value: [{ key: "file", type: "file", src: "", description: "Image file (PNG/JPEG/WebP/GIF, max 4MB)." }],
    },
  },

  // ---- Teams ---------------------------------------------------------------
  {
    method: "GET",
    folder: ["Teams"],
    name: "List Teams",
    path: ["teams"],
    description: "List every Team in the Organization. Any authenticated Member.",
  },
  {
    method: "POST",
    folder: ["Teams"],
    name: "Create Team",
    path: ["teams"],
    description:
      "Create a new Team. Requires Org Admin (requireOrgAdmin). primaryWorkItemType is optional (defaults to \"task\") and must match an existing Work Item Template key (see Work Item Templates folder).",
    body: { type: "json", value: { name: "Customer Success", primaryWorkItemType: "task" } },
  },
  {
    method: "PATCH",
    folder: ["Teams"],
    name: "Update Team",
    path: ["teams", "{{teamId}}"],
    description:
      "Update a Team's name, active flag, and/or primary Work Item template (all fields optional; at least one required). Requires Org Admin (requireOrgAdmin).",
    body: { type: "json", value: { name: "Customer Success", active: true, primaryWorkItemType: "task" } },
  },
  {
    method: "GET",
    folder: ["Teams"],
    name: "List Team Members",
    path: ["teams", "{{teamId}}", "members"],
    description: "List every TeamMembership row for a Team. Requires Team Viewer+ (requireTeamRole 'viewer').",
  },
  {
    method: "POST",
    folder: ["Teams"],
    name: "Add Team Member",
    path: ["teams", "{{teamId}}", "members"],
    description:
      "Invite/assign a Member to a Team with a role (upserts the TeamMembership row). Requires Team Admin (requireTeamRole 'admin'), or Org Admin (inherited). role allowed values: viewer | member | admin.",
    body: { type: "json", value: { email: "member@example.com", role: "member" } },
  },
  {
    method: "DELETE",
    folder: ["Teams"],
    name: "Remove Team Member",
    path: ["teams", "{{teamId}}", "members", "{{memberId}}"],
    description:
      "Remove a Member's TeamMembership row from a Team. Requires Team Admin (requireTeamRole 'admin'), or Org Admin (inherited).",
  },

  // ---- Team Configuration ----------------------------------------------
  {
    method: "GET",
    folder: ["Team Configuration"],
    name: "Get Workflow",
    path: ["teams", "{{teamId}}", "workflow"],
    query: [{ key: "type", value: "task", description: "Work Item type (defaults to \"task\")." }],
    description:
      "Get the effective Workflow (statuses + transitions) for a Work Item type on this Team. Requires Team Viewer+ (requireTeamRole 'viewer').",
  },
  {
    method: "PUT",
    folder: ["Team Configuration"],
    name: "Replace Workflow",
    path: ["teams", "{{teamId}}", "workflow"],
    description:
      "Replace the entire Workflow (statuses + transitions) for a Work Item type on this Team (upsert). Requires Team Admin (requireTeamRole 'admin'), or Org Admin (inherited). status.category allowed values: todo | in_progress | done | blocked. stageNudge.entity allowed values: journeyStage | lifecycleStage (nullable — an optional Team-Admin-configured suggestion). transitions[].requiredFields is filtered to a fixed set: assignee | dueDate | description | labels.",
    body: {
      type: "json",
      value: {
        type: "task",
        statuses: [
          { key: "todo", label: "To Do", category: "todo", stageNudge: null, wipLimit: null },
          { key: "in_progress", label: "In Progress", category: "in_progress", stageNudge: null, wipLimit: 5 },
          { key: "done", label: "Done", category: "done", stageNudge: null, wipLimit: null },
        ],
        transitions: [
          { from: "todo", to: "in_progress", requiredFields: ["assignee"] },
          { from: "in_progress", to: "done", requiredFields: [] },
        ],
      },
    },
  },
  {
    method: "GET",
    folder: ["Team Configuration"],
    name: "List Custom Fields",
    path: ["teams", "{{teamId}}", "fields"],
    query: [{ key: "type", value: "task", description: "Work Item type (defaults to \"task\")." }],
    description: "List Custom Field definitions for a Work Item type on this Team. Requires Team Viewer+ (requireTeamRole 'viewer').",
  },
  {
    method: "POST",
    folder: ["Team Configuration"],
    name: "Create Custom Field",
    path: ["teams", "{{teamId}}", "fields"],
    description:
      "Create a Custom Field definition for a Work Item type on this Team. Requires Team Admin (requireTeamRole 'admin'), or Org Admin (inherited). fieldType allowed values: text | number | dropdown | date | user_picker. options is required (non-empty) when fieldType is \"dropdown\".",
    body: {
      type: "json",
      value: {
        type: "task",
        key: "severity",
        label: "Severity",
        fieldType: "dropdown",
        options: ["Low", "Medium", "High"],
      },
    },
  },
  {
    method: "DELETE",
    folder: ["Team Configuration"],
    name: "Delete Custom Field",
    path: ["teams", "{{teamId}}", "fields", "{{fieldId}}"],
    description: "Delete a Custom Field definition. Requires Team Admin (requireTeamRole 'admin'), or Org Admin (inherited).",
  },
  {
    method: "PATCH",
    folder: ["Team Configuration"],
    name: "Update Display Label",
    path: ["teams", "{{teamId}}", "display-label"],
    description:
      "Override the display label this Team uses for its Work Item type (e.g. \"Ticket\" instead of the template default). Requires Team Admin (requireTeamRole 'admin'), or Org Admin (inherited). Pass null to clear the override and fall back to the template default.",
    body: { type: "json", value: { displayLabel: "Ticket" } },
  },
  {
    method: "PATCH",
    folder: ["Team Configuration"],
    name: "Update Sprint Settings",
    path: ["teams", "{{teamId}}", "sprint-settings"],
    description:
      "Toggle whether Sprints/Team-run Initiatives are enabled for this Team (opt-in, off by default). Requires Team Admin (requireTeamRole 'admin'), or Org Admin (inherited).",
    body: { type: "json", value: { sprintsEnabled: true } },
  },
  {
    method: "PATCH",
    folder: ["Team Configuration"],
    name: "Update Team Macro Stage",
    path: ["teams", "{{teamId}}", "macro-stage"],
    description:
      "Set this Team's macro stage on the \"team\" Stage Track. Requires Org Admin (requireOrgAdmin) — stricter than Team's other config fields. macroStage must be a valid stage key on the enabled \"team\" Stage Track (see Stage Tracks folder), or null to clear.",
    body: { type: "json", value: { macroStage: "lead" } },
  },

  // ---- Work Items: CRUD --------------------------------------------------
  {
    method: "GET",
    folder: ["Work Items"],
    name: "List Work Items",
    path: ["teams", "{{teamId}}", "work-items"],
    query: [{ key: "type", value: "task", description: "Optional Work Item type filter." }],
    description: "List Work Items for a Team. Requires Team Viewer+ (requireTeamRole 'viewer').",
  },
  {
    method: "POST",
    folder: ["Work Items"],
    name: "Create Work Item",
    path: ["teams", "{{teamId}}", "work-items"],
    description:
      "Create a Work Item on this Team. Requires Team Member+ (requireTeamRole 'member'). priority allowed values: low | medium | high | urgent (default medium). status defaults to the Team's first configured status if omitted. customerId is only used when the type's template has requiresCustomer, but is always optional. type defaults to \"task\".",
    body: {
      type: "json",
      value: {
        title: "Fix login redirect bug",
        description: "Steps to reproduce: ...",
        type: "task",
        status: "todo",
        priority: "medium",
        assignee: null,
        labels: ["bug"],
        dueDate: null,
        customFields: {},
        customerId: null,
        initiativeId: null,
        teamInitiativeId: null,
        parentId: null,
      },
    },
  },
  {
    method: "GET",
    folder: ["Work Items"],
    name: "Get Work Item",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}"],
    description:
      "Get a single Work Item. Requires Team Viewer+, OR a Guest with an explicit grant on this exact item or its Initiative (requireWorkItemAccess — the one place that bypass is allowed).",
  },
  {
    method: "PATCH",
    folder: ["Work Items"],
    name: "Update Work Item",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}"],
    description:
      "Update a Work Item (any subset of fields). Requires Team Member+ (requireTeamRole 'member'). Every field change is diffed and logged to the append-only ChangeHistory feed. priority allowed values: low | medium | high | urgent. originatedFromKind allowed values: customer | work_item (must be set/cleared together with originatedFromId). Status transitions are validated against the Team's Workflow and may require additional fields (WF-4) before they're accepted.",
    body: {
      type: "json",
      value: {
        title: "Fix login redirect bug",
        description: "Updated repro steps.",
        status: "in_progress",
        priority: "high",
        assignee: "{{memberId}}",
        labels: ["bug", "urgent"],
        dueDate: "2026-09-01",
        customFields: {},
        customerId: null,
        initiativeId: null,
        teamInitiativeId: null,
        order: 1000,
        parentId: null,
        originatedFromKind: null,
        originatedFromId: null,
        isEpic: false,
      },
    },
  },
  {
    method: "DELETE",
    folder: ["Work Items"],
    name: "Delete Work Item",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}"],
    description:
      "Delete a Work Item. Requires Team Member+ (requireTeamRole 'member'). Its ChangeHistory rows are NOT cascade-deleted (Non-Negotiable #5); its sub-tasks are orphaned to top-level rather than deleted.",
  },

  // ---- Work Items > Nested Resources -------------------------------------
  {
    method: "POST",
    folder: ["Work Items", "Nested Resources"],
    name: "Add Comment",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "comments"],
    description:
      "Add a comment to a Work Item (joins the append-only ChangeHistory feed; comments are never edited or deleted). Requires Team Member+, OR a Guest with an explicit grant on this item (requireWorkItemAccess + canCommentWithAccess).",
    body: { type: "json", value: { text: "This looks good to me, ready for QA." } },
  },
  {
    method: "GET",
    folder: ["Work Items", "Nested Resources"],
    name: "List Attachments",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "attachments"],
    query: [
      {
        key: "groupId",
        value: "",
        description: "Optional — pass an attachment's groupId to list every version of it instead of just the latest of each.",
        disabled: true,
      },
    ],
    description:
      "List the latest version of every attachment on a Work Item (or, with ?groupId=, every version of one attachment group). Requires Team Viewer+, OR a Guest with a grant on this item (requireWorkItemAccess) — Viewer/Guest can download but not delete.",
  },
  {
    method: "POST",
    folder: ["Work Items", "Nested Resources"],
    name: "Upload Attachment",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "attachments"],
    description:
      "Upload a file attachment to a Work Item (to Vercel Blob, max 10 MB). Requires Team Member+ (requireTeamRole 'member'). Body: multipart/form-data with a 'file' field, and an optional 'replacesAttachmentId' text field to upload a new version of an existing attachment.",
    body: {
      type: "formdata",
      value: [
        { key: "file", type: "file", src: "", description: "File to upload (max 10MB)." },
        {
          key: "replacesAttachmentId",
          type: "text",
          value: "",
          description: "Optional — {{attachmentId}} of the attachment this uploads a new version of.",
        },
      ],
    },
  },
  {
    method: "DELETE",
    folder: ["Work Items", "Nested Resources"],
    name: "Delete Attachment",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "attachments", "{{attachmentId}}"],
    description:
      "Delete an attachment group (every version). Requires Team Member+ (requireTeamRole 'member') — excludes Team Viewer and Guest (\"can download but not delete\").",
  },
  {
    method: "GET",
    folder: ["Work Items", "Nested Resources"],
    name: "List Collaborators",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "collaborators"],
    description:
      "List a Work Item's Collaborators (get notifications, no extra access). Requires Team Member+ (requireTeamRole 'member').",
  },
  {
    method: "POST",
    folder: ["Work Items", "Nested Resources"],
    name: "Add Collaborator",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "collaborators"],
    description: "Add a Member as a Collaborator on a Work Item. Requires Team Member+ (requireTeamRole 'member').",
    body: { type: "json", value: { email: "collaborator@example.com" } },
  },
  {
    method: "DELETE",
    folder: ["Work Items", "Nested Resources"],
    name: "Remove Collaborator",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "collaborators", "{{memberId}}"],
    description: "Remove a Collaborator from a Work Item. Requires Team Member+ (requireTeamRole 'member').",
  },
  {
    method: "GET",
    folder: ["Work Items", "Nested Resources"],
    name: "List Guest Grants (Work Item)",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "guests"],
    description:
      "List Guest access grants on a Work Item. Requires Team Admin, OR a Team Member who is this item's reporter (requireTeamRole 'member' + reporter check).",
  },
  {
    method: "POST",
    folder: ["Work Items", "Nested Resources"],
    name: "Grant Guest Access (Work Item)",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "guests"],
    description:
      "Grant a Member Guest access to a single Work Item (upserts by email). Requires Team Admin, OR a Team Member who is this item's reporter (requireTeamRole 'member' + reporter check).",
    body: { type: "json", value: { email: "guest@example.com" } },
  },
  {
    method: "DELETE",
    folder: ["Work Items", "Nested Resources"],
    name: "Revoke Guest Access (Work Item)",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "guests", "{{grantId}}"],
    description:
      "Revoke a Guest access grant on a Work Item. Requires Team Admin, OR a Team Member who is this item's reporter (requireTeamRole 'member' + reporter check).",
  },
  {
    method: "GET",
    folder: ["Work Items", "Nested Resources"],
    name: "Get Work Item History",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "history"],
    description:
      "Get the append-only field-change/comment history for a Work Item (GET only — no route anywhere updates or deletes a ChangeHistory record, Non-Negotiable #5). Requires Team Viewer+, OR a Guest with a grant on this item (requireWorkItemAccess).",
  },
  {
    method: "GET",
    folder: ["Work Items", "Nested Resources"],
    name: "List Links",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "links"],
    description:
      "List every cross-Team link touching this Work Item, from either direction. Requires Team Viewer+ (requireTeamRole 'viewer').",
  },
  {
    method: "POST",
    folder: ["Work Items", "Nested Resources"],
    name: "Create Link",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "links"],
    description:
      "Link this Work Item to another (possibly on a different Team). Requires Team Member+ on this item's Team (requireTeamRole 'member'), AND at least Viewer on the target item's Team. relation allowed values: blocks | is_blocked_by | relates_to | duplicates.",
    body: { type: "json", value: { targetItemId: "{{workItemId}}", relation: "blocks" } },
  },
  {
    method: "DELETE",
    folder: ["Work Items", "Nested Resources"],
    name: "Delete Link",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "links", "{{linkId}}"],
    description: "Remove a link from either side. Requires Team Member+ (requireTeamRole 'member').",
  },
  {
    method: "PATCH",
    folder: ["Work Items", "Nested Resources"],
    name: "Update Work Item Macro Stage",
    path: ["teams", "{{teamId}}", "work-items", "{{workItemId}}", "macro-stage"],
    description:
      "Set a Work Item's macro stage on the \"work_item\" Stage Track. Requires Org Admin (requireOrgAdmin) — stricter than the general Work Item PATCH route. macroStage must be a valid stage key on the enabled \"work_item\" Stage Track, or null to clear.",
    body: { type: "json", value: { macroStage: "idea" } },
  },

  // ---- Initiatives -----------------------------------------------------
  {
    method: "GET",
    folder: ["Initiatives"],
    name: "List Initiatives",
    path: ["initiatives"],
    query: [{ key: "teamId", value: "{{teamId}}", description: "Optional — narrow to one Team's Team-run Initiatives (Sprints).", disabled: true }],
    description: "List Initiatives in the Organization. Any authenticated Member.",
  },
  {
    method: "POST",
    folder: ["Initiatives"],
    name: "Create Initiative",
    path: ["initiatives"],
    description:
      "Create an Initiative. If teamId is omitted/null, this is an ordinary cross-Team tag and requires Org Admin or any Team Admin (requireAnyTeamAdmin). If teamId is set, this is a Team-run Initiative (Sprint) and requires Team Admin on THAT Team (requireTeamRole teamId 'admin') — startDate and endDate are then required.",
    body: {
      type: "json",
      value: {
        name: "Q3 Platform Roadmap",
        description: "Cross-team initiative for Q3 platform work.",
        teamId: null,
        sprintGoal: "",
        startDate: "2026-09-01",
        endDate: "2026-09-14",
      },
    },
  },
  {
    method: "GET",
    folder: ["Initiatives"],
    name: "Get Initiative",
    path: ["initiatives", "{{initiativeId}}"],
    description: "Get a single Initiative. Any authenticated Member.",
  },
  {
    method: "PATCH",
    folder: ["Initiatives"],
    name: "Update Initiative",
    path: ["initiatives", "{{initiativeId}}"],
    description:
      "Update an Initiative's name/description (requireAnyTeamAdmin). sprintGoal/startDate/endDate are only valid on a Team-run Initiative while sprintStatus is still \"planned\", and require Team Admin on ITS OWN Team (requireTeamRole 'admin') — a stricter gate than name/description. originatedFromKind allowed values: customer | work_item (must be set/cleared together with originatedFromId).",
    body: {
      type: "json",
      value: {
        name: "Q3 Platform Roadmap",
        description: "Updated scope.",
        sprintGoal: "Ship the new onboarding flow.",
        startDate: "2026-09-01",
        endDate: "2026-09-14",
        originatedFromKind: null,
        originatedFromId: null,
      },
    },
  },
  {
    method: "PATCH",
    folder: ["Initiatives"],
    name: "Update Lifecycle Stage",
    path: ["initiatives", "{{initiativeId}}", "lifecycle-stage"],
    description:
      "Set an Initiative's macro stage on the \"initiative\" (Product Lifecycle) Stage Track. Requires Org Admin (requireOrgAdmin). lifecycleStage must be a valid stage key on the enabled \"initiative\" Stage Track, or null to clear.",
    body: { type: "json", value: { lifecycleStage: "idea" } },
  },
  {
    method: "GET",
    folder: ["Initiatives"],
    name: "List Guest Grants (Initiative)",
    path: ["initiatives", "{{initiativeId}}", "guests"],
    description: "List Guest access grants on an Initiative. Requires Org Admin, or any Team Admin (requireAnyTeamAdmin).",
  },
  {
    method: "POST",
    folder: ["Initiatives"],
    name: "Grant Guest Access (Initiative)",
    path: ["initiatives", "{{initiativeId}}", "guests"],
    description:
      "Grant a Member Guest access to an Initiative (upserts by email). Requires Org Admin, or any Team Admin (requireAnyTeamAdmin).",
    body: { type: "json", value: { email: "guest@example.com" } },
  },
  {
    method: "DELETE",
    folder: ["Initiatives"],
    name: "Revoke Guest Access (Initiative)",
    path: ["initiatives", "{{initiativeId}}", "guests", "{{grantId}}"],
    description: "Revoke a Guest access grant on an Initiative. Requires Org Admin, or any Team Admin (requireAnyTeamAdmin).",
  },
  {
    method: "POST",
    folder: ["Initiatives"],
    name: "Start Sprint",
    path: ["initiatives", "{{initiativeId}}", "start"],
    description:
      "Start a Team-run Initiative (Sprint) — moves sprintStatus from \"planned\" to \"active\". Requires Team Member+ on the Initiative's own Team (requireTeamRole 'member'). Only valid on an Initiative with a teamId.",
  },
  {
    method: "POST",
    folder: ["Initiatives"],
    name: "Complete Sprint",
    path: ["initiatives", "{{initiativeId}}", "complete"],
    description:
      "Complete a Team-run Initiative (Sprint) — moves sprintStatus to \"completed\". Requires Team Member+ on the Initiative's own Team (requireTeamRole 'member'). Only valid on an Initiative with a teamId.",
  },
  {
    method: "GET",
    folder: ["Initiatives"],
    name: "Export Sprint Burndown (CSV)",
    path: ["initiatives", "{{initiativeId}}", "export"],
    description:
      "CSV export of a Team-run Initiative's (Sprint's) burndown report. Requires Team Viewer+ on the Initiative's own Team (requireTeamRole 'viewer'). Only valid on an Initiative with a teamId.",
  },
  {
    method: "GET",
    folder: ["Initiatives"],
    name: "Export Velocity (CSV)",
    path: ["initiatives", "velocity-export"],
    query: [{ key: "teamId", value: "{{teamId}}", description: "Required — velocity is computed per-Team." }],
    description: "CSV export of a Team's Sprint velocity history. Requires Team Viewer+ (requireTeamRole 'viewer').",
  },

  // ---- Customers -----------------------------------------------------------
  {
    method: "GET",
    folder: ["Customers"],
    name: "List Customers",
    path: ["customers"],
    description: "List every Customer in the Organization. Any authenticated Member (every non-Guest role gets at least View).",
  },
  {
    method: "POST",
    folder: ["Customers"],
    name: "Create Customer",
    path: ["customers"],
    description: "Create a Customer record. Requires Org Admin, or any Team Admin (requireAnyTeamAdmin).",
    body: {
      type: "json",
      value: {
        name: "Acme Corp",
        contacts: [{ name: "John Smith", email: "john@acme.com", phone: "555-0100" }],
      },
    },
  },
  {
    method: "GET",
    folder: ["Customers"],
    name: "Get Customer",
    path: ["customers", "{{customerId}}"],
    description: "Get a single Customer. Any authenticated Member.",
  },
  {
    method: "PATCH",
    folder: ["Customers"],
    name: "Update Customer",
    path: ["customers", "{{customerId}}"],
    description: "Update a Customer's name/contacts. Requires Org Admin, or any Team Admin (requireAnyTeamAdmin).",
    body: {
      type: "json",
      value: {
        name: "Acme Corporation",
        contacts: [{ name: "John Smith", email: "john@acme.com", phone: "555-0100" }],
      },
    },
  },
  {
    method: "PATCH",
    folder: ["Customers"],
    name: "Update Journey Stage",
    path: ["customers", "{{customerId}}", "journey-stage"],
    description:
      "Set a Customer's macro stage on the \"customer\" (Customer Journey) Stage Track. Requires Org Admin (requireOrgAdmin) — stricter than name/contacts. journeyStage must be a valid stage key on the enabled \"customer\" Stage Track, or null to clear.",
    body: { type: "json", value: { journeyStage: "lead" } },
  },

  // ---- Stage Tracks ----------------------------------------------------
  {
    method: "GET",
    folder: ["Stage Tracks"],
    name: "List Stage Tracks",
    path: ["stage-tracks"],
    description:
      "List the 4 Stage Tracks (customer, initiative, team, work_item) — the generalized Modules system. Any authenticated Member.",
  },
  {
    method: "PATCH",
    folder: ["Stage Tracks"],
    name: "Update Stage Track",
    path: ["stage-tracks", "{{trackId}}"],
    description:
      "Update a Stage Track's name, enabled flag, and/or full stage list (all optional; at least one required). Requires Org Admin (requireOrgAdmin). There is no POST/DELETE — the 4 rows are fixed by entityType and self-seeded. Removing a stage key still in live use returns 409.",
    body: {
      type: "json",
      value: {
        name: "Customer Journey",
        enabled: true,
        stages: [
          { key: "lead", label: "Lead" },
          { key: "onboarding", label: "Onboarding" },
          { key: "active", label: "Active" },
          { key: "renewal_expansion", label: "Renewal/Expansion" },
          { key: "offboarding", label: "Offboarding" },
        ],
      },
    },
  },

  // ---- Work Item Templates ----------------------------------------------
  {
    method: "GET",
    folder: ["Work Item Templates"],
    name: "List Work Item Templates",
    path: ["work-item-templates"],
    description:
      "List the Work Item Template registry (Task/Ticket, or any Org-Admin-added template). Any authenticated Member.",
  },
  {
    method: "POST",
    folder: ["Work Item Templates"],
    name: "Create Work Item Template",
    path: ["work-item-templates"],
    description: "Add a new Work Item Template to the registry. Requires Org Admin (requireOrgAdmin).",
    body: { type: "json", value: { key: "bug", label: "Bug", requiresCustomer: false } },
  },
  {
    method: "PATCH",
    folder: ["Work Item Templates"],
    name: "Update Work Item Template",
    path: ["work-item-templates", "{{templateId}}"],
    description:
      "Update a Work Item Template's label and/or requiresCustomer flag (key is not editable). Requires Org Admin (requireOrgAdmin).",
    body: { type: "json", value: { label: "Bug Report", requiresCustomer: false } },
  },
  {
    method: "DELETE",
    folder: ["Work Item Templates"],
    name: "Delete Work Item Template",
    path: ["work-item-templates", "{{templateId}}"],
    description:
      "Delete a Work Item Template. Requires Org Admin (requireOrgAdmin). Blocked with 409 if any Team still uses it as its primaryWorkItemType.",
  },

  // ---- Saved Views -------------------------------------------------------
  {
    method: "GET",
    folder: ["Saved Views"],
    name: "List Saved Views",
    path: ["teams", "{{teamId}}", "saved-views"],
    query: [{ key: "type", value: "task", description: "Required — the Work Item type these Views are for." }],
    description:
      "List Saved Views for a Work Item type on this Team (this Member's own \"self\" Views plus every \"team\" View). Requires Team Viewer+ (requireTeamRole 'viewer').",
  },
  {
    method: "POST",
    folder: ["Saved Views"],
    name: "Create Saved View",
    path: ["teams", "{{teamId}}", "saved-views"],
    description:
      "Save a filter/sort/group-by configuration as a View. Requires Team Viewer+ for visibility \"self\"; visibility \"team\" (shared with everyone) requires Team Member+. visibility allowed values: self | team.",
    body: {
      type: "json",
      value: {
        type: "task",
        name: "My Open Items",
        visibility: "self",
        config: { filters: { groups: [] }, sort: [], groupBy: null },
      },
    },
  },
  {
    method: "PATCH",
    folder: ["Saved Views"],
    name: "Update Saved View",
    path: ["teams", "{{teamId}}", "saved-views", "{{viewId}}"],
    description:
      "Update a Saved View's name/visibility/config (all optional). Requires the View's creator, or Team Admin (requireTeamRole 'admin').",
    body: {
      type: "json",
      value: {
        name: "My Open Items",
        visibility: "team",
        config: { filters: { groups: [] }, sort: [], groupBy: "priority" },
      },
    },
  },
  {
    method: "DELETE",
    folder: ["Saved Views"],
    name: "Delete Saved View",
    path: ["teams", "{{teamId}}", "saved-views", "{{viewId}}"],
    description: "Delete a Saved View. Requires the View's creator, or Team Admin (requireTeamRole 'admin').",
  },

  // ---- Dashboard -----------------------------------------------------------
  {
    method: "GET",
    folder: ["Dashboard"],
    name: "List Dashboard Views",
    path: ["dashboard-views"],
    query: [
      {
        key: "teamId",
        value: "{{teamId}}",
        description: "Optional — omit for Org-level Views, set for Team-level Views.",
        disabled: true,
      },
    ],
    description:
      "List Dashboard Views. Without ?teamId=, lists Org-level Views (any authenticated Member). With ?teamId=, lists that Team's Views and requires Team Viewer+ (requireTeamRole 'viewer').",
  },
  {
    method: "POST",
    folder: ["Dashboard"],
    name: "Create Dashboard View",
    path: ["dashboard-views"],
    description:
      "Create a Dashboard View made of configurable widgets. teamId: null creates an Org-level View — any authenticated Member may publish a \"shared\" Org-level View (a deliberate override of the original spec, see ARCHITECTURE.md). teamId set creates a Team-level View — visibility \"shared\" then requires Team Member+ (requireTeamRole 'member'), \"self\" only requires Viewer. visibility allowed values: self | shared. widgets[].kind allowed values: summary | breakdown | cycle_time | burndown | velocity.",
    body: {
      type: "json",
      value: {
        teamId: null,
        name: "Executive Summary",
        visibility: "self",
        config: {
          widgets: [
            { id: "w1", kind: "summary", title: "Open Items", filters: { groups: [] } },
            { id: "w2", kind: "breakdown", title: "By Priority", filters: { groups: [] }, groupBy: "priority" },
          ],
        },
      },
    },
  },
  {
    method: "PATCH",
    folder: ["Dashboard"],
    name: "Update Dashboard View",
    path: ["dashboard-views", "{{dashboardViewId}}"],
    description:
      "Update a Dashboard View's name/visibility/config (all optional). Requires the View's creator; otherwise a Team-level View requires Team Admin on its Team (requireTeamRole 'admin'), and an Org-level View requires Org Admin or any Team Admin (requireAnyTeamAdmin). Sharing a Team-level View still requires Team Member+ (requireTeamRole 'member').",
    body: {
      type: "json",
      value: {
        name: "Executive Summary",
        visibility: "shared",
        config: { widgets: [{ id: "w1", kind: "summary", title: "Open Items", filters: { groups: [] } }] },
      },
    },
  },
  {
    method: "DELETE",
    folder: ["Dashboard"],
    name: "Delete Dashboard View",
    path: ["dashboard-views", "{{dashboardViewId}}"],
    description:
      "Delete a Dashboard View. Requires the View's creator; otherwise a Team-level View requires Team Admin on its Team, and an Org-level View requires Org Admin or any Team Admin (requireAnyTeamAdmin).",
  },
  {
    method: "GET",
    folder: ["Dashboard"],
    name: "Export Dashboard (CSV)",
    path: ["dashboard", "export"],
    query: [
      { key: "team", value: "all", description: "Team id, or \"all\" (scope limited to Teams the Member can access)." },
      { key: "initiative", value: "all", description: "Initiative id, or \"all\"." },
    ],
    description:
      "CSV export of the Org/Team dashboard report (summary, by-priority, by-team, by-assignee, cycle/lead time). Any authenticated Member — scope is automatically limited to Teams they have a role on.",
  },

  // ---- Search --------------------------------------------------------------
  {
    method: "GET",
    folder: ["Search"],
    name: "Search Work Items",
    path: ["search"],
    query: [{ key: "q", value: "login bug", description: "Search text, minimum 2 characters." }],
    description:
      "Team-scoped search across Work Item title/key, limited to Teams the current Member has a role on. Any authenticated Member.",
  },

  // ---- Notifications ---------------------------------------------------
  {
    method: "GET",
    folder: ["Notifications"],
    name: "List Notifications",
    path: ["notifications"],
    description: "List the current Member's own notifications plus unread count. Any authenticated Member (self-scoped, no Team role needed).",
  },
  {
    method: "PATCH",
    folder: ["Notifications"],
    name: "Mark Notification Read",
    path: ["notifications", "{{notificationId}}"],
    description: "Mark one of the current Member's own notifications as read. Any authenticated Member (self-scoped).",
  },
  {
    method: "POST",
    folder: ["Notifications"],
    name: "Mark All Notifications Read",
    path: ["notifications", "mark-all-read"],
    description: "Mark every unread notification for the current Member as read. Any authenticated Member (self-scoped).",
  },
];

// ---------------------------------------------------------------------------
// Collection variables
// ---------------------------------------------------------------------------

const collectionVariables: { key: string; value: string; description: string }[] = [
  { key: "baseUrl", value: "http://localhost:3000", description: "Base URL of the running app." },
  { key: "testEmail", value: "", description: "Email of an existing account (created via the app's /signup page) to log in as." },
  { key: "testPassword", value: "", description: "Password for testEmail." },
  { key: "csrfToken", value: "", description: "Auto-set by the \"Get CSRF Token\" request's Tests script — leave blank." },
  { key: "teamId", value: "", description: "A Team's _id. Create one via POST {{baseUrl}}/api/teams (Org Admin) and paste its _id here." },
  { key: "workItemId", value: "", description: "A Work Item's _id. Create one via POST .../teams/{{teamId}}/work-items." },
  { key: "initiativeId", value: "", description: "An Initiative's _id. Create one via POST {{baseUrl}}/api/initiatives." },
  { key: "customerId", value: "", description: "A Customer's _id. Create one via POST {{baseUrl}}/api/customers." },
  { key: "memberId", value: "", description: "A Member's _id — e.g. the logged-in user's own id from GET {{baseUrl}}/api/auth/session." },
  { key: "fieldId", value: "", description: "A Custom Field definition's _id, from POST .../teams/{{teamId}}/fields." },
  { key: "viewId", value: "", description: "A Saved View's _id, from POST .../teams/{{teamId}}/saved-views." },
  { key: "dashboardViewId", value: "", description: "A Dashboard View's _id, from POST {{baseUrl}}/api/dashboard-views." },
  { key: "trackId", value: "", description: "A Stage Track's _id, from GET {{baseUrl}}/api/stage-tracks." },
  { key: "templateId", value: "", description: "A Work Item Template's _id, from POST {{baseUrl}}/api/work-item-templates." },
  { key: "grantId", value: "", description: "A Guest grant's id, from a POST .../guests response (reused across Work Item and Initiative guest grants)." },
  { key: "attachmentId", value: "", description: "An Attachment's _id, from POST .../work-items/{{workItemId}}/attachments." },
  { key: "linkId", value: "", description: "A WorkItemLink's _id, from POST .../work-items/{{workItemId}}/links." },
  { key: "notificationId", value: "", description: "A Notification's _id, from GET {{baseUrl}}/api/notifications." },
];

// ---------------------------------------------------------------------------
// Postman Collection Schema v2.1.0 emission
// ---------------------------------------------------------------------------

function buildUrl(path: string[], query?: QueryParam[]) {
  const fullPath = ["api", ...path];
  const queryString = (query ?? [])
    .filter((q) => !q.disabled)
    .map((q) => `${q.key}=${q.value}`)
    .join("&");
  const raw = `{{baseUrl}}/${fullPath.join("/")}${queryString ? `?${queryString}` : ""}`;
  return {
    raw,
    host: ["{{baseUrl}}"],
    path: fullPath,
    ...(query && query.length > 0
      ? { query: query.map((q) => ({ key: q.key, value: q.value, description: q.description, disabled: q.disabled ?? false })) }
      : {}),
  };
}

function buildBody(body?: Body): Record<string, unknown> | undefined {
  if (!body || body.type === "none") return undefined;
  if (body.type === "json") {
    return {
      mode: "raw",
      raw: JSON.stringify(body.value, null, 2),
      options: { raw: { language: "json" } },
    };
  }
  if (body.type === "urlencoded") {
    return {
      mode: "urlencoded",
      urlencoded: body.value.map((v) => ({ key: v.key, value: v.value, description: v.description, type: "text" })),
    };
  }
  return {
    mode: "formdata",
    formdata: body.value.map((v) => ({
      key: v.key,
      type: v.type,
      ...(v.type === "file" ? { src: v.src ?? [] } : { value: v.value ?? "" }),
      description: v.description,
    })),
  };
}

function buildHeaders(body?: Body) {
  if (body && body.type === "json") {
    return [{ key: "Content-Type", value: "application/json" }];
  }
  return [];
}

function buildRequestItem(ep: Endpoint) {
  return {
    name: ep.name,
    request: {
      method: ep.method,
      header: buildHeaders(ep.body),
      url: buildUrl(ep.path, ep.query),
      description: ep.description,
      ...(ep.body ? { body: buildBody(ep.body) } : {}),
    },
    response: [],
  };
}

// Group endpoints into a nested folder tree keyed by folder path.
type FolderNode = { name: string; items: unknown[]; children: Map<string, FolderNode> };

function makeFolderNode(name: string): FolderNode {
  return { name, items: [], children: new Map() };
}

function insertEndpoint(root: FolderNode, ep: Endpoint) {
  let cursor = root;
  for (const segment of ep.folder) {
    if (!cursor.children.has(segment)) {
      cursor.children.set(segment, makeFolderNode(segment));
    }
    cursor = cursor.children.get(segment)!;
  }
  cursor.items.push(buildRequestItem(ep));
}

function folderNodeToItem(node: FolderNode): unknown {
  const childItems = Array.from(node.children.values()).map(folderNodeToItem);
  return {
    name: node.name,
    item: [...node.items, ...childItems],
  };
}

// ---------------------------------------------------------------------------
// Auth folder — hand-built (NextAuth's own endpoints, not an app route with
// a Zod schema/authz gate of its own).
// ---------------------------------------------------------------------------

const authFolderItem = {
  name: "Auth",
  item: [
    {
      name: "Get CSRF Token",
      request: {
        method: "GET",
        header: [],
        url: buildUrl(["auth", "csrf"]),
        description:
          "Fetches a CSRF token required by NextAuth's Credentials sign-in callback. Run this first. The Tests script below stores the token in the {{csrfToken}} collection variable for the next request.",
      },
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: [
              "const data = pm.response.json();",
              'pm.collectionVariables.set("csrfToken", data.csrfToken);',
              'pm.test("CSRF token received", function () {',
              "    pm.expect(data.csrfToken).to.be.a('string').and.not.empty;",
              "});",
            ],
          },
        },
      ],
      response: [],
    },
    {
      name: "Login",
      request: {
        method: "POST",
        header: [{ key: "Content-Type", value: "application/x-www-form-urlencoded" }],
        url: buildUrl(["auth", "callback", "credentials"]),
        description:
          "Logs in with the Credentials provider (email/password, bcrypt-checked against Member.passwordHash). Run \"Get CSRF Token\" first. On success, Postman's cookie jar (on by default in the desktop app, per-domain) automatically carries the resulting session cookie into every subsequent request against the same {{baseUrl}} domain — no manual cookie copying needed. Requires an account that already exists (created via the app's /signup page).",
        body: {
          mode: "urlencoded",
          urlencoded: [
            { key: "email", value: "{{testEmail}}", type: "text" },
            { key: "password", value: "{{testPassword}}", type: "text" },
            { key: "csrfToken", value: "{{csrfToken}}", type: "text" },
            { key: "json", value: "true", type: "text" },
            { key: "callbackUrl", value: "{{baseUrl}}/dashboard", type: "text" },
          ],
        },
      },
      response: [],
    },
    {
      name: "Get Session",
      request: {
        method: "GET",
        header: [],
        url: buildUrl(["auth", "session"]),
        description: "Quick \"am I logged in\" sanity check — returns the current session JSON (or an empty object if not authenticated).",
      },
      response: [],
    },
  ],
};

// ---------------------------------------------------------------------------
// Assemble the full collection
// ---------------------------------------------------------------------------

const root = makeFolderNode("__root__");
for (const ep of endpoints) {
  insertEndpoint(root, ep);
}

// Folder order matches the domain-area structure from the brief.
const folderOrder = [
  "Members & Profile",
  "Teams",
  "Team Configuration",
  "Work Items",
  "Initiatives",
  "Customers",
  "Stage Tracks",
  "Work Item Templates",
  "Saved Views",
  "Dashboard",
  "Search",
  "Notifications",
  "Health",
];

const orderedFolderItems = folderOrder
  .map((name) => root.children.get(name))
  .filter((n): n is FolderNode => !!n)
  .map(folderNodeToItem);

const collection = {
  info: {
    name: "360 Cloud Board",
    description:
      "Full REST API coverage for 360 Cloud Board — every route under src/app/api/**. Start with the Auth folder: run \"Get CSRF Token\" then \"Login\" (fill in testEmail/testPassword first — the account must already exist, created via the app's /signup page, since there is no REST signup endpoint). Postman's cookie jar then carries the session into every other request automatically. Fill in the resource-id collection variables (teamId, workItemId, etc.) by creating records through this same collection and copying the returned _id.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  item: [authFolderItem, ...orderedFolderItems],
  variable: collectionVariables.map((v) => ({ key: v.key, value: v.value, type: "string", description: v.description })),
};

// ---------------------------------------------------------------------------
// Companion environment file
// ---------------------------------------------------------------------------

const environment = {
  id: "360-cloud-board-local",
  name: "360 Cloud Board — Local",
  values: collectionVariables.map((v) => ({
    key: v.key,
    value: v.value,
    type: "default",
    enabled: true,
  })),
  _postman_variable_scope: "environment",
};

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const outDir = __dirname;
writeFileSync(
  join(outDir, "360-Cloud-Board.postman_collection.json"),
  JSON.stringify(collection, null, 2) + "\n",
  "utf8"
);
writeFileSync(
  join(outDir, "360-Cloud-Board.postman_environment.json"),
  JSON.stringify(environment, null, 2) + "\n",
  "utf8"
);

const requestCount = endpoints.length + 3; // + the 3 hand-built Auth requests
console.log(`Generated collection with ${requestCount} requests (${endpoints.length} app routes + 3 Auth) and ${collectionVariables.length} variables.`);
