import "server-only";
import type mongoose from "mongoose";
import { buildFilterQuery, type ViewConfig } from "@board/lib/view-config";

/**
 * Flat, filtered+sorted+paginated page for a "many records, no workflow
 * ranking" entity — Initiatives and Customers today. Deliberately NOT an
 * aggregation pipeline: unlike Work Items (status/priority rank, key-suffix
 * sort, mention-candidate assignee lookup — see work-item-page-query.ts),
 * these entities sort on plain scalar fields, so a real `.find()` is enough.
 *
 * Plain `.find()` (unlike `.aggregate()`) auto-casts query values against
 * the schema, including inside `$in`/`$nin` — no manual ObjectId-casting
 * workaround needed here the way the aggregation pipeline requires.
 *
 * Group-by is intentionally NOT done here: `buildSortSpec` puts `view.groupBy`
 * first in the sort so same-group rows land contiguously in the page, and
 * the client renders section headers wherever the group value changes — no
 * `$group`/`$push`/`$slice`, since these lists are small enough that
 * per-group independent pagination isn't warranted.
 */
export async function getSimpleListPage<TDoc, F extends string, S extends string, G extends string>(
  Model: mongoose.Model<Record<string, unknown>>,
  scopeFilter: Record<string, unknown>,
  view: ViewConfig<F, S, G>,
  opts: {
    page: number;
    pageSize: number;
    defaultSort: Record<string, 1 | -1>;
    dateFields?: Set<string>;
    arrayFields?: Set<string>;
  }
): Promise<{ docs: TDoc[]; total: number }> {
  const filter = {
    ...scopeFilter,
    ...buildFilterQuery(view.filters, { dateFields: opts.dateFields, arrayFields: opts.arrayFields }),
  };
  const sort = buildSortSpec(view, opts.defaultSort);

  const [docs, total] = await Promise.all([
    Model.find(filter)
      .sort(sort)
      .skip((opts.page - 1) * opts.pageSize)
      .limit(opts.pageSize)
      .lean<TDoc[]>(),
    Model.countDocuments(filter),
  ]);

  return { docs, total };
}

/**
 * When grouping is active, the group field leads the sort so rows with the
 * same group value land contiguously within a page — the user's chosen sort
 * (or the entity's default) breaks ties within a group.
 */
export function buildSortSpec<F extends string, S extends string, G extends string>(
  view: ViewConfig<F, S, G>,
  defaultSort: Record<string, 1 | -1>
): Record<string, 1 | -1> {
  const rest: Record<string, 1 | -1> = {};
  if (view.sort.length > 0) {
    for (const key of view.sort) rest[key.field] = key.direction === "asc" ? 1 : -1;
  } else {
    Object.assign(rest, defaultSort);
  }
  if (!view.groupBy) return rest;
  delete rest[view.groupBy];
  return { [view.groupBy]: 1, ...rest };
}
