import { STATUS_CATEGORY_CLASSES, type StatusCategory } from "@board/lib/status-categories";
import type { WorkflowStatus } from "@board/lib/workflow";

export function StatusPill({ label, category }: { label: string; category: StatusCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${STATUS_CATEGORY_CLASSES[category]}`}
    >
      {label}
    </span>
  );
}

export function resolveStatusMeta(statuses: WorkflowStatus[], statusKey: string): WorkflowStatus {
  return (
    statuses.find((s) => s.key === statusKey) ?? {
      key: statusKey,
      label: statusKey,
      category: "todo",
    }
  );
}
