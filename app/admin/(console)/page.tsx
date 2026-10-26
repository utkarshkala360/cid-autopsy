import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { cardClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { CreateMemberForm } from "./CreateMemberForm";
import { MemberActions } from "./MemberActions";

export const metadata: Metadata = { title: "Agents & Members" };

type MemberRow = {
  id: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
};

export default async function AdminHomePage() {
  // The session check and the data load run together; requireAdmin redirects before anything renders.
  const [, members] = (await Promise.all([
    requireAdmin(),
    db()`
      SELECT id, username, full_name, role, is_active, created_at, last_login_at
      FROM members ORDER BY created_at DESC
    `,
  ])) as [unknown, MemberRow[]];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold text-slate-900">Agents &amp; Members</h1>
          <span className="text-sm text-slate-500">{members.length} total</span>
        </div>
        <div className={`${cardClass} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last login</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No agents or members yet. Create one to get started.
                  </td>
                </tr>
              )}
              {members.map((m) => (
                <tr key={m.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{m.full_name}</div>
                    <div className="break-all font-mono text-xs text-slate-500">{m.username}</div>
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-700">{m.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        m.is_active
                          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                          : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
                      }
                    >
                      {m.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(m.last_login_at)}</td>
                  <td className="px-4 py-3">
                    <MemberActions id={String(m.id)} username={m.username} isActive={m.is_active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside>
        <div className={`${cardClass} p-5`}>
          <h2 className="text-base font-semibold text-slate-900">Create agent / member</h2>
          <p className="mt-1 text-sm text-slate-500">They sign in at /dashboard with this ID and password.</p>
          <CreateMemberForm />
        </div>
      </aside>
    </div>
  );
}
