import {
  type AnyPgColumn,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const program = pgEnum("program", ["FRC", "FTC"]);
export const teamStatus = pgEnum("team_status", ["pending", "active", "rejected", "suspended"]);
/**
 * Legacy (D11): there are no roles, everyone on a team can do everything. The code
 * no longer reads `role`; new rows get the default. Dropped in a later cleanup (S0 step 7b).
 */
export const supplierPlatform = pgEnum("supplier_platform", ["shopify", "bigcommerce", "csv", "manual"]);
export const productStatus = pgEnum("product_status", ["published", "review", "hidden"]);
export const syncStatus = pgEnum("sync_status", ["running", "succeeded", "failed"]);
export const familyGrouping = pgEnum("family_grouping", ["title", "supplier", "single"]);
export const groupingIssueReason = pgEnum("grouping_issue_reason", ["reference-page", "duplicate-options", "no-size"]);
export const orderStatus = pgEnum("order_status", ["submitted", "quote_sent", "approved", "rejected", "cancelled"]);
export const deliveryMethod = pgEnum("delivery_method", ["pickup", "ship"]);
export const quoteStatus = pgEnum("quote_status", ["sent", "approved", "rejected", "superseded"]);
export const poStatus = pgEnum("po_status", ["draft", "ordered", "cancelled"]);
export const importCostType = pgEnum("import_cost_type", ["customs", "freight", "broker", "vat"]);
export const pricingScope = pgEnum("pricing_scope", ["supplier", "category"]);
export const deliveryStatus = pgEnum("delivery_status", ["prepared", "delivered"]);
/** Where a product comes from: a store's sync, or the admin's "הוספת חלק" (S16c), which the sync never touches. */
export const productSource = pgEnum("product_source", ["synced", "custom"]);

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** One row per auth user, created by the handle_new_user trigger. */
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  fullName: text("full_name"),
  phone: text("phone"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt,
});

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    program: program("program").notNull(),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    address: text("address"),
    status: teamStatus("status").notNull().default("pending"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => profiles.id),
    rejectionReason: text("rejection_reason"),
    createdAt,
  },
  (t) => [unique("teams_program_number_key").on(t.program, t.number)],
);

export const memberships = pgTable(
  "memberships",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** Email groups this address turned off on /team (EMAIL_GROUPS in src/domain/notifications.ts). */
    emailOff: text("email_off").array().notNull().default(sql`'{}'::text[]`),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  platform: supplierPlatform("platform").notNull(),
  programs: program("programs").array().notNull(),
  /** false hides the supplier and every part of it from the catalog (S16b "הסתרה"). */
  active: boolean("active").notNull().default(true),
  /** The supplier's logo (S16b; also read by the home page). A URL from the store or the `supplier-logos` bucket. */
  logoUrl: text("logo_url"),
  /** The vendor's brand colour for its box's glow, outline and tint on the home page and its store ("#0075c9"); null: brand blue. */
  accentColor: text("accent_color"),
  /** A second brand colour for the gradient outline and glow (CTRE's black, The Thrifty Bot's white); null: a lighter shade of the first. */
  accentColor2: text("accent_color_2"),
  /** Orders above this many dollars ship free from the supplier; for the admin's notes. */
  freeShippingUsd: numeric("free_shipping_usd", { precision: 10, scale: 2 }),
  notes: text("notes"),
  /** Whether the nightly sync includes it; "סנכרון עכשיו" works either way. */
  syncEnabled: boolean("sync_enabled").notNull().default(true),
  createdAt,
});

/** Append-only record of every change made through the app (spec §10). */
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id").references(() => profiles.id),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Every order and quote page asks for an entity's latest action of a kind (src/lib/orders.ts).
  index("audit_log_entity_action_at_idx").on(t.entity, t.entityId, t.action, t.at),
]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  /** The home page's photos for this category, worked out by each regroup (categoryPhotos). */
  images: text("images").array().notNull().default([]),
  /** The group it shows under (S16d): an id from the settings' `content.categoryGroups`. */
  groupId: text("group_id").notNull().default("misc"),
  /** Hidden from the home page, the stores' and the catalog's category lists (its parts stay searchable). */
  hidden: boolean("hidden").notNull().default(false),
  /** The admin's photo for the home page, shown before the regroup's own picks. */
  homeImage: text("home_image"),
});

