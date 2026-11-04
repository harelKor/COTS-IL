import {
  bigserial,
  boolean,
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

export const program = pgEnum("program", ["FRC", "FTC"]);
export const teamStatus = pgEnum("team_status", ["pending", "active", "rejected", "suspended"]);
export const teamRole = pgEnum("team_role", ["team_admin", "buyer", "viewer"]);
export const supplierPlatform = pgEnum("supplier_platform", ["shopify", "bigcommerce", "csv"]);
export const productStatus = pgEnum("product_status", ["published", "review", "hidden"]);
export const syncStatus = pgEnum("sync_status", ["running", "succeeded", "failed"]);
export const orderStatus = pgEnum("order_status", ["submitted", "quote_sent", "approved", "rejected", "cancelled"]);
export const deliveryMethod = pgEnum("delivery_method", ["pickup", "ship"]);
export const quoteStatus = pgEnum("quote_status", ["sent", "approved", "rejected", "superseded"]);

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
    role: teamRole("role").notNull(),
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
  active: boolean("active").notNull().default(true),
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
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
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
    // Summaries of the variants, kept here so listing and sorting need no join.
    minPriceUsd: numeric("min_price_usd", { precision: 10, scale: 2 }),
    maxPriceUsd: numeric("max_price_usd", { precision: 10, scale: 2 }),
    available: boolean("available"),
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
    position: integer("position").notNull().default(0),
    grams: integer("grams"),
    priceUsd: numeric("price_usd", { precision: 10, scale: 2 }),
    compareAtUsd: numeric("compare_at_usd", { precision: 10, scale: 2 }),
    available: boolean("available"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    missingSince: timestamp("missing_since", { withTimezone: true }),
  },
  (t) => [
    unique("variants_supplier_variant_key").on(t.supplierId, t.supplierVariantId),
    index("variants_product_id_idx").on(t.productId),
  ],
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
});

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
