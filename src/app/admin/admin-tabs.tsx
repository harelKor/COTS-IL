"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "כל ההזמנות", count: "orders" },
  { href: "/admin/purchasing", label: "הזמנות ספקים", count: "vendor" },
  { href: "/admin/deliveries", label: "מסירות" },
  { href: "/admin/balances", label: "יתרות" },
  { href: "/admin/reports", label: "דוחות" },
  { href: "/admin/teams", label: "קבוצות" },
  { href: "/admin/requests", label: "בקשות חלקים" },
  { href: "/admin/settings", label: "הגדרות" },
] as const;

const CRUMBS: {
  prefix: string;
  label: string;
  parent?: { href: string; label: string };
}[] = [
  {
    prefix: "/admin/purchasing/",
    label: "הזמנת ספק",
    parent: { href: "/admin/purchasing", label: "הזמנות ספקים" },
  },
  {
    prefix: "/admin/logistics/",
    label: "משלוח",
    parent: { href: "/admin/purchasing", label: "הזמנות ספקים" },
  },
  {
    prefix: "/admin/deliveries/",
    label: "תעודת משלוח",
    parent: { href: "/admin/deliveries", label: "מסירות" },
  },
  {
    prefix: "/admin/settings/system/grouping",
    label: "דוח קיבוץ",
    parent: { href: "/admin/settings/system", label: "הגדרות › מערכת" },
  },
  {
    prefix: "/admin/shortages",
    label: "דוח חוסרים",
    parent: { href: "/admin/reports", label: "דוחות" },
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The admin's tabs, with what's waiting on the first two, and a path bar one level down. */
type Badges = { orders: ReactNode; vendor: ReactNode };

export function AdminTabs({ badges }: { badges: Badges }) {
  return <TabsNav pathname={usePathname()} badges={badges} />;
}

/** The same tabs before the path is known (the Suspense fallback): links work, nothing is marked active. */
export function TabsNav({ pathname, badges }: { pathname: string; badges: Badges }) {
  const crumb = CRUMBS.find((c) => pathname.startsWith(c.prefix));
  return (
    <div className="mb-6 flex flex-col gap-2 print:hidden">
      <nav aria-label="ניהול" className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
        <ul className="flex w-max gap-1 rounded-full bg-subtle p-1">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-2 rounded-full px-4 text-sm whitespace-nowrap transition-colors ${
                    active ? "bg-surface font-semibold text-brand-strong shadow-sm" : "text-muted hover:bg-subtle-hover"
                  }`}
                >
                  {tab.label}
                  {"count" in tab && badges[tab.count]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {crumb && (
        <nav aria-label="מיקום" className="text-sm text-muted">
          <Link href="/admin" className="hover:text-brand">
            ניהול
          </Link>
          {crumb.parent && (
            <>
              {" › "}
              <Link href={crumb.parent.href} className="hover:text-brand">
                {crumb.parent.label}
              </Link>
            </>
          )}
          {" › "}
          <span className="text-foreground">{crumb.label}</span>
        </nav>
      )}
    </div>
  );
}
