"use client";

import { ChevronLeft } from "lucide-react";
import { crumbTrail, moveTo } from "@/domain/catalog-nav";
import { catalogHref, type CatalogFilters } from "@/lib/catalog-filters";
import { useScopeLink } from "./category-bar";
import { CatalogLink } from "./catalog-nav";
import { Ltr } from "./ltr";
import { useSiteFacts } from "./site-facts";

/**
 * /catalog's breadcrumb and title on one line (CF3, P1-5 and P1-11): "קטלוג › הנעה ותמסורת ›" and the
 * page's own name as the h1. You go up by a crumb; the filters that still apply there come along
 * (moveTo). With a search, the search is the title and the scope before it is a link without it.
 * The page adds the same trail as a schema.org BreadcrumbList.
 */
export function CatalogHeading({ filters, categories }: { filters: CatalogFilters; categories: { slug: string; name: string; group: string }[] }) {
  const { categoryGroups } = useSiteFacts();
  const link = useScopeLink(filters, categories);
  const trail = crumbTrail(filters, categories, categoryGroups);
  const links = filters.q ? trail : trail.slice(0, -1);
  const crumb = "flex min-h-11 items-center rounded-lg px-1 text-callout text-muted hover:text-foreground";

  return (
    <nav aria-label="נתיב" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1">
        {links.map((c, i) => {
          const last = i === links.length - 1;
          // The scope the search was made in, without the search; every crumb above it keeps the search.
          const to = filters.q && last ? { href: catalogHref({ ...moveTo(filters, c.to).filters, q: "" }), before: undefined } : link(c.to);
          return (
            <li key={c.name} className="flex items-center gap-1">
              <CatalogLink href={to.href} before={to.before} className={crumb}>
                {c.name}
              </CatalogLink>
              <ChevronLeft size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />
            </li>
          );
        })}
        <li aria-current="page" className="min-w-0">
          <h1 className="text-title font-semibold">
            {filters.q ? (
              <>
                חיפוש: <Ltr>{filters.q}</Ltr>
              </>
            ) : (
              trail.at(-1)!.name
            )}
          </h1>
        </li>
      </ol>
    </nav>
  );
}
