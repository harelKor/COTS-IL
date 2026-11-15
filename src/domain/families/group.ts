import { variantSpecs, type SourcedSpec } from "../specs/variant-specs";
import { familyKey, OPTION_KEYS, parseTitle, splitOptionTitle, type ListedOption, type ParsedTitle } from "./parse";

/**
 * Groups the catalog into product families (docs/REDESIGN.md, "Data model changes"):
 *
 * 1. A supplier product with options (AndyMark, CTRE) is a family as it is.
 * 2. Flat products (one size per product, most of WCP) group by their title with
 *    the sizes taken out, within one category.
 * 3. The same SKU at two suppliers is the same part, so their families merge and
 *    the supplier becomes a choice on the family page.
 * 4. One supplier's listings that name their options in the title ("SDS MK4i Swerve
 *    Modules - Gear Ratio:L3 6.12:1, …") fold back into one family.
 * 5. Two suppliers' parts with no SKU in common join only when more than the name agrees:
 *    one names the other's part number, or the price or the maker in the title agrees.
 *
 * A title never merges two suppliers on its own. Anything doubtful stays on its own and
 * is reported, rather than guessed.
 */

export type GroupVariant = {
  id: string;
  sku: string | null;
  options: { name: string; value: string }[];
  /** The supplier's USD price, for telling two suppliers' same-named parts apart. */
  priceUsd?: number | null;
};

export type GroupProduct = {
  id: string;
  supplierCode: string;
  title: string;
  categorySlug: string | null;
  descriptionHtml: string | null;
  variants: GroupVariant[];
  /** The admin's split (S15): this product's variants join no other family. */
  alone?: boolean;
  /** The admin's merge (S15): products with the same key make one family. */
  mergeKey?: string | null;
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
  specs: (SourcedSpec & { variantId: string })[];
};

/** "name-only": the same name at two suppliers with nothing else in common, so they stay apart. */
export type IssueReason = "reference-page" | "duplicate-options" | "no-size" | "name-only";
export type GroupingIssue = { productId: string; reason: IssueReason; detail: string };

/** Categories where flat products are grouped by title, and where a missing size is worth a look. */
const TITLE_GROUPED = new Set(["gears", "belts-chain", "bearings", "shafts", "wheels", "structure", "fasteners"]);
const SIZE_EXPECTED = new Set(["gears", "belts-chain", "bearings", "shafts"]);

/** Supplier order when choosing whose title and photos a merged family uses. */
const SUPPLIER_RANK = ["wcp", "andymark", "ctre", "ttb", "rev", "gobilda"];
const BRAND_PREFIX = /^(WCP|AndyMark|CTRE|REV|Thrifty Bot|TTB)\s/i;

