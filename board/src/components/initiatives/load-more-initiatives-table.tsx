"use client";

import { Fragment, useState } from "react";
import { toast } from "sonner";
import { InitiativeRow } from "@board/components/initiatives/initiative-row";
import { LoadMoreButton } from "@board/components/shared/load-more-button";
import { groupRows } from "@board/lib/shared/group-rows";
import { encodeViewConfig } from "@board/lib/view-config";
import type { InitiativeViewConfig } from "@board/lib/initiative-views";

const PAGE_SIZE = 50;

export type InitiativeRowData = {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  lifecycleStage: string | null;
  createdByName: string;
};

/**
 * Client wrapper for the org-level (cross-team tag) Initiatives table —
 * Design 3's "Load More" pattern, same shape as Customers, now also owning
 * simple in-page grouping (see simple-view-query.ts/group-rows.ts) driven
 * by the filter/sort/group-by toolbar rendered above it in page.tsx.
 * Deliberately NOT used for the Team-run "Sprints" branch of the
 * Initiatives page (out of scope per the plan — that branch stays a plain
 * list, naturally low-cardinality per Team).
 */
export function LoadMoreInitiativesTable({
  initialInitiatives,
  initialTotal,
  initialHasMore,
  view,
  stageLabelByKey,
  showStageColumn,
}: {
  initialInitiatives: InitiativeRowData[];
  initialTotal: number;
  initialHasMore: boolean;
  view: InitiativeViewConfig;
  stageLabelByKey: Record<string, string>;
  showStageColumn: boolean;
}) {
  const [initiatives, setInitiatives] = useState(initialInitiatives);
  const [total, setTotal] = useState(initialTotal);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (loading) return;
    setLoading(true);
    const nextPage = page + 1;
    try {
      const search = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(PAGE_SIZE),
        view: encodeViewConfig(view),
      });
      const res = await fetch(`/dashboard/board/api/initiatives?${search.toString()}`);
      if (!res.ok) throw new Error("Load more failed");
      const data = await res.json();
      setInitiatives((prev) => [...prev, ...data.initiatives]);
      setPage(nextPage);
      setHasMore(data.hasMore);
      setTotal(data.total);
    } catch {
      toast.error("Couldn't load more Initiatives — try again.");
    } finally {
      setLoading(false);
    }
  }

  const groups = view.groupBy
    ? groupRows(initiatives, (i) => i.lifecycleStage)
    : [{ key: null, rows: initiatives }];
  const colSpan = showStageColumn ? 6 : 5;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-slate">
            <th className="pb-2 pr-4 font-semibold">Name</th>
            <th className="pb-2 pr-4 font-semibold">Description</th>
            <th className="pb-2 pr-4 font-semibold">Linked Work Items</th>
            <th className="pb-2 pr-4 font-semibold">Created By</th>
            {showStageColumn && <th className="pb-2 pr-4 font-semibold">Lifecycle Stage</th>}
            <th className="pb-2 pr-4 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.key ?? "__none__"}>
              {view.groupBy && (
                <tr>
                  <td colSpan={colSpan} className="pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate">
                    {(group.key ? stageLabelByKey[group.key] : null) ?? "No stage"} · {group.rows.length}
                  </td>
                </tr>
              )}
              {group.rows.map((initiative) => (
                <InitiativeRow
                  key={initiative.id}
                  initiativeId={initiative.id}
                  name={initiative.name}
                  description={initiative.description}
                  itemCount={initiative.itemCount}
                  createdByName={initiative.createdByName}
                  stageLabel={
                    initiative.lifecycleStage
                      ? (stageLabelByKey[initiative.lifecycleStage] ?? initiative.lifecycleStage)
                      : null
                  }
                  showStageColumn={showStageColumn}
                />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <LoadMoreButton
        hasMore={hasMore}
        loading={loading}
        loadedCount={initiatives.length}
        total={total}
        onClick={loadMore}
        itemLabel="Initiative"
      />
    </div>
  );
}
