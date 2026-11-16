"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarClock, Layers } from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@board/components/work-items/status-pill";
import { PriorityBadge } from "@board/components/work-items/priority-badge";
import { Select, SelectOption } from "@board/components/ui/select";
import { LoadMoreButton } from "@board/components/shared/load-more-button";
import type { StatusCategory, Priority } from "@board/lib/status-categories";

export type WorkItemRow = {
  id: string;
  key: string;
  title: string;
  labels: string[];
  statusLabel: string;
  statusCategory: StatusCategory;
  priority: Priority;
  customerId: string | null;
  customerName: string | null;
  assigneeName: string | null;
  dueDateText: string | null;
  dueDateTitle: string | null;
  dueDateOverdue: boolean;
  isEpic: boolean;
};

export type WorkItemGroupData = {
  key: string;
  label: string;
  items: WorkItemRow[];
  // Pagination-redesign — Load More (Checkpoint 3): when present, a group
  // (or the single implicit "__all__" group in flat/ungrouped mode) can
  // page independently of every other group, matching Design 1's per-group
  // pagination. `total` is the true server-side count for this group, not
  // just `items.length` (may be larger once more items exist than are
  // currently loaded).
  total?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

type Option = { value: string; label: string };

const UNASSIGNED = "__unassigned__";
const BACKLOG = "__backlog__";

/**
 * IT-5: multi-select rows + a floating bulk-action bar that PATCHes each
 * selected item individually through the existing PATCH
 * `/dashboard/board/api/teams/{teamId}/work-items/{itemId}` route (Promise.allSettled, one
 * call per item) — no new bulk-mutation endpoint, so every item still goes
 * through the same per-item validation (WF-4 required fields, WF-1 valid
 * transitions, Sprint-completed guard) and gets its own ChangeHistory diff,
 * exactly as if it had been edited one at a time.
 */
export function WorkItemsTable({
  teamId,
  groups,
  isTicket,
  canBulkEdit,
  statusOptions,
  assigneeOptions,
  sprintOptions,
}: {
  teamId: string;
  groups: WorkItemGroupData[];
  isTicket: boolean;
  canBulkEdit: boolean;
  statusOptions: Option[];
  assigneeOptions: Option[];
  sprintOptions: Option[] | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkSprint, setBulkSprint] = useState("");
  const [applying, setApplying] = useState(false);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(ids: string[]) {
    const allIn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allIn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkStatus("");
    setBulkAssignee("");
    setBulkSprint("");
  }

  async function applyBulk() {
    const patch: Record<string, unknown> = {};
    if (bulkStatus) patch.status = bulkStatus;
    if (bulkAssignee) patch.assignee = bulkAssignee === UNASSIGNED ? null : bulkAssignee;
    if (bulkSprint) patch.teamInitiativeId = bulkSprint === BACKLOG ? null : bulkSprint;
    if (Object.keys(patch).length === 0) return;

    setApplying(true);
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/dashboard/board/api/teams/${teamId}/work-items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }).then((res) => {
          if (!res.ok) throw new Error();
        })
      )
    );
    setApplying(false);

    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = ids.length - failed;
    if (succeeded > 0) {
      toast.success(`Updated ${succeeded} item${succeeded === 1 ? "" : "s"}.`);
    }
    if (failed > 0) {
      toast.error(
        `${failed} item${failed === 1 ? "" : "s"} couldn't be updated — an invalid transition, a missing required field, or a permission check failed.`
      );
    }
    clearSelection();
    router.refresh();
  }

  const hasBulkChange = !!(bulkStatus || bulkAssignee || bulkSprint);

  return (
    <div className="space-y-6">
      {canBulkEdit && selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 shadow-xs">
          <span className="text-xs font-semibold text-ink">{selected.size} selected</span>
          <Select value={bulkStatus} onValueChange={setBulkStatus} placeholder="Set status…" className="h-8 w-36">
            {statusOptions.map((o) => (
              <SelectOption key={o.value} value={o.value}>
                {o.label}
              </SelectOption>
            ))}
          </Select>
          <Select
            value={bulkAssignee}
            onValueChange={setBulkAssignee}
            placeholder="Set assignee…"
            className="h-8 w-40"
          >
            <SelectOption value={UNASSIGNED}>Unassigned</SelectOption>
            {assigneeOptions.map((o) => (
              <SelectOption key={o.value} value={o.value}>
                {o.label}
              </SelectOption>
            ))}
          </Select>
          {sprintOptions && (
            <Select
              value={bulkSprint}
              onValueChange={setBulkSprint}
              placeholder="Set sprint…"
              className="h-8 w-36"
            >
              <SelectOption value={BACKLOG}>Backlog</SelectOption>
              {sprintOptions.map((o) => (
                <SelectOption key={o.value} value={o.value}>
                  {o.label}
                </SelectOption>
              ))}
            </Select>
          )}
          <button
            type="button"
            disabled={applying || !hasBulkChange}
            onClick={applyBulk}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {applying ? "Applying…" : "Apply"}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs font-medium text-slate hover:text-ink"
          >
            Clear selection
          </button>
        </div>
      )}

      {groups.map((group) => {
        const groupIds = group.items.map((i) => i.id);
        const groupAllSelected = groupIds.length > 0 && groupIds.every((id) => selected.has(id));
        return (
          <div key={group.key}>
            {group.label && (
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate">
                  {group.label}
                </h2>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-slate">
                  {group.total ?? group.items.length}
                </span>
              </div>
            )}
            <div className="overflow-hidden rounded-lg border border-border bg-panel shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface/60 text-[11px] font-semibold uppercase tracking-wider text-slate">
                      {canBulkEdit && (
                        <th className="w-9 px-4 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Select all in ${group.label || "this list"}`}
                            checked={groupAllSelected}
                            onChange={() => toggleGroup(groupIds)}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                        </th>
                      )}
                      <th className="px-4 py-2.5 font-semibold">Key</th>
                      <th className="px-4 py-2.5 font-semibold">Title</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold">Priority</th>
                      {isTicket && <th className="px-4 py-2.5 font-semibold">Customer</th>}
                      <th className="px-4 py-2.5 font-semibold">Assignee</th>
                      <th className="px-4 py-2.5 font-semibold">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface/50">
                        {canBulkEdit && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              aria-label={`Select ${item.key}`}
                              checked={selected.has(item.id)}
                              onChange={() => toggleOne(item.id)}
                              className="h-3.5 w-3.5 accent-primary"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/board/teams/${teamId}/work-items/${item.id}`}
                            className="font-mono text-xs text-slate hover:text-primary"
                          >
                            {item.key}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {item.isEpic && (
                              <span
                                title="Epic"
                                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                              >
                                <Layers className="h-2.5 w-2.5" />
                                Epic
                              </span>
                            )}
                            <Link
                              href={`/dashboard/board/teams/${teamId}/work-items/${item.id}`}
                              className="font-medium text-ink hover:text-primary"
                            >
                              {item.title}
                            </Link>
                          </div>
                          {item.labels.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.labels.map((label) => (
                                <span
                                  key={label}
                                  className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-slate"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill label={item.statusLabel} category={item.statusCategory} />
                        </td>
                        <td className="px-4 py-3">
                          <PriorityBadge priority={item.priority} />
                        </td>
                        {isTicket && (
                          <td className="px-4 py-3">
                            {item.customerId ? (
                              <Link
                                href={`/dashboard/board/customers/${item.customerId}`}
                                className="text-xs font-medium text-primary hover:text-primary-hover"
                              >
                                {item.customerName ?? "—"}
                              </Link>
                            ) : (
                              <span className="text-xs text-slate">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          {item.assigneeName ? (
                            <div className="flex items-center gap-1.5">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                                {item.assigneeName
                                  .split(" ")
                                  .map((p) => p[0])
                                  .slice(0, 2)
                                  .join("")
                                  .toUpperCase()}
                              </span>
                              <span className="text-xs text-ink">{item.assigneeName}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {item.dueDateText ? (
                            <span
                              className={`inline-flex items-center gap-1 text-xs ${
                                item.dueDateOverdue ? "font-medium text-status-blocked" : "text-slate"
                              }`}
                              title={item.dueDateTitle ?? undefined}
                            >
                              <CalendarClock className="h-3 w-3" />
                              {item.dueDateText}
                            </span>
                          ) : (
                            <span className="text-xs text-slate">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {group.onLoadMore && (
                <LoadMoreButton
                  hasMore={group.hasMore ?? false}
                  loading={group.loadingMore ?? false}
                  loadedCount={group.items.length}
                  total={group.total ?? group.items.length}
                  onClick={group.onLoadMore}
                  itemLabel="item"
                  className="border-t border-border"
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