/** One row per supplier product, updated by the sync job (scripts/sync.ts). */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    supplierProductId: text("supplier_product_id").notNull(),
    handle: text("handle").notNull(),
    title: text("title").notNull(),
    /** Sanitized at sync time, see src/suppliers/shopify.ts. */
    descriptionHtml: text("description_html"),
    url: text("url").notNull(),
    images: text("images").array().notNull().default([]),
    productType: text("product_type"),
    tags: text("tags").array().notNull().default([]),
    programs: program("programs").array().notNull(),
    categoryId: uuid("category_id").references(() => categories.id),
    status: productStatus("status").notNull().default("published"),
    /** "custom" parts are added in /admin/settings/products; the sync neither updates nor marks them missing. */
    source: productSource("source").notNull().default("synced"),
    /**
     * The store's own values as last synced (or, for a custom part, the admin's). title,
     * description_html and images above are these with product_overrides applied by each
     * regroup (applyOverrides in src/suppliers/families.ts), so removing an override brings them back (S16c).
     */
    storeTitle: text("store_title"),
    storeDescriptionHtml: text("store_description_html"),
    storeImages: text("store_images").array(),
    // Summaries of the variants, kept here so listing and sorting need no join.
    minPriceUsd: numeric("min_price_usd", { precision: 10, scale: 2 }),
    maxPriceUsd: numeric("max_price_usd", { precision: 10, scale: 2 }),
    available: boolean("available"),
    /** The store's own updated_at, so the stock check skips products that haven't changed (src/suppliers/stock.ts). */
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    /** When the stock check last read this product's page; null if never. */
    stockCheckedAt: timestamp("stock_checked_at", { withTimezone: true }),
    /** The store's own "best selling" position (1 = best), read at sync (src/suppliers/best-sellers.ts); null when unknown. */
    bestSellerRank: integer("best_seller_rank"),
    searchText: text("search_text").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    missingSince: timestamp("missing_since", { withTimezone: true }),
    createdAt,
  },
  (t) => [
    unique("products_supplier_product_key").on(t.supplierId, t.supplierProductId),
    // Not unique: a deleted product and its replacement can share a handle.
    index("products_supplier_handle_idx").on(t.supplierId, t.handle),
    index("products_category_id_idx").on(t.categoryId),
    index("products_min_price_usd_idx").on(t.minPriceUsd),
  ],
);

export const variants = pgTable(
  "variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    supplierVariantId: text("supplier_variant_id").notNull(),
    supplierSku: text("supplier_sku"),
    options: jsonb("options").$type<{ name: string; value: string }[]>().notNull().default([]),
    /**
     * Set by the grouping step after each sync (src/suppliers/families.ts). Per
     * variant, because a reseller's product can list parts from several families.
     */
    familyId: uuid("family_id").references((): AnyPgColumn => productFamilies.id, { onDelete: "set null" }),
    /** This variant's choices within its family, e.g. { teeth: "36t", bore: '1/2" Hex' }. */
    familyOptions: jsonb("family_options").$type<Record<string, string>>().notNull().default({}),
    position: integer("position").notNull().default(0),
    grams: integer("grams"),
    /** The price everything reads: the admin's override (variant_overrides) if any, else the store's. */
    priceUsd: numeric("price_usd", { precision: 10, scale: 2 }),
    /** The store's own price as last synced, so removing an override brings it back (S15). */
    supplierPriceUsd: numeric("supplier_price_usd", { precision: 10, scale: 2 }),
    compareAtUsd: numeric("compare_at_usd", { precision: 10, scale: 2 }),
    /** The multiplier its price uses, resolved from pricing_rules by each regroup (S16a, resolveMarkup); null until then, which means the global one. */
    markup: numeric("markup", { precision: 6, scale: 3 }),
    available: boolean("available"),
    /** Orderable but none on hand: the supplier ships it later (בהזמנה מראש). Only from the stock check; never a quantity. */
    shipsLater: boolean("ships_later").notNull().default(false),
    /** The supplier's own words for when, e.g. "late November"; null when it gives none. */
    shipsLaterEta: text("ships_later_eta"),
    /** The admin's fixed ₪ price (variant_overrides.fixed_ils, written by each regroup): it beats the rate and the multiplier (S16c). */
    fixedIls: numeric("fixed_ils", { precision: 10, scale: 2 }),
    /** The store's SKU, options and availability as last synced, so removing an override brings them back (S16c). */
    storeSku: text("store_sku"),
    storeOptions: jsonb("store_options").$type<{ name: string; value: string }[]>(),
    storeAvailable: boolean("store_available"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    missingSince: timestamp("missing_since", { withTimezone: true }),
  },
  (t) => [
    unique("variants_supplier_variant_key").on(t.supplierId, t.supplierVariantId),
    index("variants_product_id_idx").on(t.productId),
    index("variants_family_id_idx").on(t.familyId),
    // The search panel puts an exact SKU first (quickSearch in src/lib/catalog.ts).
    index("variants_lower_sku_idx").on(sql`lower(${t.supplierSku})`),
    // Search by SKU in any spelling ("wcp0749", "WCP 0749"): letters and digits only (textMatch in src/lib/catalog.ts).
    index("variants_sku_norm_idx").on(sql`regexp_replace(lower(${t.supplierSku}), '[^a-z0-9]', '', 'g')`),
  ],
);

