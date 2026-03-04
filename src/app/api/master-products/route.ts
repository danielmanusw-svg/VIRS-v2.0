import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterProducts, productVariants, stock } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

// GET: list all master products with linked variants
export async function GET() {
  try {
    const allMasters = await db.select().from(masterProducts);
    const allVariants = await db.select().from(productVariants);

    const result = allMasters.map((mp) => ({
      ...mp,
      variants: allVariants
        .filter((v) => v.master_product_id === mp.id)
        .map((v) => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          shopify_variant_id: v.shopify_variant_id,
        })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch master products";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: create a master product and link variants
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, variant_ids } = body as {
      name: string;
      variant_ids: number[];
    };

    if (!name || !variant_ids || variant_ids.length === 0) {
      return NextResponse.json(
        { error: "name and variant_ids (non-empty) are required" },
        { status: 400 }
      );
    }

    // Calculate initial stock from variants
    const variantsWithStock = await db
      .select({
        stock: stock.quantity
      })
      .from(productVariants)
      .leftJoin(stock, eq(stock.variant_id, productVariants.id))
      .where(sql`${productVariants.id} IN ${variant_ids}`);

    const initialStock = variantsWithStock.reduce((sum, v) => sum + (v.stock || 0), 0);

    // Create master product
    const [mp] = await db
      .insert(masterProducts)
      .values({
        name,
        stock_quantity: initialStock, // Set initial stock
        is_manual_stock: false,      // Start as auto-summed (conceptually) - though once created it's technically independent unless we add logic to keep syncing. 
        // Plan says: "From then on, it acts as a independent pool". So strictly speaking, it's just an initial value.
        image_url: body.image_url
      })
      .returning();

    // Link variants
    for (const vid of variant_ids) {
      await db
        .update(productVariants)
        .set({
          master_product_id: mp.id,
          updated_at: new Date().toISOString(),
          // Note: We do NOT zero out variant stock. Variants keep their stock for reference? 
          // Realistically if stock is deducted from Master, variants stop being the source of truth for "Available to sell".
        })
        .where(eq(productVariants.id, vid));
    }

    return NextResponse.json({ master_product: mp, linked_variant_ids: variant_ids });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create master product";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
