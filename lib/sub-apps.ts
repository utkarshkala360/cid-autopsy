// Registry of sub apps shown on the dashboard. Each lives at /dashboard/<slug>.
export type SubApp = {
  slug: string;
  name: string;
  description: string;
  status: "live" | "coming-soon";
};

export const SUB_APPS: SubApp[] = [
  {
    slug: "call_anchor_config",
    name: "CallAnchor Config",
    description: "Configure CallAnchor.",
    status: "coming-soon",
  },
];
