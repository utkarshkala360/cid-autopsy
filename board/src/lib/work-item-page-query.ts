import "server-only";

// Pagination/performance rewrite — Checkpoint 2 (Design 1: aggregation
// rewrite). Replaces the Checkpoint 1 "fetch everything, sort in JS" version
// of getWorkItemsPage() with a real MongoDB aggregation pipeline so
// $skip/$limit can apply correctly in every mode (flat, grouped, and
// per-group "Load More"), instead of pagination only being safe for the
// unsorted/ungrouped case.
//
// Kept in its own file, not merged into src/lib/work-item-views.ts — see
// that file's own comment: it's intentionally DB/mongoose-free because a
// client component (view-toolbar.tsx) imports its pure types/constants, and
// adding a mongoose import there would risk pulling server-only code into
// the client bundle graph for that import. This file imports
// work-item-views.ts's pure helpers (buildFilterQuery, UNASSIGNED_VALUE,
// types) rather than duplicating them.
//
// Semantic sort/group fidelity notes (verified against the OLD in-JS
// applySort/applyGroupBy — see scripts/_tmp-verify-checkpoint2.ts run
// against real seeded data before this rewrite replaced them):
//   - status/priority sort use the exact same rank arrays the old JS
//     comparator used ($indexOfArray against the Team's live Workflow
//     status order / the fixed PRIORITIES scale), with an unmatched key
//     mapped to rank 0 (not -1) to match the old `?? 0` fallback exactly.
//   - assignee sort resolves the live Member name via $lookup, same
//     "empty string for unassigned" fallback the old comparator used, so
//     unassigned items keep sorting first in ascending order.
//   - the human-readable Work Item `key` (e.g. "DEV-42") sorts by its
//     numeric suffix, not lexicographically — the old comparator used
//     `localeCompare(..., { numeric: true })`; a plain Mongo string $sort
//     would put "DEV-10" before "DEV-2", so the numeric suffix is extracted
//     into a computed field and sorted as a number instead.
//   - every aggregate() call uses `.collation({ locale: "en" })` so string
//     comparisons (title, key-as-fallback) use ICU collation, the closest
//     practical match to JS's default `localeCompare` (plain Mongo $sort is
//     byte-order, which — unlike collation — sorts all-uppercase strings
//     before any lowercase one).
//   - a deterministic `_id: 1` tiebreaker is appended to every sort spec.
//     This is a genuine, deliberate addition beyond old-behavior parity:
//     the old code had no tiebreak for equal-timestamp ties either (Mongo's
//     own unsorted-tie order is not guaranteed stable across calls), but
//     leaving that in place would make pagination non-deterministic —
//     capable of silently duplicating or dropping a row across two page
//     fetches whenever two items tie on the chosen sort key. It never
//     changes the *visible* order for realistic (non-tied) data.
//   - group-by ordering (which group section appears first) is NOT
//     alphabetical or rank-order — the old code always ran applySort across
//     the WHOLE item set first, then bucketed the already-sorted array, so
//     a group's position is "wherever its first item landed in the overall
//     sort" (confirmed directly against real data: default sort is
//     updatedAt-desc, so group order came out effectively randomized by
//     recency, not todo/in_progress/done rank order). Reproduced here by
//     capturing each group's first-encountered document (`$first` on the
//     already-sorted stream) and re-sorting the group summaries by that
//     document's same computed sort fields.
//   - GROUPABLE_FIELDS (work-item-views.ts) does not include "labels" —
//     confirmed by direct read before implementing — so no $unwind stage is
//     needed for group-by; every groupable field is single-valued.

import mongoose, { type PipelineStage } from "mongoose";
import { connectDB } from "@board/lib/mongodb";
import { WorkItem, type WorkItemDoc } from "@board/models/WorkItem";
import { Customer } from "@board/models/Customer";
import { Initiative } from "@board/models/Initiative";
import { getEffectiveWorkflow, type EffectiveWorkflow } from "@board/lib/workflow";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@board/lib/status-categories";
import {
  buildFilterQuery,
  UNASSIGNED_VALUE,
  type ViewConfig,
  type SortKey,
  type SortField,
  type GroupByField,
} from "@board/lib/work-item-views";

export const DEFAULT_PAGE_SIZE = 50;
export const GROUP_PAGE_SIZE = 50;

export type PageWorkItem = Omit<WorkItemDoc, "assignee" | "dueDate"> & {
  assignee: string | null;
  dueDate: Date | null;
};

