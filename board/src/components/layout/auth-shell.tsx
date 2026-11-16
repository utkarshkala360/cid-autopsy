import React from "react";
import { Logo } from "./logo";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="bg-surface flex min-h-screen flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center">
          <Logo className="h-10" />
        </div>

        <div className="border-border bg-panel rounded-xl border p-6 shadow-xs sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="font-heading text-ink text-xl font-bold tracking-tight">
              {title}
            </h1>
            <p className="text-slate mt-1 text-xs">{subtitle}</p>
          </div>
          {children}
        </div>

        <p className="text-slate mt-5 text-center text-xs">{footer}</p>
      </div>
    </div>
  );
}
