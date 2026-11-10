import { measure, OPTION_KEYS, parseTitle, type ParsedTitle, type Spec } from "./parse";

/**
 * Groups the catalog into product families (docs/REDESIGN.md, "Data model changes"):
 *
 * 1. A supplier product with options (AndyMark, CTRE) is a family as it is.
 * 2. Flat products (one size per product, most of WCP) group by their title with
 *    the sizes taken out, within one category.
 * 3. The same SKU at two suppliers is the same part, so their families merge and
 *    the supplier becomes a choice on the family page.
 *
 * Anything doubtful stays on its own and is reported, rather than guessed.
 */

export type GroupVariant = {
  id: string;
  sku: string | null;
  options: { name: string; value: string }[];
};

export type GroupProduct = {
  id: string;
  supplierCode: string;
  title: string;
  categorySlug: string | null;
  descriptionHtml: string | null;
  variants: GroupVariant[];
};

export type Grouping = "title" | "supplier" | "single";

export type FamilyDraft = {
  /** Stable across syncs: what the family is matched on. */
  key: string;
  slug: string;
  title: string;
  categorySlug: string | null;
  grouping: Grouping;
  /** The member whose details (images, description) the family shows first. */
  primaryProductId: string;
  /** Products with at least one variant here. A reseller's product can span families. */
  productIds: string[];
  variantIds: string[];
  suppliers: string[];
  /** Option names that differ between the family's variants, in display order. */
  optionKeys: string[];
  variantOptions: Record<string, Record<string, string>>;
  specs: (Spec & { variantId: string })[];
};

export type IssueReason = "reference-page" | "duplicate-options" | "no-size";
export type GroupingIssue = { productId: string; reason: IssueReason; detail: string };

/** Categories where flat products are grouped by title, and where a missing size is worth a look. */
const TITLE_GROUPED = new Set(["gears", "belts-chain", "bearings", "shafts", "wheels", "structure", "fasteners"]);
const SIZE_EXPECTED = new Set(["gears", "belts-chain", "bearings", "shafts"]);

/** Supplier order when choosing whose title and photos a merged family uses. */
const SUPPLIER_RANK = ["wcp", "andymark", "ctre", "ttb", "rev", "gobilda"];
const BRAND_PREFIX = /^(WCP|AndyMark|CTRE|REV|Thrifty Bot|TTB)\s/i;

/**
 * WCP's collection pages ("Bushings", "10DP Gears", "Swerve X2"): listed as a
 * product with one SKU-less variant at a token price, while every real WCP part
 * has a SKU. Other suppliers do sell real parts without SKUs, so for them only
 * the "This Page is for Reference Only" placeholder counts.
 */
export function isReferencePage(product: GroupProduct): boolean {
  if (product.variants.some((v) => v.sku)) return false;
  if (product.supplierCode === "wcp" && product.variants.length === 1) return true;
  const text = (product.descriptionHtml ?? "").replace(/<[^>]+>/g, " ");
  return /for reference only|page is for reference/i.test(text);
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/(\d)"/g, "$1in")
    .replace(/#/g, "no")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

function normalizeSku(sku: string | null): string | null {
  const s = sku?.trim().toUpperCase();
  return s ? s : null;
}

/** Shopify option names ("Bore Size", "Teeth") to our keys, so they can be filtered like parsed ones. */
function optionKey(name: string): string {
  const n = name.toLowerCase().trim();
  if (/^(bore|bore size|bore type|hub bore)$/.test(n)) return "bore";
  if (/^(teeth|tooth count|# of teeth|number of teeth)$/.test(n)) return "teeth";
  if (/^(length|belt length)$/.test(n)) return "length";
  if (/^(width|belt width)$/.test(n)) return "width";
  return n.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "option";
}

function rank(product: GroupProduct): [number, number, number, string] {
  const supplier = SUPPLIER_RANK.indexOf(product.supplierCode);
  return [BRAND_PREFIX.test(product.title) ? 1 : 0, supplier === -1 ? 99 : supplier, -product.variants.length, product.title];
}

function byRank(a: GroupProduct, b: GroupProduct) {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i] ? -1 : 1;
  return 0;
}

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    const p = this.parent.get(x) ?? x;
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
}

const signature = (options: Record<string, string>) =>
  JSON.stringify(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)));

