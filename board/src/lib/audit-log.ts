import "server-only";
import { connectDB } from "@board/lib/mongodb";
import { ChangeHistory, type ChangeHistoryKind } from "@board/models/ChangeHistory";
import { Team } from "@board/models/Team";
import { Customer } from "@board/models/Customer";
import { Initiative } from "@board/models/Initiative";
import { Member } from "@board/models/Member";
import { WorkItem } from "@board/models/WorkItem";
import { getEffectiveWorkflow } from "@board/lib/workflow";
import { PRIORITY_LABEL, type Priority } from "@board/lib/status-categories";

export type AuditLogFilters = {
  memberId?: string | null;
  teamId?: string | null;
  from?: string | null; // ISO date, inclusive
  to?: string | null; // ISO date, inclusive
};

export type AuditLogEntry = {
  id: string;
  createdAt: string;
  memberId: string;
  memberName: string;
  kind: ChangeHistoryKind;
  teamName: string | null;
  entityLabel: string;
  entityHref: string | null;
  description: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  status: "Status",
  priority: "Priority",
  assignee: "Assignee",
  collaborators: "Collaborators",
  labels: "Labels",
  dueDate: "Due date",
  customerId: "Customer",
  initiativeId: "Initiative",
  journeyStage: "Journey Stage",
  lifecycleStage: "Lifecycle Stage",
  macroStage: "Macro Stage",
  originatedFromKind: "Origin type",
  originatedFromId: "Origin reference",
  isEpic: "Epic status",
};

function fieldLabel(field: string | undefined): string {
  if (!field) return "field";
  if (field.startsWith("customFields.")) return field.slice("customFields.".length);
  return FIELD_LABELS[field] ?? field;
}

/**
 * A deliberately shallower value formatter than history-feed.tsx's — this
 * page spans every Team's workflow/custom fields at once, so per-Team
 * context (status labels) is only resolved where cheap to batch (see
 * statusLabel below); everything else renders as its raw stored value,
 * which is still meaningful for an audit trail (unlike the single-item
 * detail page, nobody's reading this to recognize a status pill's color).
 */
function formatValue(
  field: string | undefined,
  value: unknown,
  ctx: { memberNames: Map<string, string>; statusLabel?: (v: string) => string }
): string {
  if (value === null || value === undefined || value === "") return "(none)";
  if (field === "status" && ctx.statusLabel) return ctx.statusLabel(String(value));
  if (field === "priority") return PRIORITY_LABEL[value as Priority] ?? String(value);
  if (field === "assignee" || field === "originatedFromId") {
    return ctx.memberNames.get(String(value)) ?? String(value);
  }
  if (field === "dueDate") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "(none)";
  if (field === "isEpic") return value ? "Epic" : "Not an Epic";
  return String(value);
}

/**
 * CT-7: Org-Admin-only, reads directly from the same append-only
 * `ChangeHistory` collection everything else in the app already writes to
 * (CT-1/CT-2/CT-4, CJ-2/PL-2, IT-9) — "one audit engine, just a different
 * read," the same principle Phase 10's Module A/B stage-history views
 * established for a narrower slice. No new collection, no new write path.
 *
 * `ChangeHistory` rows aren't tagged with `organizationId` directly (they're
 * scoped by `teamId`/`customerId`/`initiativeId`, each of which IS org-scoped)
 * — so the org boundary here is enforced by first resolving every Team/
 * Customer/Initiative id that belongs to this Organization, then matching
 * rows against that id set, never against the whole collection unscoped
 * (Non-Negotiable #4).
 */
