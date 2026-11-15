import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    timeZone: text("time_zone").notNull().default("America/Sao_Paulo"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("stores_organization_id_id_uidx").on(table.organizationId, table.id),
    uniqueIndex("stores_organization_id_code_uidx").on(table.organizationId, table.code),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    authUserId: uuid("auth_user_id").notNull(),
    role: varchar("role", { length: 24 }).notNull().default("operator"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "organization_memberships_role_check",
      sql`${table.role} in ('owner', 'manager', 'operator')`,
    ),
    uniqueIndex("organization_memberships_organization_user_uidx").on(table.organizationId, table.authUserId),
    index("organization_memberships_auth_user_idx").on(table.authUserId),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    unit: varchar("unit", { length: 16 }).notNull().default("UN"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("products_organization_id_id_uidx").on(table.organizationId, table.id),
    index("products_organization_name_idx").on(table.organizationId, table.name),
  ],
);

export const externalProductKeys = pgTable(
  "external_product_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    productId: uuid("product_id").notNull(),
    sourceSystem: text("source_system").notNull(),
    externalKey: text("external_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
      name: "external_product_keys_organization_product_fk",
    }).onDelete("cascade"),
    uniqueIndex("external_product_keys_source_key_uidx").on(table.organizationId, table.sourceSystem, table.externalKey),
    index("external_product_keys_product_idx").on(table.organizationId, table.productId),
  ],
);

export const storePrices = pgTable(
  "store_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    storeId: uuid("store_id").notNull(),
    productId: uuid("product_id").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("BRL"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("store_prices_nonnegative_amount_check", sql`${table.amount} >= 0`),
    check("store_prices_brl_currency_check", sql`${table.currency} = 'BRL'`),
    foreignKey({
      columns: [table.organizationId, table.storeId],
      foreignColumns: [stores.organizationId, stores.id],
      name: "store_prices_organization_store_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
      name: "store_prices_organization_product_fk",
    }).onDelete("cascade"),
    uniqueIndex("store_prices_store_product_uidx").on(table.storeId, table.productId),
    index("store_prices_organization_store_idx").on(table.organizationId, table.storeId),
  ],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    storeId: uuid("store_id").notNull(),
    sourceSystem: text("source_system").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("received"),
    rowsReceived: integer("rows_received").notNull().default(0),
    productsCreated: integer("products_created").notNull().default(0),
    pricesChanged: integer("prices_changed").notNull().default(0),
    errorSummary: text("error_summary"),
    requestedBy: uuid("requested_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    check("sync_runs_status_check", sql`${table.status} in ('received', 'processing', 'applied', 'failed')`),
    foreignKey({
      columns: [table.organizationId, table.storeId],
      foreignColumns: [stores.organizationId, stores.id],
      name: "sync_runs_organization_store_fk",
    }).onDelete("cascade"),
    uniqueIndex("sync_runs_organization_store_id_uidx").on(table.organizationId, table.storeId, table.id),
    index("sync_runs_store_created_idx").on(table.storeId, table.createdAt),
  ],
);

