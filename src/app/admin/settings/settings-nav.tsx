"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS } from "./sections";


export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="הגדרות" className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
      <ul className="flex w-max gap-2">
        {SECTIONS.map((s) => (
          <li key={s.label}>
            <Link
              href={s.href}
              aria-current={pathname === s.href ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-full border px-4 text-callout whitespace-nowrap transition-colors ${
                pathname === s.href ? "border-brand bg-brand-soft font-semibold text-brand-strong" : "border-line bg-surface text-foreground hover:bg-subtle"
              }`}
            >
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
