import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { productMarketShipping, markets } from "@/db/schema";
import { and, eq } from "drizzle-orm";

// POST body: { costs: { EU: 5.00, UK: 3.50, US: 8.00, AU: 10.00 } }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const { variantId } = await params;
    const variantIdNum = parseInt(variantId, 10);
    const body = await request.json();
    const { costs } = body as { costs: Record<string, number> };

    const allMarkets = await db.select().from(markets);
    const marketMap = new Map(allMarkets.map((m) => [m.code, m.id]));

    for (const [marketCode, cost] of Object.entries(costs)) {
      const marketId = marketMap.get(marketCode);
      if (!marketId) continue;

      const existing = await db
        .select()
        .from(productMarketShipping)
        .where(
          and(
            eq(productMarketShipping.variant_id, variantIdNum),
            eq(productMarketShipping.market_id, marketId)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(productMarketShipping).values({
          variant_id: variantIdNum,
          market_id: marketId,
          shipping_cost: cost,
        });
      } else {
        await db
          .update(productMarketShipping)
          .set({ shipping_cost: cost })
          .where(eq(productMarketShipping.id, existing[0].id));
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update shipping costs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
