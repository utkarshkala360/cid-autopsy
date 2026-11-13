import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { loadOverview, type Level } from "@/lib/callanchor/health";
import { HEALTH_PATH, requireCallAnchorSession, showInternal } from "@/lib/callanchor/session";
import { LEVELS, ago, callHref, int } from "../format";
import { LoadingNote, Section, Table, Tile, clientViews, rowLinkClass, td } from "../parts";

export const metadata: Metadata = { title: "Client health overview" };

// Clients, their phones (licenses) and their seats read together: one row per client with all three,
// each opening the other views (owner, 2026-11-13). From the store; the Clients tab brings it up to date.

const PATH = `${HEALTH_PATH}/overview`;
const LEVEL_ORDER: Level[] = ["critical", "warning", "healthy", "idle", "unknown"];

export default async function OverviewPage() {
  await requireCallAnchorSession(PATH);
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Client health overview</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every client with its phones and seats side by side. A client&apos;s health comes from its calls reaching the CRM; its phones are the
        licenses those calls are made on; its seats are how many of those licenses it bought and uses. Each number opens the view behind it.
      </p>
      <Suspense fallback={<LoadingNote text="Reading clients, phones and seats…" />}>
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  const { rows: all, hiddenInternal, loadedAt } = await loadOverview(await showInternal());
  const now = Date.parse(loadedAt);
  const rows = all.filter((r) => r.status !== "inactive");
  const inactive = all.length - rows.length;
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((total, r) => total + pick(r), 0);
  const levelCount = (level: Level) => rows.filter((r) => r.level === level).length;
  const purchasedKnown = rows.every((r) => r.seats.purchased !== null);
  const unused = (r: (typeof rows)[number]) => r.seats.idle + r.seats.loggedOut + r.seats.unassigned;
  const phonesNeedingAction = sum((r) => r.licenses.critical + r.licenses.warning);

  return (
    <>
      <p className="mt-2 text-xs text-slate-500">
        {inactive > 0 && `${inactive} inactive clients left out. `}
        {hiddenInternal > 0 && `${hiddenInternal} internal clients hidden. `}
        From stored data; open Clients to pull what&apos;s new.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Tile
          label="Clients"
          value={int(rows.length)}
          href={HEALTH_PATH}
          detail={LEVEL_ORDER.filter((l) => levelCount(l) > 0).map((l) => `${levelCount(l)} ${LEVELS[l].label.toLowerCase()}`).join(" · ")}
        />
        <Tile
          label="Phones"
          value={int(sum((r) => r.licenses.total))}
          href={`${HEALTH_PATH}/licenses`}
          detail={`${int(phonesNeedingAction)} need action · ${int(sum((r) => r.licenses.critical))} critical · ${int(sum((r) => r.licenses.warning))} warning`}
        />
        <Tile
          label="Seats"
          value={`${int(sum((r) => r.seats.calling))} / ${int(sum((r) => r.seats.active))}`}
          href={`${HEALTH_PATH}/seats`}
          detail={`calling / active${purchasedKnown ? ` · ${int(sum((r) => r.seats.purchased ?? 0))} purchased` : ""} · ${int(sum((r) => r.seats.loggedIn))} logged in · ${int(sum(unused))} unused`}
        />
      </div>

      <Section title="Clients, phones and seats" note="Worst health first. Health opens the client, Phones its licenses, Seats how its seats are used.">
        <Table
          head={["Client", "Health", "Open issues", "Calls 24h", "Last call through", "Phones needing action", "Seats: purchased · active · logged in · calling", "Unused seats"]}
          empty={rows.length ? undefined : "No clients stored yet. Open Clients to pull them."}
        >
          {rows.map((r) => {
            const views = clientViews(HEALTH_PATH, r.clientId);
            const needs = r.licenses.critical + r.licenses.warning;
            const idle = unused(r);
            return (
              <tr key={r.clientId} className="hover:bg-slate-50">
                <td className={td}>
                  <Link href={views.health} className={rowLinkClass}>{r.companyName}</Link>
                  <p className="text-xs text-slate-500">{r.status}</p>
                </td>
                <td className={td}>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${LEVELS[r.level].className}`}>
                    <span aria-hidden>{LEVELS[r.level].icon}</span>
                    {LEVELS[r.level].label}
                  </span>
                </td>
                <td className={`${td} tabular-nums`}>
                  {r.openIssues ? (
                    <Link href={views.health} className="hover:underline">
                      {int(r.openIssues)}
                      {r.criticalIssues > 0 && <span className="text-red-700"> · {int(r.criticalIssues)} critical</span>}
                    </Link>
                  ) : (
                    <span className="text-slate-400">0</span>
                  )}
                </td>
                <td className={`${td} text-right tabular-nums`}>{int(r.calls24h)}</td>
                <td className={`${td} text-xs`}>
                  {r.lastComplete ? (
                    <Link href={callHref(HEALTH_PATH, r.lastComplete.callId, undefined, r.clientId)} className={rowLinkClass}>{ago(r.lastComplete.at, now)}</Link>
                  ) : (
                    <span className={r.calls24h ? "font-medium text-amber-800" : "text-slate-400"}>never</span>
                  )}
                </td>
                <td className={`${td} tabular-nums`}>
                  <Link href={views.licenses} className="hover:underline">
                    {needs ? (
                      <>
                        {r.licenses.critical > 0 && <span className="text-red-700">{int(r.licenses.critical)} critical </span>}
                        {r.licenses.warning > 0 && <span className="text-amber-800">{int(r.licenses.warning)} warning </span>}
                      </>
                    ) : (
                      <span className="text-slate-500">none </span>
                    )}
                    <span className="text-slate-400">of {int(r.licenses.total)}</span>
                  </Link>
                </td>
                <td className={`${td} tabular-nums`}>
                  <Link href={views.seats} className="hover:underline">
                    {int(r.seats.purchased)} · {int(r.seats.active)} · {int(r.seats.loggedIn)} · {int(r.seats.calling)}
                  </Link>
                </td>
                <td className={`${td} text-right tabular-nums ${idle ? "font-medium text-amber-800" : "text-slate-400"}`}>
                  <Link href={views.seats} className="hover:underline">{int(idle)}</Link>
                </td>
              </tr>
            );
          })}
        </Table>
      </Section>
    </>
  );
}
