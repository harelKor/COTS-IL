import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, ViewTransition } from "react";
import { AutoSubmitCheckbox, AutoSubmitSelect } from "@/components/auto-submit";
import { ProductCard } from "@/components/catalog";
import { CardGridSkeleton, Loading } from "@/components/skeleton";
import { getFacets, searchProducts } from "@/lib/catalog";
import { catalogHref, PAGE_SIZE, parseFilters, type CatalogFilters } from "@/lib/catalog-filters";

export const metadata: Metadata = { title: "קטלוג" };

const sortLabels = {
  relevance: "רלוונטיות",
  "price-asc": "מחיר: מהנמוך לגבוה",
  "price-desc": "מחיר: מהגבוה לנמוך",
  title: "שם",
} as const;

function FilterBar({ filters, facets }: { filters: CatalogFilters; facets: Awaited<ReturnType<typeof getFacets>> }) {
  return (
    <Form action="/catalog" className="flex flex-col gap-3 rounded-card bg-surface p-4">
      <div className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="חיפוש לפי שם או מק״ט"
          aria-label="חיפוש"
          className="h-11 min-w-0 flex-1 rounded-full bg-subtle px-4"
        />
        <button className="h-11 rounded-full bg-brand px-5 text-white hover:bg-brand-strong">חיפוש</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AutoSubmitSelect name="category" defaultValue={filters.category} aria-label="קטגוריה">
          <option value="">כל הקטגוריות</option>
          {facets.categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name} ({c.count})
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="supplier" defaultValue={filters.supplier} aria-label="ספק">
          <option value="">כל הספקים</option>
          {facets.suppliers.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name} ({s.count})
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="program" defaultValue={filters.program} aria-label="תוכנית">
          <option value="">FRC + FTC</option>
          <option value="FRC">FRC</option>
          <option value="FTC">FTC</option>
        </AutoSubmitSelect>
        <AutoSubmitSelect name="sort" defaultValue={filters.sort} aria-label="מיון">
          {Object.entries(sortLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </AutoSubmitSelect>
        <label className="flex items-center gap-2 px-1 text-sm">
          <AutoSubmitCheckbox name="available" value="1" defaultChecked={filters.availableOnly} />
          רק מוצרים זמינים
        </label>
      </div>
    </Form>
  );
}

function Pagination({ filters, total }: { filters: CatalogFilters; total: number }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  const linkClass = "rounded-md border border-line bg-surface px-4 py-2 text-sm hover:bg-subtle";
  return (
    <nav className="flex items-center justify-center gap-3" aria-label="עמודים">
      {filters.page > 1 && (
        <Link href={catalogHref({ ...filters, page: filters.page - 1 })} className={linkClass}>
          הקודם
        </Link>
      )}
      <span className="text-sm text-muted">
        עמוד {filters.page} מתוך {pages}
      </span>
      {filters.page < pages && (
        <Link href={catalogHref({ ...filters, page: filters.page + 1 })} className={linkClass}>
          הבא
        </Link>
      )}
    </nav>
  );
}

async function Catalog({ searchParams }: PageProps<"/catalog">) {
  const filters = parseFilters(await searchParams);
  // Availability compares the check date with today, so this part renders per request.
  await connection();
  const [facets, { rows, total }] = await Promise.all([getFacets(), searchProducts(filters)]);

  return (
    <div className="flex flex-col gap-6">
      {/* The key resets the form's fields when the URL changes, for example on the back button. */}
      <FilterBar key={catalogHref({ ...filters, page: 1 })} filters={filters} facets={facets} />
      <p className="text-sm text-muted">{total.toLocaleString("he-IL")} מוצרים</p>
      {rows.length > 0 ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-muted">
          לא מצאנו מוצרים. נסו מילה אחרת או הסירו חלק מהסינונים.
        </p>
      )}
      <Pagination filters={filters} total={total} />
    </div>
  );
}

export default function CatalogPage(props: PageProps<"/catalog">) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-title font-semibold">קטלוג</h1>
        <p className="text-sm text-muted">המחירים כוללים מע״מ. משלוח בישראל מתומחר בהצעת המחיר.</p>
      </div>
      <Suspense
        fallback={
          <ViewTransition exit="page-exit" default="none">
            <Loading>
              <div className="flex flex-col gap-6">
                <div className="skeleton h-28 w-full rounded-card" />
                <CardGridSkeleton count={12} />
              </div>
            </Loading>
          </ViewTransition>
        }
      >
        <ViewTransition enter="reveal" default="none">
          <Catalog {...props} />
        </ViewTransition>
      </Suspense>
    </div>
  );
}
