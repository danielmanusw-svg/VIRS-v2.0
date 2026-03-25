import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Markets ───────────────────────────────────────────────────────────────────

export const markets = sqliteTable("markets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(), // EU, UK, US, AU
  name: text("name").notNull(),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const marketCountries = sqliteTable("market_countries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  market_id: integer("market_id")
    .notNull()
    .references(() => markets.id),
  country_code: text("country_code").notNull().unique(), // ISO 3166-1 alpha-2
});

// ─── Products ──────────────────────────────────────────────────────────────────

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopify_product_id: text("shopify_product_id").notNull().unique(),
  title: text("title").notNull(),
  vendor: text("vendor"),
  image_url: text("image_url"),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updated_at: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const productVariants = sqliteTable("product_variants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  product_id: integer("product_id")
    .notNull()
    .references(() => products.id),
  shopify_variant_id: text("shopify_variant_id").notNull().unique(),
  title: text("title").notNull(),
  sku: text("sku"),
  supplier_cost: real("supplier_cost").notNull().default(0),
  initialized_from_shopify: integer("initialized_from_shopify", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updated_at: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  bundle_multiplier: integer("bundle_multiplier").notNull().default(1),
  master_product_id: integer("master_product_id").references(
    () => masterProducts.id
  ),
});

// ─── Stock ─────────────────────────────────────────────────────────────────────

export const stock = sqliteTable("stock", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  variant_id: integer("variant_id")
    .notNull()
    .unique()
    .references(() => productVariants.id),
  quantity: integer("quantity").notNull().default(0),
  updated_at: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// ─── Shipping Costs ────────────────────────────────────────────────────────────

export const productMarketShipping = sqliteTable("product_market_shipping", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  variant_id: integer("variant_id")
    .notNull()
    .references(() => productVariants.id),
  market_id: integer("market_id")
    .notNull()
    .references(() => markets.id),
  shipping_cost: real("shipping_cost").notNull().default(0),
});

// ─── Orders ────────────────────────────────────────────────────────────────────

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopify_order_id: text("shopify_order_id").notNull().unique(),
  order_number: integer("order_number").notNull(),
  market_id: integer("market_id").references(() => markets.id),
  shipping_country_code: text("shipping_country_code"),
  is_flagged: integer("is_flagged", { mode: "boolean" })
    .notNull()
    .default(false),
  shipping_cost_override: real("shipping_cost_override"),
  financial_status: text("financial_status"),
  fulfillment_status: text("fulfillment_status"),
  shopify_created_at: text("shopify_created_at").notNull(),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updated_at: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  is_shipbob_fulfilled: integer("is_shipbob_fulfilled", { mode: "boolean" }),
  cancelled_at: text("cancelled_at"),
});

export const orderLineItems = sqliteTable("order_line_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  order_id: integer("order_id")
    .notNull()
    .references(() => orders.id),
  variant_id: integer("variant_id").references(() => productVariants.id),
  shopify_line_item_id: text("shopify_line_item_id").notNull(),
  title: text("title").notNull(),
  sku: text("sku"),
  quantity: integer("quantity").notNull(),
  supplier_cost_snapshot: real("supplier_cost_snapshot").notNull().default(0),
  line_price: real("line_price").notNull().default(0),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// ─── Stock Audit Trail ─────────────────────────────────────────────────────────

export const stockAdjustmentLog = sqliteTable("stock_adjustment_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  variant_id: integer("variant_id")
    .notNull()
    .references(() => productVariants.id),
  adjustment_type: text("adjustment_type").notNull(), // initial_import, sale, manual_set, manual_add, manual_subtract
  quantity_before: integer("quantity_before").notNull(),
  quantity_after: integer("quantity_after").notNull(),
  reason: text("reason"),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// ─── Sync History ──────────────────────────────────────────────────────────────

export const syncHistory = sqliteTable("sync_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sync_type: text("sync_type").notNull(), // products, orders
  status: text("status").notNull(), // success, error
  records_processed: integer("records_processed").notNull().default(0),
  records_created: integer("records_created").notNull().default(0),
  records_updated: integer("records_updated").notNull().default(0),
  error_detail: text("error_detail"),
  started_at: text("started_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  completed_at: text("completed_at"),
});

// ─── Settings ──────────────────────────────────────────────────────────────────

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sync_frequency_hours: integer("sync_frequency_hours").notNull().default(6),
  shopify_orders_synced_until: text("shopify_orders_synced_until"),
  last_synced_at: text("last_synced_at"),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updated_at: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// ─── Invoices ──────────────────────────────────────────────────────────────────

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  start_order_number: integer("start_order_number").notNull(),
  end_order_number: integer("end_order_number").notNull(),
  status: text("status").notNull().default("draft"), // draft, confirmed, void
  total_supplier_cost: real("total_supplier_cost").notNull().default(0),
  total_shipping_cost: real("total_shipping_cost").notNull().default(0),
  grand_total: real("grand_total").notNull().default(0),
  missing_order_numbers: text("missing_order_numbers"), // JSON array of missing order numbers
  eu_shipping_override: real("eu_shipping_override"),
  uk_shipping_override: real("uk_shipping_override"),
  us_shipping_override: real("us_shipping_override"),
  au_shipping_override: real("au_shipping_override"),
  distinct_order_count: integer("distinct_order_count"),
  total_commission_gbp: real("total_commission_gbp"),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  confirmed_at: text("confirmed_at"),
});

export const invoiceLineItems = sqliteTable("invoice_line_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoice_id: integer("invoice_id")
    .notNull()
    .references(() => invoices.id),
  order_id: integer("order_id")
    .notNull()
    .references(() => orders.id),
  order_number: integer("order_number").notNull(),
  variant_id: integer("variant_id").references(() => productVariants.id),
  sku: text("sku"),
  title: text("title").notNull(),
  quantity: integer("quantity").notNull(),
  market_code: text("market_code"),
  supplier_cost: real("supplier_cost").notNull().default(0),
  shipping_cost: real("shipping_cost").notNull().default(0),
  line_total: real("line_total").notNull().default(0),
  line_price: real("line_price").notNull().default(0),
});

// ─── Master Products ───────────────────────────────────────────────────────

export const masterProducts = sqliteTable("master_products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  stock_quantity: integer("stock_quantity").notNull().default(0),
  is_manual_stock: integer("is_manual_stock", { mode: "boolean" })
    .notNull()
    .default(false),
  image_url: text("image_url"),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updated_at: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// ─── Collections ───────────────────────────────────────────────────────────

export const collections = sqliteTable("collections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updated_at: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const collectionItems = sqliteTable("collection_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collection_id: integer("collection_id")
    .notNull()
    .references(() => collections.id, { onDelete: "cascade" }),
  item_type: text("item_type").notNull(), // 'variant' | 'master_product'
  item_id: integer("item_id").notNull(),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// ─── Supplier Aliases ──────────────────────────────────────────────────────

export const supplierAliases = sqliteTable("supplier_aliases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  supplier_label: text("supplier_label").notNull(),
  master_product_id: integer("master_product_id").references(
    () => masterProducts.id
  ),
  variant_id: integer("variant_id").references(() => productVariants.id),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// ─── Failed Orders ─────────────────────────────────────────────────────────

export const failedOrders = sqliteTable("failed_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopify_order_id: text("shopify_order_id").notNull(),
  order_number: integer("order_number").notNull(),
  shopify_payload: text("shopify_payload", { mode: "json" }).notNull(),
  error_reason: text("error_reason"),
  resolved_at: text("resolved_at"),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});
