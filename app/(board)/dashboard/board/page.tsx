import { redirect } from "next/navigation";

// Board opens on its org dashboard, whose own getCurrentMember() gate handles sign-in and access.
export default function BoardHomePage() {
  redirect("/dashboard/board/dashboard");
}