export function groupFamilies(input: GroupProduct[]): { families: FamilyDraft[]; issues: GroupingIssue[] } {
  const issues: GroupingIssue[] = [];
  const products = input.filter((p) => {
    if (!isReferencePage(p)) return true;
    issues.push({ productId: p.id, reason: "reference-page", detail: p.title });
    return false;
  });

  const parsed = new Map<string, ParsedTitle>();
  const titleKey = new Map<string, string>();
  for (const p of products) {
    const flat = p.variants.length === 1 && p.variants[0].options.length === 0;
    if (!flat) continue;
    const parse = parseTitle(p.title);
    parsed.set(p.id, parse);
    const hasSize = Object.keys(parse.options).length > 0;
    if (hasSize && parse.key && p.categorySlug && TITLE_GROUPED.has(p.categorySlug)) {
      titleKey.set(p.id, `t:${p.categorySlug}:${parse.key}`);
    } else if (!hasSize && p.categorySlug && SIZE_EXPECTED.has(p.categorySlug) && /\d/.test(p.title)) {
      issues.push({ productId: p.id, reason: "no-size", detail: p.title });
    }
  }

  // Title groups. Two products of one supplier with the same sizes aren't the same part,
  // so those leave the group and are reported.
  const titleGroups = new Map<string, GroupProduct[]>();
  for (const p of products) {
    const key = titleKey.get(p.id);
    if (key) titleGroups.set(key, [...(titleGroups.get(key) ?? []), p]);
  }
  for (const [key, members] of titleGroups) {
    const seen = new Map<string, GroupProduct>();
    const clashing = new Set<GroupProduct>();
    for (const p of members) {
      const sig = `${p.supplierCode}|${signature(parsed.get(p.id)!.options)}`;
      const other = seen.get(sig);
      if (other) {
        clashing.add(p).add(other);
      } else seen.set(sig, p);
    }
    for (const p of clashing) {
      titleKey.delete(p.id);
      issues.push({ productId: p.id, reason: "duplicate-options", detail: p.title });
    }
    titleGroups.set(key, members.filter((p) => !clashing.has(p)));
  }

  // Every SKU has an owner: the best-ranked product listing it, usually the brand's own
  // store (WCP for WCP-0749). A reseller's copy of that SKU joins the owner's family on
  // its own, so a reseller product that lists parts from several families (CTRE's
  // "Steel Spur Gears" with both 10 DP and 20 DP gears) can't bridge them.
  const productOf = new Map<string, GroupProduct>();
  const owner = new Map<string, { product: GroupProduct; variant: GroupVariant }>();
  for (const p of [...products].sort(byRank)) {
    for (const v of p.variants) {
      productOf.set(v.id, p);
      const sku = normalizeSku(v.sku);
      if (sku && !owner.has(sku)) owner.set(sku, { product: p, variant: v });
    }
  }
  const ownerOf = (v: GroupVariant) => {
    const sku = normalizeSku(v.sku);
    const found = sku ? owner.get(sku) : undefined;
    return found && found.variant.id !== v.id ? found : null;
  };

  const uf = new UnionFind();
  for (const members of titleGroups.values()) {
    for (const p of members.slice(1)) uf.union(members[0].variants[0].id, p.variants[0].id);
  }
  for (const p of products) {
    const own = p.variants.filter((v) => !ownerOf(v));
    for (const v of own.slice(1)) uf.union(own[0].id, v.id);
    for (const v of p.variants) {
      const o = ownerOf(v);
      if (o) uf.union(o.variant.id, v.id);
    }
  }

  // The same part under the same name at several suppliers, with no SKU in common
  // (CTRE's "Battery Beak", WCP's "CTR Battery Beak"): flat, sizeless products, one per
  // supplier, join one family. Two of one supplier's products with that name stay apart.
  const byName = new Map<string, GroupProduct[]>();
  for (const p of products) {
    const parse = parsed.get(p.id);
    if (!parse || Object.keys(parse.options).length > 0 || titleKey.has(p.id) || ownerOf(p.variants[0])) continue;
    const name = sameName(p.title);
    if (name) byName.set(name, [...(byName.get(name) ?? []), p]);
  }
  for (const members of byName.values()) {
    const supplierCount = new Set(members.map((m) => m.supplierCode)).size;
    if (supplierCount < 2 || supplierCount !== members.length) continue;
    for (const p of members.slice(1)) uf.union(members[0].variants[0].id, p.variants[0].id);
  }

  // Options and specs of a variant as its owner describes it.
  const ownOptions = (p: GroupProduct, v: GroupVariant): Record<string, string> => {
    const parse = parsed.get(p.id);
    return parse ? { ...parse.options } : Object.fromEntries(v.options.map((o) => [optionKey(o.name), o.value]));
  };
  const ownSpecs = (p: GroupProduct, v: GroupVariant) =>
    parsed.get(p.id)?.specs ?? v.options.map((o) => ({ key: optionKey(o.name), value: o.value, ...measure(o.value) }));

  const components = new Map<string, GroupVariant[]>();
  for (const p of products) {
    for (const v of p.variants) {
      const root = uf.find(v.id);
      components.set(root, [...(components.get(root) ?? []), v]);
    }
  }

  const drafts: Omit<FamilyDraft, "slug">[] = [];
  for (const memberVariants of components.values()) {
    const members = [...new Set(memberVariants.map((v) => productOf.get(v.id)!))].sort(byRank);
    const owners = members.filter((p) => memberVariants.some((v) => productOf.get(v.id) === p && !ownerOf(v)));
    const primary = owners[0] ?? members[0];
    const titledMembers = owners.filter((p) => titleKey.has(p.id));
    const titled = titledMembers.length >= 2 ? titledMembers[0] : undefined;
    const key = titled ? titleKey.get(titled.id)! : titledMembers.length === 1 && owners.length === 1 ? titleKey.get(primary.id)! : `p:${primary.id}`;

    const variantOptions: Record<string, Record<string, string>> = {};
    const specs: FamilyDraft["specs"] = [];
    for (const v of memberVariants) {
      const source = ownerOf(v) ?? { product: productOf.get(v.id)!, variant: v };
      variantOptions[v.id] = ownOptions(source.product, source.variant);
      for (const s of ownSpecs(source.product, source.variant)) specs.push({ ...s, variantId: v.id });
    }

    const optionKeys = varyingKeys(Object.values(variantOptions));
    for (const id of Object.keys(variantOptions)) {
      variantOptions[id] = Object.fromEntries(optionKeys.flatMap((k) => (variantOptions[id][k] ? [[k, variantOptions[id][k]]] : [])));
    }

    drafts.push({
      key,
      title: titled ? parsed.get(titled.id)!.familyTitle : primary.title,
      categorySlug: primary.categorySlug,
      grouping: titled ? "title" : memberVariants.filter((v) => productOf.get(v.id) === primary).length > 1 ? "supplier" : "single",
      primaryProductId: primary.id,
      productIds: members.map((p) => p.id),
      variantIds: memberVariants.map((v) => v.id),
      suppliers: [...new Set(members.map((p) => p.supplierCode))],
      optionKeys,
      variantOptions,
      specs,
    });
  }

  return { families: assignSlugs(drafts), issues };
}

