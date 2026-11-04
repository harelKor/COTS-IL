export type Program = "FRC" | "FTC";
export type ProductStatus = "published" | "review" | "hidden";

/** A supplier product in our shape, whatever platform it came from. */
export type NormalizedProduct = {
  supplierProductId: string;
  handle: string;
  title: string;
  descriptionHtml: string | null;
  url: string;
  images: string[];
  productType: string | null;
  tags: string[];
  programs: Program[];
  categorySlug: string;
  status: ProductStatus;
  variants: NormalizedVariant[];
};

export type NormalizedVariant = {
  supplierVariantId: string;
  supplierSku: string | null;
  options: { name: string; value: string }[];
  position: number;
  grams: number | null;
  priceUsd: string | null;
  compareAtUsd: string | null;
  available: boolean | null;
};
