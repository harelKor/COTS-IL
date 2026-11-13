"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS } from "./sections";

/** The section tabs, and one line on what the open section controls. */
export function SettingsNav() {
  const pathname = usePathname();
  const current = SECTIONS.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`));
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="הגדרות" className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
        <ul className="flex w-max gap-2">
          {SECTIONS.map((s) => {
            const active = s === current;
            return (
              <li key={s.label}>
                <Link
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-full border px-4 text-callout whitespace-nowrap transition-colors ${
                    active ? "border-brand bg-brand-soft font-semibold text-brand-strong" : "border-line bg-surface text-foreground hover:bg-subtle"
                  }`}
                >
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {current && <p className="text-callout text-muted">{current.description}</p>}
    </div>
  );
}
