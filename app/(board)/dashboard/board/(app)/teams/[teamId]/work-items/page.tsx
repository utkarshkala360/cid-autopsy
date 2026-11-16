import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, ClipboardList, ArrowLeft, Columns3, LayoutDashboard } from "lucide-react";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { ViewToolbar, type SavedViewOption } from "@board/components/work-items/view-toolbar";
import {
  LoadMoreWorkItemsTable,
  type InitialWorkItemGroup,
} from "@board/components/work-items/load-more-work-items-table";
import { requireTeamRole } from "@board/lib/authz";
import { getEffectiveWorkflow } from "@board/lib/workflow";
import { getTeamMentionCandidates } from "@board/lib/work-items";
import { connectDB } from "@board/lib/mongodb";
import { WorkItem } from "@board/models/WorkItem";
import { Team, type TeamDoc } from "@board/models/Team";
import { Customer } from "@board/models/Customer";
import { Initiative, type InitiativeDoc } from "@board/models/Initiative";
import { SavedView } from "@board/models/SavedView";
import { labelForTeam, getWorkItemTemplateDefs } from "@board/lib/work-item-templates";
import { PRIORITIES, PRIORITY_LABEL } from "@board/lib/status-categories";
import { decodeViewConfig, encodeViewConfig } from "@board/lib/work-item-views";
import { getWorkItemsPage, DEFAULT_PAGE_SIZE } from "@board/lib/work-item-page-query";
import { toWorkItemRow, buildRowMaps } from "@board/lib/work-item-row";

