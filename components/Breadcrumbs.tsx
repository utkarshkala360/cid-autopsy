import Link from "next/link";

export function Breadcrumbs({ items }: { items: { href: string; label: string }[] }) {
  return (
    <p className="text-sm text-slate-500">
      {items.map((item) => (
        <span key={item.href}>
          <Link href={item.href} className="hover:text-slate-900">{item.label}</Link> /{" "}
        </span>
      ))}
    </p>
  );
}
