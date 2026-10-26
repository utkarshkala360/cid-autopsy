import { MemberShell } from "@/components/MemberShell";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return <MemberShell>{children}</MemberShell>;
}
