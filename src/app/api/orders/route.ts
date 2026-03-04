import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, markets } from "@/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const flaggedOnly = searchParams.get("flagged") === "true";
    const limit = parseInt(searchParams.get("limit") ?? "100", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Build conditions
    const conditions = [];

    if (flaggedOnly) {
      conditions.push(eq(orders.is_flagged, true));
    }
    if (from) {
      conditions.push(gte(orders.shopify_created_at, from));
    }
    if (to) {
      // Add end-of-day to "to" date
      const toEnd = to.includes("T") ? to : `${to}T23:59:59.999Z`;
      conditions.push(lte(orders.shopify_created_at, toEnd));
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(whereClause);

    // Get paginated data
    const result = await db
      .select({
        id: orders.id,
        shopify_order_id: orders.shopify_order_id,
        order_number: orders.order_number,
        market_id: orders.market_id,
        shipping_country_code: orders.shipping_country_code,
        is_flagged: orders.is_flagged,
        shipping_cost_override: orders.shipping_cost_override,
        financial_status: orders.financial_status,
        fulfillment_status: orders.fulfillment_status,
        shopify_created_at: orders.shopify_created_at,
        market_code: markets.code,
      })
      .from(orders)
      .leftJoin(markets, eq(orders.market_id, markets.id))
      .where(whereClause)
      .orderBy(desc(orders.order_number))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ data: result, total: count });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch orders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
