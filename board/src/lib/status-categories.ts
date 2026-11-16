// Plain constants/types only — no Mongoose import. Client components (status
// pills, config forms) need these at runtime; see the Phase 3 lesson in
// team-roles.ts about not importing runtime values from Mongoose model files.

export const STATUS_CATEGORIES = ["todo", "in_progress", "done", "blocked"] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const STATUS_CATEGORY_LABEL: Record<StatusCategory, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
};

// Tailwind class pairs matching the semantic status tokens in globals.css.
export const STATUS_CATEGORY_CLASSES: Record<StatusCategory, string> = {
  todo: "bg-status-todo-bg text-status-todo",
  in_progress: "bg-status-in-progress-bg text-status-in-progress",
  done: "bg-status-done-bg text-status-done",
  blocked: "bg-status-blocked-bg text-status-blocked",
};

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

// Not tied to the 4 status categories — priority is its own Org-level scale
// (ORG-7) reusing the same ruby/amber/gray language for visual consistency.
export const PRIORITY_CLASSES: Record<Priority, string> = {
  low: "bg-status-todo-bg text-status-todo",
  medium: "bg-status-in-progress-bg text-status-in-progress",
  high: "bg-status-blocked-bg text-status-blocked",
  urgent: "bg-status-blocked text-white",
};

export const CUSTOM_FIELD_TYPES = ["text", "number", "dropdown", "date", "user_picker"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  dropdown: "Dropdown",
  date: "Date",
  user_picker: "User Picker",
};