export const syncStagingPrices = pgTable(
  "sync_staging_prices",
  {
    organizationId: uuid("organization_id").notNull(),
    storeId: uuid("store_id").notNull(),
    syncRunId: uuid("sync_run_id").notNull(),
    productId: uuid("product_id").notNull(),
    sourceSystem: text("source_system").notNull(),
    externalKey: text("external_key").notNull(),
    productName: text("product_name").notNull(),
    unit: varchar("unit", { length: 16 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    rowNumber: integer("row_number").notNull(),
  },
  (table) => [
    check("sync_staging_prices_amount_check", sql`${table.amount} >= 0`),
    foreignKey({
      columns: [table.organizationId, table.storeId, table.syncRunId],
      foreignColumns: [syncRuns.organizationId, syncRuns.storeId, syncRuns.id],
      name: "sync_staging_prices_run_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.storeId],
      foreignColumns: [stores.organizationId, stores.id],
      name: "sync_staging_prices_store_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
      name: "sync_staging_prices_product_fk",
    }).onDelete("cascade"),
    uniqueIndex("sync_staging_prices_run_row_uidx").on(table.syncRunId, table.rowNumber),
    index("sync_staging_prices_run_idx").on(table.syncRunId),
  ],
);

export const priceChangeEvents = pgTable(
  "price_change_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    storeId: uuid("store_id").notNull(),
    productId: uuid("product_id").notNull(),
    syncRunId: uuid("sync_run_id").notNull(),
    oldAmount: numeric("old_amount", { precision: 12, scale: 2 }),
    newAmount: numeric("new_amount", { precision: 12, scale: 2 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("price_change_events_new_amount_check", sql`${table.newAmount} >= 0`),
    check("price_change_events_old_amount_check", sql`${table.oldAmount} is null or ${table.oldAmount} >= 0`),
    foreignKey({
      columns: [table.organizationId, table.storeId, table.syncRunId],
      foreignColumns: [syncRuns.organizationId, syncRuns.storeId, syncRuns.id],
      name: "price_change_events_run_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.storeId],
      foreignColumns: [stores.organizationId, stores.id],
      name: "price_change_events_store_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
      name: "price_change_events_product_fk",
    }).onDelete("cascade"),
    uniqueIndex("price_change_events_run_product_uidx").on(table.syncRunId, table.productId),
    index("price_change_events_store_time_idx").on(table.storeId, table.occurredAt),
  ],
);

export const promotions = pgTable(
  "promotions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    storeId: uuid("store_id").notNull(),
    productId: uuid("product_id").notNull(),
    regularAmount: numeric("regular_amount", { precision: 12, scale: 2 }).notNull(),
    promotionalAmount: numeric("promotional_amount", { precision: 12, scale: 2 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by"),
  },
  (table) => [
    check("promotions_regular_amount_check", sql`${table.regularAmount} > 0`),
    check("promotions_promotional_amount_check", sql`${table.promotionalAmount} >= 0 and ${table.promotionalAmount} < ${table.regularAmount}`),
    check("promotions_period_check", sql`${table.endsAt} > ${table.startsAt}`),
    foreignKey({
      columns: [table.organizationId, table.storeId],
      foreignColumns: [stores.organizationId, stores.id],
      name: "promotions_organization_store_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
      name: "promotions_organization_product_fk",
    }).onDelete("cascade"),
    uniqueIndex("promotions_organization_store_product_id_uidx").on(
      table.organizationId,
      table.storeId,
      table.productId,
      table.id,
    ),
    index("promotions_store_period_idx").on(table.storeId, table.startsAt, table.endsAt),
    index("promotions_product_period_idx").on(table.storeId, table.productId, table.startsAt, table.endsAt).where(sql`${table.cancelledAt} is null`),
  ],
);

export const priceLabels = pgTable(
  "price_labels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    storeId: uuid("store_id").notNull(),
    productId: uuid("product_id").notNull(),
    promotionId: uuid("promotion_id"),
    regularAmount: numeric("regular_amount", { precision: 12, scale: 2 }).notNull(),
    displayAmount: numeric("display_amount", { precision: 12, scale: 2 }).notNull(),
    promotionStartsAt: timestamp("promotion_starts_at", { withTimezone: true }),
    removalDueAt: timestamp("removal_due_at", { withTimezone: true }),
    status: varchar("status", { length: 24 }).notNull().default("ready_to_print"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    printedAt: timestamp("printed_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    printedBy: uuid("printed_by"),
    removedBy: uuid("removed_by"),
  },
  (table) => [
    check("price_labels_regular_amount_check", sql`${table.regularAmount} >= 0`),
    check("price_labels_display_amount_check", sql`${table.displayAmount} >= 0`),
    check("price_labels_status_check", sql`${table.status} in ('ready_to_print', 'printed', 'removed', 'cancelled')`),
    check("price_labels_print_timestamp_check", sql`${table.status} <> 'printed' or ${table.printedAt} is not null`),
    check("price_labels_removed_timestamp_check", sql`${table.status} <> 'removed' or ${table.removedAt} is not null`),
    check(
      "price_labels_promotion_snapshot_check",
      sql`(${table.promotionId} is null and ${table.promotionStartsAt} is null and ${table.removalDueAt} is null) or (${table.promotionId} is not null and ${table.promotionStartsAt} is not null and ${table.removalDueAt} is not null)`,
    ),
    foreignKey({
      columns: [table.organizationId, table.storeId],
      foreignColumns: [stores.organizationId, stores.id],
      name: "price_labels_organization_store_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
      name: "price_labels_organization_product_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.storeId, table.productId, table.promotionId],
      foreignColumns: [promotions.organizationId, promotions.storeId, promotions.productId, promotions.id],
      name: "price_labels_promotion_fk",
    }).onDelete("restrict"),
    index("price_labels_store_created_idx").on(table.storeId, table.createdAt),
    index("price_labels_removal_due_idx")
      .on(table.storeId, table.removalDueAt)
      .where(sql`${table.status} = 'printed' and ${table.removalDueAt} is not null`),
    uniqueIndex("price_labels_organization_store_id_uidx").on(table.organizationId, table.storeId, table.id),
  ],
);

export const storeAlerts = pgTable(
  "store_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    storeId: uuid("store_id").notNull(),
    labelId: uuid("label_id").notNull(),
    alertType: varchar("alert_type", { length: 40 }).notNull().default("label_removal_due"),
    status: varchar("status", { length: 24 }).notNull().default("unread"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    readBy: uuid("read_by"),
  },
  (table) => [
    check("store_alerts_type_check", sql`${table.alertType} = 'label_removal_due'`),
    check("store_alerts_status_check", sql`${table.status} in ('unread', 'read', 'resolved')`),
    check("store_alerts_read_timestamp_check", sql`${table.status} <> 'read' or ${table.readAt} is not null`),
    check("store_alerts_resolved_timestamp_check", sql`${table.status} <> 'resolved' or ${table.resolvedAt} is not null`),
    foreignKey({
      columns: [table.organizationId, table.storeId],
      foreignColumns: [stores.organizationId, stores.id],
      name: "store_alerts_organization_store_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.storeId, table.labelId],
      foreignColumns: [priceLabels.organizationId, priceLabels.storeId, priceLabels.id],
      name: "store_alerts_label_fk",
    }).onDelete("cascade"),
    uniqueIndex("store_alerts_label_type_uidx").on(table.alertType, table.labelId),
    index("store_alerts_store_status_created_idx").on(table.storeId, table.status, table.createdAt),
  ],
);
