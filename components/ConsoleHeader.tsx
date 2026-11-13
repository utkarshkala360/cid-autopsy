import Link from "next/link";
import { secondaryButtonClass } from "@/components/ui";

type Props = {
  consoleName: string;
  homeHref: string;
  userLabel: string;
  logoutAction: () => Promise<void>;
  nav?: { href: string; label: string }[];
};

export function ConsoleHeader({ consoleName, homeHref, userLabel, logoutAction, nav = [] }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="flex h-14 w-full items-center gap-x-6 px-4">
        <Link href={homeHref} className="flex shrink-0 items-baseline gap-2">
          <span className="text-sm font-bold tracking-wide text-slate-900">CID Autopsy</span>
          <span className="text-xs font-medium uppercase tracking-wider text-indigo-600">{consoleName}</span>
        </Link>
        <nav className="flex min-w-0 gap-4 overflow-x-auto whitespace-nowrap text-sm text-slate-600">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-slate-900">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="hidden text-sm text-slate-500 md:inline">{userLabel}</span>
          <form action={logoutAction}>
            <button type="submit" className={secondaryButtonClass}>Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
