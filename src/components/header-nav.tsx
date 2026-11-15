import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { countOf, PRODUCT } from "@/domain/plural";
import { vendorHref } from "@/domain/vendors";
import { catalogHref } from "@/lib/catalog-filters";
import { getHeaderNav, type HeaderNav as Nav } from "@/lib/header-nav";
import { CategoryIcon } from "./category-icon";
import { HeaderMenu } from "./header-menu";
import { Ltr } from "./ltr";
import { VendorMark } from "./vendor-mark";

export const menuLink = "flex min-h-11 items-center rounded-lg px-3 hover:bg-subtle";

const trigger =
  "flex h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-callout text-foreground hover:text-brand aria-expanded:text-brand";

function AllCatalogLink() {
  return (
    <Link href="/catalog" className={`${menuLink} gap-1 text-brand`}>
      כל הקטלוג
      <ChevronLeft size={16} strokeWidth={2} aria-hidden className="ltr:rotate-180" />
    </Link>
  );
}

/**
 * The desktop "קטגוריות" panel: each group a column, its title a link to the group's page
 * (`?group=`, CF3) and its categories as links. The same groups and categories as the catalog's
 * bar: both come from getFacets and the admin's groups (groupCategories).
 */
function CategoryColumns({ groups }: { groups: Nav["groups"] }) {
  return (
    <nav aria-label="קטגוריות">
      <div className="grid gap-x-2 gap-y-4 p-2" style={{ gridTemplateColumns: `repeat(${Math.max(groups.length, 1)}, minmax(0, 1fr))` }}>
        {groups.map((g) => (
          <div key={g.id} className="min-w-0">
            <Link
              id={`menu-group-${g.id}`}
              href={catalogHref({ group: g.id })}
              className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-caption font-semibold text-muted hover:bg-subtle hover:text-foreground"
            >
              {g.name}
              <ChevronLeft size={14} strokeWidth={2} aria-hidden className="ltr:rotate-180" />
            </Link>
            <ul aria-labelledby={`menu-group-${g.id}`} className="flex flex-col">
              {g.items.map((c) => (
                <li key={c.slug}>
                  <Link href={catalogHref({ group: g.id, category: c.slug })} className="flex min-h-11 items-center gap-2.5 rounded-lg px-1 py-0.5 hover:bg-subtle">
                    <CategoryIcon slug={c.slug} />
                    <span className="min-w-0 leading-tight">{c.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-1 flex border-t border-line pt-1">
        <AllCatalogLink />
      </div>
    </nav>
  );
}

/** The desktop "ספקים" panel: each active vendor's logo (or name) and its product count. */
function VendorTiles({ vendors }: { vendors: Nav["vendors"] }) {
  return (
    <nav aria-label="ספקים">
      <ul className="grid grid-cols-2 gap-1">
        {vendors.map((v) => (
          <li key={v.code}>
            <Link href={vendorHref(v.code)} className="flex min-h-16 flex-col items-start justify-center gap-1.5 rounded-xl px-3 py-2.5 hover:bg-subtle">
              {v.logoUrl ? <VendorMark name={v.name} logoUrl={v.logoUrl} size="menu" /> : <Ltr className="text-body font-semibold">{v.name}</Ltr>}
              {/* The name too: some logos are only a mark (WCP's gear, TTB's robot). */}
              <span className="text-caption text-muted">
                {v.logoUrl && (
                  <>
                    <Ltr>{v.name}</Ltr>,{" "}
                  </>
                )}
                {countOf(v.count, PRODUCT)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "קטגוריות" and "ספקים" beside קטלוג, from 1024px; below that they're in the header's menu. */
export async function HeaderNav() {
  const { groups, vendors } = await getHeaderNav();
  return (
    <div className="hidden shrink-0 items-center lg:flex">
      {groups.length > 0 && (
        <HeaderMenu id="categories-menu" label="קטגוריות" trigger="קטגוריות" triggerClassName={trigger} width={1104} align="center">
          <CategoryColumns groups={groups} />
        </HeaderMenu>
      )}
      {vendors.length > 0 && (
        <HeaderMenu id="vendors-menu" label="ספקים" trigger="ספקים" triggerClassName={trigger} width={480}>
          <VendorTiles vendors={vendors} />
        </HeaderMenu>
      )}
    </div>
  );
}

/** Stands in for HeaderNav while it streams, so the header doesn't shift. */
export function HeaderNavFallback() {
  return (
    <div className="hidden shrink-0 items-center text-callout text-muted lg:flex" aria-hidden>
      <span className="flex h-11 items-center gap-1 px-2">קטגוריות</span>
      <span className="flex h-11 items-center gap-1 px-2">ספקים</span>
    </div>
  );
}

/**
 * The same categories and vendors inside the header's menu below 1024px (phones and tablets),
 * where the header has no room for them: groups with their categories in two columns, then the vendors.
 */
export function MenuNavSections({ nav }: { nav: Nav }) {
  return (
    <nav aria-label="קטלוג" className="flex flex-col border-b border-line py-1 lg:hidden">
      <AllCatalogLink />
      {nav.groups.length > 0 && <p className="px-3 pt-2 text-callout font-semibold">קטגוריות</p>}
      {nav.groups.map((g) => (
        <div key={g.id}>
          <Link id={`menu-sheet-group-${g.id}`} href={catalogHref({ group: g.id })} className={`${menuLink} mt-1 gap-1 text-caption text-muted`}>
            {g.name}
            <ChevronLeft size={14} strokeWidth={2} aria-hidden className="ltr:rotate-180" />
          </Link>
          <ul aria-labelledby={`menu-sheet-group-${g.id}`} className="grid grid-cols-2">
            {g.items.map((c) => (
              <li key={c.slug} className="min-w-0">
                <Link href={catalogHref({ group: g.id, category: c.slug })} className={`${menuLink} leading-tight`}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {nav.vendors.length > 0 && <p className="px-3 pt-3 text-callout font-semibold">ספקים</p>}
      <ul className="grid grid-cols-2">
        {nav.vendors.map((v) => (
          <li key={v.code} className="min-w-0">
            <Link href={vendorHref(v.code)} className={menuLink}>
              <Ltr className="truncate">{v.name}</Ltr>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
