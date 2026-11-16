import { redirect } from "next/navigation";
import Link from "next/link";
import { Target, CalendarRange, ArrowUpRight, TrendingUp, Download } from "lucide-react";
import { CreateInitiativeForm } from "@board/components/initiatives/create-initiative-form";
import { LoadMoreInitiativesTable } from "@board/components/initiatives/load-more-initiatives-table";
import { InitiativesTeamFilter } from "@board/components/initiatives/initiatives-team-filter";
import { UrlSyncedViewToolbar } from "@board/components/shared/url-synced-view-toolbar";
import { SprintCreateForm } from "@board/components/sprints/sprint-create-form";
import { VelocityChart } from "@board/components/sprints/velocity-chart";
import { SPRINT_STATUS_LABEL, type SprintStatus } from "@board/lib/sprint-status";
import { fullDateTimeTitle } from "@board/lib/format-date";
import { getCurrentMember } from "@board/lib/get-current-member";
import { listMemberTeamsWithRoles } from "@board/lib/teams";
import { resolveTeamRole } from "@board/lib/authz";
import { computeVelocity } from "@board/lib/sprint-reports";
import { connectDB } from "@board/lib/mongodb";
import { Initiative, type InitiativeDoc } from "@board/models/Initiative";
import { TeamMembership } from "@board/models/TeamMembership";
import { Team, type TeamDoc } from "@board/models/Team";
import { WorkItem } from "@board/models/WorkItem";
import { Member } from "@board/models/Member";
import { getStageTrack } from "@board/lib/stage-tracks";
import { getSimpleListPage } from "@board/lib/simple-view-query";
import { decodeViewConfig, encodeViewConfig, isEmptyViewConfig } from "@board/lib/view-config";
import {
  INITIATIVE_FIELD_META,
  INITIATIVE_SORT_FIELD_LABEL,
  INITIATIVE_GROUP_FIELD_LABEL,
  initiativeFilterableFields,
  initiativeGroupableFields,
  type InitiativeFilterField,
  type InitiativeSortField,
  type InitiativeGroupField,
} from "@board/lib/initiative-views";

const PAGE_SIZE = 50;

const STATUS_BADGE: Record<SprintStatus, string> = {
  planned: "bg-muted text-slate",
  active: "bg-status-in-progress-bg text-status-in-progress",
  completed: "bg-status-done-bg text-status-done",
};

