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
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href={homeHref} className="flex items-baseline gap-2">
          <span className="text-sm font-bold tracking-wide text-slate-900">CID Autopsy</span>
          <span className="text-xs font-medium uppercase tracking-wider text-indigo-600">{consoleName}</span>
        </Link>
        <nav className="flex gap-4 text-sm text-slate-600">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-slate-900">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-slate-500">{userLabel}</span>
          <form action={logoutAction}>
            <button type="submit" className={secondaryButtonClass}>Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
