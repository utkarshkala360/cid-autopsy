import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { loadFleetLicenses, type FleetLicense } from "@/lib/callanchor/health";
import { CALLANCHOR_PATH, HEALTH_PATH, requireCallAnchorSession, showInternal } from "@/lib/callanchor/session";
import { LICENSE_STATUSES, STATUS_RANK, ago, int, licenseHref, pct, rateClass } from "../format";
import { DayStrip, ItemLink, LoadingNote, Section, StatusBadge, Table, issueLinks, td } from "../parts";

export const metadata: Metadata = { title: "Licenses" };

// Every license that needs action, across clients, from the store. The side panel groups problems by
// device model and app version, which shows when an issue follows a phone rather than a client.

const PATH = `${HEALTH_PATH}/licenses`;
const FILTERS = { status: "Status", client: "Client", app: "App version", model: "Device model" } as const;
type Filters = Partial<Record<keyof typeof FILTERS, string>>;
const needsAction = (h: FleetLicense) => h.status === "critical" || h.status === "warning";

export default async function LicensesPage({ searchParams }: PageProps<"/dashboard/call_anchor_config/health/licenses">) {
  const query = await searchParams;
  const filters: Filters = {};
  for (const key of Object.keys(FILTERS) as (keyof typeof FILTERS)[]) {
    const value = query[key];
    if (typeof value === "string" && value.length <= 200) filters[key] = value;
  }
  const href = (changes: Filters & Record<string, string | null | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...changes })) if (value) next.set(key, value);
    return next.size ? `${PATH}?${next}` : PATH;
  };
  await requireCallAnchorSession(href({}));

  return (
    <div>
      <Breadcrumbs items={[{ href: CALLANCHOR_PATH, label: "CallAnchor Config" }, { href: HEALTH_PATH, label: "Client health" }]} />
      <h1 className="text-xl font-semibold text-slate-900">Client health</h1>
      <p className="mt-3 text-sm text-slate-500">
        Every phone across clients, worst first. Without a status filter, only phones that need action are listed. Notes don&apos;t change a
        phone&apos;s status; how each seat is used is on the Seats tab. From stored data: the dashboard brings it up to date.
      </p>
      <Suspense key={href({})} fallback={<LoadingNote text="Reading every license…" />}>
        <Licenses filters={filters} href={href} />
      </Suspense>
    </div>
  );
}

