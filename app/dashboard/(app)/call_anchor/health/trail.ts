const BASE = "/dashboard/call_anchor/health";

const FLEET_LABELS: Record<string, string> = {
  overview: "Overview",
  licenses: "Licenses",
  seats: "Seats",
  settings: "Settings",
  find: "Find by ID",
  items: "Calls & logs",
  issues: "Issues",
  calls: "Calls",
};

// Where you are, from the URL: Client health › Clients › <client> › Licenses › Phone …1234, and so
// on. Every step but the last opens that level (owner, 2026-11-13). Names come from the layout: client
// names, and each license's last four digits. `back` is the items list a call was opened from.
export type Crumb = { label: string; href?: string };
export function trailFor(pathname: string, back: string | null, clients: Record<string, string>, phones: Record<string, string>): Crumb[] {
  if (!pathname.startsWith(BASE)) return [];
  const segs = pathname.slice(BASE.length).split("/").filter(Boolean).map(decodeURIComponent);
  const crumbs: Crumb[] = [{ label: "Client health", href: BASE }];
  const backTo = back && back.startsWith(`${BASE}/`) && back.includes("/items?") ? back : null;

  if (segs[0] === "clients" && segs[1]) {
    const root = `${BASE}/clients/${encodeURIComponent(segs[1])}`;
    crumbs.push({ label: "Clients", href: BASE }, { label: clients[segs[1]] ?? "Client", href: root });
    const [, , view, id] = segs;
    if (view === "licenses") {
      crumbs.push({ label: "Licenses", href: `${root}/licenses` });
      if (id) crumbs.push({ label: `Phone …${phones[id] ?? "????"}` });
    } else if (view === "seats") crumbs.push({ label: "Seats" });
    else if (view === "items") crumbs.push({ label: "Calls & logs" });
    else if (view === "calls") {
      crumbs.push({ label: "Calls & logs", href: backTo ?? `${root}/items?kind=calls&stage=all&window=1` });
      if (id) crumbs.push({ label: `Call …${id.slice(-8)}` });
    } else if (view === "issues") {
      crumbs.push({ label: "Issues", href: `${root}#s-issues` });
      if (id) crumbs.push({ label: "Issue" });
    } else crumbs.push({ label: "Health" });
  } else {
    const [view, id] = segs;
    crumbs.push({ label: FLEET_LABELS[view ?? ""] ?? "Clients", href: view && id ? `${BASE}/${view === "calls" ? "items?kind=calls&stage=all&window=1" : view}` : undefined });
    if (id) crumbs.push({ label: view === "calls" ? `Call …${id.slice(-8)}` : view === "issues" ? "Issue" : id });
  }
  const last = crumbs.length - 1;
  crumbs[last] = { label: crumbs[last].label };
  return crumbs;
}

