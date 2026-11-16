import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { WorkItem } from "@board/models/WorkItem";
import { Team } from "@board/models/Team";
import { Customer } from "@board/models/Customer";
import { Initiative } from "@board/models/Initiative";
import { getEffectiveWorkflow, isValidStatus } from "@board/lib/workflow";
import { getFieldDefs, validateCustomFieldValues } from "@board/lib/custom-fields";
import { PRIORITIES } from "@board/lib/status-categories";
import { getTemplateDef, getWorkItemTemplateDefs } from "@board/lib/work-item-templates";
import { nextCreateOrder } from "@board/lib/ordering";
import { nextWorkItemSeq, formatWorkItemKey } from "@board/lib/work-item-key";
import { validateSubtaskParent } from "@board/lib/work-item-subtasks";
import { decodeViewConfig, buildFilterQuery } from "@board/lib/work-item-views";
import { getWorkItemsPage, DEFAULT_PAGE_SIZE } from "@board/lib/work-item-page-query";
import { toWorkItemRow, buildRowMaps } from "@board/lib/work-item-row";
import { toBoardItem, buildBoardRowMaps, type BoardRowSource } from "@board/lib/board-item-row";

// Pagination redesign (Checkpoint 3): this route serves two distinct shapes
// from one endpoint, chosen by which query params are present —
// deliberately backward-compatible rather than a breaking rewrite, since
// several existing pickers (sub-task parent picker, cross-team link picker,
// origin picker — see subtasks-panel.tsx, work-item-links-panel.tsx,
// origin-panel.tsx) already call `GET .../work-items?type=X` expecting the
// original `{ workItems: [...raw docs] }` shape and need the FULL matching
// set to search/filter from client-side, not a page of it.
//   - No `view`/`page`/`pageSize`/`groupKey` param present -> ORIGINAL
//     behavior, byte-for-byte: `{ workItems }`, full array, `type`-only
//     filter, `.sort({updatedAt:-1})`. Existing callers are unaffected.
//   - Any of those params present -> NEW paginated "Load More" shape,
//     driven by the same getWorkItemsPage() the Work Items list page uses
//     for its first-page server render, so a page-2+ row is produced by
//     the identical filter/sort/group-by/aggregation logic as page 1.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "viewer");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const sp = request.nextUrl.searchParams;
  const type = sp.get("type");
  const view = sp.get("view");
  const pageParam = sp.get("page");
  const pageSizeParam = sp.get("pageSize");
  const groupKey = sp.get("groupKey");
  const mode = sp.get("mode");
  const status = sp.get("status");

  await connectDB();

  if (view === null && pageParam === null && pageSizeParam === null && groupKey === null && mode === null) {
    const query: Record<string, unknown> = { teamId };
    if (type) query.type = type.toLowerCase();
    const workItems = await WorkItem.find(query).sort({ updatedAt: -1 }).lean();
    return NextResponse.json({ workItems });
  }

  if (!type) {
    return NextResponse.json({ error: "type is required for a paginated fetch." }, { status: 400 });
  }

  const normalizedType = type.toLowerCase();
  const config = decodeViewConfig(view);
  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(pageSizeParam) || DEFAULT_PAGE_SIZE));

  // Board pagination (Design 3, Board section): a fundamentally different
  // query shape from the Work Items list's aggregation above — Board
  // always sorts by {order, createdAt} (drag rank), never a semantic
  // sort/group-by (its ViewToolbar disables both, showSortAndGroup={false}),
  // and pages ONE status column at a time (`status` present) or the whole
  // flat Backlog queue (`status` absent). Simple `.find().skip().limit()`
  // suffices — no aggregation pipeline needed.
  if (mode === "board") {
    const matchQuery: Record<string, unknown> = { teamId, type: normalizedType, ...buildFilterQuery(config.filters) };
    if (status) matchQuery.status = status;

    const [items, total] = await Promise.all([
      WorkItem.find(matchQuery)
        .sort({ order: 1, createdAt: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<BoardRowSource[]>(),
      WorkItem.countDocuments(matchQuery),
    ]);

    const { assigneeMap, customerMap } = await buildBoardRowMaps(items);
    const ctx = { assigneeMap, customerMap };

    return NextResponse.json({
      items: items.map((i) => toBoardItem(i, ctx)),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    });
  }

  const result = await getWorkItemsPage({
    teamId,
    type: normalizedType,
    config,
    page,
    pageSize,
    groupKey,
  });

  const workflow = await getEffectiveWorkflow(teamId, normalizedType);
  const allItems = result.mode === "flat" ? result.items : result.groups.flatMap((g) => g.items);
  const { assigneeMap, customerMap } = await buildRowMaps(allItems);
  const ctx = { workflow, assigneeMap, customerMap };

  if (result.mode === "flat") {
    return NextResponse.json({
      mode: "flat",
      items: result.items.map((i) => toWorkItemRow(i, ctx)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    });
  }

  return NextResponse.json({
    mode: "grouped",
    groups: result.groups.map((g) => ({
      key: g.key,
      label: g.label,
      items: g.items.map((i) => toWorkItemRow(i, ctx)),
      total: g.total,
      page: g.page,
      pageSize: g.pageSize,
      hasMore: g.hasMore,
    })),
  });
}

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().max(20000).optional(),
  type: z.string().trim().toLowerCase().min(1).max(40).default("task"),
  status: z.string().trim().optional(),
  priority: z.enum(PRIORITIES).default("medium"),
  assignee: z.string().nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  dueDate: z.string().nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  customerId: z.string().nullable().optional(),
  initiativeId: z.string().nullable().optional(),
  teamInitiativeId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
});

