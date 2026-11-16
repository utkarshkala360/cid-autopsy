import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { AuditLogFilters } from "@board/components/settings/audit-log-filters";
import { AuditLogTable } from "@board/components/settings/audit-log-table";
import { getCurrentMember } from "@board/lib/get-current-member";
import { listOrgAuditLog } from "@board/lib/audit-log";
import { connectDB } from "@board/lib/mongodb";
import { Team } from "@board/models/Team";
import { Member } from "@board/models/Member";

// CT-7: Org-Admin-only view over the append-only ChangeHistory trail across
// every Team, Customer, and Initiative — same authz pattern as the Modules
// settings page (org_admin check, ForbiddenState otherwise).
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; member?: string; from?: string; to?: string; page?: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  if (member.orgRole !== "org_admin") {
    return (
      <ForbiddenState message="The Org-wide Audit Log (CT-7) is an Org Admin view. Ask your Org Admin for access." />
    );
  }

  const { team, member: memberParam, from, to, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  await connectDB();
  const [teams, members] = await Promise.all([
    Team.find({ organizationId: member.organizationId }, "name").sort({ name: 1 }).lean<
      { _id: unknown; name: string }[]
    >(),
    Member.find({ organizationId: member.organizationId }, "name").sort({ name: 1 }).lean<
      { _id: unknown; name: string }[]
    >(),
  ]);
  const teamOptions = teams.map((t) => ({ id: String(t._id), name: t.name }));
  const memberOptions = members.map((m) => ({ id: String(m._id), name: m.name }));
  const teamIds = new Set(teamOptions.map((t) => t.id));
  const memberIds = new Set(memberOptions.map((m) => m.id));

  const selectedTeam = team && teamIds.has(team) ? team : "all";
  const selectedMember = memberParam && memberIds.has(memberParam) ? memberParam : "all";

  const { entries, total, pageSize } = await listOrgAuditLog({
    organizationId: String(member.organizationId),
    filters: {
      teamId: selectedTeam === "all" ? null : selectedTeam,
      memberId: selectedMember === "all" ? null : selectedMember,
      from: from || null,
      to: to || null,
    },
    page,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function pageHref(nextPage: number): string {
    const params = new URLSearchParams();
    if (selectedTeam !== "all") params.set("team", selectedTeam);
    if (selectedMember !== "all") params.set("member", selectedMember);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(nextPage));
    return `/dashboard/board/settings/audit-log?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Audit Log</h1>
        <p className="mt-1 text-xs text-slate">
          Every field change, comment, and attachment event across every Team, Customer, and
          Initiative (CT-7) — a read of the same append-only trail every other history view in
          this app already writes to, filterable by Member, Team, and date range.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <AuditLogFilters
          teams={teamOptions}
          members={memberOptions}
          currentTeam={selectedTeam}
          currentMember={selectedMember}
          currentFrom={from ?? ""}
          currentTo={to ?? ""}
        />
        <span className="shrink-0 text-xs text-slate">
          {total} {total === 1 ? "event" : "events"}
        </span>
      </div>

      <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
        {total === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-slate">
              <ScrollText className="h-7 w-7" />
            </div>
            <h2 className="font-heading text-lg font-bold text-ink">No activity found</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate">
              No changes match the current filters. Widen the date range or clear a filter above.
            </p>
          </div>
        ) : (
          <>
            <AuditLogTable entries={entries} />
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <Link
                  href={pageHref(Math.max(1, page - 1))}
                  aria-disabled={page <= 1}
                  className={`flex items-center gap-1 text-xs font-medium ${
                    page <= 1 ? "pointer-events-none text-slate/50" : "text-slate hover:text-ink"
                  }`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </Link>
                <span className="text-xs text-slate">
                  Page {page} of {totalPages}
                </span>
                <Link
                  href={pageHref(Math.min(totalPages, page + 1))}
                  aria-disabled={page >= totalPages}
                  className={`flex items-center gap-1 text-xs font-medium ${
                    page >= totalPages ? "pointer-events-none text-slate/50" : "text-slate hover:text-ink"
                  }`}
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
