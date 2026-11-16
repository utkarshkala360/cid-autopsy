/**
 * Buckets an already-sorted (server-side, group field leading) array into
 * contiguous runs by group key — the client-side half of the "simple
 * in-page grouping" approach (see simple-view-query.ts): no aggregation
 * pipeline, just a section header wherever the key changes within the page
 * already fetched.
 */
export function groupRows<T>(
  rows: T[],
  keyFn: (row: T) => string | null
): { key: string | null; rows: T[] }[] {
  const groups: { key: string | null; rows: T[] }[] = [];
  for (const row of rows) {
    const key = keyFn(row);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
    } else {
      groups.push({ key, rows: [row] });
    }
  }
  return groups;
}
