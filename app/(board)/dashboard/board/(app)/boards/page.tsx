import { redirect } from "next/navigation";
import Link from "next/link";
import { Columns3, ArrowUpRight, CalendarRange, Users2 } from "lucide-react";
import { getCurrentMember } from "@board/lib/get-current-member";
import { listMemberTeamsWithRoles } from "@board/lib/teams";

export default async function BoardsLandingPage() {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  const entries = await listMemberTeamsWithRoles(member);

  return (
    
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">
            Boards &amp; Sprints
          </h1>
          <p className="mt-1 text-xs text-slate">
            Pick a Team to see its Kanban board and backlog, or jump straight to its Sprints.
            Columns follow that Team&apos;s configured workflow (WF-1).
          </p>
        </div>

        <div className="rounded-lg border border-border bg-panel p-5">
          {entries.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-slate mb-3">
                <Users2 className="h-5 w-5" />
              </div>
              <p className="text-xs text-slate">
                You&apos;re not on any Team yet. Ask your Org Admin or Team Admin to add you.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map(({ team, role }) => (
                <li key={String(team._id)} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Columns3 className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="text-sm font-medium text-ink">{team.name}</div>
                      <div className="text-[11px] text-slate">
                        Your role: {role[0].toUpperCase() + role.slice(1)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {team.sprintsEnabled && (
                      <Link
                        href={`/dashboard/board/initiatives?team=${team._id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate hover:text-ink"
                      >
                        <CalendarRange className="h-3.5 w-3.5" />
                        View Sprints
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    )}
                    <Link
                      href={`/dashboard/board/teams/${team._id}/board`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
                    >
                      View Board
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
  );
}
