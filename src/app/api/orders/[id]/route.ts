import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";

// PATCH: update a flagged order's shipping cost override
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orderId = parseInt(id, 10);
    const body = await request.json();
    const { shipping_cost_override } = body;

    if (shipping_cost_override === undefined) {
      return NextResponse.json(
        { error: "shipping_cost_override is required" },
        { status: 400 }
      );
    }

    await db
      .update(orders)
      .set({
        shipping_cost_override: parseFloat(shipping_cost_override),
        is_flagged: false,
        updated_at: new Date().toISOString(),
      })
      .where(eq(orders.id, orderId));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
