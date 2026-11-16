import { redirect } from "next/navigation";

// This segment has no content of its own — Members and Config are now equal
// sibling tabs (see layout.tsx / team-settings-tabs.tsx). Members is the
// default landing tab, same "index redirects to the default tab" pattern
// /settings itself uses for My Teams.
export default async function TeamSettingsIndexPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  redirect(`/dashboard/board/settings/teams/${teamId}/members`);
}
