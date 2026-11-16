import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarRange, LayoutDashboard } from "lucide-react";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { BoardView } from "@board/components/work-items/board-view";
import { ViewToolbar, type SavedViewOption } from "@board/components/work-items/view-toolbar";
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
import { decodeViewConfig, buildFilterQuery } from "@board/lib/work-item-views";
import { toBoardItem, buildBoardRowMaps, type BoardRowSource } from "@board/lib/board-item-row";

const BOARD_PAGE_SIZE = 50;

export default async function BoardPage({
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
              : "Viewing the Board requires at least Team Viewer access."
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

  // Team.primaryWorkItemType, not a hardcoded constant — this exact page and
  // the KanbanBoard/BacklogList components below are unchanged from Phase 5
  // (Dev/Task); Support (Ticket) reuses them with zero new board code.
  const workItemType = team.primaryWorkItemType;
  const templates = await getWorkItemTemplateDefs(authz.member.organizationId);
  const typeLabel = labelForTeam(team, templates);
  const isTicket = templates.find((t) => t.key === workItemType)?.requiresCustomer ?? workItemType === "ticket";

  const config = decodeViewConfig(view);
  // Board columns are always status — filtering is the only View control
  // that applies here (ViewToolbar's showSortAndGroup={false} below); sort
  // is drag-managed via `order`, and "group by" would mean a different
  // column dimension entirely, a bigger visual rework than this pass covers.
  const workflow = await getEffectiveWorkflow(teamId, workItemType);
  const baseMatch = { teamId, type: workItemType, ...buildFilterQuery(config.filters) };

  // Board pagination (Design 3): each Kanban column fetches its own first
  // page (+ true total, for WIP limits) independently — not one big
  // team-wide fetch like before — and the Backlog tab gets its own flat
  // first page across every status. `columnResults`/`backlogItems` overlap
  // is expected and merged/deduped below (an item can legitimately appear
  // in both a column's first page and Backlog's first page); "Load More"
  // fetches for either come from GET .../work-items?mode=board.
  const [columnResults, backlogItems, backlogTotal, teamMembers, allCustomers, initiatives, sprints, labelOptions, savedViews] =
    await Promise.all([
      Promise.all(
        workflow.statuses.map(async (s) => {
          const match = { ...baseMatch, status: s.key };
          const [colItems, total] = await Promise.all([
            WorkItem.find(match).sort({ order: 1, createdAt: 1 }).limit(BOARD_PAGE_SIZE).lean<BoardRowSource[]>(),
            WorkItem.countDocuments(match),
          ]);
          return { key: s.key, items: colItems, total };
        })
      ),
      WorkItem.find(baseMatch).sort({ order: 1, createdAt: 1 }).limit(BOARD_PAGE_SIZE).lean<BoardRowSource[]>(),
      WorkItem.countDocuments(baseMatch),
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

  const rawById = new Map<string, BoardRowSource>();
  for (const c of columnResults) for (const i of c.items) rawById.set(String(i._id), i);
  for (const i of backlogItems) rawById.set(String(i._id), i);
  const mergedRawItems = [...rawById.values()];

  const { assigneeMap, customerMap } = await buildBoardRowMaps(mergedRawItems);
  const rowCtx = { assigneeMap, customerMap };

  const fieldOptions = {
    status: workflow.statuses.map((s) => ({ value: s.key, label: s.label })),
    priority: PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
    assignee: teamMembers.map((m) => ({ value: m.id, label: m.name })),
    reporter: teamMembers.map((m) => ({ value: m.id, label: m.name })),
    labels: labelOptions.filter(Boolean).map((l) => ({ value: l, label: l })),
    customerId: allCustomers.map((c) => ({ value: String(c._id), label: c.name as string })),
    initiativeId: initiatives.map((i) => ({ value: String(i._id), label: i.name as string })),
    teamInitiativeId: sprints.map((s) => ({ value: String(s._id), label: s.name as string })),
  };

  const boardItems = mergedRawItems.map((item) => toBoardItem(item, rowCtx));
  const columnMeta = columnResults.map((c) => ({
    key: c.key,
    total: c.total,
    hasMore: c.total > BOARD_PAGE_SIZE,
  }));
  const backlogMeta = { total: backlogTotal, hasMore: backlogTotal > BOARD_PAGE_SIZE };

  const canEdit = authz.role !== "viewer";

  return (
    
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Link
              href={`/dashboard/board/teams/${teamId}/work-items`}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate hover:text-ink"
            >
              <ArrowLeft className="h-3 w-3" />
              {team.name} {typeLabel}s
            </Link>
            <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-ink">
              {team.name} · Board
            </h1>
            <p className="mt-1 text-xs text-slate">
              {backlogTotal} {typeLabel.toLowerCase()}
              {backlogTotal === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/board/teams/${teamId}/dashboard`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-panel px-3 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-muted"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
            {team.sprintsEnabled && (
              <Link
                href={`/dashboard/board/initiatives?team=${teamId}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-panel px-3 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-muted"
              >
                <CalendarRange className="h-3.5 w-3.5" />
                Sprints
              </Link>
            )}
          </div>
        </div>

        <ViewToolbar
          teamId={teamId}
          type={workItemType}
          fieldOptions={fieldOptions}
          showSortAndGroup={false}
          initialViews={savedViews.map((v) => ({
            id: String(v._id),
            name: v.name as string,
            visibility: v.visibility as "self" | "team",
            config: v.config as SavedViewOption["config"],
            mine: String(v.createdBy) === String(authz.member._id),
          }))}
        />

        <BoardView
          key={`${workItemType}:${view ?? ""}`}
          teamId={teamId}
          type={workItemType}
          filterConfig={config}
          itemHrefBase={`/dashboard/board/teams/${teamId}/work-items`}
          columns={workflow.statuses}
          transitions={workflow.transitions}
          initialItems={boardItems}
          initialColumnMeta={columnMeta}
          initialBacklogMeta={backlogMeta}
          canEdit={canEdit}
          itemLabel={typeLabel}
        />
      </div>
  );
}
