import { db } from "@/db";
import {
  orders,
  orderLineItems,
  productVariants,
  stock,
  stockAdjustmentLog,
  failedOrders,
  masterProducts,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { buildMarketLookup } from "@/lib/markets";
import type { ShopifyOrder } from "@/lib/shopify/orders";

interface SyncResult {
  processed: number;
  created: number;
  updated: number;
  errors: string[];
}

interface ProcessOrdersOptions {
  skipStockAdjustments?: boolean;
  skipExistingUpdates?: boolean;
  skipIdempotencyCheck?: boolean;
}

/**
 * Fix existing NZ orders that were flagged before the NZ->AU mapping.
 * Unflags them and assigns the AU market.
 */
export async function fixNzOrders(): Promise<number> {
  const marketLookup = await buildMarketLookup();
  const auMarket = marketLookup.get("NZ"); // NZ resolves to AU market
  if (!auMarket) return 0;

  const flaggedNz = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.shipping_country_code, "NZ"),
        eq(orders.is_flagged, true)
      )
    );

  for (const order of flaggedNz) {
    await db
      .update(orders)
      .set({
        market_id: auMarket.marketId,
        is_flagged: false,
        updated_at: new Date().toISOString(),
      })
      .where(eq(orders.id, order.id));
  }

  return flaggedNz.length;
}

export async function processOrders(
  shopifyOrders: ShopifyOrder[],
  options: ProcessOrdersOptions = {}
): Promise<SyncResult> {
  const marketLookup = await buildMarketLookup();
  const result: SyncResult = {
    processed: 0,
    created: 0,
    updated: 0,
    errors: [],
  };

  // Process in batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < shopifyOrders.length; i += BATCH_SIZE) {
    const batch = shopifyOrders.slice(i, i + BATCH_SIZE);
    let existingIds = new Set<string>();

    if (options.skipExistingUpdates && batch.length > 0) {
      const batchIds = batch.map((so) => String(so.id));
      const existingRows = await db
        .select({ shopify_order_id: orders.shopify_order_id })
        .from(orders)
        .where(inArray(orders.shopify_order_id, batchIds));
      existingIds = new Set(existingRows.map((row) => row.shopify_order_id));
    }

    for (const so of batch) {
      try {
        if (options.skipExistingUpdates && existingIds.has(String(so.id))) {
          result.updated++;
          result.processed++;
          continue;
        }

        await processOneOrder(so, marketLookup, result, {
          ...options,
          skipIdempotencyCheck: options.skipExistingUpdates,
        });
        result.processed++;
      } catch (error) {
        const msg = `Order #${so.order_number} (${so.id}): ${error instanceof Error ? error.message : "Unknown error"
          }`;
        result.errors.push(msg);

        // Capture failed order for later review/retry
        try {
          await db.insert(failedOrders).values({
            shopify_order_id: String(so.id),
            order_number: so.order_number,
            shopify_payload: so,
            error_reason:
              error instanceof Error ? error.message : "Unknown error",
          });
        } catch {
          // Don't let failed_orders insert failure break the sync loop
        }
      }
    }
  }

  return result;
}

