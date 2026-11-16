import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireAnyTeamAdmin } from "@board/lib/authz";
import { getCurrentMember } from "@board/lib/get-current-member";
import { connectDB } from "@board/lib/mongodb";
import { Customer, type CustomerDoc } from "@board/models/Customer";
import { WorkItem } from "@board/models/WorkItem";
import { Member } from "@board/models/Member";
import { CustomerTemplateDef } from "@board/models/CustomerTemplateDef";
import { getSimpleListPage } from "@board/lib/simple-view-query";
import { decodeViewConfig } from "@board/lib/view-config";
import { getCustomerTemplateFieldDefs } from "@board/lib/customer-templates";
import { validateCustomFieldValues } from "@board/lib/custom-fields";
import type { CustomerFilterField, CustomerSortField, CustomerGroupField } from "@board/lib/customer-views";

const DEFAULT_PAGE_SIZE = 50;

// Any authenticated Member can view Customer records (Roles & Permissions
// Matrix — every non-Guest role gets at least "View only"). Pagination
// redesign — Design 3: real `.skip()/.limit()` instead of the old
// full-collection fetch, called by the Customers page's "Load More" client
// wrapper for every page after the server-rendered first one. No existing
// caller depended on the old unpaginated shape (checked: nothing in the
// codebase called this GET route via fetch before this change — the
// Customers page itself always queried Customer directly, not through this
// route), so this is a clean redesign rather than an additive/back-compat
// branch like the Work Items route needed.
export async function GET(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize")) || DEFAULT_PAGE_SIZE));
  const view = decodeViewConfig<CustomerFilterField, CustomerSortField, CustomerGroupField>(
    sp.get("view")
  );

  await connectDB();
  const query = { organizationId: member.organizationId };
  const { docs: customers, total } = await getSimpleListPage<CustomerDoc, CustomerFilterField, CustomerSortField, CustomerGroupField>(
    Customer,
    query,
    view,
    { page, pageSize, defaultSort: { name: 1 } }
  );

  // Linked-Ticket counts, scoped to just this page's Customers — not every
  // Customer in the Org, matching the "only fetch what this page needs"
  // discipline the Work Items aggregation rewrite established.
  const ids = customers.map((c) => c._id);
  const creatorIds = [...new Set(customers.map((c) => String(c.createdBy)))];
  const templateIds = [
    ...new Set(customers.map((c) => c.customerTemplateId).filter((id): id is NonNullable<typeof id> => !!id).map(String)),
  ];
  const [ticketCounts, creators, templates] = await Promise.all([
    ids.length
      ? WorkItem.aggregate([
          { $match: { organizationId: member.organizationId, type: "ticket", customerId: { $in: ids } } },
          { $group: { _id: "$customerId", count: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
    creatorIds.length ? Member.find({ _id: { $in: creatorIds } }, "name").lean() : Promise.resolve([]),
    templateIds.length
      ? CustomerTemplateDef.find({ _id: { $in: templateIds } }, "label").lean()
      : Promise.resolve([]),
  ]);
  const countMap = new Map(ticketCounts.map((t: { _id: unknown; count: number }) => [String(t._id), t.count]));
  const nameByCreator = new Map(
    (creators as { _id: unknown; name: string }[]).map((m) => [String(m._id), m.name])
  );
  const labelByTemplate = new Map(
    (templates as { _id: unknown; label: string }[]).map((t) => [String(t._id), t.label])
  );

  const rows = customers.map((c) => ({
    id: String(c._id),
    name: c.name,
    primaryContactName: c.contacts?.[0]?.name ?? null,
    ticketCount: countMap.get(String(c._id)) ?? 0,
    journeyStage: c.journeyStage ?? null,
    customerTemplateLabel: c.customerTemplateId
      ? (labelByTemplate.get(String(c.customerTemplateId)) ?? null)
      : null,
    createdByName: nameByCreator.get(String(c.createdBy)) ?? "—",
  }));

  return NextResponse.json({
    customers: rows,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  contacts: z.array(contactSchema).max(20).optional(),
  // Optional — a Customer can still be created without picking a product
  // (every pre-existing Customer, and any future one that doesn't need
  // this), same "optional, not required" precedent WorkItem.customerId/
  // initiativeId already established.
  customerTemplateId: z.string().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

// Org Admin, or Team Admin on any Team (requireAnyTeamAdmin — see authz.ts).
export async function POST(request: NextRequest) {
  const authz = await requireAnyTeamAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  await connectDB();

  let customerTemplateId: string | null = null;
  let customFields: Record<string, unknown> = {};

  if (data.customerTemplateId) {
    if (!mongoose.isValidObjectId(data.customerTemplateId)) {
      return NextResponse.json({ error: "That Customer Template doesn't exist." }, { status: 400 });
    }
    const template = await CustomerTemplateDef.findOne({
      _id: data.customerTemplateId,
      organizationId: authz.member.organizationId,
    });
    if (!template) {
      return NextResponse.json({ error: "That Customer Template doesn't exist." }, { status: 400 });
    }
    customerTemplateId = data.customerTemplateId;

    const fieldDefs = await getCustomerTemplateFieldDefs(data.customerTemplateId);
    const result = validateCustomFieldValues(fieldDefs, data.customFields ?? {});
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    customFields = result.values;
  }

  const customer = await Customer.create({
    organizationId: authz.member.organizationId,
    name: data.name,
    contacts: data.contacts ?? [],
    customerTemplateId,
    customFields,
    createdBy: authz.member._id,
  });

  return NextResponse.json({ customer }, { status: 201 });
}
