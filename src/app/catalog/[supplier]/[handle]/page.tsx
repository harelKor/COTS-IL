import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddToCart } from "@/components/add-to-cart";
import { Availability, ProductImage } from "@/components/catalog";
import { canOrder } from "@/domain/orders";
import { formatIls, priceIls } from "@/domain/pricing";
import { activeTeam, getViewer } from "@/lib/auth";
import { getProduct } from "@/lib/catalog";
import { catalogHref } from "@/lib/catalog-filters";

async function Product({ params }: PageProps<"/catalog/[supplier]/[handle]">) {
  const { supplier, handle } = await params;
  const result = await getProduct(supplier, decodeURIComponent(handle));
  if (!result) notFound();

  const { product, variants } = result;
  const viewer = await getViewer();
  const team = viewer && activeTeam(viewer);
  const canAdd = !!team && canOrder(team.role);
  const productPath = `/catalog/${supplier}/${handle}`;
  const hasOptions = variants.some((v) => v.options.length > 0);

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
          <ProductImage
            src={product.images[0]}
            alt={product.title}
            width={800}
            className="aspect-square w-full rounded-lg border border-line"
          />
          {product.images.length > 1 && (
            <ul className="grid grid-cols-5 gap-2">
              {product.images.slice(1, 6).map((src) => (
                <li key={src}>
                  <ProductImage src={src} alt="" width={160} className="aspect-square w-full rounded border border-line" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <Link
              href={catalogHref({ supplier: result.supplierCode })}
              className="ltr text-sm text-muted hover:text-brand"
            >
              {result.supplierName}
            </Link>
            <h1 dir="ltr" className="text-start text-2xl font-bold">
              {product.title}
            </h1>
          </div>

          <div className="max-h-[32rem] overflow-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-muted">
                <tr>
                  {hasOptions && <th className="p-3 text-start font-medium">אפשרות</th>}
                  <th className="p-3 text-start font-medium">מק״ט</th>
                  <th className="p-3 text-start font-medium">מחיר</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => {
                  const price = priceIls(variant.priceUsd);
                  return (
                    <tr key={variant.id} className="border-t border-line align-top">
                      {hasOptions && (
                        <td dir="ltr" className="p-3 text-start">
                          {variant.options.map((o) => o.value).join(" / ")}
                        </td>
                      )}
                      <td className="ltr whitespace-nowrap p-3 text-xs">
                        {variant.supplierSku ?? <span className="text-muted">ללא מק״ט ספק</span>}
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
            <div className="rounded-lg border border-dashed border-line bg-surface p-4 text-sm">
              כדי להזמין צריך חשבון קבוצה:{" "}
              <Link href={`/login?next=${encodeURIComponent(productPath)}`} className="text-brand hover:underline">
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
            <div className="rounded-lg border border-dashed border-line bg-surface p-4 text-sm">
              אפשר להזמין אחרי שהספק הישראלי יאשר את הקבוצה.
            </div>
          )}
          {canAdd && (
            <Link href="/cart" className="text-sm text-brand hover:underline">
              לסל
            </Link>
          )}

          <a href={product.url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand hover:underline">
            לעמוד המוצר באתר <span className="ltr">{result.supplierName}</span>
          </a>
        </div>
      </div>

      {product.descriptionHtml && (
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-3 font-semibold">תיאור הספק</h2>
          {/* Sanitized by sanitizeDescription when it was synced. */}
          <div dir="ltr" className="rich-text text-sm" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
        </section>
      )}
    </article>
  );
}

export default function ProductPage(props: PageProps<"/catalog/[supplier]/[handle]">) {
  return (
    <Suspense fallback={<p className="text-muted">טוען…</p>}>
      <Product {...props} />
    </Suspense>
  );
}
