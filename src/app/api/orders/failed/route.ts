import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { failedOrders } from "@/db/schema";
import { eq, isNull, desc } from "drizzle-orm";
import { processOneOrder } from "@/lib/sync/orderSync";
import { buildMarketLookup } from "@/lib/markets";
import type { ShopifyOrder } from "@/lib/shopify/orders";

// GET: list failed orders (default: unresolved only)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get("all") === "true";

    let query = db
      .select()
      .from(failedOrders)
      .orderBy(desc(failedOrders.created_at))
      .$dynamic();

    if (!showAll) {
      query = query.where(isNull(failedOrders.resolved_at));
    }

    const result = await query;
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch failed orders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: retry a failed order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body as { id: number };

    const [failedOrder] = await db
      .select()
      .from(failedOrders)
      .where(eq(failedOrders.id, id))
      .limit(1);

    if (!failedOrder) {
      return NextResponse.json(
        { error: "Failed order not found" },
        { status: 404 }
      );
    }

    if (failedOrder.resolved_at) {
      return NextResponse.json(
        { error: "This failed order has already been resolved" },
        { status: 400 }
      );
    }

    const marketLookup = await buildMarketLookup();
    const shopifyOrder = failedOrder.shopify_payload as ShopifyOrder;
    const result = { processed: 0, created: 0, updated: 0, errors: [] as string[] };

    await processOneOrder(shopifyOrder, marketLookup, result);

    // Mark as resolved
    await db
      .update(failedOrders)
      .set({ resolved_at: new Date().toISOString() })
      .where(eq(failedOrders.id, id));

    return NextResponse.json({
      success: true,
      message: `Order #${failedOrder.order_number} retried successfully`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Retry failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH: dismiss a failed order
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body as { id: number };

    const [failedOrder] = await db
      .select()
      .from(failedOrders)
      .where(eq(failedOrders.id, id))
      .limit(1);

    if (!failedOrder) {
      return NextResponse.json(
        { error: "Failed order not found" },
        { status: 404 }
      );
    }

    await db
      .update(failedOrders)
      .set({ resolved_at: new Date().toISOString() })
      .where(eq(failedOrders.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to dismiss";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