/** A supplier's own brand in another supplier's title: AndyMark's "REV Analog Pressure Sensor" is REV's part. */
const BRAND_OF: Record<string, RegExp> = {
  rev: /\bREV\b/,
  ctre: /\b(?:CTRE?|CTR Electronics)\b/,
  wcp: /\b(?:WCP|West Coast Products)\b/,
  andymark: /\bAndyMark\b/i,
  ttb: /\b(?:Thrifty Bot|TTB)\b/i,
  gobilda: /\bgoBILDA\b/i,
  limelightvision: /\bLimelight\b/i,
};

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
  // AndyMark spells it both ways across one combined listing.
  if (n === "motor pinon type") return "motor-pinion-type";
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

  // Listings with their options in the title, grouped per supplier by the title before " - ".
  const listed = new Map<string, { base: string; options: ListedOption[] }>();
  const listKey = new Map<string, string>();
  {
    const byBase = new Map<string, GroupProduct[]>();
    for (const p of products) {
      const split = p.alone ? null : splitOptionTitle(p.title);
      if (!split) continue;
      const key = `l:${p.supplierCode}:${familyKey(split.base)}`;
      listed.set(p.id, split);
      byBase.set(key, [...(byBase.get(key) ?? []), p]);
    }
    // One listing on its own is an ordinary product with an odd title.
    for (const [key, members] of byBase) {
      if (members.length < 2) for (const p of members) listed.delete(p.id);
      else for (const p of members) listKey.set(p.id, key);
    }
  }

  const parsed = new Map<string, ParsedTitle>();
  const titleKey = new Map<string, string>();
  for (const p of products) {
    const flat = p.variants.length === 1 && p.variants[0].options.length === 0;
    if (!flat || listed.has(p.id)) continue;
    const parse = parseTitle(p.title);
    parsed.set(p.id, parse);
    const hasSize = Object.keys(parse.options).length > 0;
    if (p.alone) continue;
    if (hasSize && parse.key && p.categorySlug && (TITLE_GROUPED.has(p.categorySlug) || parse.options.awg)) {
      titleKey.set(p.id, `t:${p.categorySlug}:${parse.key}`);
    } else if (!hasSize && p.categorySlug && SIZE_EXPECTED.has(p.categorySlug) && /\d/.test(p.title)) {
      issues.push({ productId: p.id, reason: "no-size", detail: p.title });
    }
  }

  // A title group never spans suppliers: two suppliers' parts with the same name are the
  // same part only when a SKU says so. The best-ranked supplier keeps the group's key.
  {
    const byKey = new Map<string, GroupProduct[]>();
    for (const p of products) {
      const key = titleKey.get(p.id);
      if (key) byKey.set(key, [...(byKey.get(key) ?? []), p]);
    }
    for (const [key, members] of byKey) {
      const lead = [...members].sort(byRank)[0].supplierCode;
      for (const p of members) if (p.supplierCode !== lead) titleKey.set(p.id, `${key}@${p.supplierCode}`);
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
      if (sku && !p.alone && !owner.has(sku)) owner.set(sku, { product: p, variant: v });
    }
  }
  const ownerOf = (v: GroupVariant) => {
    if (productOf.get(v.id)?.alone) return null;
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

  // One supplier's listings with their options in the title: one family.
  {
    const first = new Map<string, string>();
    for (const p of products) {
      const key = listKey.get(p.id);
      if (!key) continue;
      const root = first.get(key);
      if (root) uf.union(root, p.variants[0].id);
      else first.set(key, p.variants[0].id);
    }
  }

  // The same part at two suppliers with no SKU in common. Joined products, by supplier,
  // so no family ever gets two products of one supplier this way.
  const joined = new UnionFind();
  const suppliersOf = new Map<string, Set<string>>();
  const join = (a: GroupProduct, b: GroupProduct) => {
    const ra = joined.find(a.id);
    const rb = joined.find(b.id);
    if (ra === rb) return true;
    const sa = suppliersOf.get(ra) ?? new Set([a.supplierCode]);
    const sb = suppliersOf.get(rb) ?? new Set([b.supplierCode]);
    // Through a variant each one owns, so a reseller's listing can't bridge two families.
    const va = a.variants.find((v) => !ownerOf(v));
    const vb = b.variants.find((v) => !ownerOf(v));
    if (!va || !vb || [...sa].some((s) => sb.has(s))) return false;
    joined.union(a.id, b.id);
    suppliersOf.set(joined.find(a.id), new Set([...sa, ...sb]));
    uf.union(va.id, vb.id);
    return true;
  };
  /** Variants of a single-variant product that take the options of the other supplier's matching variant. */
  const adopted = new Map<string, { product: GroupProduct; variant: GroupVariant }>();

  // 1. A part number: one product's description names the other supplier's SKU, and
  //    the names agree (AndyMark's "REV NEO 550 Brushless Motor" names REV-21-1651).
  const skuOwner = new Map<string, GroupProduct>();
  for (const p of [...products].sort(byRank)) {
    if (p.alone) continue;
    for (const v of p.variants) {
      const sku = normalizeSku(v.sku);
      if (sku && sku.length >= 5 && !skuOwner.has(sku)) skuOwner.set(sku, p);
    }
  }
  for (const a of products) {
    if (a.alone || titleKey.has(a.id) || listed.has(a.id) || !a.descriptionHtml) continue;
    const own = new Set(a.variants.map((v) => normalizeSku(v.sku)));
    for (const token of new Set(plainText(a.descriptionHtml).toUpperCase().match(/[A-Z0-9][A-Z0-9_.-]*\d[A-Z0-9_-]*/g) ?? [])) {
      const b = own.has(token) ? undefined : skuOwner.get(token);
      if (!b || b.supplierCode === a.supplierCode || titleKey.has(b.id) || listed.has(b.id) || !namesAgree(a.title, b.title)) continue;
      if (join(a, b)) adoptOptions(a, b, adopted);
    }
  }

  // 2. The same name (CTRE's "Battery Beak", WCP's "CTR Battery Beak") or one name
  //    starting the other ("Kraken Wire Bundle", "Kraken Wire Bundle 18" (10 AWG …)"), on
  //    flat, sizeless products, one per supplier. The name alone isn't enough: the price
  //    has to agree, or one title names the other's maker. Otherwise they stay apart and
  //    the report lists them.
  const byName = new Map<string, GroupProduct[]>();
  for (const p of products) {
    const parse = parsed.get(p.id);
    if (!parse || p.alone || Object.keys(parse.options).length > 0 || titleKey.has(p.id) || ownerOf(p.variants[0])) continue;
    const name = sameName(p.title);
    if (name) byName.set(name, [...(byName.get(name) ?? []), p]);
  }
  const reported = new Set<string>();
  const report = (p: GroupProduct, other: GroupProduct) => {
    if (reported.has(p.id)) return;
    reported.add(p.id);
    issues.push({ productId: p.id, reason: "name-only", detail: `${p.title} ↔ ${other.supplierCode}: ${other.title}` });
  };
  for (const members of byName.values()) {
    const supplierCount = new Set(members.map((m) => m.supplierCode)).size;
    if (supplierCount < 2 || supplierCount !== members.length) continue;
    const [lead, ...rest] = [...members].sort(byRank);
    for (const p of rest) {
      if (corroborated(lead, p, "same")) join(lead, p);
      else {
        report(lead, p);
        report(p, lead);
      }
    }
  }
  for (const [name, members] of byName) {
    if (members.length !== 1) continue;
    const words = name.split(" ");
    for (let k = words.length - 1; k >= 2; k--) {
      const shorter = byName.get(words.slice(0, k).join(" "));
      if (!shorter) continue;
      if (shorter.length === 1 && shorter[0].supplierCode !== members[0].supplierCode && corroborated(shorter[0], members[0], "prefix")) {
        join(shorter[0], members[0]);
      }
      break;
    }
  }

  // The admin's merges: every product with the same key joins one family.
  const merged = new Map<string, GroupProduct[]>();
  for (const p of products) if (p.mergeKey) merged.set(p.mergeKey, [...(merged.get(p.mergeKey) ?? []), p]);
  for (const members of merged.values()) {
    for (const p of members.slice(1)) uf.union(members[0].variants[0].id, p.variants[0].id);
  }

  // Options and specs of a variant as its owner describes it; a listing's title options
  // under its variant's own, which win where both name one.
  const optionList = (p: GroupProduct, v: GroupVariant) => {
    const fromTitle = listed.get(p.id)?.options ?? [];
    const own = new Set(v.options.map((o) => optionKey(o.name)));
    return [...fromTitle.filter((o) => !own.has(optionKey(o.name))), ...v.options];
  };
  const ownOptions = (p: GroupProduct, v: GroupVariant): Record<string, string> => {
    const parse = parsed.get(p.id);
    return parse ? { ...parse.options } : Object.fromEntries(optionList(p, v).map((o) => [optionKey(o.name), o.value]));
  };
  // The filter specs in their one form (src/domain/specs), filled from the title where the options say nothing.
  const ownSpecs = (p: GroupProduct, v: GroupVariant): SourcedSpec[] =>
    variantSpecs(
      parsed.get(p.id)?.specs.map((s) => ({ key: s.key, value: s.value, source: "title" as const })) ??
        optionList(p, v).map((o) => ({ key: optionKey(o.name), value: o.value, source: "option" as const })),
      p,
    );

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
    const mergeKey = members.flatMap((p) => (p.mergeKey ? [p.mergeKey] : [])).sort()[0];
    const list = owners.find((p) => listKey.has(p.id));
    const key = mergeKey
      ? `m:${mergeKey}`
      : titled
        ? titleKey.get(titled.id)!
        : list
          ? listKey.get(list.id)!
          : titledMembers.length === 1 && owners.length === 1
            ? titleKey.get(primary.id)!
            : `p:${primary.id}`;

    const variantOptions: Record<string, Record<string, string>> = {};
    const specs: FamilyDraft["specs"] = [];
    for (const v of memberVariants) {
      const source = ownerOf(v) ?? adopted.get(v.id) ?? { product: productOf.get(v.id)!, variant: v };
      variantOptions[v.id] = ownOptions(source.product, source.variant);
      for (const s of ownSpecs(source.product, source.variant)) specs.push({ ...s, variantId: v.id });
    }

    const optionKeys = varyingKeys(Object.values(variantOptions));
    for (const id of Object.keys(variantOptions)) {
      variantOptions[id] = Object.fromEntries(optionKeys.flatMap((k) => (variantOptions[id][k] ? [[k, variantOptions[id][k]]] : [])));
    }

    drafts.push({
      key,
      title: titled ? parsed.get(titled.id)!.familyTitle : list && !mergeKey ? listed.get(list.id)!.base : primary.title,
      categorySlug: primary.categorySlug,
      grouping: titled ? "title" : list || memberVariants.filter((v) => productOf.get(v.id) === primary).length > 1 ? "supplier" : "single",
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
    .replace(/\s*&\s*/g, " and ")
    .replace(/^(the thrifty bot|thrifty bot|ttb|wcp|andymark|ctr electronics|ctre|ctr|rev robotics|rev)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return name.length >= 6 ? name : null;
}

const plainText = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");

/** The same name, or one name the start of the other at a word break ("kraken wire bundle" and "kraken wire bundle 18 …"). */
function namesAgree(a: string, b: string): boolean {
  const na = sameName(a);
  const nb = sameName(b);
  if (!na || !nb) return false;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short === long || (long.startsWith(`${short} `) && short.includes(" "));
}

/** The supplier's price when the product has one variant with one. */
function onePrice(p: GroupProduct): number | null {
  const price = p.variants.length === 1 ? p.variants[0].priceUsd : null;
  return price && price > 0 ? price : null;
}

/**
 * Whether two suppliers' products with the same name ("same"), or one name starting the
 * other ("prefix"), are the same part: their prices agree (within 5%, or 2% for a prefix),
 * or, for the same name, one title names the other supplier's brand.
 */
function corroborated(a: GroupProduct, b: GroupProduct, match: "same" | "prefix"): boolean {
  const pa = onePrice(a);
  const pb = onePrice(b);
  if (pa !== null && pb !== null && Math.abs(pa - pb) <= (match === "same" ? 0.05 : 0.02) * Math.max(pa, pb)) return true;
  if (match === "prefix") return false;
  return Boolean(BRAND_OF[b.supplierCode]?.test(a.title) || BRAND_OF[a.supplierCode]?.test(b.title));
}

/** The "none" choice of an option: "No Pinion", "None", "Without Encoder", "Standard". */
const NONE_VALUE = /^(?:no|none|without|standard)\b/i;

/**
 * When a part number joins a single plain listing (REV's NEO 550) to another supplier's
 * product with options (AndyMark's, with No Pinion, 12T and 16T), the plain one is the
 * "none" choice, if exactly one variant has nothing but "none" values.
 */
function adoptOptions(a: GroupProduct, b: GroupProduct, adopted: Map<string, { product: GroupProduct; variant: GroupVariant }>) {
  for (const [single, many] of [
    [a, b],
    [b, a],
  ]) {
    if (single.variants.length !== 1 || single.variants[0].options.length > 0 || many.variants.length < 2) continue;
    const plain = many.variants.filter((v) => v.options.length > 0 && v.options.every((o) => NONE_VALUE.test(o.value)));
    if (plain.length === 1) adopted.set(single.variants[0].id, { product: many, variant: plain[0] });
  }
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