/**
 * What the catalog lists: one part in all its sizes, possibly from several
 * suppliers (docs/REDESIGN.md, "Data model changes"). Rebuilt from products and
 * variants by the grouping step, so it holds nothing that isn't derived.
 */
export const productFamilies = pgTable(
  "product_families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** What the family is matched on across syncs, e.g. "t:gears:steel spur gear 20 dp". */
    key: text("key").notNull().unique(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    categoryId: uuid("category_id").references(() => categories.id),
    grouping: familyGrouping("grouping").notNull(),
    primaryProductId: uuid("primary_product_id").references((): AnyPgColumn => products.id, { onDelete: "set null" }),
    supplierCodes: text("supplier_codes").array().notNull().default([]),
    programs: program("programs").array().notNull().default([]),
    images: text("images").array().notNull().default([]),
    descriptionHtml: text("description_html"),
    /** Option names that differ between the variants, in display order. */
    optionKeys: text("option_keys").array().notNull().default([]),
    variantCount: integer("variant_count").notNull().default(0),
    minPriceUsd: numeric("min_price_usd", { precision: 10, scale: 2 }),
    maxPriceUsd: numeric("max_price_usd", { precision: 10, scale: 2 }),
    /** Lowest and highest USD × each variant's multiplier (S16a): × the rate gives the ₪ range, and price sorting uses it. */
    minListUsd: numeric("min_list_usd", { precision: 12, scale: 2 }),
    maxListUsd: numeric("max_list_usd", { precision: 12, scale: 2 }),
    available: boolean("available"),
    /** Every available variant ships later, so the family shows בהזמנה מראש (derived by regroup). */
    shipsLater: boolean("ships_later").notNull().default(false),
    status: productStatus("status").notNull().default("published"),
    searchText: text("search_text").notNull(),
    /** The admin's "מומלץ" order (lowest pin of its products, product_overrides.pin_rank); null when not pinned. */
    pinnedRank: integer("pinned_rank"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    /** Set when no listed product is left in the family. */
    missingSince: timestamp("missing_since", { withTimezone: true }),
  },
  (t) => [
    index("product_families_category_id_idx").on(t.categoryId),
    index("product_families_min_price_usd_idx").on(t.minPriceUsd),
    index("product_families_min_list_usd_idx").on(t.minListUsd),
  ],
);

/** Sizes and specs for the catalog's filter chips (teeth, bore, DP, pitch, ID, OD…). */
export const specValues = pgTable(
  "spec_values",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => productFamilies.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => variants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    num: numeric("num", { precision: 12, scale: 4 }),
    unit: text("unit"),
  },
  (t) => [index("spec_values_family_id_idx").on(t.familyId), index("spec_values_key_value_idx").on(t.key, t.value)],
);

/** Products the grouping step left alone instead of guessing, for an admin to look at. */
export const groupingIssues = pgTable(
  "grouping_issues",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    reason: groupingIssueReason("reason").notNull(),
    detail: text("detail").notNull(),
    createdAt,
  },
  (t) => [unique("grouping_issues_product_reason_key").on(t.productId, t.reason)],
);

