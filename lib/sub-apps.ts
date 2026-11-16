// Registry of sub apps shown on the dashboard. Each lives at /dashboard/<slug>. Members sign in once
// at /dashboard/login; which apps each one can open is `members.apps`, set in the Admin Console.
export type SubApp = {
  slug: string;
  name: string;
  description: string;
  status: "live" | "coming-soon";
};

export const SUB_APPS: SubApp[] = [
  {
    slug: "call_anchor",
    name: "CallAnchor",
    description: "Health of CallAnchor clients, phones, calls and CRM syncs.",
    status: "live",
  },
  {
    slug: "board",
    name: "Board",
    description: "360 Cloud Board: work items, boards, initiatives and customers.",
    status: "live",
  },
];

export const APP_SLUGS = SUB_APPS.map((app) => app.slug);

export function appsFor(member: { apps: string[] }) {
  return SUB_APPS.filter((app) => member.apps.includes(app.slug));
}