export async function processOneOrder(
  so: ShopifyOrder,
  marketLookup: Map<string, { marketId: number; marketCode: string }>,
  result: SyncResult,
  options: ProcessOrdersOptions = {}
) {
  const shopifyId = String(so.id);

  if (!options.skipIdempotencyCheck) {
    // Check if order already exists (idempotency)
    const existing = await db
      .select()
      .from(orders)
      .where(eq(orders.shopify_order_id, shopifyId))
      .limit(1);

    if (existing.length > 0) {
      if (!options.skipExistingUpdates) {
        // Already exists: only update status fields, never re-deduct stock.
        await db
          .update(orders)
          .set({
            financial_status: so.financial_status,
            fulfillment_status: so.fulfillment_status,
            cancelled_at: so.cancelled_at ?? null,
            updated_at: new Date().toISOString(),
          })
          .where(eq(orders.shopify_order_id, shopifyId));
      }
      result.updated++;
      return;
    }
  }

  // New order: determine market
  const countryCode = so.shipping_address?.country_code ?? null;
  const marketInfo = countryCode ? marketLookup.get(countryCode) ?? null : null;
  const isFlagged = countryCode !== null && marketInfo === null;

  // Check if order is fulfilled by ShipBob:
  // 1. Check order-level fulfillments array for "shipbob" in name or service
  // 2. Fall back to checking line-item fulfillment_service
  const hasShipBobFulfillment = (so.fulfillments ?? []).some(
    (f) =>
      f.name?.toLowerCase().includes("shipbob") ||
      f.service?.toLowerCase().includes("shipbob")
  );
  const allLineItemsShipBob =
    so.line_items.length > 0 &&
    so.line_items.every(
      (li) => li.fulfillment_service?.toLowerCase() === "shipbob"
    );
  const isShipBobFulfilled = hasShipBobFulfillment || allLineItemsShipBob;

  // Insert the order
  const [insertedOrder] = await db
    .insert(orders)
    .values({
      shopify_order_id: shopifyId,
      order_number: so.order_number,
      market_id: marketInfo?.marketId ?? null,
      shipping_country_code: countryCode,
      is_flagged: isFlagged,
      shipping_cost_override: null,
      financial_status: so.financial_status,
      fulfillment_status: so.fulfillment_status,
      shopify_created_at: so.created_at,
      is_shipbob_fulfilled: isShipBobFulfilled,
      cancelled_at: so.cancelled_at ?? null,
    })
    .returning({ id: orders.id });

  // Process line items
  for (const li of so.line_items) {
    const variantShopifyId = li.variant_id ? String(li.variant_id) : null;

    // Find local variant
    let localVariantId: number | null = null;
    let supplierCostSnapshot = 0;

    let bundleMultiplier = 1;
    let masterProductId: number | null = null;

    if (variantShopifyId) {
      const variant = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.shopify_variant_id, variantShopifyId))
        .limit(1);

      if (variant.length > 0) {
        localVariantId = variant[0].id;
        supplierCostSnapshot = variant[0].supplier_cost;
        bundleMultiplier = variant[0].bundle_multiplier;
        masterProductId = variant[0].master_product_id;
      }
    }

    // Calculate total discount including allocations
    const discountAllocationsTotal = li.discount_allocations?.reduce((sum, d) => sum + parseFloat(d.amount), 0) || 0;
    const totalDiscount = parseFloat(li.total_discount || "0") + discountAllocationsTotal;

    // Insert line item with cost snapshot and Shopify price
    await db.insert(orderLineItems).values({
      order_id: insertedOrder.id,
      variant_id: localVariantId,
      shopify_line_item_id: String(li.id),
      title: li.title,
      sku: li.sku,
      quantity: li.quantity,
      supplier_cost_snapshot: supplierCostSnapshot,
      line_price: Math.max(0, (parseFloat(li.price) * li.quantity - totalDiscount) / (li.quantity || 1)),
    });

    // Deduct stock (only for known variants), applying bundle multiplier
    if (localVariantId && !options.skipStockAdjustments) {
      await deductStock(
        localVariantId,
        li.quantity * bundleMultiplier,
        masterProductId
      );
    }
  }

  result.created++;
}

async function deductStock(
  variantId: number,
  qty: number,
  masterProductId: number | null = null
) {
  if (masterProductId) {
    // Deduct from master product stock
    const [mp] = await db
      .select()
      .from(masterProducts)
      .where(eq(masterProducts.id, masterProductId))
      .limit(1);

    if (!mp) return;

    const oldQty = mp.stock_quantity;
    const newQty = Math.max(0, oldQty - qty);

    await db
      .update(masterProducts)
      .set({
        stock_quantity: newQty,
        updated_at: new Date().toISOString(),
      })
      .where(eq(masterProducts.id, masterProductId));

    const reason =
      newQty === 0 && oldQty - qty < 0
        ? `Sale deduction on master product (would go negative: ${oldQty} - ${qty} = ${oldQty - qty}, clamped to 0)`
        : `Sale deduction from order sync (master product #${masterProductId})`;

    await db.insert(stockAdjustmentLog).values({
      variant_id: variantId,
      adjustment_type: "sale",
      quantity_before: oldQty,
      quantity_after: newQty,
      reason,
    });
  } else {
    // Deduct from variant stock
    const currentStock = await db
      .select()
      .from(stock)
      .where(eq(stock.variant_id, variantId))
      .limit(1);

    if (currentStock.length === 0) return;

    const oldQty = currentStock[0].quantity;
    const newQty = Math.max(0, oldQty - qty);

    await db
      .update(stock)
      .set({
        quantity: newQty,
        updated_at: new Date().toISOString(),
      })
      .where(eq(stock.variant_id, variantId));

    const reason =
      newQty === 0 && oldQty - qty < 0
        ? `Sale deduction (would go negative: ${oldQty} - ${qty} = ${oldQty - qty}, clamped to 0)`
        : "Sale deduction from order sync";

    await db.insert(stockAdjustmentLog).values({
      variant_id: variantId,
      adjustment_type: "sale",
      quantity_before: oldQty,
      quantity_after: newQty,
      reason,
    });
  }
}