// Team Member and above may create Work Items (Roles & Permissions Matrix).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "member");
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

  const workflow = await getEffectiveWorkflow(teamId, data.type);
  const status = data.status || workflow.statuses[0]?.key;
  if (!status || !isValidStatus(workflow, status)) {
    return NextResponse.json(
      { error: "Invalid status for this Work Item type." },
      { status: 400 }
    );
  }

  let customFields: Record<string, unknown> = {};
  if (data.customFields && Object.keys(data.customFields).length > 0) {
    const defs = await getFieldDefs(teamId, data.type);
    const validated = validateCustomFieldValues(defs, data.customFields);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    customFields = validated.values;
  }

  let dueDate: Date | null = null;
  if (data.dueDate) {
    const parsedDate = new Date(data.dueDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
    }
    dueDate = parsedDate;
  }

  // WT-1: linking a Customer is optional even for a template with
  // requiresCustomer (Phase 16, Design 3) — a Work Item can always stand on
  // its own without linking to a Customer or any other module. When a
  // customerId IS given, it's still validated at the API boundary (schema
  // stays generic for every type, ORG-4). `requiresCustomer` is looked up
  // against the live WorkItemTemplateDef registry instead of a hardcoded
  // `type === "ticket"` check — any Org-Admin-added template gets the same
  // treatment with zero new code.
  const templates = await getWorkItemTemplateDefs(authz.member.organizationId);
  const requiresCustomer = getTemplateDef(data.type, templates)?.requiresCustomer ?? false;
  let customerId: string | null = null;
  if (requiresCustomer && data.customerId) {
    if (!mongoose.isValidObjectId(data.customerId)) {
      return NextResponse.json({ error: "That Customer doesn't exist." }, { status: 400 });
    }
    await connectDB();
    const customer = await Customer.findOne({
      _id: data.customerId,
      organizationId: authz.member.organizationId,
    }).lean();
    if (!customer) {
      return NextResponse.json({ error: "That Customer doesn't exist." }, { status: 400 });
    }
    customerId = data.customerId;
  }

  await connectDB();

  // ORG-5: Initiative is optional but, if given, must be a real Org-level
  // Initiative — same "validate at the API boundary" pattern as customerId.
  let initiativeId: string | null = null;
  if (data.initiativeId) {
    if (!mongoose.isValidObjectId(data.initiativeId)) {
      return NextResponse.json({ error: "That Initiative doesn't exist." }, { status: 400 });
    }
    const initiative = await Initiative.findOne({
      _id: data.initiativeId,
      organizationId: authz.member.organizationId,
    }).lean();
    if (!initiative) {
      return NextResponse.json({ error: "That Initiative doesn't exist." }, { status: 400 });
    }
    initiativeId = data.initiativeId;
  }

  // BD-3: optional Team-run-Initiative (formerly Sprint) assignment at
  // creation — validated at the API boundary the same way
  // customerId/initiativeId are (ORG-4). A closed one isn't a valid target
  // for new work. Phase 16 (Design 2): queries Initiative{teamId,...}
  // instead of the deleted Sprint model.
  let teamInitiativeId: string | null = null;
  if (data.teamInitiativeId) {
    if (!mongoose.isValidObjectId(data.teamInitiativeId)) {
      return NextResponse.json({ error: "That Sprint doesn't exist." }, { status: 400 });
    }
    const sprint = await Initiative.findOne({ _id: data.teamInitiativeId, teamId }).lean<{
      sprintStatus: string;
    }>();
    if (!sprint) {
      return NextResponse.json({ error: "That Sprint doesn't exist." }, { status: 400 });
    }
    if (sprint.sprintStatus === "completed") {
      return NextResponse.json({ error: "Can't assign a new item to a completed Sprint." }, { status: 400 });
    }
    teamInitiativeId = data.teamInitiativeId;
  }

  // Sub-tasks: optional, validated the same way customerId/initiativeId are
  // — the API boundary, not the schema (ORG-4).
  let parentId: string | null = null;
  if (data.parentId) {
    const validated = await validateSubtaskParent(teamId, data.parentId);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    parentId = data.parentId;
  }

  const existingOrders = await WorkItem.find({ teamId, type: data.type }, "order").lean<
    { order: number }[]
  >();

  const team = await Team.findById(teamId, "slug").lean<{ slug: string }>();
  const seq = await nextWorkItemSeq(teamId);
  const key = formatWorkItemKey(team!.slug, seq);

  const workItem = await WorkItem.create({
    organizationId: authz.member.organizationId,
    teamId,
    type: data.type,
    key,
    title: data.title,
    description: data.description ?? "",
    status,
    priority: data.priority,
    assignee: data.assignee || null,
    reporter: authz.member._id,
    labels: data.labels ?? [],
    dueDate,
    customFields,
    customerId,
    initiativeId,
    teamInitiativeId,
    parentId,
    order: nextCreateOrder(existingOrders.map((o) => o.order)),
  });

  return NextResponse.json({ workItem }, { status: 201 });
}