// ORG-5: an Initiative is Org-level, not owned by one Team — every
// non-Guest role can view (Roles & Permissions Matrix); creating an
// ordinary cross-team tag is gated at the API layer via requireAnyTeamAdmin.
//
// Phase 16 (Design 2, Sprint/Initiative unification): this page now also
// covers Team-run Initiatives (the former teams/[teamId]/sprints/page.tsx),
// switched via the `?team=` param and the InitiativesTeamFilter dropdown —
// "gains a Team filter/tab so a Team's own time-boxed Initiatives are easy
// to find and create from."
export default async function InitiativesPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; view?: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  const { team: teamParam, view: viewParam } = await searchParams;
  const accessible = await listMemberTeamsWithRoles(member);
  const accessibleTeams = accessible.map((a) => ({ id: String(a.team._id), name: a.team.name }));
  const accessibleIds = new Set(accessibleTeams.map((t) => t.id));
  const selectedTeamId = teamParam && accessibleIds.has(teamParam) ? teamParam : null;

  await connectDB();

  if (selectedTeamId) {
    const team = await Team.findById(selectedTeamId).lean<TeamDoc>();
    if (!team) {
      redirect("/dashboard/board/initiatives");
    }
    const role = await resolveTeamRole(member, selectedTeamId);
    const canManage = role === "member" || role === "admin";

    if (!team!.sprintsEnabled) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Initiatives</h1>
            <p className="mt-1 text-xs text-slate">
              A shared, Org-level tag grouping Work Items across every Team — and, for a Team that
              opts in, that Team&apos;s own Sprint planning (ORG-5/BD-3).
            </p>
          </div>
          <InitiativesTeamFilter teams={accessibleTeams} current={selectedTeamId} />
          <div className="rounded-xl border border-border bg-panel p-8 text-center shadow-xs">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-slate">
              <CalendarRange className="h-7 w-7" />
            </div>
            <h2 className="font-heading text-lg font-bold text-ink">Sprints aren&apos;t on for {team!.name}</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate">
              Scrum mechanics are opt-in per Team (BD-3).{" "}
              {role === "admin" ? (
                <>
                  A Team Admin can turn them on from{" "}
                  <Link
                    href={`/dashboard/board/settings/teams/${selectedTeamId}/work-item-config`}
                    className="font-medium text-primary hover:text-primary-hover"
                  >
                    Work Item Configuration
                  </Link>
                  .
                </>
              ) : (
                "Ask a Team Admin to turn them on from Work Item Configuration."
              )}
            </p>
          </div>
        </div>
      );
    }

    const [sprints, velocity] = await Promise.all([
      Initiative.find({ teamId: selectedTeamId }).sort({ startDate: 1 }).lean<InitiativeDoc[]>(),
      computeVelocity(selectedTeamId),
    ]);

    const active = sprints.filter((s) => s.sprintStatus === "active");
    const planned = sprints.filter((s) => s.sprintStatus === "planned");
    const completed = [...sprints.filter((s) => s.sprintStatus === "completed")].reverse();

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Initiatives</h1>
          <p className="mt-1 text-xs text-slate">
            {team!.name}&apos;s own Sprints — Team-run Initiatives (BD-3/BD-4), time-boxed and owned
            by this Team.
          </p>
        </div>

        <InitiativesTeamFilter teams={accessibleTeams} current={selectedTeamId} />

        {canManage && (
          <div className="rounded-lg border border-border bg-panel p-5">
            <h2 className="mb-3 font-heading text-sm font-semibold text-ink">Create a Sprint</h2>
            <SprintCreateForm teamId={selectedTeamId} />
          </div>
        )}

        {sprints.length === 0 ? (
          <div className="rounded-xl border border-border bg-panel p-8 text-center shadow-xs">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <CalendarRange className="h-7 w-7" />
            </div>
            <h2 className="font-heading text-lg font-bold text-ink">No Sprints yet</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate">
              {canManage
                ? "Create the first Sprint above to start planning."
                : "No Sprints have been created for this Team yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(active.length > 0 || planned.length > 0) && (
              <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate">
                  Active &amp; Planned
                </div>
                <ul className="divide-y divide-border">
                  {[...active, ...planned].map((s) => (
                    <li key={String(s._id)} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/board/initiatives/${s._id}`}
                          className="flex items-center gap-1 truncate text-sm font-medium text-ink hover:text-primary"
                        >
                          {s.name}
                          <ArrowUpRight className="h-3 w-3 shrink-0" />
                        </Link>
                        <span className="text-[11px] text-slate">
                          <span title={fullDateTimeTitle(s.startDate!)}>
                            {new Date(s.startDate!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>{" "}
                          –{" "}
                          <span title={fullDateTimeTitle(s.endDate!)}>
                            {new Date(s.endDate!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                          {s.sprintGoal ? ` · ${s.sprintGoal}` : ""}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[s.sprintStatus as SprintStatus]}`}
                      >
                        {SPRINT_STATUS_LABEL[s.sprintStatus as SprintStatus]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {completed.length > 0 && (
              <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate">
                  Completed
                </div>
                <ul className="divide-y divide-border">
                  {completed.map((s) => (
                    <li key={String(s._id)} className="flex items-center justify-between gap-3 py-2.5">
                      <Link
                        href={`/dashboard/board/initiatives/${s._id}`}
                        className="flex items-center gap-1 truncate text-sm font-medium text-ink hover:text-primary"
                      >
                        {s.name}
                        <ArrowUpRight className="h-3 w-3 shrink-0" />
                      </Link>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE.completed}`}
                      >
                        {SPRINT_STATUS_LABEL.completed}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate">
              <TrendingUp className="h-3.5 w-3.5" />
              Velocity — last {velocity.length || "N"} Sprints
            </div>
            {velocity.length > 0 && (
              <a
                href={`/dashboard/board/api/initiatives/velocity-export?teamId=${selectedTeamId}`}
                className="flex items-center gap-1 text-[11px] font-medium text-slate hover:text-primary"
                title="Export velocity as CSV"
              >
                <Download className="h-3 w-3" /> CSV
              </a>
            )}
          </div>
          <VelocityChart points={velocity} />
        </div>
      </div>
    );
  }

  const orgTagsQuery = { organizationId: member.organizationId, teamId: null };
  const view = decodeViewConfig<InitiativeFilterField, InitiativeSortField, InitiativeGroupField>(
    viewParam
  );

  const [{ docs: initiatives, total: initiativesTotal }, hasTeamAdmin, lifecycleTrack, orgMembers] =
    await Promise.all([
      // Pagination redesign (Design 3): server-rendered first page only (50)
      // — subsequent pages come from GET /api/initiatives via
      // LoadMoreInitiativesTable. Only this org-level tags branch is
      // paginated; the Team-run Sprints branch above returns before this
      // point and is untouched (naturally low-cardinality per Team, out of
      // scope per the plan).
      getSimpleListPage<InitiativeDoc, InitiativeFilterField, InitiativeSortField, InitiativeGroupField>(
        Initiative,
        orgTagsQuery,
        view,
        { page: 1, pageSize: PAGE_SIZE, defaultSort: { name: 1 } }
      ),
      member.orgRole === "org_admin"
        ? Promise.resolve(true)
        : TeamMembership.exists({ memberId: member._id, role: "admin" }),
      getStageTrack(member.organizationId, "initiative"),
      Member.find({ organizationId: member.organizationId }, "name").lean<{ _id: unknown; name: string }[]>(),
    ]);

  const initiativeIds = initiatives.map((i) => i._id);
  const itemCounts = initiativeIds.length
    ? await WorkItem.aggregate([
        { $match: { organizationId: member.organizationId, initiativeId: { $in: initiativeIds } } },
        { $group: { _id: "$initiativeId", count: { $sum: 1 } } },
      ])
    : [];

  const canManage = member.orgRole === "org_admin" || !!hasTeamAdmin;
  const itemCountByInitiative = new Map(
    itemCounts.map((t: { _id: unknown; count: number }) => [String(t._id), t.count])
  );
  const memberById = new Map(orgMembers.map((m) => [String(m._id), m.name]));

  const lifecycleEnabled = !!lifecycleTrack?.enabled;
  const stageOptions = (lifecycleTrack?.stages ?? []).map((s) => ({ value: s.key, label: s.label }));
  const stageLabelByKey = new Map((lifecycleTrack?.stages ?? []).map((s) => [s.key, s.label]));
  const memberOptions = orgMembers.map((m) => ({ value: String(m._id), label: m.name }));

  const filterableFields = initiativeFilterableFields(lifecycleEnabled);
  const groupableFields = initiativeGroupableFields(lifecycleEnabled);
  const fields = Object.fromEntries(
    filterableFields.map((f) => [f, INITIATIVE_FIELD_META[f]])
  ) as Record<InitiativeFilterField, (typeof INITIATIVE_FIELD_META)[InitiativeFilterField]>;
  const groupFields = Object.fromEntries(
    groupableFields.map((f) => [f, INITIATIVE_GROUP_FIELD_LABEL[f]])
  ) as Record<InitiativeGroupField, string>;
  const fieldOptions = {
    lifecycleStage: stageOptions,
    createdBy: memberOptions,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Initiatives</h1>
        <p className="mt-1 text-xs text-slate">
          A shared, Org-level tag grouping Work Items across every Team around one cross-team
          effort (ORG-5) — e.g. tagging a Dev Task and a Marketing Task both under &quot;Q4
          Launch&quot; without a full roadmap tool.
        </p>
      </div>

      {accessibleTeams.length > 0 && (
        <InitiativesTeamFilter teams={accessibleTeams} current="tags" />
      )}

      {canManage && (
        <div className="rounded-lg border border-border bg-panel p-5">
          <CreateInitiativeForm />
        </div>
      )}

      <div className="rounded-lg border border-border bg-panel p-5">
        <div className="mb-4">
          <UrlSyncedViewToolbar
            fields={fields}
            fieldOptions={fieldOptions}
            sortFields={INITIATIVE_SORT_FIELD_LABEL}
            groupFields={groupFields}
          />
        </div>
        {initiativesTotal === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-slate mb-3">
              <Target className="h-5 w-5" />
            </div>
            <p className="text-xs text-slate">
              {isEmptyViewConfig(view)
                ? canManage
                  ? "No Initiatives yet. Create the first one above."
                  : "No Initiatives yet."
                : "No Initiatives match these filters."}
            </p>
          </div>
        ) : (
          <LoadMoreInitiativesTable
            key={encodeViewConfig(view)}
            view={view}
            stageLabelByKey={Object.fromEntries(stageLabelByKey)}
            showStageColumn={lifecycleEnabled}
            initialInitiatives={initiatives.map((initiative) => ({
              id: String(initiative._id),
              name: initiative.name,
              description: initiative.description,
              itemCount: itemCountByInitiative.get(String(initiative._id)) ?? 0,
              lifecycleStage: initiative.lifecycleStage ?? null,
              createdByName: memberById.get(String(initiative.createdBy)) ?? "—",
            }))}
            initialTotal={initiativesTotal}
            initialHasMore={PAGE_SIZE < initiativesTotal}
          />
        )}
      </div>
    </div>
  );
}
