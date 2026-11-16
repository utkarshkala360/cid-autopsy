import { redirect } from "next/navigation";

// Design 4 (Phase 16): /settings has no content of its own — it's the one
// entry point every Member lands on (the sidebar's "Settings" row points
// here), which always redirects to the one tab every Member can see.
export default function SettingsIndexPage() {
  redirect("/dashboard/board/settings/my-teams");
}
