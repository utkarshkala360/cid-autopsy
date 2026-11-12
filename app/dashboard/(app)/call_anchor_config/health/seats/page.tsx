import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { loadSeats, type SeatRow } from "@/lib/callanchor/health";
import { durationText, type SeatState } from "@/lib/callanchor/issues";
import { CALLANCHOR_PATH, HEALTH_PATH, requireCallAnchorSession, showInternal } from "@/lib/callanchor/session";
import { ago, formatTime, int, licenseHref } from "../format";
import { LoadingNote, Section, StatusBadge, Table, Tile, td } from "../parts";

export const metadata: Metadata = { title: "Seats" };

// How each client uses the seats it bought, and every seat not in use with since when. Seat use lives
// here, not among the issues (owner, 2026-11-05). From the store; the dashboard brings it up to date.

const PATH = `${HEALTH_PATH}/seats`;
const ID_PATTERN = /^[\w-]{1,100}$/;

const SEAT_STATES: Record<SeatState, { label: string; className: string }> = {
  calling: { label: "Calling", className: "text-emerald-700" },
  idle: { label: "Logged in, not calling", className: "font-medium text-amber-800" },
  loggedOut: { label: "Logged out", className: "font-medium text-amber-800" },
  unassigned: { label: "Not assigned", className: "font-medium text-amber-800" },
  inactive: { label: "Inactive", className: "text-slate-400" },
};
const UNUSED: SeatState[] = ["idle", "loggedOut", "unassigned"];

export default async function SeatsPage({ searchParams }: PageProps<"/dashboard/call_anchor_config/health/seats">) {
  const query = await searchParams;
  const client = typeof query.client === "string" ? query.client : undefined;
  if (client !== undefined && !ID_PATTERN.test(client)) notFound();
  await requireCallAnchorSession(client ? `${PATH}?client=${client}` : PATH);
  return (
    <div>
      <Breadcrumbs items={[{ href: CALLANCHOR_PATH, label: "CallAnchor Config" }, { href: HEALTH_PATH, label: "Client health" }]} />
      <h1 className="text-xl font-semibold text-slate-900">Client health</h1>
      <Suspense key={client ?? ""} fallback={<LoadingNote text="Reading every seat…" />}>
        <Seats client={client} />
      </Suspense>
    </div>
  );
}

