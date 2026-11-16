import { Info } from "lucide-react";

// Flags an Org Member surfaced in a Team-scoped picker (Assignee, a
// "member" custom field, @mention suggestions) who isn't actually on that
// Team — reuses the existing status-in-progress amber token as the app's
// closest "alert" color rather than inventing a new one.
export function NotOnTeamBadge({ teamName }: { teamName: string }) {
  return (
    <span
      title={`This member is not part of ${teamName}`}
      className="text-status-in-progress inline-flex shrink-0 items-center"
    >
      <Info className="h-3 w-3" />
    </span>
  );
}
