"use client";

import { useState } from "react";
import { toast } from "sonner";
import { WorkItemsTable, type WorkItemRow } from "@board/components/work-items/work-items-table";
import { encodeViewConfig, type ViewConfig } from "@board/lib/work-item-views";

const PAGE_SIZE = 50;

export type InitialWorkItemGroup = {
  key: string;
  label: string;
  items: WorkItemRow[];
  total: number;
  hasMore: boolean;
};

type GroupRuntimeState = InitialWorkItemGroup & { page: number; loading: boolean };

/**
 * Client wrapper around WorkItemsTable that owns "Load More" pagination
 * state, seeded from the server-rendered first page (Design 3). Flat/
 * ungrouped mode is modeled as a single implicit group (key "__all__",
 * label "") so both modes share one code path — matching how
 * WorkItemsTable itself renders a group's Load More button (see that
 * component's `onLoadMore` field).
 *
 * Deliberately ONE WorkItemsTable instance for every group, not one
 * instance per group section: WorkItemsTable owns the multi-select bulk-
 * edit state internally, and splitting into separate instances per group
 * would silently break cross-group bulk selection (today you can select
 * items from two different status groups and bulk-apply to both at once).
 *
 * Callers must pass a `key` prop that changes whenever the view config
 * (filters/sort/groupBy) or Work Item type changes — e.g.
 * `key={`${type}:${encodeViewConfig(config)}`}` — so React remounts this
 * component (fresh Load More state) instead of reusing accumulated pages
 * from a now-stale filter/sort, since a `view` query-param change is a
 * normal client-side navigation, not a full page reload.
 */
export function LoadMoreWorkItemsTable({
  teamId,
  type,
  config,
  isGrouped,
  isTicket,
  canBulkEdit,
  statusOptions,
  assigneeOptions,
  sprintOptions,
  initialGroups,
}: {
  teamId: string;
  type: string;
  config: ViewConfig;
  isGrouped: boolean;
  isTicket: boolean;
  canBulkEdit: boolean;
  statusOptions: { value: string; label: string }[];
  assigneeOptions: { value: string; label: string }[];
  sprintOptions: { value: string; label: string }[] | null;
  initialGroups: InitialWorkItemGroup[];
}) {
  const [groups, setGroups] = useState<GroupRuntimeState[]>(() =>
    initialGroups.map((g) => ({ ...g, page: 1, loading: false }))
  );

  async function loadMore(groupKey: string) {
    const target = groups.find((g) => g.key === groupKey);
    if (!target || target.loading) return;

    setGroups((prev) => prev.map((g) => (g.key === groupKey ? { ...g, loading: true } : g)));

    const nextPage = target.page + 1;
    const search = new URLSearchParams({
      type,
      view: encodeViewConfig(config),
      page: String(nextPage),
      pageSize: String(PAGE_SIZE),
    });
    if (isGrouped) search.set("groupKey", groupKey);

    try {
      const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items?${search.toString()}`);
      if (!res.ok) throw new Error("Load more failed");
      const data = await res.json();
      const page = data.mode === "flat" ? data : data.groups[0];
      setGroups((prev) =>
        prev.map((g) =>
          g.key === groupKey
            ? {
                ...g,
                items: [...g.items, ...page.items],
                page: nextPage,
                hasMore: page.hasMore,
                total: page.total,
                loading: false,
              }
            : g
        )
      );
    } catch {
      // Real error state (Non-Negotiable #7): the button reverts to its
      // normal (non-loading) state so the Member can simply try again — no
      // state was lost since nothing was optimistically appended before the
      // fetch resolved — and a toast surfaces the failure instead of it
      // silently doing nothing.
      setGroups((prev) => prev.map((g) => (g.key === groupKey ? { ...g, loading: false } : g)));
      toast.error("Couldn't load more items — try again.");
    }
  }

  return (
    <WorkItemsTable
      teamId={teamId}
      isTicket={isTicket}
      canBulkEdit={canBulkEdit}
      statusOptions={statusOptions}
      assigneeOptions={assigneeOptions}
      sprintOptions={sprintOptions}
      groups={groups.map((g) => ({
        key: g.key,
        label: g.label,
        items: g.items,
        total: g.total,
        hasMore: g.hasMore,
        loadingMore: g.loading,
        onLoadMore: () => loadMore(g.key),
      }))}
    />
  );
}