/** A row is added only when a variant's price or availability changes. */
export const priceHistory = pgTable(
  "price_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    priceUsd: numeric("price_usd", { precision: 10, scale: 2 }),
    compareAtUsd: numeric("compare_at_usd", { precision: 10, scale: 2 }),
    available: boolean("available"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_history_variant_id_idx").on(t.variantId, t.observedAt)],
);

export const syncJobs = pgTable("sync_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  status: syncStatus("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  counts: jsonb("counts"),
  error: text("error"),
  /** The USD→ILS rate in force when this job ran (exchange_rates), for the admin dashboard. */
  usdIlsRate: numeric("usd_ils_rate", { precision: 10, scale: 4 }),
});

/**
 * Bank of Israel representative rates, one row per currency and rate date, fetched
 * by the daily sync. Prices use the latest row (src/lib/fx.ts); a failed fetch keeps it.
 */
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    currency: text("currency").notNull(),
    rateDate: date("rate_date").notNull(),
    /** ILS per one unit of `currency`. */
    rate: numeric("rate", { precision: 10, scale: 4 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.currency, t.rateDate] })],
);

/** A team's shared cart. Prices are read live from the catalog until the order is submitted. */
export const cartItems = pgTable(
  "cart_items",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    qty: integer("qty").notNull(),
    addedBy: uuid("added_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.teamId, t.variantId] })],
);

export const teamOrders = pgTable(
  "team_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().generatedByDefaultAsIdentity({ startWith: 1001 }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    status: orderStatus("status").notNull().default("submitted"),
    deliveryMethod: deliveryMethod("delivery_method").notNull(),
    address: text("address"),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    notes: text("notes"),
    rejectionReason: text("rejection_reason"),
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => profiles.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("team_orders_number_key").on(t.number), index("team_orders_team_id_idx").on(t.teamId)],
);

/** Copies everything at submit time, so later catalog syncs never change an order (spec §8, AT-04). */
export const teamOrderItems = pgTable(
  "team_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => teamOrders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id),
    qty: integer("qty").notNull(),
    supplierCode: text("supplier_code").notNull(),
    supplierName: text("supplier_name").notNull(),
    supplierSku: text("supplier_sku"),
    title: text("title").notNull(),
    options: jsonb("options").$type<{ name: string; value: string }[]>().notNull(),
    productUrl: text("product_url").notNull(),
    priceUsd: numeric("price_usd", { precision: 10, scale: 2 }).notNull(),
    multiplier: numeric("multiplier", { precision: 6, scale: 3 }).notNull(),
    /** The USD→ILS rate behind unitPriceIls. Null on orders sent before the rate was applied (Nov 2026). */
    usdIlsRate: numeric("usd_ils_rate", { precision: 10, scale: 4 }),
    unitPriceIls: integer("unit_price_ils").notNull(),
    pricedAt: timestamp("priced_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("team_order_items_order_id_idx").on(t.orderId)],
);

/** Sending a changed quote adds a new version, and the team has to approve it again. */
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => teamOrders.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: quoteStatus("status").notNull().default("sent"),
    shippingIls: integer("shipping_ils").notNull(),
    notes: text("notes"),
    rejectionReason: text("rejection_reason"),
    sentBy: uuid("sent_by")
      .notNull()
      .references(() => profiles.id),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("quotes_order_version_key").on(t.orderId, t.version)],
);

export const quoteLines = pgTable(
  "quote_lines",
  {
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => teamOrderItems.id, { onDelete: "cascade" }),
    qty: integer("qty").notNull(),
    unitPriceIls: integer("unit_price_ils").notNull(),
    changeReason: text("change_reason"),
  },
  (t) => [primaryKey({ columns: [t.quoteId, t.itemId] })],
);

/** Proof of what was approved: who, when, and a hash of the quote's content. */
export const quoteApprovals = pgTable("quote_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  quoteId: uuid("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id),
  contentHash: text("content_hash").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/** An order the Israeli supplier places by hand on one supplier's site. */
