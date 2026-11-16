// WF-4: plain constants/logic only — no server-only import, since the
// workflow config UI (a client component) needs REQUIRABLE_FIELDS to render
// checkboxes, and the Work Item PATCH route needs missingRequiredFields to
// enforce them (same split as status-categories.ts / work-item-views.ts).

export const REQUIRABLE_FIELDS = ["assignee", "dueDate", "description", "labels"] as const;
export type RequirableField = (typeof REQUIRABLE_FIELDS)[number];

export const REQUIRABLE_FIELD_LABEL: Record<RequirableField, string> = {
  assignee: "Assignee",
  dueDate: "Due date",
  description: "Description",
  labels: "Labels",
};

export type RequirableWorkItem = {
  assignee?: unknown;
  dueDate?: unknown;
  description?: string | null;
  labels?: string[] | null;
};

/**
 * Returns the subset of `requiredFields` that aren't actually filled in on
 * `item` yet. Called against the Work Item's state AFTER every other field
 * in the same PATCH request has already been merged onto it — so a request
 * that sets both `status` and `assignee` together can satisfy an
 * assignee-required transition in one edit, not two.
 */
export function missingRequiredFields(
  item: RequirableWorkItem,
  requiredFields: string[] | undefined
): RequirableField[] {
  if (!requiredFields || requiredFields.length === 0) return [];
  const missing: RequirableField[] = [];
  for (const field of requiredFields) {
    if (!(REQUIRABLE_FIELDS as readonly string[]).includes(field)) continue;
    const f = field as RequirableField;
    if (f === "assignee" && !item.assignee) missing.push(f);
    if (f === "dueDate" && !item.dueDate) missing.push(f);
    if (f === "description" && !item.description?.trim()) missing.push(f);
    if (f === "labels" && (!item.labels || item.labels.length === 0)) missing.push(f);
  }
  return missing;
}
