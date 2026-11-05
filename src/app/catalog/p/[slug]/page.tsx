import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, ViewTransition } from "react";
import { AddToCart } from "@/components/add-to-cart";
import { Availability, familyHref, ProductImage, productImageTransition } from "@/components/catalog";
import { Ltr } from "@/components/ltr";
import { Loading, ProductSkeleton } from "@/components/skeleton";
import { optionLabel, sortByOptions } from "@/domain/families/sort";
import { canOrder } from "@/domain/orders";
import { formatIls, priceIls } from "@/domain/pricing";
import { activeTeam, getViewer } from "@/lib/auth";
import { getFamily, type FamilyVariant } from "@/lib/catalog";
import { catalogHref } from "@/lib/catalog-filters";
import { descriptionText, isRealDescription, metaDescription } from "@/lib/description";

export async function generateMetadata({ params }: PageProps<"/catalog/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await getFamily(decodeURIComponent(slug));
  if (!result) return { title: "המוצר לא נמצא" };

  const { family } = result;
  const suppliers = [...new Set(result.variants.map((v) => v.supplierName))].join(", ");
  const low = priceIls(family.minPriceUsd);
  const price = low === null ? "" : `${family.variantCount > 1 ? "החל מ-" : ""}${formatIls(low)} כולל מע״מ · `;
  const text = isRealDescription(family.descriptionHtml) ? descriptionText(family.descriptionHtml) : "";
  const description = metaDescription(`${price}${suppliers}${text ? ` · ${text}` : ""}`);
  const title = `${family.title} · ${suppliers}`;
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

async function Family({ params, searchParams }: PageProps<"/catalog/p/[slug]">) {
  const { slug } = await params;
  const result = await getFamily(decodeURIComponent(slug));
  if (!result) notFound();
  // Availability compares the check date with today, so this part renders per request.
  await connection();

  const { family } = result;
  const variants = sortByOptions(result.variants, family.optionKeys);
  const selected = selectedVariant(variants, (await searchParams).v);
  const suppliers = [...new Map(variants.map((v) => [v.supplierCode, v])).values()];
  const manySuppliers = suppliers.length > 1;
  const viewer = await getViewer();
  const team = viewer && activeTeam(viewer);
  const canAdd = !!team && canOrder(team.role);
  const path = familyHref(family.slug);

  return (
    <article className="flex flex-col gap-8">
      <nav className="flex flex-wrap gap-2 text-sm text-muted" aria-label="ניווט">
        <Link href="/catalog" className="hover:text-brand">
          קטלוג
        </Link>
        {result.categorySlug && (
          <>
            <span aria-hidden>/</span>
            <Link href={catalogHref({ category: result.categorySlug })} className="hover:text-brand">
              {result.categoryName}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <ViewTransition name={productImageTransition(family.id)} share="morph" default="none">
            <ProductImage src={family.images[0]} alt={family.title} width={800} className="aspect-square w-full rounded-card p-6" />
          </ViewTransition>
          {family.images.length > 1 && (
            <ul className="grid grid-cols-5 gap-2">
              {family.images.slice(1, 6).map((src, i) => (
                <li key={src}>
                  <ProductImage src={src} alt={`${family.title}, תמונה ${i + 2}`} width={160} className="aspect-square w-full rounded-xl p-1" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <p className="text-caption text-muted">
              {suppliers.map((s, i) => (
                <span key={s.supplierCode}>
                  {i > 0 && " · "}
                  <Link href={catalogHref({ supplier: s.supplierCode })} className="hover:text-brand">
                    <Ltr>{s.supplierName}</Ltr>
                  </Link>
                </span>
              ))}
            </p>
            <h1 dir="ltr" className="text-start text-title font-semibold">
              {family.title}
            </h1>
            {variants.length > 1 && (
              <p className="text-caption text-muted">{variants.length.toLocaleString("he-IL")} אפשרויות</p>
            )}
          </div>

          {selected && (
            <div className="flex flex-col gap-2 rounded-card bg-surface p-4 shadow-lift">
              <span className="text-caption text-muted">נבחר</span>
              <VariantSummary variant={selected} optionKeys={family.optionKeys} showSupplier={manySuppliers} />
              {canAdd && priceIls(selected.priceUsd) !== null && <AddToCart variantId={selected.id} />}
            </div>
          )}

          <div className="max-h-[32rem] overflow-auto rounded-card border border-line bg-surface">
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
                {variants.map((variant) => {
                  const price = priceIls(variant.priceUsd);
                  return (
                    <tr
                      key={variant.id}
                      aria-current={variant === selected ? "true" : undefined}
                      className={`border-t border-line align-top ${variant === selected ? "bg-subtle" : ""}`}
                    >
                      {family.optionKeys.map((k) => (
                        <td key={k} className="p-3 whitespace-nowrap">
                          {variant.familyOptions[k] ? <Ltr>{variant.familyOptions[k]}</Ltr> : <span className="text-muted">—</span>}
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
                        <div className="font-semibold">
                          {price === null ? <span className="font-normal text-muted">ייבדק בהצעה</span> : formatIls(price)}
                        </div>
                        <Availability available={variant.available} checkedAt={variant.checkedAt} />
                        {canAdd && price !== null && (
                          <div className="mt-2">
                            <AddToCart variantId={variant.id} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-muted">
            המחירים כוללים מע״מ. משלוח בישראל מתומחר בהצעת המחיר, והמחיר הסופי נקבע בהצעה שהספק הישראלי שולח.
          </p>

          {!viewer && (
            <div className="rounded-card border border-dashed border-line bg-surface p-4 text-sm">
              כדי להזמין צריך חשבון קבוצה:{" "}
              <Link href={`/login?next=${encodeURIComponent(path)}`} className="text-brand hover:underline">
                כניסה
              </Link>{" "}
              או{" "}
              <Link href="/signup" className="text-brand hover:underline">
                הרשמת קבוצה
              </Link>
              .
            </div>
          )}
          {viewer && !team && !viewer.isAdmin && (
            <div className="rounded-card border border-dashed border-line bg-surface p-4 text-sm">
              אפשר להזמין אחרי שהספק הישראלי יאשר את הקבוצה.
            </div>
          )}

          <ul className="flex flex-col gap-1 text-sm">
            {suppliers.map((s) => (
              <li key={s.supplierCode}>
                <a href={(selected?.supplierCode === s.supplierCode ? selected : s).productUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                  לעמוד המוצר באתר <Ltr>{s.supplierName}</Ltr>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Some suppliers leave a placeholder ("This Page is for Reference Only") instead of a description. */}
      {family.descriptionHtml && isRealDescription(family.descriptionHtml) && (
        <section className="rounded-card bg-surface p-6">
          <h2 className="mb-3 text-section font-semibold">תיאור הספק</h2>
          {/* Sanitized by sanitizeDescription when it was synced. */}
          <div dir="ltr" className="rich-text text-sm" dangerouslySetInnerHTML={{ __html: family.descriptionHtml }} />
        </section>
      )}
    </article>
  );
}

function VariantSummary({ variant, optionKeys, showSupplier }: { variant: FamilyVariant; optionKeys: string[]; showSupplier: boolean }) {
  const price = priceIls(variant.priceUsd);
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      {optionKeys.map(
        (k) =>
          variant.familyOptions[k] && (
            <span key={k}>
              <span className="text-caption text-muted">{optionLabel(k)} </span>
              <Ltr className="font-medium">{variant.familyOptions[k]}</Ltr>
            </span>
          ),
      )}
      {showSupplier && <Ltr className="text-caption text-muted">{variant.supplierName}</Ltr>}
      {variant.sku && <Ltr className="font-mono text-caption text-muted">{variant.sku}</Ltr>}
      <span className="font-semibold">{price === null ? "ייבדק בהצעה" : formatIls(price)}</span>
      <Availability available={variant.available} checkedAt={variant.checkedAt} />
    </div>
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