async function Seats({ client }: { client?: string }) {
  // A client asked for by id is shown even when it's internal.
  const { clients: all, hiddenInternal, unusedAfterMs, loadedAt } = await loadSeats(Boolean(client) || (await showInternal()));
  const now = Date.parse(loadedAt);
  const clients = all.filter((c) => !client || c.clientId === client);
  const working = clients.filter((c) => c.status !== "inactive");
  const sum = (key: "active" | "assigned" | "loggedIn" | "calling" | "idle" | "loggedOut" | "unassigned") => working.reduce((total, c) => total + c.seats[key], 0);
  const purchased = working.every((c) => c.seats.purchased !== null) ? working.reduce((total, c) => total + (c.seats.purchased ?? 0), 0) : null;
  const unused = working
    .flatMap((c) => c.rows.filter((r) => UNUSED.includes(r.seat.state)).map((r) => ({ ...r, companyName: c.companyName })))
    .sort((a, b) => (a.seat.since ?? "").localeCompare(b.seat.since ?? ""));
  const name = client ? clients[0]?.companyName : null;

  return (
    <>
      <p className="mt-3 text-sm text-slate-500">
        {name ? `${name}: ` : "Active and trial clients: "}seats bought, then used. A seat is unused when it&apos;s not assigned, logged out, or logged in
        with no call for {durationText(unusedAfterMs)} (set in Settings). Calls count from linked calls and from CallAnchor&apos;s lifetime count
        rising.{hiddenInternal > 0 && ` ${hiddenInternal} internal clients hidden.`}
        {client && (
          <>
            {" "}
            <Link href={PATH} className="text-indigo-700 hover:underline">Show every client</Link>
          </>
        )}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Purchased" value={int(purchased)} detail={purchased === null ? "Known once each client's snapshot is refreshed" : undefined} />
        <Tile label="Active" value={int(sum("active"))} />
        <Tile label="Assigned" value={int(sum("assigned"))} detail={`${int(sum("unassigned"))} not assigned`} />
        <Tile label="Logged in" value={int(sum("loggedIn"))} detail={`${int(sum("loggedOut"))} logged out`} />
        <Tile label="Calling" value={int(sum("calling"))} detail={`${int(sum("idle"))} logged in, not calling`} />
        <Tile label="Unused" value={int(sum("idle") + sum("loggedOut") + sum("unassigned"))} detail={sum("active") ? `${Math.round(((sum("idle") + sum("loggedOut") + sum("unassigned")) / sum("active")) * 100)}% of active seats` : undefined} />
      </div>

      {!client && (
        <Section title="By client" note="Most unused first. Inactive clients are left out.">
          <Table head={["Client", "Purchased", "Active", "Assigned", "Logged in", "Calling", "Unused"]} empty={working.length ? undefined : "No seats stored yet."}>
            {[...working]
              .sort((a, b) => b.seats.idle + b.seats.loggedOut + b.seats.unassigned - (a.seats.idle + a.seats.loggedOut + a.seats.unassigned) || b.seats.active - a.seats.active)
              .map((c) => {
                const idle = c.seats.idle + c.seats.loggedOut + c.seats.unassigned;
                return (
                  <tr key={c.clientId}>
                    <td className={td}>
                      <Link href={`${PATH}?client=${c.clientId}`} className="font-medium text-indigo-700 hover:underline">{c.companyName}</Link>
                      <p className="text-xs text-slate-500">{c.status}</p>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{int(c.seats.purchased)}</td>
                    <td className={`${td} text-right tabular-nums`}>{int(c.seats.active)}</td>
                    <td className={`${td} text-right tabular-nums`}>{int(c.seats.assigned)}</td>
                    <td className={`${td} text-right tabular-nums`}>{int(c.seats.loggedIn)}</td>
                    <td className={`${td} text-right tabular-nums`}>{int(c.seats.calling)}</td>
                    <td className={`${td} text-right tabular-nums ${idle ? "font-medium text-amber-800" : "text-slate-400"}`}>{int(idle)}</td>
                  </tr>
                );
              })}
          </Table>
        </Section>
      )}

      <Section title={`Unused seats: ${unused.length}`} note="Longest unused first. Open a phone for its history and calls.">
        <SeatTable rows={unused} now={now} showClient={!client} empty="Every active seat is calling." />
      </Section>

      {client && (
        <Section title="Every seat">
          <SeatTable rows={clients.flatMap((c) => c.rows.map((r) => ({ ...r, companyName: c.companyName })))} now={now} showClient={false} empty="No seats stored yet." />
        </Section>
      )}
    </>
  );
}

function SeatTable({ rows, now, showClient, empty }: { rows: (SeatRow & { companyName: string })[]; now: number; showClient: boolean; empty: string }) {
  return (
    <Table head={["Phone", ...(showClient ? ["Client"] : []), "Seat", "Since", "Last call", "Last good sync", "Health"]} empty={rows.length ? undefined : empty}>
      {rows.map((r) => {
        const state = SEAT_STATES[r.seat.state];
        return (
          <tr key={r.license.licenseId}>
            <td className={td}>
              <Link href={licenseHref(HEALTH_PATH, r.license.licenseId)} className="font-mono text-xs font-medium text-indigo-700 hover:underline">…{r.license.last4 ?? "????"}</Link>
            </td>
            {showClient && (
              <td className={td}>
                <Link href={`${PATH}?client=${r.license.clientId}`} className="hover:text-indigo-700 hover:underline">{r.companyName}</Link>
              </td>
            )}
            <td className={`${td} ${state.className}`}>{state.label}</td>
            <td className={`${td} text-xs text-slate-500`}>
              {r.seat.since ? (
                <>
                  {ago(r.seat.since, now)}
                  <p>{formatTime(r.seat.since)} IST</p>
                </>
              ) : (
                <span title="Before the store began tracking this seat">not seen{r.license.lastLoginLabel ? ` · last login ${r.license.lastLoginLabel}` : ""}</span>
              )}
            </td>
            <td className={`${td} text-xs text-slate-500`}>{ago(r.lastCallAt, now)}</td>
            <td className={`${td} text-xs text-slate-500`}>{r.lastSyncAt ? ago(r.lastSyncAt, now) : "never"}</td>
            <td className={td}><StatusBadge status={r.status} /></td>
          </tr>
        );
      })}
    </Table>
  );
}
