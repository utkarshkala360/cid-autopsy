import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { CreateCustomerForm } from "@board/components/customers/create-customer-form";
import { LoadMoreCustomersTable } from "@board/components/customers/load-more-customers-table";
import { UrlSyncedViewToolbar } from "@board/components/shared/url-synced-view-toolbar";
import { getCurrentMember } from "@board/lib/get-current-member";
import { connectDB } from "@board/lib/mongodb";
import { Customer, type CustomerDoc } from "@board/models/Customer";
import { TeamMembership } from "@board/models/TeamMembership";
import { WorkItem } from "@board/models/WorkItem";
import { Member } from "@board/models/Member";
import { getStageTrack } from "@board/lib/stage-tracks";
import { getCustomerTemplateDefs } from "@board/lib/customer-templates";
import { getSimpleListPage } from "@board/lib/simple-view-query";
import { decodeViewConfig, encodeViewConfig, isEmptyViewConfig } from "@board/lib/view-config";
import {
  CUSTOMER_FIELD_META,
  CUSTOMER_SORT_FIELD_LABEL,
  CUSTOMER_GROUP_FIELD_LABEL,
  customerFilterableFields,
  customerGroupableFields,
  type CustomerFilterField,
  type CustomerSortField,
  type CustomerGroupField,
} from "@board/lib/customer-views";

const PAGE_SIZE = 50;

// CU-1: a Customer is Org-level, not owned by one Team — every non-Guest
// role can view (Roles & Permissions Matrix); managing (create/edit) is
// gated at the API layer via requireAnyTeamAdmin (see src/lib/authz.ts).
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  const { view: viewParam } = await searchParams;
  const view = decodeViewConfig<CustomerFilterField, CustomerSortField, CustomerGroupField>(viewParam);

  await connectDB();
  const query = { organizationId: member.organizationId };
  const [{ docs: customers, total }, hasTeamAdmin, journeyTrack, orgMembers, customerTemplates] = await Promise.all([
    // Pagination redesign (Design 3): server-rendered first page only (50),
    // matching the "no waterfall" first-paint precedent every other list
    // page in this codebase already follows — subsequent pages come from
    // GET /api/customers via LoadMoreCustomersTable.
    getSimpleListPage<CustomerDoc, CustomerFilterField, CustomerSortField, CustomerGroupField>(
      Customer,
      query,
      view,
      { page: 1, pageSize: PAGE_SIZE, defaultSort: { name: 1 } }
    ),
    member.orgRole === "org_admin"
      ? Promise.resolve(true)
      : TeamMembership.exists({ memberId: member._id, role: "admin" }),
    getStageTrack(member.organizationId, "customer"),
    Member.find({ organizationId: member.organizationId }, "name").lean<{ _id: unknown; name: string }[]>(),
    getCustomerTemplateDefs(member.organizationId),
  ]);

  const ids = customers.map((c) => c._id);
  const ticketCounts = ids.length
    ? await WorkItem.aggregate([
        { $match: { organizationId: member.organizationId, type: "ticket", customerId: { $in: ids } } },
        { $group: { _id: "$customerId", count: { $sum: 1 } } },
      ])
    : [];

  const canManage = member.orgRole === "org_admin" || !!hasTeamAdmin;
  const ticketCountByCustomer = new Map(
    ticketCounts.map((t: { _id: unknown; count: number }) => [String(t._id), t.count])
  );
  const memberById = new Map(orgMembers.map((m) => [String(m._id), m.name]));
  const templateLabelById = new Map(customerTemplates.map((t) => [t.id, t.label]));

  const journeyEnabled = !!journeyTrack?.enabled;
  const templatesAvailable = customerTemplates.length > 0;
  const stageOptions = (journeyTrack?.stages ?? []).map((s) => ({ value: s.key, label: s.label }));
  const stageLabelByKey = new Map((journeyTrack?.stages ?? []).map((s) => [s.key, s.label]));
  const memberOptions = orgMembers.map((m) => ({ value: String(m._id), label: m.name }));
  const templateOptions = customerTemplates.map((t) => ({ value: t.id, label: t.label }));

  const filterableFields = customerFilterableFields(journeyEnabled, templatesAvailable);
  const groupableFields = customerGroupableFields(journeyEnabled, templatesAvailable);
  const fields = Object.fromEntries(
    filterableFields.map((f) => [f, CUSTOMER_FIELD_META[f]])
  ) as Record<CustomerFilterField, (typeof CUSTOMER_FIELD_META)[CustomerFilterField]>;
  const groupFields = Object.fromEntries(
    groupableFields.map((f) => [f, CUSTOMER_GROUP_FIELD_LABEL[f]])
  ) as Record<CustomerGroupField, string>;
  const fieldOptions = {
    journeyStage: stageOptions,
    customerTemplateId: templateOptions,
    createdBy: memberOptions,
  };

  return (

      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Customers</h1>
          <p className="mt-1 text-xs text-slate">
            A single, Org-level Customer record shared by every Team that works with them (CU-1) —
            Sales, CS, and Support all reference the same one instead of separate copies.
          </p>
        </div>

        {canManage && (
          <div className="rounded-lg border border-border bg-panel p-5">
            <CreateCustomerForm
              templates={customerTemplates.map((t) => ({ id: t.id, label: t.label }))}
              orgMembers={orgMembers.map((m) => ({ id: String(m._id), name: m.name }))}
            />
          </div>
        )}

        <div className="rounded-lg border border-border bg-panel p-5">
          <div className="mb-4">
            <UrlSyncedViewToolbar
              fields={fields}
              fieldOptions={fieldOptions}
              sortFields={CUSTOMER_SORT_FIELD_LABEL}
              groupFields={groupFields}
            />
          </div>
          {total === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-slate mb-3">
                <Building2 className="h-5 w-5" />
              </div>
              <p className="text-xs text-slate">
                {isEmptyViewConfig(view)
                  ? canManage
                    ? "No Customers yet. Create the first one above."
                    : "No Customers yet."
                  : "No Customers match these filters."}
              </p>
            </div>
          ) : (
            <LoadMoreCustomersTable
              key={encodeViewConfig(view)}
              view={view}
              stageLabelByKey={Object.fromEntries(stageLabelByKey)}
              showStageColumn={journeyEnabled}
              showTemplateColumn={templatesAvailable}
              initialCustomers={customers.map((customer) => ({
                id: String(customer._id),
                name: customer.name,
                primaryContactName: customer.contacts?.[0]?.name ?? null,
                ticketCount: ticketCountByCustomer.get(String(customer._id)) ?? 0,
                journeyStage: customer.journeyStage ?? null,
                customerTemplateLabel: customer.customerTemplateId
                  ? (templateLabelById.get(String(customer.customerTemplateId)) ?? null)
                  : null,
                createdByName: memberById.get(String(customer.createdBy)) ?? "—",
              }))}
              initialTotal={total}
              initialHasMore={PAGE_SIZE < total}
            />
          )}
        </div>
      </div>
  );
}
