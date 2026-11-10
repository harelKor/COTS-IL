import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, ViewTransition } from "react";
import { Availability } from "@/components/catalog";
import { FamilyCard } from "@/components/family-card";
import { FamilyView, type ViewVariant } from "@/components/family-view";
import { Ltr } from "@/components/ltr";
import { CardGridSkeleton, Loading, ProductSkeleton } from "@/components/skeleton";
import { companionRules } from "@/domain/families/companions";
import { measure } from "@/domain/families/parse";
import { compareOptionValues, optionLabel, sortByOptions } from "@/domain/families/sort";
import { formatIls, priceIls } from "@/domain/pricing";
import { getCompanions, getFamily, type FamilyVariant } from "@/lib/catalog";
import { usdIlsRate } from "@/lib/fx";
import { catalogHref } from "@/lib/catalog-filters";
import { familyHref } from "@/lib/catalog-links";
import { descriptionText, isRealDescription, metaDescription } from "@/lib/description";

/** Fail fast instead of Vercel's 300 s default: every query stops at 8 s (src/db/index.ts). */
export const maxDuration = 30;

export async function generateMetadata({ params }: PageProps<"/catalog/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await getFamily(decodeURIComponent(slug));
  if (!result) return { title: "המוצר לא נמצא" };
  const rate = await usdIlsRate();

  const { family } = result;
  const suppliers = [...new Set(result.variants.map((v) => v.supplierName))].join(", ");
  const low = priceIls(family.minPriceUsd, rate);
  const price = low === null ? "" : `${family.variantCount > 1 ? "החל מ-" : ""}${formatIls(low)} כולל מע״מ, `;
  const text = isRealDescription(family.descriptionHtml) ? descriptionText(family.descriptionHtml) : "";
  const description = metaDescription(`${price}${suppliers}${text ? `, ${text}` : ""}`);
  const title = `${family.title}, ${suppliers}`;
  const images = family.images[0] ? [{ url: family.images[0], alt: family.title }] : undefined;

  return {
    title,
    description,
    alternates: { canonical: familyHref(family.slug) },
    openGraph: { title, description, images, type: "website" },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images },
  };
}

