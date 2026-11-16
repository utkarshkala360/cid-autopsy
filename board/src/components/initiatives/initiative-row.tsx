import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function InitiativeRow({
  initiativeId,
  name,
  description,
  itemCount,
  createdByName,
  stageLabel,
  showStageColumn,
}: {
  initiativeId: string;
  name: string;
  description: string;
  itemCount: number;
  createdByName: string;
  stageLabel: string | null;
  showStageColumn: boolean;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4 font-medium text-ink">{name}</td>
      <td className="py-3 pr-4 text-slate">{description || "—"}</td>
      <td className="py-3 pr-4 text-slate">
        {itemCount} {itemCount === 1 ? "Work Item" : "Work Items"}
      </td>
      <td className="py-3 pr-4 text-slate">{createdByName}</td>
      {showStageColumn && <td className="py-3 pr-4 text-slate">{stageLabel ?? "—"}</td>}
      <td className="py-3 pr-4">
        <Link
          href={`/dashboard/board/initiatives/${initiativeId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
        >
          View
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </td>
    </tr>
  );
}
