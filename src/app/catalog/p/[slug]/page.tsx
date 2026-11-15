import { blendedTheme } from "@/domain/vendors";
import { BackToList } from "@/components/back-to-list";
import { ChevronLeft, Table2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition } from "react";
import { OptionsTable } from "@/components/options-table";
import { HotRow } from "@/components/hot-row";
import { suggestionRow } from "@/domain/suggestions";
import { FamilyView, type ViewVariant } from "@/components/family-view";
import { galleryPhotos } from "@/lib/image-size";
import { Ltr } from "@/components/ltr";
import { CardGridSkeleton, Loading, ProductSkeleton } from "@/components/skeleton";
import { companionRules } from "@/domain/families/companions";
import { findLinked } from "@/domain/families/link";
import { specRows } from "@/domain/families/spec-rows";
import { docTiles, documentLinks, quickDocs, sortDocs } from "@/domain/doc-links";
import { SpecTable } from "@/components/spec-table";
import { DocTiles } from "@/components/doc-tiles";
import { JumpBar } from "@/components/jump-bar";
import { ProductDescription } from "@/components/product-description";
import { SectionHeading } from "@/components/section-heading";
import { formatIls, priceIls, type PriceContext } from "@/domain/pricing";
import { getCategoryPicks, getCompanions, getFacets, getFamily, getVendorPopular, getVendors, type FamilyVariant } from "@/lib/catalog";
import { priceContext } from "@/lib/settings";
import { getStaleSupplierCodes } from "@/lib/health";
import { catalogHref } from "@/lib/catalog-filters";
import { familyHref } from "@/lib/catalog-links";
import { cleanDescription, descriptionBlocks, descriptionText, metaDescription } from "@/lib/description";
import { siteUrl } from "@/lib/site-url";

/** Fail fast instead of Vercel's 300 s default: every query stops at 8 s (src/db/index.ts). */
export const maxDuration = 30;

/**
 * The parts teams open most, each vendor's "most wanted" list, are prerendered at build, so
 * the click from a store lands on a finished page. The rest render on their first visit and
 * are kept. Safe with `?vendor=` and `?v=`: the page body doesn't read the query
 * (FamilyView reads it in the browser; only the suggestions do, under their own Suspense).
 */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const vendors = await getVendors();
  const lists = await Promise.all(vendors.map((v) => getVendorPopular(v.code, 8)));
  const slugs = [...new Set(lists.flat().map((f) => f.slug))];
  // Cache Components needs at least one.
  return slugs.length > 0 ? slugs.map((slug) => ({ slug })) : [{ slug: "steel-spur-gear-20-dp" }];
}

export async function generateMetadata({ params }: PageProps<"/catalog/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await getFamily(decodeURIComponent(slug));
  if (!result) return { title: "המוצר לא נמצא" };
  const [rate, stale] = await Promise.all([priceContext(), getStaleSupplierCodes()]);

  const { family } = result;
  const suppliers = [...new Set(result.variants.map((v) => v.supplierName))].join(", ");
  // No price while every vendor of it is too long without a sync (M1).
  const low = result.variants.every((v) => stale.includes(v.supplierCode)) ? null : priceIls(family.minListUsd, rate, 1);
  const price = low === null ? "" : `${family.variantCount > 1 ? "החל מ-" : ""}${formatIls(low)}, `;
  const clean = cleanDescription(family.descriptionHtml);
  const text = descriptionText(`${clean.lead} ${clean.more}`);
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

/** The variant a link asked for: `?v=` holds a SKU (any case) or a variant id; `?vendor=` settles a SKU two vendors share. */
function selectedVariant(variants: FamilyVariant[], v: string | string[] | undefined, vendor: string | string[] | undefined) {
  const first = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x);
  return findLinked(variants, first(v), first(vendor)) ?? null;
}

const SITE = siteUrl();

/** JSON-LD in a script tag: `<` escaped so the text can't close it. */
function jsonLd(...items: object[]) {
  return JSON.stringify(items.length === 1 ? items[0] : items).replace(/</g, "\\u003c");
}

type FamilyResult = NonNullable<Awaited<ReturnType<typeof getFamily>>>;

/** Product + Offer (ILS, availability, SKU, brand) for search engines. */
function productJsonLd({ family }: FamilyResult, variants: ViewVariant[], lead: string) {
  const priced = variants.filter((v) => v.priceIls !== null);
  const prices = priced.map((v) => v.priceIls!);
  const availability = (v: ViewVariant[]) => {
    const live = v.filter((x) => x.available === true);
    return `https://schema.org/${live.length === 0 ? "OutOfStock" : live.every((x) => x.shipsLater) ? "BackOrder" : "InStock"}`;
  };
  const url = `${SITE}${familyHref(family.slug)}`;
  const one = variants.length === 1 ? variants[0] : null;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: family.title,
    url,
    ...(family.images.length ? { image: family.images.slice(0, 3) } : {}),
    ...(lead ? { description: metaDescription(descriptionText(lead), 300) } : {}),
    ...(one?.sku ? { sku: one.sku } : {}),
    brand: { "@type": "Brand", name: [...new Set(variants.map((v) => v.supplierName))][0] },
    ...(prices.length === 0
      ? {}
      : one
        ? { offers: { "@type": "Offer", url, priceCurrency: "ILS", price: prices[0], availability: availability(priced) } }
        : {
            offers: {
              "@type": "AggregateOffer",
              url,
              priceCurrency: "ILS",
              lowPrice: Math.min(...prices),
              highPrice: Math.max(...prices),
              offerCount: priced.length,
              availability: availability(priced),
            },
          }),
  };
}