export type FlatWorkItemsPage = {
  mode: "flat";
  items: PageWorkItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type WorkItemGroupPage = {
  key: string;
  label: string;
  items: PageWorkItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type GroupedWorkItemsPage = {
  mode: "grouped";
  groups: WorkItemGroupPage[];
};

export type WorkItemsPageResult = FlatWorkItemsPage | GroupedWorkItemsPage;

// --- ObjectId-bearing fields needing manual cast for aggregate() (Mongoose
// only auto-casts $match query docs for .find(), not .aggregate()). ---
const OBJECT_ID_FILTER_FIELDS = new Set(["assignee", "reporter", "customerId", "initiativeId", "teamInitiativeId"]);
const OBJECT_ID_GROUP_FIELDS = new Set(["assignee", "customerId", "initiativeId", "teamInitiativeId"]);

function toObjectIdOrNull(v: unknown): unknown {
  if (v === null) return null;
  if (typeof v === "string" && mongoose.isValidObjectId(v)) return new mongoose.Types.ObjectId(v);
  return v;
}

function castFilterQueryForAggregate(query: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key === "$or" || key === "$and") {
      result[key] = (value as Record<string, unknown>[]).map(castFilterQueryForAggregate);
      continue;
    }
    if (OBJECT_ID_FILTER_FIELDS.has(key) && value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      const casted: Record<string, unknown> = {};
      if ("$in" in v) casted.$in = (v.$in as unknown[]).map(toObjectIdOrNull);
      if ("$nin" in v) casted.$nin = (v.$nin as unknown[]).map(toObjectIdOrNull);
      result[key] = casted;
      continue;
    }
    result[key] = value;
  }
  return result;
}

// --- Sort-key -> pipeline-field mapping ---
const RANK_FIELD: Partial<Record<SortField, string>> = {
  status: "_statusRank",
  priority: "_priorityRank",
  assignee: "_assigneeName",
  key: "_keySeq",
  dueDate: "_dueDateSort",
};

// Mongo's native $sort puts null/missing BEFORE any real value in ascending
// order. The old comparator treated a missing dueDate as `Infinity`
// (`a.dueDate ? new Date(a.dueDate).getTime() : Infinity`), i.e. unscheduled
// items always sort to the far end regardless of asc/desc — the opposite of
// Mongo's default for ascending. Confirmed as a real, visible mismatch
// (not just a theoretical edge case) against real seeded data with a mix of
// null and set due dates.
const NO_DUE_DATE_SORT_VALUE = Number.MAX_SAFE_INTEGER;

function sortNeeds(sort: SortKey[], field: SortField): boolean {
  return sort.some((s) => s.field === field);
}

/** $addFields stages needed before $sort, only for fields actually used. */
function buildRankStages(
  sort: SortKey[],
  statusOrder: string[],
  mentionCandidateIds: string[],
  mentionCandidateNames: string[]
): Record<string, unknown>[] {
  const stages: Record<string, unknown>[] = [];

  if (sortNeeds(sort, "status")) {
    stages.push({
      $addFields: {
        _statusRank: {
          $let: {
            vars: { idx: { $indexOfArray: [statusOrder, "$status"] } },
            in: { $cond: [{ $eq: ["$$idx", -1] }, 0, "$$idx"] },
          },
        },
      },
    });
  }

  if (sortNeeds(sort, "priority")) {
    stages.push({
      $addFields: {
        _priorityRank: {
          $let: {
            vars: { idx: { $indexOfArray: [PRIORITIES as unknown as string[], "$priority"] } },
            in: { $cond: [{ $eq: ["$$idx", -1] }, 0, "$$idx"] },
          },
        },
      },
    });
  }

  if (sortNeeds(sort, "assignee")) {
    // Deliberately NOT a $lookup against the full Member collection — the
    // old in-JS comparator resolved assignee display names via this Team's
    // *mention candidates* map (Team members + org-wide Org Admins, the
    // same set the assignee field-option picker offers — see
    // getTeamMentionCandidates), defaulting to "" for anyone outside that
    // set. A raw $lookup would resolve ANY valid Member id's real name
    // regardless of Team membership — confirmed as a real, visible sort-
    // order mismatch during behavior-preservation testing, not a
    // theoretical one. Same $indexOfArray pattern as status/priority rank,
    // against a literal {ids, names} pair built from the already-fetched
    // candidate list instead of a DB join.
    const ids = mentionCandidateIds.map((id) => new mongoose.Types.ObjectId(id));
    stages.push({
      $addFields: {
        _assigneeName: {
          $let: {
            vars: { idx: { $indexOfArray: [ids, "$assignee"] } },
            in: { $cond: [{ $eq: ["$$idx", -1] }, "", { $arrayElemAt: [mentionCandidateNames, "$$idx"] }] },
          },
        },
      },
    });
  }

  if (sortNeeds(sort, "key")) {
    // Keys are "<TEAMSLUG>-<seq>" (see work-item-key.ts) — every item in
    // this pipeline shares one Team (and therefore one slug), so comparing
    // just the numeric suffix as an integer reproduces the old
    // `localeCompare(..., { numeric: true })` behavior without needing the
    // slug itself.
    stages.push({
      $addFields: {
        _keySeq: { $toInt: { $arrayElemAt: [{ $split: ["$key", "-"] }, -1] } },
      },
    });
  }

  if (sortNeeds(sort, "dueDate")) {
    stages.push({
      $addFields: {
        _dueDateSort: {
          $cond: [{ $eq: ["$dueDate", null] }, NO_DUE_DATE_SORT_VALUE, { $toLong: "$dueDate" }],
        },
      },
    });
  }

  return stages;
}

