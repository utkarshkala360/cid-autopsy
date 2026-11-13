import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { loadOverview, type Level } from "@/lib/callanchor/health";
import { HEALTH_PATH, requireCallAnchorSession, showInternal } from "@/lib/callanchor/session";
import { LEVELS, ago, callHref, int } from "../format";
import { LoadingNote, Section, Table, clientViews, rowLinkClass, td } from "../parts";
import { Hero, Ring, StatCell, StatStrip } from "../ui";

export const metadata: Metadata = { title: "Client health overview" };

// Clients, their phones (licenses) and their seats read together: one row per client with all three,
// each opening the other views (owner, 2026-11-13). From the store; the Clients tab brings it up to date.

const PATH = `${HEALTH_PATH}/overview`;
const LEVEL_ORDER: Level[] = ["critical", "warning", "healthy", "idle", "unknown"];

export default async function OverviewPage() {
  await requireCallAnchorSession(PATH);
  return (
    <div>
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
      <Hero
        eyebrow={{ icon: "grid", label: "Client health" }}
        title="Overview"
        meta={
          <>
            Every client with its licenses and seats side by side. Each number opens the view behind it.
            {inactive > 0 && ` ${inactive} inactive clients left out.`}
            {hiddenInternal > 0 && ` ${hiddenInternal} internal clients hidden.`} From stored data; Clients pulls what&apos;s new.
          </>
        }
        kpis={[
          { label: "Calls, 24h", value: int(sum((r) => r.calls24h)) },
          { label: "Open issues", value: int(sum((r) => r.openIssues)), note: `${int(sum((r) => r.criticalIssues))} critical` },
        ]}
      >
        <StatStrip attached>
          <StatCell
            icon="building"
            tone={levelCount("critical") ? "red" : levelCount("warning") ? "amber" : "green"}
            label="Clients"
            value={int(rows.length)}
            sub={LEVEL_ORDER.filter((l) => levelCount(l) > 0).map((l) => `${levelCount(l)} ${LEVELS[l].label.toLowerCase()}`).join(" · ") || "none stored yet"}
            href={HEALTH_PATH}
          />
          <StatCell
            icon="licenses"
            tone={phonesNeedingAction ? "amber" : "green"}
            label="Licenses"
            value={int(sum((r) => r.licenses.total))}
            sub={`${int(phonesNeedingAction)} need action · ${int(sum((r) => r.licenses.critical))} critical`}
            href={`${HEALTH_PATH}/licenses`}
          />
          <StatCell
            icon="seats"
            tone="blue"
            label="Seats calling"
            value={`${int(sum((r) => r.seats.calling))} / ${int(sum((r) => r.seats.active))}`}
            sub={`${purchasedKnown ? `${int(sum((r) => r.seats.purchased ?? 0))} purchased · ` : ""}${int(sum((r) => r.seats.loggedIn))} logged in`}
            href={`${HEALTH_PATH}/licenses?use=unused`}
          />
          <StatCell icon="alert" tone={sum(unused) ? "amber" : "green"} label="Unused seats" value={int(sum(unused))} sub="not assigned, logged out or not calling" href={`${HEALTH_PATH}/licenses?use=unused`} />
        </StatStrip>
      </Hero>

      <Section title="Clients, phones and seats" note="Worst health first. Health opens the client, Phones its licenses, Seats how its seats are used.">
        <Table
          head={["Client", "Health", "Open issues", "Calls 24h", "Last call through", "Licenses needing action", 
            { label: "Purchased", info: "Purchased: total seats the client bought" },
            { label: "Active", info: "Ring = active ÷ purchased" },
            { label: "Logged in", info: "Ring = logged in ÷ active" },
            { label: "Calling", info: "Ring = calling ÷ active (a call within the unused threshold in Settings)" },
            "Unused seats",
          ]}
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
                <td className={`${td} text-right font-medium tabular-nums text-slate-900`}>{int(r.seats.purchased)}</td>
                <td className={td}><Ring value={r.seats.active} of={r.seats.purchased} /></td>
                <td className={td}><Ring value={r.seats.loggedIn} of={r.seats.active} /></td>
                <td className={td}><Ring value={r.seats.calling} of={r.seats.active} /></td>
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
