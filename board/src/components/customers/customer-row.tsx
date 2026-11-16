import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function CustomerRow({
  customerId,
  name,
  primaryContactName,
  ticketCount,
  createdByName,
  stageLabel,
  showStageColumn,
  templateLabel,
  showTemplateColumn,
}: {
  customerId: string;
  name: string;
  primaryContactName: string | null;
  ticketCount: number;
  createdByName: string;
  stageLabel: string | null;
  showStageColumn: boolean;
  templateLabel: string | null;
  showTemplateColumn: boolean;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4 font-medium text-ink">{name}</td>
      <td className="py-3 pr-4 text-slate">{primaryContactName ?? "—"}</td>
      <td className="py-3 pr-4 text-slate">
        {ticketCount} {ticketCount === 1 ? "Ticket" : "Tickets"}
      </td>
      <td className="py-3 pr-4 text-slate">{createdByName}</td>
      {showStageColumn && <td className="py-3 pr-4 text-slate">{stageLabel ?? "—"}</td>}
      {showTemplateColumn && <td className="py-3 pr-4 text-slate">{templateLabel ?? "—"}</td>}
      <td className="py-3 pr-4">
        <Link
          href={`/dashboard/board/customers/${customerId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
        >
          View
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </td>
    </tr>
  );
}