function breadcrumbJsonLd({ family, categorySlug, categoryName }: FamilyResult) {
  const crumbs = [
    { name: "קטלוג", item: `${SITE}/catalog` },
    ...(categorySlug && categoryName ? [{ name: categoryName, item: `${SITE}${catalogHref({ category: categorySlug })}` }] : []),
    { name: family.title, item: `${SITE}${familyHref(family.slug)}` },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, ...c })),
  };
}

/** Offers cheapest in stock first, so a settled choice picks the best one. */
function byOffer(variants: FamilyVariant[], rate: PriceContext) {
  return [...variants].sort(
    (a, b) => Number(b.available === true) - Number(a.available === true) || (priceIls(a.priceUsd, rate, a.markup, a.fixedIls) ?? Infinity) - (priceIls(b.priceUsd, rate, b.markup, b.fixedIls) ?? Infinity),
  );
}

/**
 * "מתאים לשימוש עם". The one part of the page that reads `?v=`: suggestions follow the
 * variant in the link; without one, the first that has any (a keyed 8mm bore matches no
 * bearing, a 1/2" hex one does).
 */
async function Companions({ slug, searchParams }: { slug: string; searchParams: PageProps<"/catalog/p/[slug]">["searchParams"] }) {
  const result = await getFamily(slug);
  if (!result) return null;
  const { family } = result;
  const query = await searchParams;
  const selected = selectedVariant(result.variants, query.v, query.vendor);
  const rulesFor = (v: FamilyVariant | undefined) =>
    companionRules({ categorySlug: result.categorySlug, title: family.title, options: v?.familyOptions ?? {} });
  const rules = selected
    ? rulesFor(selected)
    : (byOffer(result.variants, await priceContext()).map(rulesFor).find((r) => r.length > 0) ?? rulesFor(undefined));
  // Every product gets the row: the parts that fit it, filled when they're few from its category
  // and its vendor's most wanted (suggestionRow keeps the title honest).
  const vendor = (selected ?? result.variants[0])?.supplierCode;
  const [fitting, sameCategory, vendorPopular] = await Promise.all([
    rules.length > 0 ? getCompanions(family.id, rules) : [],
    result.categorySlug ? getCategoryPicks(family.id, result.categorySlug) : [],
    vendor ? getVendorPopular(vendor, 8) : [],
  ]);
  const row = suggestionRow(family.id, fitting, sameCategory, vendorPopular);
  return <HotRow title={row.title} cards={row.cards} />;
}

async function Family({ params, searchParams }: PageProps<"/catalog/p/[slug]">) {
  const slug = decodeURIComponent((await params).slug);
  return (
    <FamilyBody slug={slug}>
      <Suspense fallback={<CardGridSkeleton count={4} />}>
        <Companions slug={slug} searchParams={searchParams} />
      </Suspense>
    </FamilyBody>
  );
}

/**
 * Everything but the suggestions: the same for every visitor and every `?v=` (FamilyView
 * reads the selected variant in the browser), from the cached getFamily. `children` is the suggestions.
 */