function buildSortStage(sort: SortKey[]): Record<string, 1 | -1> {
  const stage: Record<string, 1 | -1> = {};
  for (const key of sort) {
    const field = RANK_FIELD[key.field] ?? key.field;
    stage[field] = key.direction === "desc" ? -1 : 1;
  }
  if (Object.keys(stage).length === 0) {
    stage.updatedAt = -1; // matches the old default query sort
  } else if (!("updatedAt" in stage)) {
    // Matches the old JS behavior exactly: applySort ran a STABLE sort on
    // top of an array already fetched via `.sort({updatedAt:-1})` — so
    // among items tied on every explicit sort key, the old code's
    // effective secondary order was "most recently updated first," not
    // creation/_id order. Confirmed empirically against real seeded data
    // (scripts/_tmp-verify-checkpoint2.ts) — using `_id` here instead
    // produced a real, visible mismatch for "sort by priority" and "sort
    // by dueDate" (both have many ties), not just an edge case.
    stage.updatedAt = -1;
  }
  stage._id = 1; // final deterministic tiebreak (pagination correctness only — see file-header note)
  return stage;
}

/** Same sort spec, but reading from a nested `firstDoc.<field>` path — used
 * to reorder group summaries by their first-encountered item, reproducing
 * the old "group order = first occurrence in the overall sort" behavior. */
function buildGroupOrderStage(sort: SortKey[]): Record<string, 1 | -1> {
  const itemStage = buildSortStage(sort);
  const stage: Record<string, 1 | -1> = {};
  for (const [field, dir] of Object.entries(itemStage)) {
    stage[`firstDoc.${field}`] = dir;
  }
  return stage;
}

const TEMP_FIELDS = ["_statusRank", "_priorityRank", "_assigneeName", "_assigneeDoc", "_keySeq", "_dueDateSort"];

function groupKeyExpr(field: GroupByField): Record<string, unknown> {
  if (OBJECT_ID_GROUP_FIELDS.has(field)) {
    return { $ifNull: [{ $toString: `$${field}` }, UNASSIGNED_VALUE] };
  }
  return { $ifNull: [`$${field}`, UNASSIGNED_VALUE] };
}

function groupKeyToMatchValue(field: GroupByField, key: string): unknown {
  if (key === UNASSIGNED_VALUE) return null;
  if (OBJECT_ID_GROUP_FIELDS.has(field)) return new mongoose.Types.ObjectId(key);
  return key;
}

function stripTempFields(doc: Record<string, unknown>): PageWorkItem {
  const clean = { ...doc };
  for (const f of TEMP_FIELDS) delete clean[f];
  return clean as PageWorkItem;
}

type LabelContext = {
  workflow: EffectiveWorkflow;
  memberNames: Map<string, string>;
  customerNames: Map<string, string>;
  initiativeNames: Map<string, string>;
};

function labelForGroup(field: GroupByField, key: string, ctx: LabelContext): string {
  if (key === UNASSIGNED_VALUE) return "None";
  if (field === "status") return ctx.workflow.statuses.find((s) => s.key === key)?.label ?? key;
  if (field === "priority") return PRIORITY_LABEL[key as Priority] ?? key;
  if (field === "assignee") return ctx.memberNames.get(key) ?? "Unknown";
  if (field === "customerId") return ctx.customerNames.get(key) ?? "Unknown";
  // initiativeId and teamInitiativeId both reference the Initiative
  // collection (ORG-5 tag vs. Team-run Initiative) — same lookup map.
  if (field === "initiativeId" || field === "teamInitiativeId") return ctx.initiativeNames.get(key) ?? "Unknown";
  return key;
}

