import { redirect } from "next/navigation";
import Link from "next/link";
import { Users2, ArrowUpRight } from "lucide-react";
import { getCurrentMember } from "@board/lib/get-current-member";
import { listMemberTeamsWithRoles } from "@board/lib/teams";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

// Design 4 (Phase 16): moved unchanged from the former top-level
// src/app/(app)/my-teams/page.tsx — no admin gate, every Member sees their
// own Team list. Now reached via the "Settings" sidebar entry → this tab
// instead of its own top-level nav row.
export default async function MyTeamsPage() {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  const entries = await listMemberTeamsWithRoles(member);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">
          My Teams
        </h1>
        <p className="mt-1 text-xs text-slate">
          Teams you belong to and your role on each.
          {member.orgRole === "org_admin" &&
            " As Org Admin, you have Admin access on every Team by default (MB-2)."}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-panel p-5">
        {entries.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-slate mb-3">
              <Users2 className="h-5 w-5" />
            </div>
            <p className="text-xs text-slate">
              You&apos;re not on any Team yet. Ask your Org Admin or Team Admin to
              add you.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-slate">
                  <th className="pb-2 pr-4 font-semibold">Team</th>
                  <th className="pb-2 pr-4 font-semibold">Status</th>
                  <th className="pb-2 pr-4 font-semibold">Your role</th>
                  <th className="pb-2 pr-4 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {entries.map(({ team, role }) => (
                  <tr key={String(team._id)} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4 font-medium text-ink">{team.name}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          team.active
                            ? "bg-status-done-bg text-status-done"
                            : "bg-status-todo-bg text-status-todo"
                        }`}
                      >
                        {team.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {ROLE_LABEL[role]}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {role === "admin" && (
                        <Link
                          href={`/dashboard/board/settings/teams/${team._id}/members`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-primary"
                        >
                          Manage
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