export const supplierPos = pgTable(
  "supplier_pos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().generatedByDefaultAsIdentity({ startWith: 5001 }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    status: poStatus("status").notNull().default("draft"),
    supplierOrderRef: text("supplier_order_ref"),
    notes: text("notes"),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    /** What the supplier charged on top of the lines, in USD (S13). */
    shippingUsd: numeric("shipping_usd", { precision: 10, scale: 2 }),
    taxUsd: numeric("tax_usd", { precision: 10, scale: 2 }),
    /** The card statement's amount, when known. It wins over lines + shipping + tax. */
    totalChargedUsd: numeric("total_charged_usd", { precision: 10, scale: 2 }),
    /** Which card paid, as a nickname such as "ויזה 1234". Never a full card number. */
    cardLabel: text("card_label"),
    /** The supplier's tracking number for the whole order. */
    tracking: text("tracking"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt,
  },
  (t) => [unique("supplier_pos_number_key").on(t.number), index("supplier_pos_supplier_id_idx").on(t.supplierId)],
);

/** One per variant in a PO. Lines are only ever merged for the same variant. */
export const poLines = pgTable(
  "po_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poId: uuid("po_id")
      .notNull()
      .references(() => supplierPos.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id),
    supplierVariantId: text("supplier_variant_id").notNull(),
    supplierSku: text("supplier_sku"),
    title: text("title").notNull(),
    options: jsonb("options").$type<{ name: string; value: string }[]>().notNull(),
    productUrl: text("product_url").notNull(),
    unitCostUsd: numeric("unit_cost_usd", { precision: 10, scale: 2 }),
  },
  (t) => [unique("po_lines_po_variant_key").on(t.poId, t.variantId)],
);

/** Which team's order line each purchased unit is for. A line's quantity is the sum of these. */
export const poAllocations = pgTable(
  "po_allocations",
  {
    poLineId: uuid("po_line_id")
      .notNull()
      .references(() => poLines.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => teamOrderItems.id),
    qty: integer("qty").notNull(),
  },
  (t) => [primaryKey({ columns: [t.poLineId, t.orderItemId] }), index("po_allocations_order_item_id_idx").on(t.orderItemId)],
);

/** One physical shipment from a supplier. A supplier order can arrive in several. */
export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().generatedByDefaultAsIdentity({ startWith: 7001 }),
    poId: uuid("po_id")
      .notNull()
      .references(() => supplierPos.id),
    carrier: text("carrier"),
    tracking: text("tracking"),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt,
  },
  (t) => [unique("shipments_number_key").on(t.number), index("shipments_po_id_idx").on(t.poId)],
);

export const shipmentItems = pgTable(
  "shipment_items",
  {
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    poLineId: uuid("po_line_id")
      .notNull()
      .references(() => poLines.id),
    qty: integer("qty").notNull(),
  },
  (t) => [primaryKey({ columns: [t.shipmentId, t.poLineId] })],
);

export const importCosts = pgTable(
  "import_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    type: importCostType("type").notNull(),
    amountIls: numeric("amount_ils", { precision: 12, scale: 2 }).notNull(),
    /** Reclaimable VAT isn't a real cost, so the profit report leaves it out (spec §8, AT-10). */
    vatReclaimable: boolean("vat_reclaimable").notNull().default(false),
    reference: text("reference"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt,
  },
  (t) => [index("import_costs_shipment_id_idx").on(t.shipmentId)],
);

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id),
    notes: text("notes"),
    receivedBy: uuid("received_by")
      .notNull()
      .references(() => profiles.id),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("receipts_shipment_id_idx").on(t.shipmentId)],
);

export const receiptLines = pgTable(
  "receipt_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    poLineId: uuid("po_line_id")
      .notNull()
      .references(() => poLines.id),
    qtyReceived: integer("qty_received").notNull(),
    qtyDamaged: integer("qty_damaged").notNull().default(0),
    location: text("location"),
  },
  (t) => [index("receipt_lines_receipt_id_idx").on(t.receiptId), index("receipt_lines_po_line_id_idx").on(t.poLineId)],
);

/** Which team gets which received units. Only undamaged units can be allocated. */
export const stockAllocations = pgTable(
  "stock_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptLineId: uuid("receipt_line_id")
      .notNull()
      .references(() => receiptLines.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => teamOrderItems.id),
    qty: integer("qty").notNull(),
  },
  (t) => [
    unique("stock_allocations_line_item_key").on(t.receiptLineId, t.orderItemId),
    index("stock_allocations_order_item_id_idx").on(t.orderItemId),
  ],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().generatedByDefaultAsIdentity({ startWith: 9001 }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    method: deliveryMethod("method").notNull(),
    address: text("address"),
    status: deliveryStatus("status").notNull().default("prepared"),
    recipientName: text("recipient_name"),
    proofNote: text("proof_note"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt,
  },
  (t) => [unique("deliveries_number_key").on(t.number), index("deliveries_team_id_idx").on(t.teamId)],
);