export async function listOrgAuditLog(params: {
  organizationId: string;
  filters: AuditLogFilters;
  page: number;
  pageSize?: number;
}): Promise<{ entries: AuditLogEntry[]; total: number; page: number; pageSize: number }> {
  await connectDB();
  const pageSize = params.pageSize ?? 50;

  const [teams, customers, initiatives] = await Promise.all([
    Team.find({ organizationId: params.organizationId }, "name").lean<{ _id: unknown; name: string }[]>(),
    Customer.find({ organizationId: params.organizationId }, "name").lean<{ _id: unknown; name: string }[]>(),
    Initiative.find({ organizationId: params.organizationId }, "name").lean<{ _id: unknown; name: string }[]>(),
  ]);
  const teamIds = teams.map((t) => String(t._id));
  const teamNameById = new Map(teams.map((t) => [String(t._id), t.name]));
  const customerNameById = new Map(customers.map((c) => [String(c._id), c.name]));
  const initiativeNameById = new Map(initiatives.map((i) => [String(i._id), i.name]));

  const andClauses: Record<string, unknown>[] = [];
  if (params.filters.teamId) {
    andClauses.push({ teamId: params.filters.teamId });
  } else {
    andClauses.push({
      $or: [
        { teamId: { $in: teamIds } },
        { customerId: { $in: customers.map((c) => c._id) } },
        { initiativeId: { $in: initiatives.map((i) => i._id) } },
      ],
    });
  }
  if (params.filters.memberId) andClauses.push({ memberId: params.filters.memberId });
  if (params.filters.from || params.filters.to) {
    const range: Record<string, Date> = {};
    if (params.filters.from) range.$gte = new Date(`${params.filters.from}T00:00:00.000Z`);
    if (params.filters.to) range.$lte = new Date(`${params.filters.to}T23:59:59.999Z`);
    andClauses.push({ createdAt: range });
  }
  const query = andClauses.length === 1 ? andClauses[0] : { $and: andClauses };

  const [total, rows] = await Promise.all([
    ChangeHistory.countDocuments(query),
    ChangeHistory.find(query)
      .sort({ createdAt: -1 })
      .skip((params.page - 1) * pageSize)
      .limit(pageSize)
      .lean<
        {
          _id: unknown;
          createdAt: Date;
          memberId: unknown;
          kind: ChangeHistoryKind;
          teamId?: unknown;
          workItemId?: unknown;
          customerId?: unknown;
          initiativeId?: unknown;
          field?: string;
          oldValue?: unknown;
          newValue?: unknown;
          commentText?: string;
          attachmentAction?: string;
          attachmentFilename?: string;
        }[]
      >(),
  ]);

  const memberIds = [...new Set(rows.map((r) => String(r.memberId)))];
  const workItemIds = [...new Set(rows.filter((r) => r.workItemId).map((r) => String(r.workItemId)))];

  const [members, workItems] = await Promise.all([
    Member.find({ _id: { $in: memberIds } }, "name").lean<{ _id: unknown; name: string }[]>(),
    workItemIds.length
      ? WorkItem.find({ _id: { $in: workItemIds } }, "key title type teamId").lean<
          { _id: unknown; key: string; title: string; type: string; teamId: unknown }[]
        >()
      : Promise.resolve([]),
  ]);
  const memberNameById = new Map(members.map((m) => [String(m._id), m.name]));
  const workItemById = new Map(workItems.map((w) => [String(w._id), w]));

  const combos = new Map<string, { teamId: string; type: string }>();
  for (const w of workItems) {
    const teamId = String(w.teamId);
    combos.set(`${teamId}|${w.type}`, { teamId, type: w.type });
  }
  const workflowByCombo = new Map(
    await Promise.all(
      [...combos.entries()].map(
        async ([key, c]) => [key, await getEffectiveWorkflow(c.teamId, c.type)] as const
      )
    )
  );

  const entries: AuditLogEntry[] = rows.map((row) => {
    const memberName = memberNameById.get(String(row.memberId)) ?? "Unknown Member";
    const teamId = row.teamId ? String(row.teamId) : null;
    const teamName = teamId ? (teamNameById.get(teamId) ?? "Unknown Team") : null;

    let entityLabel: string;
    let entityHref: string | null;
    let statusLabel: ((v: string) => string) | undefined;

    if (row.workItemId) {
      const item = workItemById.get(String(row.workItemId));
      entityLabel = item ? `${item.key} — ${item.title}` : "Deleted Work Item";
      entityHref = item ? `/dashboard/board/teams/${item.teamId}/work-items/${row.workItemId}` : null;
      if (item) {
        const workflow = workflowByCombo.get(`${String(item.teamId)}|${item.type}`);
        statusLabel = (v) => workflow?.statuses.find((s) => s.key === v)?.label ?? v;
      }
    } else if (row.customerId) {
      const name = customerNameById.get(String(row.customerId));
      entityLabel = name ? `Customer: ${name}` : "Deleted Customer";
      entityHref = name ? `/dashboard/board/customers/${row.customerId}` : null;
    } else if (row.initiativeId) {
      const name = initiativeNameById.get(String(row.initiativeId));
      entityLabel = name ? `Initiative: ${name}` : "Deleted Initiative";
      entityHref = name ? `/dashboard/board/initiatives/${row.initiativeId}` : null;
    } else if (row.teamId) {
      // Phase 16 (Design 1): a Team's own macroStage change — the one row
      // shape scoped by teamId alone, no workItemId/customerId/initiativeId
      // (see recordTeamStageChange, src/lib/work-item-history.ts).
      entityLabel = teamName ? `Team: ${teamName}` : "Deleted Team";
      entityHref = teamName ? `/dashboard/board/settings/teams/${row.teamId}` : null;
    } else {
      entityLabel = "Unknown";
      entityHref = null;
    }

    const ctx = { memberNames: memberNameById, statusLabel };
    let description: string;
    if (row.kind === "comment") {
      description = `commented: "${(row.commentText ?? "").slice(0, 140)}${(row.commentText?.length ?? 0) > 140 ? "…" : ""}"`;
    } else if (row.kind === "attachment") {
      description = `${row.attachmentAction === "removed" ? "removed" : "added"} attachment "${row.attachmentFilename ?? ""}"`;
    } else {
      description = `changed ${fieldLabel(row.field)} from ${formatValue(row.field, row.oldValue, ctx)} to ${formatValue(row.field, row.newValue, ctx)}`;
    }

    return {
      id: String(row._id),
      createdAt: row.createdAt.toISOString(),
      memberId: String(row.memberId),
      memberName,
      kind: row.kind,
      teamName,
      entityLabel,
      entityHref,
      description,
    };
  });

  return { entries, total, page: params.page, pageSize };
}