/** A product name without the maker in front or trademark signs: "CTR Battery Beak" → "battery beak". */
export function sameName(title: string): string | null {
  const name = title
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/^(the thrifty bot|thrifty bot|ttb|wcp|andymark|ctr electronics|ctre|ctr|rev robotics|rev)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return name.length >= 6 ? name : null;
}

/** Option names whose values differ, known ones first in their display order. */
function varyingKeys(rows: Record<string, string>[]): string[] {
  const values = new Map<string, Set<string>>();
  for (const row of rows) for (const [k, v] of Object.entries(row)) values.set(k, (values.get(k) ?? new Set()).add(v));
  const varying = [...values].filter(([k, set]) => set.size > 1 || rows.some((r) => !(k in r))).map(([k]) => k);
  const known = OPTION_KEYS.filter((k) => varying.includes(k)) as string[];
  return [...known, ...varying.filter((k) => !known.includes(k)).sort()];
}

/** Unique slugs, given in key order so the same catalog always gets the same slugs. */
function assignSlugs(drafts: Omit<FamilyDraft, "slug">[]): FamilyDraft[] {
  const taken = new Set<string>();
  return [...drafts]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((d) => {
      const base = slugify(d.title) || "product";
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      taken.add(slug);
      return { ...d, slug };
    });
}
