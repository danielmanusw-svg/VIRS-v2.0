import { db } from "@/db";
import {
  orders,
  orderLineItems,
  markets,
  collections,
  collectionItems,
} from "@/db/schema";
import { and, eq, gte, lte, or, sql, inArray } from "drizzle-orm";


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
  commissionable_product_count: number;
  order_commission_gbp: number;
  product_commission_gbp: number;
  total_commission_gbp: number;
}

export async function calculateInvoice(
  startOrderNumber: number,
  endOrderNumber: number
): Promise<InvoiceCalculation> {
  // 1. Fetch ALL order numbers in the range to detect genuine missing gaps
  const allOrdersInRange = await db
    .select({ order_number: orders.order_number })
    .from(orders)
    .where(
      and(
        gte(orders.order_number, startOrderNumber),
        lte(orders.order_number, endOrderNumber)
      )
    );

  const existingNumbers = new Set(allOrdersInRange.map((o) => o.order_number));
  const missingOrderNumbers: number[] = [];
  for (let n = startOrderNumber; n <= endOrderNumber; n++) {
    if (!existingNumbers.has(n)) {
      missingOrderNumbers.push(n);
    }
  }

  // 2. Fetch valid orders for the invoice (excluding cancelled and ShipBob orders)
  const ordersInRange = await db
    .select()
    .from(orders)
    .where(
      and(
        gte(orders.order_number, startOrderNumber),
        lte(orders.order_number, endOrderNumber),
        // Exclude cancelled orders
        sql`${orders.cancelled_at} IS NULL`,
        // Filter out ShipBob fulfilled orders
        or(
          eq(orders.is_shipbob_fulfilled, false),
          sql`${orders.is_shipbob_fulfilled} IS NULL`
        )
      )
    );

  // 3. Build market lookup (id → code)
  const allMarkets = await db.select().from(markets);
  const marketCodeById = new Map(allMarkets.map((m) => [m.id, m.code]));

  // 4. Build "Valid Collections" set (variant IDs to include in invoices)
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

  // 4. Process each order's line items
  //    Per-line costs are 0 — pricing happens at the set level in the aggregator
  const lines: InvoiceLineResult[] = [];

  for (const order of ordersInRange) {
    const lineItems = await db
      .select()
      .from(orderLineItems)
      .where(eq(orderLineItems.order_id, order.id));

    const marketCode = order.market_id
      ? marketCodeById.get(order.market_id) ?? null
      : null;

    for (const li of lineItems) {
      // Skip variants that DO NOT belong to any valid collection
      if (li.variant_id === null || !validVariantIds.has(li.variant_id)) {
        continue;
      }

      lines.push({
        order_id: order.id,
        order_number: order.order_number,
        variant_id: li.variant_id,
        sku: li.sku,
        title: li.title,
        quantity: li.quantity,
        market_code: marketCode,
        supplier_cost: 0,
        shipping_cost: 0,
        line_total: 0,
        line_price: li.line_price ?? 0,
      });
    }
  }

  const distinctOrderCount = new Set(lines.map((l) => l.order_number)).size;

  const productCommCount = lines.filter(l => l.line_price > 0).reduce((sum, l) => sum + l.quantity, 0);

  return {
    lines,
    total_supplier_cost: 0,
    total_shipping_cost: 0,
    grand_total: 0,
    missing_order_numbers: missingOrderNumbers,
    distinct_order_count: distinctOrderCount,
    commissionable_product_count: productCommCount,
    order_commission_gbp: distinctOrderCount * 0.8,
    product_commission_gbp: productCommCount * 0.8,
    total_commission_gbp: (distinctOrderCount * 0.8) + (productCommCount * 0.8),
  };
}
