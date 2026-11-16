// Generic filter/sort/group-by config shared by every "many records" list
// surface (Work Items, Initiatives, Customers). Extracted from
// work-item-views.ts once a second concrete entity needed the same shape —
// same "generalize via a shared core, entity-specific field unions on top"
// pattern StageTrack's entityType discriminator already established. No
// server/DB imports here — used by both client builder UI and server query
// building.
//
// Deliberately a two-level structure — groups combined with AND, conditions
// within a group combined with OR — rather than an arbitrary recursive tree.

export type MultiSelectOperator = "is_any_of" | "is_none_of";
export type DateOperator = "before" | "after" | "is_empty" | "is_not_empty";

export type FilterCondition<TField extends string, TDateField extends TField = never> =
  | { field: Exclude<TField, TDateField>; operator: MultiSelectOperator; values: string[] }
  | { field: TDateField; operator: DateOperator; value?: string | null };

export type FilterGroup<TField extends string, TDateField extends TField = never> = {
  id: string;
  conditions: FilterCondition<TField, TDateField>[];
};
export type FilterConfig<TField extends string, TDateField extends TField = never> = {
  groups: FilterGroup<TField, TDateField>[];
};

export type SortKey<TSortField extends string> = { field: TSortField; direction: "asc" | "desc" };

export type ViewConfig<
  TField extends string,
  TSortField extends string,
  TGroupField extends string,
  TDateField extends TField = never,
> = {
  filters: FilterConfig<TField, TDateField>;
  sort: SortKey<TSortField>[];
  groupBy: TGroupField | null;
};

export const UNASSIGNED_VALUE = "__unassigned__";

export function emptyViewConfig<
  F extends string,
  S extends string,
  G extends string,
  D extends F = never,
>(): ViewConfig<F, S, G, D> {
  return { filters: { groups: [] }, sort: [], groupBy: null };
}

export function isEmptyViewConfig<
  F extends string,
  S extends string,
  G extends string,
  D extends F = never,
>(config: ViewConfig<F, S, G, D>): boolean {
  return (
    config.filters.groups.every((g) => g.conditions.length === 0) &&
    config.sort.length === 0 &&
    !config.groupBy
  );
}

// Callers hand this straight to URLSearchParams.set()/read it from Next's
// searchParams — both already percent-encode/decode the query string, so
// encoding it again here would double-encode (still round-trips correctly,
// since decode happens twice too, but produces uglier/longer URLs for no
// reason).
export function encodeViewConfig<
  F extends string,
  S extends string,
  G extends string,
  D extends F = never,
>(config: ViewConfig<F, S, G, D>): string {
  return JSON.stringify(config);
}

export function decodeViewConfig<
  F extends string,
  S extends string,
  G extends string,
  D extends F = never,
>(raw: string | undefined | null): ViewConfig<F, S, G, D> {
  if (!raw) return emptyViewConfig<F, S, G, D>();
  try {
    const parsed = JSON.parse(raw);
    return {
      filters: parsed.filters?.groups ? { groups: parsed.filters.groups } : { groups: [] },
      sort: Array.isArray(parsed.sort) ? parsed.sort : [],
      groupBy: parsed.groupBy ?? null,
    };
  } catch {
    return emptyViewConfig<F, S, G, D>();
  }
}

/**
 * AND across groups, OR within a group. Mongo-shaped so page loaders can
 * spread the result straight into a `Model.find()`/`.aggregate()` query
 * alongside its own scope filter. `dateFields` names which fields use the
 * date-operator condition shape (before/after/is_empty/is_not_empty) instead
 * of multi-select is_any_of/is_none_of; `arrayFields` names which multi-select
 * fields are themselves arrays on the document (so `is_any_of`/`is_none_of`
 * stay plain $in/$nin against array membership, never translating an
 * "unassigned" sentinel to null the way scalar fields do).
 */
export function buildFilterQuery<F extends string, D extends F = never>(
  config: FilterConfig<F, D>,
  opts?: { dateFields?: Set<string>; arrayFields?: Set<string> }
): Record<string, unknown> {
  const dateFields = opts?.dateFields ?? new Set<string>();
  const arrayFields = opts?.arrayFields ?? new Set<string>();

  const andClauses = config.groups
    .map((group) => {
      const orClauses = group.conditions
        .map((cond) => conditionToMongo(cond, dateFields, arrayFields))
        .filter((c): c is Record<string, unknown> => c !== null);
      if (orClauses.length === 0) return null;
      return orClauses.length === 1 ? orClauses[0] : { $or: orClauses };
    })
    .filter((c): c is Record<string, unknown> => c !== null);

  if (andClauses.length === 0) return {};
  return andClauses.length === 1 ? andClauses[0] : { $and: andClauses };
}

function conditionToMongo<TField extends string, TDateField extends TField>(
  cond: FilterCondition<TField, TDateField>,
  dateFields: Set<string>,
  arrayFields: Set<string>
): Record<string, unknown> | null {
  if (dateFields.has(cond.field as string)) {
    const dateCond = cond as Extract<FilterCondition<TField, TDateField>, { operator: DateOperator }>;
    if (dateCond.operator === "is_empty") return { [dateCond.field]: null };
    if (dateCond.operator === "is_not_empty") return { [dateCond.field]: { $ne: null } };
    if (!dateCond.value) return null;
    const d = new Date(dateCond.value);
    if (Number.isNaN(d.getTime())) return null;
    return { [dateCond.field]: dateCond.operator === "before" ? { $lt: d } : { $gt: d } };
  }

  const msCond = cond as Extract<FilterCondition<TField, TDateField>, { operator: MultiSelectOperator }>;
  if (msCond.values.length === 0) return null;

  if (arrayFields.has(msCond.field as string)) {
    return { [msCond.field]: { [msCond.operator === "is_none_of" ? "$nin" : "$in"]: msCond.values } };
  }

  const resolved = msCond.values.map((v) => (v === UNASSIGNED_VALUE ? null : v));
  return { [msCond.field]: { [msCond.operator === "is_none_of" ? "$nin" : "$in"]: resolved } };
}
