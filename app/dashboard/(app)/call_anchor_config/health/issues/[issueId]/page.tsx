import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ISSUE_ID, loadIssue } from "@/lib/callanchor/health";
import { durationText, RULES } from "@/lib/callanchor/issues";
import { CALLANCHOR_PATH, HEALTH_PATH, requireCallAnchorSession } from "@/lib/callanchor/session";
import { ago, formatTime, int, licenseHref } from "../../format";
import { IssuePanel, ItemLink, Section, issueLinks } from "../../parts";

export const metadata: Metadata = { title: "Issue" };

// One issue in depth: the trusted evidence, what the CRM said, matching suggestions and what to check.
// Cards with rows open the items page instead, which shows the same panel above the rows; this page
// is for issues without rows and for links kept from before. Recomputed from the store.

export default async function IssuePage({ params }: PageProps<"/dashboard/call_anchor_config/health/issues/[issueId]">) {
  const issueId = decodeURIComponent((await params).issueId);
  if (!ISSUE_ID.test(issueId)) notFound();
  const { member } = await requireCallAnchorSession(`${HEALTH_PATH}/issues/${encodeURIComponent(issueId)}`);
  const data = await loadIssue(issueId);
  const now = Date.parse(data.loadedAt);
  const { issue } = data;

  const crumbs = [
    { href: CALLANCHOR_PATH, label: "CallAnchor Config" },
    { href: HEALTH_PATH, label: "Client health" },
    ...(data.clientId ? [{ href: `${HEALTH_PATH}/${data.clientId}`, label: data.companyName ?? data.clientId }] : []),
  ];

  if (!issue) {
    return (
      <div>
        <Breadcrumbs items={crumbs} />
        <h1 className="text-xl font-semibold text-slate-900">This issue isn&apos;t open now</h1>
        <p className="mt-2 text-sm text-slate-600">
          <span aria-hidden className="text-emerald-700">✓ </span>
          {data.state
            ? `It was last seen ${formatTime(data.state.lastSeenAt)} IST (${ago(data.state.lastSeenAt, now)}), first seen ${formatTime(data.state.firstSeenAt)} IST.`
            : "Nothing in the stored data matches it now."}
        </p>
      </div>
    );
  }

  const links = issueLinks(HEALTH_PATH, issue);

  return (
    <div>
      <Breadcrumbs items={crumbs} />
      <h1 className="text-xl font-semibold text-slate-900">{issue.title}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {issue.scope === "fleet" ? "CallAnchor, all clients" : data.companyName}
        {data.license && (
          <>
            {" · phone "}
            <Link href={licenseHref(HEALTH_PATH, data.license.licenseId)} className="font-mono text-indigo-700 hover:underline">…{data.license.last4}</Link>
          </>
        )}
      </p>
      {issue.rolledUp && <p className="mt-1 text-sm text-slate-500">Most of this client&apos;s phones show this, so it&apos;s also raised once for the client.</p>}

      <div className="mt-4">
        <IssuePanel issue={issue} checklist={data.checklist} suggestions={data.suggestions} now={now} compact />
      </div>

      <Section title="Affected items">
        {links.rows ? (
          <p className="text-sm">
            <ItemLink href={links.rows} className="font-medium text-indigo-700">
              Open the {issue.impact ? `${int(issue.impact)} affected ` : ""}{issue.drill?.kind === "logs" ? "log lines" : issue.drill?.kind === "syncs" ? "syncs" : "calls"}
            </ItemLink>
            , one row each, with this evidence above them, down to a single call&apos;s timeline.
          </p>
        ) : (
          <p className="text-sm text-slate-500">This issue is about the account, an integration or the phone, not individual calls.</p>
        )}
      </Section>

      <p className="mt-8 text-xs text-slate-400">
        Critical below {RULES.criticalSuccessRate}% success, warning below {RULES.warningSuccessRate}%, a {durationText(RULES.phoneGraceMs)} grace for the phone&apos;s
        upload and {durationText(RULES.serverGraceMs)} for CallAnchor&apos;s server steps.
        {member.role === "admin" && (
          <>
            {" "}
            Change them in <Link href={`${HEALTH_PATH}/settings`} className="text-indigo-700 hover:underline">Settings</Link>.
          </>
        )}
      </p>
    </div>
  );
}