export const deliveryItems = pgTable(
  "delivery_items",
  {
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    allocationId: uuid("allocation_id")
      .notNull()
      .references(() => stockAllocations.id),
    qty: integer("qty").notNull(),
  },
  (t) => [primaryKey({ columns: [t.deliveryId, t.allocationId] }), index("delivery_items_allocation_id_idx").on(t.allocationId)],
);

/** An invitation by email. Only a hash of the link's token is stored. */
export const teamInvitations = pgTable(
  "team_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => profiles.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [index("team_invitations_email_idx").on(t.email), index("team_invitations_team_id_idx").on(t.teamId)],
);

/**
 * "בקשת הצטרפות" (S2): someone signed in asks to join a team that is already
 * registered. Anyone on that team adds the address with one tap, or declines.
 * S3 emails the team and the admin when one comes in.
 */
export const teamJoinRequests = pgTable(
  "team_join_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => profiles.id),
    accepted: boolean("accepted"),
    createdAt,
  },
  (t) => [index("team_join_requests_team_id_idx").on(t.teamId), unique("team_join_requests_team_user_key").on(t.teamId, t.userId)],
);

/**
 * "לא מצאתם? שלחו לנו קישור לחלק" (S5 task 8): one part a team couldn't find in the
 * catalog, as a link and a note, for the admin to look into. Not an order and not a SKU list.
 */
export const partRequests = pgTable(
  "part_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    note: text("note"),
    /** What the team searched for before giving up. */
    query: text("query"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    handledAt: timestamp("handled_at", { withTimezone: true }),
  },
  (t) => [index("part_requests_open_idx").on(t.handledAt, t.createdAt)],
);

/**
 * The admin's fixes to a supplier product (S15). Keyed by products.id, which survives
 * every sync, so the nightly sync and regroup apply them again (src/domain/catalog-overrides.ts).
 */
export const productOverrides = pgTable("product_overrides", {
  productId: uuid("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  /** Left out of the catalog. */
  hidden: boolean("hidden").notNull().default(false),
  /** Replaces the store's photos; the first is the main one. */
  images: text("images").array(),
  /** Files the product under another category. */
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  /** Split: this product's variants join no other family. */
  alone: boolean("alone").notNull().default(false),
  /** Merge: products with the same key make one family. */
  mergeKey: text("merge_key"),
  /** "מומלץ": pinned families come first, lowest rank first. */
  pinRank: integer("pin_rank"),
  /** S16c: the admin's name, description and availability (null keeps the store's). */
  title: text("title"),
  descriptionHtml: text("description_html"),
  available: boolean("available"),
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
});

/**
 * The admin's fixes to one variant: a USD price (S15) that then goes through priceIls like
 * any price, or a fixed ₪ price that ignores the rate and multiplier, a SKU, options and
 * hiding (S16c). Null fields keep the store's.
 */
export const variantOverrides = pgTable("variant_overrides", {
  variantId: uuid("variant_id")
    .primaryKey()
    .references(() => variants.id, { onDelete: "cascade" }),
  priceUsd: numeric("price_usd", { precision: 10, scale: 2 }),
  fixedIls: numeric("fixed_ils", { precision: 10, scale: 2 }),
  sku: text("sku"),
  options: jsonb("options").$type<{ name: string; value: string }[]>(),
  hidden: boolean("hidden").notNull().default(false),
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
});

/**
 * The admin's settings (S16): one row (id 1) of JSON, checked by the zod schema in
 * src/domain/settings.ts and read through getSettings() in src/lib/settings.ts.
 */
export const siteSettings = pgTable("site_settings", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
});

/** A multiplier for one supplier or one category (S16a); precedence in resolveMarkup (src/domain/pricing.ts). */
export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: pricingScope("scope").notNull(),
    /** suppliers.id or categories.id, by scope. */
    targetId: uuid("target_id").notNull(),
    multiplier: numeric("multiplier", { precision: 6, scale: 3 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
  },
  (t) => [unique("pricing_rules_scope_target_key").on(t.scope, t.targetId)],
);
