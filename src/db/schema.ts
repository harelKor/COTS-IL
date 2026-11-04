import {
  bigserial,
  boolean,
  integer,
  jsonb,
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