export default async function WorkItemsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { teamId } = await params;
  const { view } = await searchParams;
  const authz = await requireTeamRole(teamId, "viewer");

  if (!authz.ok && authz.status === 401) {
    redirect("/dashboard/login");
  }

  if (!authz.ok) {
    return (

        <ForbiddenState
          title={authz.status === 404 ? "Team not found" : "You don't have access to this Team"}
          message={
            authz.status === 404
              ? "This Team doesn't exist or was removed."
              : "Viewing Work Items requires at least Team Viewer access."
          }
        />
    );
  }

  await connectDB();
  const team = await Team.findById(teamId).lean<TeamDoc>();
  if (!team) {
    return (

        <ForbiddenState title="Team not found" message="This Team doesn't exist or was removed." />
    );
  }

  // A Team's Work Item type is config (Team.primaryWorkItemType), not a
  // hardcoded page constant — this is what let Support (Ticket) reuse this
  // exact page with zero new code (Phase 6 / ORG-4).
  const workItemType = team.primaryWorkItemType;
  const templates = await getWorkItemTemplateDefs(authz.member.organizationId);
  const typeLabel = labelForTeam(team, templates);
  const isTicket = templates.find((t) => t.key === workItemType)?.requiresCustomer ?? workItemType === "ticket";

  const config = decodeViewConfig(view);

  const [
    pageResult,
    unfilteredCount,
    workflow,
    teamMembers,
    customers,
    initiatives,
    sprints,
    labelOptions,
    savedViews,
  ] = await Promise.all([
    getWorkItemsPage({ teamId, type: workItemType, config, page: 1, pageSize: DEFAULT_PAGE_SIZE }),
    WorkItem.countDocuments({ teamId, type: workItemType }),
    getEffectiveWorkflow(teamId, workItemType),
    getTeamMentionCandidates(teamId),
    isTicket
      ? Customer.find({ organizationId: authz.member.organizationId }, "name").sort({ name: 1 }).lean()
      : Promise.resolve([]),
    Initiative.find({ organizationId: authz.member.organizationId, teamId: null }, "name")
      .sort({ name: 1 })
      .lean(),
    team.sprintsEnabled
      ? Initiative.find({ teamId }).sort({ startDate: 1 }).lean<InitiativeDoc[]>()
      : Promise.resolve([]),
    WorkItem.distinct("labels", { teamId, type: workItemType }) as Promise<string[]>,
    SavedView.find({
      teamId,
      type: workItemType,
      $or: [{ visibility: "team" }, { visibility: "self", createdBy: authz.member._id }],
    })
      .sort({ name: 1 })
      .lean(),
  ]);

  // getWorkItemsPage() already resolved display order/grouping via the
  // aggregation pipeline (Design 1) — this page only needs to turn its raw
  // items into WorkItemRows (toWorkItemRow, shared with the "Load More" API
  // route so a page-2 row is produced identically to a page-1 row) and wrap
  // them for LoadMoreWorkItemsTable's per-group pagination state.
  const allItems = pageResult.mode === "flat" ? pageResult.items : pageResult.groups.flatMap((g) => g.items);
  const { assigneeMap, customerMap } = await buildRowMaps(allItems);
  const rowCtx = { workflow, assigneeMap, customerMap };

  const initialGroups: InitialWorkItemGroup[] =
    pageResult.mode === "flat"
      ? [
          {
            key: "__all__",
            label: "",
            items: pageResult.items.map((i) => toWorkItemRow(i, rowCtx)),
            total: pageResult.total,
            hasMore: pageResult.hasMore,
          },
        ]
      : pageResult.groups.map((g) => ({
          key: g.key,
          label: g.label,
          items: g.items.map((i) => toWorkItemRow(i, rowCtx)),
          total: g.total,
          hasMore: g.hasMore,
        }));

  const totalMatching = initialGroups.reduce((sum, g) => sum + g.total, 0);

  const canCreate = authz.role !== "viewer";
  // IT-5: bulk-PATCHing goes through the same PATCH route as a single edit,
  // which requires Team Member+ (requireTeamRole(teamId, "member")) — so
  // bulk edit is gated identically to individual edit/create, not a
  // separate permission.
  const canBulkEdit = canCreate;

  const fieldOptions = {
    status: workflow.statuses.map((s) => ({ value: s.key, label: s.label })),
    priority: PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
    assignee: teamMembers.map((m) => ({ value: m.id, label: m.name })),
    reporter: teamMembers.map((m) => ({ value: m.id, label: m.name })),
    labels: labelOptions.filter(Boolean).map((l) => ({ value: l, label: l })),
    customerId: customers.map((c) => ({ value: String(c._id), label: c.name as string })),
    initiativeId: initiatives.map((i) => ({ value: String(i._id), label: i.name as string })),
    teamInitiativeId: sprints.map((s) => ({ value: String(s._id), label: s.name as string })),
  };

  const statusOptions = fieldOptions.status;
  const assigneeOptions = fieldOptions.assignee;
  const sprintOptions = team.sprintsEnabled ? fieldOptions.teamInitiativeId : null;

  return (

      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/dashboard/board/work-items"
              className="inline-flex items-center gap-1 text-xs font-medium text-slate hover:text-ink"
            >
              <ArrowLeft className="h-3 w-3" />
              All Teams
            </Link>
            <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-ink">
              {team.name} · {typeLabel}s
            </h1>
            <p className="mt-1 text-xs text-slate">
              {totalMatching} {typeLabel.toLowerCase()}
              {totalMatching === 1 ? "" : "s"}
              {totalMatching !== unfilteredCount && ` (filtered from ${unfilteredCount})`}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <Link
              href={`/dashboard/board/teams/${teamId}/dashboard`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-panel px-3 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-muted"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
            <Link
              href={`/dashboard/board/teams/${teamId}/board`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-panel px-3 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-muted"
            >
              <Columns3 className="h-3.5 w-3.5" />
              Board
            </Link>
            {canCreate && (
              <Link
                href={`/dashboard/board/teams/${teamId}/work-items/new`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover"
              >
                <Plus className="h-3.5 w-3.5" />
                New {typeLabel}
              </Link>
            )}
          </div>
        </div>

        <ViewToolbar
          teamId={teamId}
          type={workItemType}
          fieldOptions={fieldOptions}
          initialViews={savedViews.map((v) => ({
            id: String(v._id),
            name: v.name as string,
            visibility: v.visibility as "self" | "team",
            config: v.config as SavedViewOption["config"],
            mine: String(v.createdBy) === String(authz.member._id),
          }))}
        />

        {unfilteredCount === 0 ? (
          <div className="rounded-xl border border-border bg-panel p-8 text-center shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
              <ClipboardList className="h-7 w-7" />
            </div>
            <h2 className="font-heading text-lg font-bold text-ink">No {typeLabel.toLowerCase()}s yet</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate">
              {canCreate
                ? `Create the first ${typeLabel} for this Team to get started.`
                : "Nothing has been created on this Team yet."}
            </p>
            {canCreate && (
              <Link
                href={`/dashboard/board/teams/${teamId}/work-items/new`}
                className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover"
              >
                <Plus className="h-3.5 w-3.5" />
                New {typeLabel}
              </Link>
            )}
          </div>
        ) : totalMatching === 0 ? (
          <div className="rounded-xl border border-border bg-panel p-8 text-center shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-slate mb-4">
              <ClipboardList className="h-7 w-7" />
            </div>
            <h2 className="font-heading text-lg font-bold text-ink">No matches</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate">
              No {typeLabel.toLowerCase()}s match the current filters. Try widening them.
            </p>
          </div>
        ) : (
          <LoadMoreWorkItemsTable
            key={`${workItemType}:${encodeViewConfig(config)}`}
            teamId={teamId}
            type={workItemType}
            config={config}
            isGrouped={pageResult.mode === "grouped"}
            isTicket={isTicket}
            canBulkEdit={canBulkEdit}
            statusOptions={statusOptions}
            assigneeOptions={assigneeOptions}
            sprintOptions={sprintOptions}
            initialGroups={initialGroups}
          />
        )}
      </div>
  );
}