/** Fetches display names only for the group keys that actually came back —
 * not the Team/Org's full Customer/Initiative/Member lists — since this
 * function (unlike the page, which needs full pickers) only needs to label
 * the handful of distinct groups present in this result. */
async function resolveGroupLabels(
  teamId: string,
  groupBy: GroupByField,
  keys: string[],
  workflow: EffectiveWorkflow
): Promise<LabelContext> {
  const realIds = keys.filter((k) => k !== UNASSIGNED_VALUE);
  const memberNames = new Map<string, string>();
  const customerNames = new Map<string, string>();
  const initiativeNames = new Map<string, string>();

  if (groupBy === "assignee" && realIds.length > 0) {
    // Matches the old in-JS labelForGroup exactly: resolved via this
    // Team's mention candidates (Team members + org-wide Org Admins), the
    // same set the assignee field-option picker uses — NOT a raw Member
    // lookup by id. An assignee id that isn't in that set (shouldn't
    // happen through the real picker, but defensively handled the same way
    // status/customerId/initiativeId all fall back) resolves to "Unknown",
    // same as before. Confirmed as a real, visible difference against real
    // data during behavior-preservation testing, not a theoretical one.
    const { getTeamMentionCandidates } = await import("@board/lib/work-items");
    const candidates = await getTeamMentionCandidates(teamId);
    const idSet = new Set(realIds);
    for (const c of candidates) {
      if (idSet.has(c.id)) memberNames.set(c.id, c.name);
    }
  } else if (groupBy === "customerId" && realIds.length > 0) {
    const customers = await Customer.find({ _id: { $in: realIds } }, "name").lean<{ _id: mongoose.Types.ObjectId; name: string }[]>();
    for (const c of customers) customerNames.set(String(c._id), c.name);
  } else if ((groupBy === "initiativeId" || groupBy === "teamInitiativeId") && realIds.length > 0) {
    const initiatives = await Initiative.find({ _id: { $in: realIds } }, "name").lean<{ _id: mongoose.Types.ObjectId; name: string }[]>();
    for (const i of initiatives) initiativeNames.set(String(i._id), i.name);
  }

  return { workflow, memberNames, customerNames, initiativeNames };
}

export type GetWorkItemsPageParams = {
  teamId: string;
  type: string;
  config: ViewConfig;
  page?: number;
  pageSize?: number;
  /** Grouped mode only: when set, fetch the NEXT page of this one group
   * instead of the first page of every group ("Load More" within a
   * section). Ignored when config.groupBy is null. */
  groupKey?: string | null;
};

async function buildBaseStages(teamId: string, type: string, config: ViewConfig, workflow: EffectiveWorkflow) {
  const matchStage: Record<string, unknown> = {
    teamId: new mongoose.Types.ObjectId(teamId),
    type,
    ...castFilterQueryForAggregate(buildFilterQuery(config.filters)),
  };
  const statusOrder = workflow.statuses.map((s) => s.key);

  // Only fetched when actually sorting by assignee — see buildRankStages'
  // assignee branch for why this (not a raw Member $lookup) is required.
  let mentionCandidateIds: string[] = [];
  let mentionCandidateNames: string[] = [];
  if (sortNeeds(config.sort, "assignee")) {
    const { getTeamMentionCandidates } = await import("@board/lib/work-items");
    const candidates = await getTeamMentionCandidates(teamId);
    mentionCandidateIds = candidates.map((c) => c.id);
    mentionCandidateNames = candidates.map((c) => c.name);
  }

  const rankStages = buildRankStages(config.sort, statusOrder, mentionCandidateIds, mentionCandidateNames);
  const sortStage = buildSortStage(config.sort);
  return { matchStage, rankStages, sortStage };
}

/**
 * Single entry point for "give me a page of this Team's Work Items,
 * filtered/sorted/grouped per `config`" — used by both the Work Items list
 * page (first-page server render) and `GET /api/teams/[teamId]/work-items`
 * (subsequent "Load More" pages, and per-group "Load More").
 *
 * Three modes, chosen from `config.groupBy`/`groupKey`:
 *   - groupBy null            -> flat mode: real $skip/$limit pagination.
 *   - groupBy set, no groupKey -> grouped-initial mode: every group's first
 *     page (capped at GROUP_PAGE_SIZE) in one aggregation, each with its
 *     own total/hasMore — NOT one global page across every group.
 *   - groupBy set + groupKey  -> single-group mode: the next page of one
 *     specific already-rendered group (cheaper — no $group stage needed,
 *     just an extra $match on that group's field value).
 */
