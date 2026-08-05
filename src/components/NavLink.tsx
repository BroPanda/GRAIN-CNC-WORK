"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  href: string;
  label: string;
  badge?: number;
  children: React.ReactNode;
  variant: "side" | "tab";
}

export default function NavLink({ href, label, badge, children, variant }: Props) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  if (variant === "tab") {
    return (
      <Link
        href={href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold transition ${
          active ? "text-gold-400" : "text-ink-dim"
        }`}
      >
        <span className="relative">
          {children}
          {!!badge && badge > 0 && (
            <span className="absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold transition ${
        active
          ? "bg-gold-500/15 text-gold-300 ring-1 ring-gold-500/25"
          : "text-ink-muted hover:bg-white/5 hover:text-ink"
      }`}
    >
      {children}
      <span className="flex-1">{label}</span>
      {!!badge && badge > 0 && (
        <span className="min-w-5 rounded-full bg-danger px-1.5 text-center text-xs font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