async function FamilyBody({ slug, children }: { slug: string; children: React.ReactNode }) {
  const result = await getFamily(slug);
  if (!result) notFound();
  // The photos once each, a large one first when the first is small (read from their headers, cached).
  const [rate, stale, photos, { suppliers: supplierRows }] = await Promise.all([priceContext(), getStaleSupplierCodes(), galleryPhotos(result.family.images), getFacets()]);
  const { rateDate } = rate;

  const { family } = result;
  const viewVariants: ViewVariant[] = byOffer(result.variants, rate).map((v) => ({
    id: v.id,
    sku: v.sku,
    options: v.familyOptions,
    // A vendor too long without a successful sync (M1): "ייבדק בהצעה" instead of an old price that looks current.
    priceIls: stale.includes(v.supplierCode) ? null : priceIls(v.priceUsd, rate, v.markup, v.fixedIls),
    markup: Number(v.markup ?? rate.markup),
    available: v.available,
    shipsLater: v.shipsLater,
    shipsLaterEta: v.shipsLaterEta,
    checkedAt: v.checkedAt.toISOString(),
    supplierName: v.supplierName,
    supplierCode: v.supplierCode,
    productUrl: v.productUrl,
    image: v.image,
    specs: result.specs[v.id] ?? [],
  }));
  // Our copy of the supplier's description: no sales talk; its spec tables join the spec section.
  const description = cleanDescription(family.descriptionHtml);
  // One spec table: the options and the variants' specs (summarized until the choice settles them), then the description's.
  const specs = specRows(family.optionKeys, viewVariants, description.specs);
  // Each document once, by what it opens (CAD, guide, datasheet…), from every product's description, with the vendor that linked it.
  const docs = sortDocs([
    ...new Map(result.variants.flatMap((v) => documentLinks(v.productDescription, descriptionText, family.title).map((d) => ({ ...d, vendor: v.supplierCode }))).map((d) => [d.href, d])).values(),
  ]).slice(0, 8);
  const quick = quickDocs(docs, family.title);

  // The vendors in the order their logos show (FamilyView's, the best offer's first), each with its product page:
  // the one page all its variants are on, else the one most of them are.
  const vendors = [...new Map(viewVariants.map((v) => [v.supplierCode, { code: v.supplierCode, name: v.supplierName }])).values()];
  const logoOf = new Map(supplierRows.map((s) => [s.code, s.logoUrl]));
  const vendorPages = vendors.map((v) => {
    const counts = new Map<string, number>();
    for (const x of viewVariants) if (x.supplierCode === v.code) counts.set(x.productUrl, (counts.get(x.productUrl) ?? 0) + 1);
    const href = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    return { ...v, logoUrl: logoOf.get(v.code) ?? null, href };
  });
  // The vendor's colours across the page (PP4): one vendor's whole palette, or two blended (blendedTheme).
  const theme = blendedTheme(vendors);
  const blocks = descriptionBlocks(`${description.lead}\n${description.more}`);
  // The table of every option, unless the variants differ only by vendor (the Kraken's two offers: the supplier cards show them).
  const optionSets = new Set(result.variants.map((v) => JSON.stringify(Object.entries(v.familyOptions).sort())));
  const showTable = result.variants.length > 1 && optionSets.size > 1;

  return (
    <article style={theme?.style as React.CSSProperties | undefined} className={`pdp relative flex flex-col gap-12 ${theme?.single ? "vendor-theme" : ""}`}>
      {/* A soft glow of the vendor's colour behind the top of the page; two vendors' blend from one side to the other. */}
      <div aria-hidden className="pdp-canvas pointer-events-none absolute -z-10" />
      <JumpBar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(productJsonLd(result, viewVariants, description.lead), breadcrumbJsonLd(result)) }} />
      <nav aria-label="ניווט" className="-mb-8 text-caption text-muted">
        <ol className="flex min-w-0 items-center gap-1">
          <li className="shrink-0">
            {result.categorySlug ? (
              <Link href="/catalog" className="flex min-h-11 items-center hover:text-brand">
                קטלוג
              </Link>
            ) : (
              <BackToList href="/catalog" category={null} className="flex min-h-11 items-center hover:text-brand">
                קטלוג
              </BackToList>
            )}
          </li>
          {result.categorySlug && (
            <li className="flex shrink-0 items-center gap-1">
              <ChevronLeft size={14} aria-hidden />
              {/* Back to the list it came from, filters and all, when that was this category. */}
              <BackToList href={catalogHref({ category: result.categorySlug })} category={result.categorySlug} className="flex min-h-11 items-center hover:text-brand">
                {result.categoryName}
              </BackToList>
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
        family={{ id: family.id, slug: family.slug, title: family.title, images: photos, optionKeys: family.optionKeys }}
        variants={viewVariants}
        rateDate={rateDate}
        tableRows={showTable && result.variants.length > 12 ? result.variants.length : undefined}
        docs={{ cad: quick.cad?.href ?? null, guide: quick.guide?.href ?? null }}
        logos={Object.fromEntries(supplierRows.map((s) => [s.code, s.logoUrl]))}
        below={
          // Under the buy box, beside the photos (PP4): the specs and the documents, on the page itself.
          <div className="flex flex-col gap-10 pt-6">
            <SpecTable familyId={family.id} optionKeys={family.optionKeys} fixed={description.specs} rows={specs} />
            <DocTiles familyId={family.id} tiles={docTiles(docs)} vendors={vendorPages} />
          </div>
        }
      />

      {/* Empty when the supplier left a placeholder ("This Page is for Reference Only") or only sales talk. */}
      <ProductDescription blocks={blocks} long={description.more !== ""} />

      {showTable && (
        <OptionsTable slug={family.slug} count={result.variants.length}>
          <SectionHeading
            icon={<Table2 size={20} strokeWidth={1.75} />}
            aside={<span className="shrink-0 text-callout text-muted tabular-nums">{result.variants.length.toLocaleString("he-IL")} אפשרויות</span>}
          >
            כל האפשרויות
          </SectionHeading>
        </OptionsTable>
      )}

      {children}
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