export async function getWorkItemsPage(params: GetWorkItemsPageParams): Promise<WorkItemsPageResult> {
  const { teamId, type, config } = params;
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;

  await connectDB();
  const workflow = await getEffectiveWorkflow(teamId, type);

  if (!config.groupBy) {
    return getFlatPage(teamId, type, config, workflow, page, pageSize);
  }

  if (params.groupKey) {
    const group = await getSingleGroupPage(
      teamId,
      type,
      config,
      workflow,
      config.groupBy,
      params.groupKey,
      page,
      pageSize
    );
    return { mode: "grouped", groups: [group] };
  }

  return getGroupedInitialPage(teamId, type, config, workflow, config.groupBy);
}

async function getFlatPage(
  teamId: string,
  type: string,
  config: ViewConfig,
  workflow: EffectiveWorkflow,
  page: number,
  pageSize: number
): Promise<FlatWorkItemsPage> {
  const { matchStage, rankStages, sortStage } = await buildBaseStages(teamId, type, config, workflow);

  const pipeline: Record<string, unknown>[] = [
    { $match: matchStage },
    ...rankStages,
    { $sort: sortStage },
    { $unset: TEMP_FIELDS },
    {
      $facet: {
        items: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        totalCount: [{ $count: "count" }],
      },
    },
  ];

  const [result] = await WorkItem.aggregate(pipeline as unknown as PipelineStage[]).collation({ locale: "en" });
  const items = (result?.items ?? []) as PageWorkItem[];
  const total = result?.totalCount?.[0]?.count ?? 0;

  return {
    mode: "flat",
    items,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}

async function getGroupedInitialPage(
  teamId: string,
  type: string,
  config: ViewConfig,
  workflow: EffectiveWorkflow,
  groupBy: GroupByField
): Promise<GroupedWorkItemsPage> {
  const { matchStage, rankStages, sortStage } = await buildBaseStages(teamId, type, config, workflow);
  const groupOrderStage = buildGroupOrderStage(config.sort);

  const pipeline: Record<string, unknown>[] = [
    { $match: matchStage },
    ...rankStages,
    { $sort: sortStage },
    // Deliberately NOT $unset here (unlike the flat/single-group
    // pipelines) — `firstDoc`/`items` below need the computed rank fields
    // (_statusRank etc.) to still be present so `groupOrderStage` can sort
    // group summaries by them. Temp fields are stripped afterward in JS via
    // stripTempFields() instead, once they're no longer needed.
    {
      $group: {
        _id: groupKeyExpr(groupBy),
        items: { $push: "$$ROOT" },
        firstDoc: { $first: "$$ROOT" },
      },
    },
    {
      $addFields: {
        total: { $size: "$items" },
        items: { $slice: ["$items", 0, GROUP_PAGE_SIZE] },
      },
    },
    { $sort: groupOrderStage },
  ];

  const raw = (await WorkItem.aggregate(pipeline as unknown as PipelineStage[]).collation({ locale: "en" })) as {
    _id: string;
    items: Record<string, unknown>[];
    total: number;
  }[];

  const keys = raw.map((g) => g._id);
  const ctx = await resolveGroupLabels(teamId, groupBy, keys, workflow);

  return {
    mode: "grouped",
    groups: raw.map((g) => ({
      key: g._id,
      label: labelForGroup(groupBy, g._id, ctx),
      items: g.items.map(stripTempFields),
      total: g.total,
      page: 1,
      pageSize: GROUP_PAGE_SIZE,
      hasMore: g.total > GROUP_PAGE_SIZE,
    })),
  };
}

async function getSingleGroupPage(
  teamId: string,
  type: string,
  config: ViewConfig,
  workflow: EffectiveWorkflow,
  groupBy: GroupByField,
  groupKey: string,
  page: number,
  pageSize: number
): Promise<WorkItemGroupPage> {
  const { matchStage, rankStages, sortStage } = await buildBaseStages(teamId, type, config, workflow);
  matchStage[groupBy] = groupKeyToMatchValue(groupBy, groupKey);

  const pipeline: Record<string, unknown>[] = [
    { $match: matchStage },
    ...rankStages,
    { $sort: sortStage },
    { $unset: TEMP_FIELDS },
    {
      $facet: {
        items: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        totalCount: [{ $count: "count" }],
      },
    },
  ];

  const [result] = await WorkItem.aggregate(pipeline as unknown as PipelineStage[]).collation({ locale: "en" });
  const items = (result?.items ?? []) as PageWorkItem[];
  const total = result?.totalCount?.[0]?.count ?? 0;
  const ctx = await resolveGroupLabels(teamId, groupBy, [groupKey], workflow);

  return {
    key: groupKey,
    label: labelForGroup(groupBy, groupKey, ctx),
    items,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}
