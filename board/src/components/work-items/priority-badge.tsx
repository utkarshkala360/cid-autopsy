import type { ComponentType } from "react";
import { ArrowUp, ArrowDown, Minus, AlertTriangle } from "lucide-react";
import { PRIORITY_CLASSES, PRIORITY_LABEL, type Priority } from "@board/lib/status-categories";

const PRIORITY_ICON: Record<Priority, ComponentType<{ className?: string }>> = {
  low: ArrowDown,
  medium: Minus,
  high: ArrowUp,
  urgent: AlertTriangle,
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${PRIORITY_CLASSES[priority]}`}
    >
      <Icon className="h-3 w-3" />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
