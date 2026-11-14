import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { buttonClass, Card, Input, Select, StatusTag } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { formatIls } from "@/domain/pricing";
import { requireAdmin } from "@/lib/auth";
import { getCatalogCounts } from "@/lib/catalog";
import { categoryChoices, editorPart, familyEditHref, PAGE_SIZE, productCards, supplierChoices, type ProductCard } from "@/lib/product-admin";
import { PartSheet } from "./part-sheet";

export const metadata: Metadata = { title: "הגדרות: מוצרים" };
/** Every save regroups the catalog (about 10 s locally). */
export const maxDuration = 60;

type Params = Awaited<PageProps<"/admin/settings/products">["searchParams"]>;
const str = (v: Params[string]) => (typeof v === "string" ? v : "");

function hrefWith(base: Record<string, string>, extra: Record<string, string | null>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...extra })) if (v) params.set(k, v);
  const query = params.toString();
  return `/admin/settings/products${query ? `?${query}` : ""}`;
}

function PriceRange({ min, max }: { min: number | null; max: number | null }) {
  if (min === null) return <span className="text-callout text-muted">ללא מחיר</span>;
  return <span className="text-callout font-semibold tabular-nums">{min === max || max === null ? formatIls(min) : `${formatIls(min)} עד ${formatIls(max)}`}</span>;
}

