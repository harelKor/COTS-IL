import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, TileGridSkeleton } from "@/components/skeleton";
import { getFacets } from "@/lib/catalog";
import { catalogHref } from "@/lib/catalog-filters";

export const metadata: Metadata = { title: "הדף לא נמצא", robots: { index: false } };

async function PopularCategories() {
  const { categories } = await getFacets();
  const popular = [...categories].sort((a, b) => b.count - a.count).slice(0, 8);
  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {popular.map((c) => (
        <li key={c.slug}>
          <Link
            href={catalogHref({ category: c.slug })}
            className="flex h-11 items-center rounded-full bg-surface px-5 text-[15px] shadow-lift transition-transform duration-200 hover:-translate-y-0.5"
          >
            {c.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-8 py-12 text-center">
      <div>
        <p className="mb-2 text-caption text-muted">שגיאה 404</p>
        <h1 className="mb-3 text-hero-sm font-semibold">הדף לא נמצא</h1>
        <p className="text-muted">ייתכן שהקישור ישן או שהמוצר כבר לא נמכר אצל הספק. נסו לחפש אותו.</p>
      </div>
      <Form action="/catalog" className="flex w-full max-w-xl gap-2">
        <input
          type="search"
          name="q"
          placeholder="חיפוש לפי שם או מק״ט"
          aria-label="חיפוש"
          className="h-12 min-w-0 flex-1 rounded-full bg-surface px-5 shadow-lift"
        />
        <button className="h-12 rounded-full bg-brand px-6 text-white hover:bg-brand-strong">חיפוש</button>
      </Form>
      <section className="flex flex-col gap-4">
        <h2 className="text-section font-semibold">קטגוריות פופולריות</h2>
        <Suspense
          fallback={
            <Loading>
              <TileGridSkeleton count={4} />
            </Loading>
          }
        >
          <PopularCategories />
        </Suspense>
      </section>
      <Link href="/" className="text-brand hover:underline">
        לדף הבית
      </Link>
    </div>
  );
}