/** The variant a link asked for: `?v=` holds a SKU (any case) or a variant id. */
function selectedVariant(variants: FamilyVariant[], v: string | string[] | undefined) {
  const wanted = (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase();
  if (!wanted) return null;
  return variants.find((x) => x.id === wanted || x.sku?.toLowerCase() === wanted) ?? null;
}

/** Per spec, the family's value or its range ("12t – 100t"), for the specifications table. */
function specSummary(specs: Record<string, { key: string; value: string }[]>) {
  const values = new Map<string, Set<string>>();
  for (const list of Object.values(specs)) for (const s of list) values.set(s.key, (values.get(s.key) ?? new Set()).add(s.value));
  return [...values].map(([key, set]) => {
    const sorted = [...set].sort(compareOptionValues);
    const numeric = sorted.every((v) => measure(v).num !== null) && new Set(sorted.map((v) => measure(v).unit)).size === 1;
    const value = sorted.length === 1 ? sorted[0] : numeric && sorted.length > 4 ? `${sorted[0]} – ${sorted.at(-1)}` : sorted.slice(0, 8).join(", ") + (sorted.length > 8 ? "…" : "");
    return { key, value };
  });
}

/** CAD, STEP, drawings and manuals linked from the supplier's description. */
function documentLinks(html: string | null): { href: string; text: string }[] {
  if (!html) return [];
  const links: { href: string; text: string }[] = [];
  for (const m of html.matchAll(/<a [^>]*href="(https:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    if (/\b(step|cad|onshape|drawing|manual|pdf|docs?|guide|datasheet|instructions?)\b/i.test(`${text} ${m[1]}`)) {
      if (!links.some((l) => l.href === m[1])) links.push({ href: m[1], text: text || m[1] });
    }
  }
  return links.slice(0, 8);
}

async function Companions({ familyId, rules }: { familyId: string; rules: ReturnType<typeof companionRules> }) {
  const cards = await getCompanions(familyId, rules);
  if (cards.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-section font-semibold">בדרך כלל מוזמן יחד עם</h2>
      <ul className="-mx-6 grid auto-cols-[44%] grid-flow-col gap-4 overflow-x-auto px-6 pb-2 sm:auto-cols-[30%] md:-mx-0 md:grid-flow-row md:grid-cols-4 md:px-0">
        {cards.map((c) => (
          <FamilyCard key={c.id} family={c} />
        ))}
      </ul>
    </section>
  );
}

async function Family({ params, searchParams }: PageProps<"/catalog/p/[slug]">) {
  const { slug } = await params;
  const result = await getFamily(decodeURIComponent(slug));
  if (!result) notFound();
  // Availability compares the check date with today, so this part renders per request.
  await connection();
  const rate = await usdIlsRate();

  const { family } = result;
  const selected = selectedVariant(result.variants, (await searchParams).v);
  const byOffer = [...result.variants].sort(
    (a, b) => Number(b.available === true) - Number(a.available === true) || (priceIls(a.priceUsd, rate) ?? Infinity) - (priceIls(b.priceUsd, rate) ?? Infinity),
  );
  const viewVariants: ViewVariant[] = byOffer.map((v) => ({
    id: v.id,
    sku: v.sku,
    options: v.familyOptions,
    priceIls: priceIls(v.priceUsd, rate),
    available: v.available,
    checkedAt: v.checkedAt.toISOString(),
    supplierName: v.supplierName,
    supplierCode: v.supplierCode,
    productUrl: v.productUrl,
    image: v.image,
  }));
  const tableVariants = sortByOptions(result.variants, family.optionKeys);
  const manySuppliers = new Set(result.variants.map((v) => v.supplierCode)).size > 1;
  const specs = specSummary(result.specs);
  const docs = [...new Map(result.variants.flatMap((v) => documentLinks(v.productDescription)).map((d) => [d.href, d])).values()].slice(0, 8);
  // Suggestions follow the variant in the link; without one, the first that has any (a keyed
  // 8mm bore matches no bearing, a 1/2" hex one does).
  const rulesFor = (v: FamilyVariant | undefined) =>
    companionRules({ categorySlug: result.categorySlug, title: family.title, options: v?.familyOptions ?? {} });
  const rules = selected
    ? rulesFor(selected)
    : (byOffer.map(rulesFor).find((r) => r.length > 0) ?? rulesFor(undefined));

  return (
    <article className="flex flex-col gap-10">
      <nav aria-label="ניווט" className="-mb-4 text-caption text-muted">
        <ol className="flex min-w-0 items-center gap-1">
          <li className="shrink-0">
            <Link href="/catalog" className="flex min-h-11 items-center hover:text-brand">
              קטלוג
            </Link>
          </li>
          {result.categorySlug && (
            <li className="flex shrink-0 items-center gap-1">
              <ChevronLeft size={14} aria-hidden />
              <Link href={catalogHref({ category: result.categorySlug })} className="flex min-h-11 items-center hover:text-brand">
                {result.categoryName}
              </Link>
            </li>
          )}
          <li className="flex min-w-0 items-center gap-1">
            <ChevronLeft size={14} aria-hidden className="shrink-0" />
            <span aria-current="page" className="truncate text-foreground">
              <Ltr>{family.title}</Ltr>
            </span>
          </li>
        </ol>
      </nav>

      <FamilyView
        family={{ id: family.id, slug: family.slug, title: family.title, images: family.images, optionKeys: family.optionKeys }}
        variants={viewVariants}
        initialVariantId={selected?.id ?? (viewVariants.length === 1 ? viewVariants[0].id : null)}
      />

      <div className="grid gap-6 md:grid-cols-2">
        {specs.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-section font-semibold">מפרט</h2>
            <dl className="divide-y divide-line rounded-card bg-surface text-[15px]">
              {specs.map((s) => (
                <div key={s.key} className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-muted">{optionLabel(s.key)}</dt>
                  <dd className="text-end">
                    <Ltr>{s.value}</Ltr>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <section className="flex flex-col gap-3">
          <h2 className="text-section font-semibold">תיעוד</h2>
          <ul className="flex flex-col divide-y divide-line rounded-card bg-surface text-[15px]">
            {docs.map((d) => (
              <li key={d.href}>
                <a href={d.href} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center px-4 py-2 text-brand hover:underline">
                  <Ltr>{d.text}</Ltr>
                </a>
              </li>
            ))}
            {[...new Map(result.variants.map((v) => [v.supplierCode, v])).values()].map((v) => (
              <li key={v.supplierCode}>
                <a href={v.productUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center px-4 py-2 text-brand hover:underline">
                  עמוד המוצר, CAD ותיעוד באתר <Ltr className="ms-1">{v.supplierName}</Ltr>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Some suppliers leave a placeholder ("This Page is for Reference Only") instead of a description. */}
      {family.descriptionHtml && isRealDescription(family.descriptionHtml) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-section font-semibold">תיאור הספק</h2>
          {/* Sanitized by sanitizeDescription when it was synced. */}
          <div dir="ltr" className="rich-text rounded-card bg-surface p-6 text-[15px]" dangerouslySetInnerHTML={{ __html: family.descriptionHtml }} />
        </section>
      )}

      {tableVariants.length > 1 && (
        <details className="group rounded-card bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 py-3 font-semibold">
            כל האפשרויות ({tableVariants.length.toLocaleString("he-IL")})
          </summary>
          <div className="max-h-[32rem] overflow-auto border-t border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-subtle text-muted">
                <tr>
                  {family.optionKeys.map((k) => (
                    <th key={k} className="p-3 text-start font-medium whitespace-nowrap">
                      {optionLabel(k)}
                    </th>
                  ))}
                  {manySuppliers && <th className="p-3 text-start font-medium">ספק</th>}
                  <th className="p-3 text-start font-medium">מק״ט</th>
                  <th className="p-3 text-start font-medium">מחיר</th>
                </tr>
              </thead>
              <tbody>
                {tableVariants.map((variant) => {
                  const price = priceIls(variant.priceUsd, rate);
                  return (
                    <tr key={variant.id} className="border-t border-line align-top">
                      {family.optionKeys.map((k) => (
                        <td key={k} className="p-3 whitespace-nowrap">
                          {variant.familyOptions[k] ? (
                            <Link href={familyHref(family.slug, variant.sku ?? variant.id)} className="hover:text-brand">
                              <Ltr>{variant.familyOptions[k]}</Ltr>
                            </Link>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      ))}
                      {manySuppliers && (
                        <td className="p-3">
                          <Ltr>{variant.supplierName}</Ltr>
                        </td>
                      )}
                      <td className="p-3 text-xs whitespace-nowrap">
                        {variant.sku ? <Ltr className="font-mono">{variant.sku}</Ltr> : <span className="text-muted">ללא מק״ט ספק</span>}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold">{price === null ? <span className="font-normal text-muted">ייבדק בהצעה</span> : formatIls(price)}</div>
                        <Availability available={variant.available} checkedAt={variant.checkedAt} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {rules.length > 0 && (
        <Suspense fallback={<CardGridSkeleton count={4} />}>
          <Companions familyId={family.id} rules={rules} />
        </Suspense>
      )}
    </article>
  );
}

export default function FamilyPage(props: PageProps<"/catalog/p/[slug]">) {
  return (
    <Suspense
      fallback={
        <ViewTransition exit="page-exit" default="none">
          <Loading>
            <ProductSkeleton />
          </Loading>
        </ViewTransition>
      }
    >
      <ViewTransition enter="reveal" default="none">
        <Family {...props} />
      </ViewTransition>
    </Suspense>
  );
}