function PartCard({ card, href, showSupplier }: { card: ProductCard; href: string; showSupplier: boolean }) {
  return (
    <li>
      <Link href={href} scroll={false} className="card-surface flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift">
        <div className="tile-fade aspect-[4/3]">
          {card.image ? (
            // Supplier photos from many hosts; the admin grid doesn't go through image optimization.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.image} alt="" className="size-full object-contain p-2" loading="lazy" />
          ) : (
            <div className="flex size-full items-center justify-center text-caption text-muted">אין תמונה</div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <p className="line-clamp-2 text-callout font-medium">
            <Ltr>{card.title}</Ltr>
          </p>
          {showSupplier && (
            <p className="text-caption text-muted">
              <Ltr>{card.supplierName}</Ltr>
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-2">
            <PriceRange min={card.minIls} max={card.maxIls} />
            <StatusTag tone={card.available === true ? "success" : card.available === false ? "danger" : "neutral"}>
              {card.available === true ? "במלאי" : card.available === false ? "לא במלאי" : "זמינות לא ידועה"}
            </StatusTag>
          </div>
          <div className="flex flex-wrap gap-1">
            {card.variantCount > 1 && <StatusTag>{card.variantCount} גרסאות</StatusTag>}
            {card.badges.map((b) => (
              <StatusTag key={b} tone={b === "מוסתר" ? "warning" : "brand"}>
                {b}
              </StatusTag>
            ))}
          </div>
        </div>
      </Link>
    </li>
  );
}

async function Products({ searchParams }: { searchParams: PageProps<"/admin/settings/products">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  // A family link (the grouping report, old /admin/catalog?family= links) opens its primary part.
  if (str(params.family)) {
    const href = await familyEditHref(str(params.family));
    if (href) redirect(href);
  }
  const [suppliers, categories, counts] = await Promise.all([supplierChoices(), categoryChoices(), getCatalogCounts()]);
  if (suppliers.length === 0) return <Card>אין ספקים עדיין. הוסיפו ספק בלשונית ספקים.</Card>;
  // Every supplier at once unless one is chosen (A-18): opening on one supplier hid the rest.
  const supplier = suppliers.find((s) => s.code === str(params.s)) ?? null;
  const all = {
    parts: suppliers.reduce((n, s) => n + s.parts, 0),
    hidden: suppliers.reduce((n, s) => n + s.hidden, 0),
    variants: suppliers.reduce((n, s) => n + s.variants, 0),
    families: counts.families,
  };
  const scope = supplier ?? all;

  const q = str(params.q).slice(0, 100);
  const categoryId = categories.some((c) => c.id === str(params.c)) ? str(params.c) : "";
  const showHidden = str(params.hidden) === "1";
  const onlyEdited = str(params.edited) === "1";
  const page = Math.max(0, Math.min(500, Number(str(params.page)) || 0));
  const base = { s: supplier?.code ?? "", q, c: categoryId, hidden: showHidden ? "1" : "", edited: onlyEdited ? "1" : "", page: page ? String(page) : "" };
  const edit = str(params.edit);

  const [{ cards, total, variants }, part] = await Promise.all([
    productCards({ supplierId: supplier?.id ?? "", q, categoryId, showHidden, onlyEdited, page }),
    edit && edit !== "new" && /^[0-9a-f-]{36}$/i.test(edit) ? editorPart(edit) : Promise.resolve(null),
  ]);
  const closeHref = hrefWith(base, {});
  const editing = part && (!supplier || part.supplierId === supplier.id) ? part : null;
  const editingSupplier = suppliers.find((s) => s.id === (editing?.supplierId ?? supplier?.id)) ?? null;
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="ספק" className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
        <ul className="flex w-max gap-2">
          <li>
            <Link
              href={hrefWith({}, {})}
              aria-current={!supplier ? "page" : undefined}
              className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-callout whitespace-nowrap ${
                !supplier ? "border-brand bg-brand-soft font-semibold text-brand-strong" : "border-line bg-surface hover:bg-subtle"
              }`}
            >
              כל הספקים
              <span className="text-caption text-muted tabular-nums">{all.parts.toLocaleString("he-IL")}</span>
            </Link>
          </li>
          {suppliers.map((s) => (
            <li key={s.id}>
              <Link
                href={hrefWith({}, { s: s.code })}
                aria-current={s.id === supplier?.id ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-callout whitespace-nowrap ${
                  s.id === supplier?.id ? "border-brand bg-brand-soft font-semibold text-brand-strong" : "border-line bg-surface hover:bg-subtle"
                }`}
              >
                <Ltr>{s.name}</Ltr>
                <span className="text-caption text-muted tabular-nums">{s.parts.toLocaleString("he-IL")}</span>
                {!s.active && <span className="text-caption text-warning">מוסתר</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form role="search" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="s" value={supplier?.code ?? ""} />
        <Input name="q" defaultValue={q} placeholder="שם או מק״ט" aria-label="חיפוש חלק" className="min-w-0 flex-1 basis-48" />
        <Select name="c" defaultValue={categoryId} aria-label="קטגוריה" className="min-w-0 basis-40">
          <option value="">כל הקטגוריות</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <label className="flex min-h-11 items-center gap-2 px-1 text-callout">
          <input type="checkbox" name="hidden" value="1" defaultChecked={showHidden} className="size-5 accent-brand" />
          גם מוסתרים
        </label>
        <label className="flex min-h-11 items-center gap-2 px-1 text-callout">
          <input type="checkbox" name="edited" value="1" defaultChecked={onlyEdited} className="size-5 accent-brand" />
          רק עם שינויים
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          סינון
        </button>
        {supplier ? (
          <Link href={hrefWith(base, { edit: "new" })} scroll={false} className={buttonClass("primary", "ms-auto")}>
            <Plus size={20} aria-hidden />
            הוספת חלק
          </Link>
        ) : (
          <span className="ms-auto text-caption text-muted">להוספת חלק בחרו ספק</span>
        )}
      </form>

      <div className="flex flex-col gap-1">
        <p className="text-callout" role="status">
          {total === 0 ? "לא נמצאו חלקים" : `${total.toLocaleString("he-IL")} חלקים, ${variants.toLocaleString("he-IL")} וריאנטים`}
          {supplier?.platform === "manual" && ", ספק ידני: כל החלקים שלו מתווספים כאן"}
        </p>
        <p className="text-caption text-muted">
          {supplier ? <Ltr>{supplier.name}</Ltr> : "כל הספקים"}: {scope.families.toLocaleString("he-IL")} משפחות, {scope.parts.toLocaleString("he-IL")} חלקים, {scope.variants.toLocaleString("he-IL")} וריאנטים
          {!showHidden && scope.hidden > 0 ? `, ועוד ${scope.hidden.toLocaleString("he-IL")} חלקים מוסתרים (מופיעים עם "גם מוסתרים")` : ""}. משפחה היא מה שהלקוחות רואים בכרטיס אחד, חלק הוא
          דף מוצר אצל הספק, וריאנט הוא גודל או אפשרות בתוכו.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <PartCard key={c.id} card={c} href={hrefWith(base, { edit: c.id })} showSupplier={!supplier} />
        ))}
      </ul>

      {pages > 1 && (
        <nav aria-label="עמודים" className="flex items-center justify-center gap-3">
          {page > 0 && (
            <Link href={hrefWith(base, { page: page > 1 ? String(page - 1) : null })} className={buttonClass("secondary")}>
              הקודמים
            </Link>
          )}
          <span className="text-caption text-muted tabular-nums">
            {page + 1} / {pages}
          </span>
          {page + 1 < pages && (
            <Link href={hrefWith(base, { page: String(page + 1) })} className={buttonClass("secondary")}>
              הבאים
            </Link>
          )}
        </nav>
      )}

      {editingSupplier && (edit === "new" || editing) && (
        <PartSheet
          key={editing?.id ?? "new"}
          part={editing}
          supplier={{ id: editingSupplier.id, name: editingSupplier.name }}
          categories={categories}
          closeHref={closeHref}
        />
      )}
    </div>
  );
}

export default function ProductSettingsPage({ searchParams }: PageProps<"/admin/settings/products">) {
  return (
    <Suspense
      fallback={
        <Loading>
          <PageSkeleton />
        </Loading>
      }
    >
      <Products searchParams={searchParams} />
    </Suspense>
  );
}
