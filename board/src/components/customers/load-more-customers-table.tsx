"use client";

import { Fragment, useState } from "react";
import { toast } from "sonner";
import { CustomerRow } from "@board/components/customers/customer-row";
import { LoadMoreButton } from "@board/components/shared/load-more-button";
import { groupRows } from "@board/lib/shared/group-rows";
import { encodeViewConfig } from "@board/lib/view-config";
import type { CustomerViewConfig } from "@board/lib/customer-views";

const PAGE_SIZE = 50;

export type CustomerRowData = {
  id: string;
  name: string;
  primaryContactName: string | null;
  ticketCount: number;
  journeyStage: string | null;
  customerTemplateLabel: string | null;
  createdByName: string;
};

/**
 * Client wrapper around the Customers table — Design 3's "Load More"
 * pattern, now also owning simple in-page grouping (see
 * simple-view-query.ts/group-rows.ts) driven by the filter/sort/group-by
 * toolbar rendered above it in page.tsx, mirroring
 * load-more-initiatives-table.tsx.
 */
export function LoadMoreCustomersTable({
  initialCustomers,
  initialTotal,
  initialHasMore,
  view,
  stageLabelByKey,
  showStageColumn,
  showTemplateColumn,
}: {
  initialCustomers: CustomerRowData[];
  initialTotal: number;
  initialHasMore: boolean;
  view: CustomerViewConfig;
  stageLabelByKey: Record<string, string>;
  showStageColumn: boolean;
  showTemplateColumn: boolean;
}) {
  const [customers, setCustomers] = useState(initialCustomers);
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
      const res = await fetch(`/dashboard/board/api/customers?${search.toString()}`);
      if (!res.ok) throw new Error("Load more failed");
      const data = await res.json();
      setCustomers((prev) => [...prev, ...data.customers]);
      setPage(nextPage);
      setHasMore(data.hasMore);
      setTotal(data.total);
    } catch {
      toast.error("Couldn't load more Customers — try again.");
    } finally {
      setLoading(false);
    }
  }

  const groupByTemplate = view.groupBy === "customerTemplateId";
  const groups = view.groupBy
    ? groupRows(customers, (c) => (groupByTemplate ? c.customerTemplateLabel : c.journeyStage))
    : [{ key: null, rows: customers }];
  const colSpan = 4 + (showStageColumn ? 1 : 0) + (showTemplateColumn ? 1 : 0) + 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-slate">
            <th className="pb-2 pr-4 font-semibold">Name</th>
            <th className="pb-2 pr-4 font-semibold">Primary Contact</th>
            <th className="pb-2 pr-4 font-semibold">Linked Tickets</th>
            <th className="pb-2 pr-4 font-semibold">Created By</th>
            {showStageColumn && <th className="pb-2 pr-4 font-semibold">Journey Stage</th>}
            {showTemplateColumn && <th className="pb-2 pr-4 font-semibold">Template</th>}
            <th className="pb-2 pr-4 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.key ?? "__none__"}>
              {view.groupBy && (
                <tr>
                  <td colSpan={colSpan} className="pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate">
                    {groupByTemplate
                      ? (group.key ?? "No template")
                      : ((group.key ? stageLabelByKey[group.key] : null) ?? "No stage")}{" "}
                    · {group.rows.length}
                  </td>
                </tr>
              )}
              {group.rows.map((customer) => (
                <CustomerRow
                  key={customer.id}
                  customerId={customer.id}
                  name={customer.name}
                  primaryContactName={customer.primaryContactName}
                  ticketCount={customer.ticketCount}
                  createdByName={customer.createdByName}
                  stageLabel={
                    customer.journeyStage
                      ? (stageLabelByKey[customer.journeyStage] ?? customer.journeyStage)
                      : null
                  }
                  showStageColumn={showStageColumn}
                  templateLabel={customer.customerTemplateLabel}
                  showTemplateColumn={showTemplateColumn}
                />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <LoadMoreButton
        hasMore={hasMore}
        loading={loading}
        loadedCount={customers.length}
        total={total}
        onClick={loadMore}
        itemLabel="Customer"
      />
    </div>
  );
}