async function Licenses({ filters, href }: { filters: Filters; href: (changes: Record<string, string | null | undefined>) => string }) {
  // A client asked for by id is shown even when it's internal.
  const { licenses, loadedAt } = await loadFleetLicenses(Boolean(filters.client) || (await showInternal()));
  const now = Date.parse(loadedAt);
  const model = (h: FleetLicense) => [h.license.deviceBrand, h.license.deviceModel].filter(Boolean).join(" ") || "Unknown device";
  const matches = (h: FleetLicense, skip?: keyof Filters) =>
    (skip === "status" || (filters.status ? h.status === filters.status : needsAction(h))) &&
    (skip === "client" || !filters.client || h.license.clientId === filters.client) &&
    (skip === "app" || !filters.app || (h.license.appVersion ?? "Unknown") === filters.app) &&
    (skip === "model" || !filters.model || model(h) === filters.model);
  const shown = licenses.filter((h) => matches(h)).sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.issues.length - a.issues.length);

  // Problems grouped by what the phones share, against how many phones share it.
  const group = (key: (h: FleetLicense) => string) => {
    const groups = new Map<string, { total: number; problems: number }>();
    for (const h of licenses) {
      if (!h.license.isLoggedIn && !needsAction(h)) continue;
      const g = groups.get(key(h)) ?? { total: 0, problems: 0 };
      g.total++;
      if (needsAction(h)) g.problems++;
      groups.set(key(h), g);
    }
    return [...groups.entries()].filter(([, g]) => g.problems > 0).sort((a, b) => b[1].problems / b[1].total - a[1].problems / a[1].total || b[1].problems - a[1].problems);
  };
  const statusCounts = Object.keys(LICENSE_STATUSES).map((s) => ({ status: s, count: licenses.filter((h) => matches(h, "status") && h.status === s).length }));
  const clientName = filters.client ? licenses.find((h) => h.license.clientId === filters.client)?.companyName : null;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {statusCounts.map(({ status, count }) => (
          <Link
            key={status}
            href={href({ status: filters.status === status ? null : status })}
            aria-pressed={filters.status === status}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filters.status === status ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {LICENSE_STATUSES[status as keyof typeof LICENSE_STATUSES].label} {count}
          </Link>
        ))}
        {(["client", "app", "model"] as const).map((key) =>
          filters[key] ? (
            <Link key={key} href={href({ [key]: null })} title="Remove this filter" className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs text-indigo-800 hover:bg-indigo-100">
              <span className="font-medium">{FILTERS[key]}:</span> {key === "client" ? (clientName ?? filters.client) : filters[key]} <span aria-hidden>✕</span>
            </Link>
          ) : null,
        )}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <Table head={["Phone", "Client", "Status", "Issues", "Calls 24h", "Reached CRM", "CRM sync, 7 days", "App", "Device"]} empty={shown.length ? undefined : "No phones match."}>
            {shown.map((h) => (
              <tr key={h.license.licenseId}>
                <td className={td}>
                  <Link href={licenseHref(HEALTH_PATH, h.license.licenseId)} className="font-mono text-xs font-medium text-indigo-700 hover:underline">…{h.license.last4}</Link>
                </td>
                <td className={td}>
                  <Link href={href({ client: h.license.clientId })} className="hover:text-indigo-700 hover:underline">{h.companyName}</Link>
                </td>
                <td className={td}><StatusBadge status={h.status} /></td>
                <td className="min-w-56 px-3 py-2 align-top text-xs text-slate-700">
                  {h.issues.length ? (
                    h.issues.map((i) => (
                      <p key={i.id} className={i.level === "info" ? "text-slate-500" : ""}>
                        {i.level === "info" && <span aria-hidden className="text-sky-700">i </span>}
                        <ItemLink href={issueLinks(HEALTH_PATH, i).primary}>{i.title}</ItemLink>
                        {i.rolledUp ? " (shared by the client's phones)" : ""}
                      </p>
                    ))
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {int(h.calls24h)}
                  <p className="text-xs text-slate-400">last {ago(h.lastCallAt, now)}</p>
                </td>
                <td className={`${td} text-right tabular-nums ${rateClass(h.pulse.reached.share)}`}>{pct(h.pulse.reached.share)}</td>
                <td className={td}>
                  <DayStrip days={h.pulse.days.slice(-7)} size="sm" />
                  <p className="mt-0.5 text-xs text-slate-500">last sync {h.pulse.lastSyncAt ? ago(h.pulse.lastSyncAt, now) : "never"}</p>
                </td>
                <td className={`${td} text-xs`}>
                  <Link href={href({ app: h.license.appVersion ?? "Unknown" })} className="hover:text-indigo-700 hover:underline">{h.license.appVersion ?? "—"}</Link>
                </td>
                <td className={`${td} text-xs`}>
                  <Link href={href({ model: model(h) })} className="hover:text-indigo-700 hover:underline">{model(h)}</Link>
                </td>
              </tr>
            ))}
          </Table>
        </div>
        <aside className="space-y-6">
          <GroupPanel title="By device model" rows={group(model)} href={(value) => href({ model: value })} />
          <GroupPanel title="By app version" rows={group((h) => h.license.appVersion ?? "Unknown")} href={(value) => href({ app: value })} />
        </aside>
      </div>
    </>
  );
}

function GroupPanel({ title, rows, href }: { title: string; rows: [string, { total: number; problems: number }][]; href: (value: string) => string }) {
  return (
    <Section title={title} note="Phones needing action / logged-in phones">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No problems.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.slice(0, 12).map(([value, g]) => (
            <li key={value} className="flex justify-between gap-3">
              <Link href={href(value)} className="truncate text-indigo-700 hover:underline">{value}</Link>
              <span className="tabular-nums text-slate-600">{g.problems} / {g.total}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
