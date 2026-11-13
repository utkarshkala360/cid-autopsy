import { SessionGuard } from "./SessionGuard";

export default function CallAnchorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SessionGuard />
      {children}
    </>
  );
}
