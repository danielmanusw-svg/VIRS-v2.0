import { db } from "@/db";
import {
  orders,
  orderLineItems,
  productVariants,
  productMarketShipping,
  markets,
  collections,
  collectionItems,
} from "@/db/schema";
import { and, between, eq, gte, lte, or, sql, inArray } from "drizzle-orm";

export interface MarketOverrides {
  EU?: number;
  UK?: number;
  US?: number;
  AU?: number;
}

export interface InvoiceLineResult {
  order_id: number;
  order_number: number;
  variant_id: number | null;
  sku: string | null;
  title: string;
  quantity: number;
  market_code: string | null;
  supplier_cost: number;
  shipping_cost: number;
  line_total: number;
  line_price: number;
}

export interface InvoiceCalculation {
  lines: InvoiceLineResult[];
  total_supplier_cost: number;
  total_shipping_cost: number;
  grand_total: number;
  missing_order_numbers: number[];
  distinct_order_count: number;
  total_commission_gbp: number;
}

export async function calculateInvoice(
  startOrderNumber: number,
  endOrderNumber: number,
  overrides?: MarketOverrides
): Promise<InvoiceCalculation> {
  // 1. Fetch all orders in the range
  const ordersInRange = await db
    .select()
    .from(orders)
    .where(
      and(
        gte(orders.order_number, startOrderNumber),
        lte(orders.order_number, endOrderNumber),
        // Filter out ShipBob fulfilled orders (or treat null as false)
        // Since we defined it as boolean in schema, we can check for false/null.
        // But better: explicitly exclude true.
        // However, existing rows are null.
        // So we want: is_shipbob_fulfilled IS NOT TRUE
        or(
          eq(orders.is_shipbob_fulfilled, false),
          sql`${orders.is_shipbob_fulfilled} IS NULL`
        )
      )
    );

  // 2. Detect missing order numbers (gaps)
  const existingNumbers = new Set(ordersInRange.map((o) => o.order_number));
  const missingOrderNumbers: number[] = [];
  for (let n = startOrderNumber; n <= endOrderNumber; n++) {
    if (!existingNumbers.has(n)) {
      missingOrderNumbers.push(n);
    }
  }

  // 3. Build market lookup (id → code)
  const allMarkets = await db.select().from(markets);
  const marketCodeById = new Map(allMarkets.map((m) => [m.id, m.code]));

  // 4. Build shipping cost lookup (variant_id + market_id → cost)
  const allShipping = await db.select().from(productMarketShipping);
  const shippingLookup = new Map<string, number>();
  for (const s of allShipping) {
    shippingLookup.set(`${s.variant_id}_${s.market_id}`, s.shipping_cost);
  }

  // 5. Build "Valid Collections" set (variant IDs to include in invoices)
  // Skip "No Count"
  const validCollections = await db
    .select()
    .from(collections)
    .where(sql`${collections.name} != 'No Count'`);

  const validVariantIds = new Set<number>();
  if (validCollections.length > 0) {
    const validCollectionIds = validCollections.map(c => c.id);
    const validItems = await db
      .select()
      .from(collectionItems)
      .where(
        and(
          inArray(collectionItems.collection_id, validCollectionIds),
          eq(collectionItems.item_type, "variant")
        )
      );
    for (const item of validItems) {
      validVariantIds.add(item.item_id);
    }
  }

  // 6. Process each order's line items
  const lines: InvoiceLineResult[] = [];
  let totalSupplierCost = 0;
  let totalShippingCost = 0;

  for (const order of ordersInRange) {
    const lineItems = await db
      .select()
      .from(orderLineItems)
      .where(eq(orderLineItems.order_id, order.id));

    const marketCode = order.market_id
      ? marketCodeById.get(order.market_id) ?? null
      : null;

    // Count total line items for distributing flat override
    const totalLineItemQty = lineItems.reduce((sum, li) => sum + li.quantity, 0);

    for (const li of lineItems) {
      // Skip variants that DO NOT belong to any valid collection
      if (li.variant_id === null || !validVariantIds.has(li.variant_id)) {
        continue;
      }

      const supplierCost = li.supplier_cost_snapshot * li.quantity;

      // Resolve shipping cost (priority order per roadmap):
      // 1. Per-invoice market override
      // 2. shipping_cost_override on flagged order (distributed evenly)
      // 3. product_market_shipping (per-variant, per-market)
      // 4. Falls back to £0
      let shippingPerUnit = 0;

      if (overrides && marketCode && overrides[marketCode as keyof MarketOverrides] !== undefined) {
        // Priority 1: per-invoice market override
        shippingPerUnit = overrides[marketCode as keyof MarketOverrides]!;
      } else if (order.shipping_cost_override !== null) {
        // Priority 2: flat per-order override, distributed across line items
        shippingPerUnit =
          totalLineItemQty > 0
            ? order.shipping_cost_override / totalLineItemQty
            : 0;
      } else if (li.variant_id && order.market_id) {
        // Priority 3: per-variant, per-market
        const key = `${li.variant_id}_${order.market_id}`;
        shippingPerUnit = shippingLookup.get(key) ?? 0;
      }
      // Priority 4: £0 (default)

      const shippingCost = shippingPerUnit * li.quantity;
      const lineTotal = supplierCost + shippingCost;

      lines.push({
        order_id: order.id,
        order_number: order.order_number,
        variant_id: li.variant_id,
        sku: li.sku,
        title: li.title,
        quantity: li.quantity,
        market_code: marketCode,
        supplier_cost: supplierCost,
        shipping_cost: shippingCost,
        line_total: lineTotal,
        line_price: li.line_price ?? 0,
      });

      totalSupplierCost += supplierCost;
      totalShippingCost += shippingCost;
    }
  }

  const distinctOrderCount = new Set(lines.map((l) => l.order_number)).size;

  return {
    lines,
    total_supplier_cost: totalSupplierCost,
    total_shipping_cost: totalShippingCost,
    grand_total: totalSupplierCost + totalShippingCost,
    missing_order_numbers: missingOrderNumbers,
    distinct_order_count: distinctOrderCount,
    total_commission_gbp: distinctOrderCount * 0.8,
  };
}
