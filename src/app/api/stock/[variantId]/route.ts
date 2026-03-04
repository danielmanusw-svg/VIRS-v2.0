import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stock, stockAdjustmentLog, productVariants, masterProducts } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const { variantId } = await params;
    const variantIdNum = parseInt(variantId, 10);
    const body = await request.json();
    const { quantity, adjustment_type, supplier_cost, bundle_multiplier } = body;

    // Fetch the variant to check for master product link
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, variantIdNum))
      .limit(1);

    if (!variant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    // Update supplier_cost if provided
    if (supplier_cost !== undefined) {
      await db
        .update(productVariants)
        .set({
          supplier_cost: parseFloat(supplier_cost),
          updated_at: new Date().toISOString(),
        })
        .where(eq(productVariants.id, variantIdNum));
    }

    // Update bundle_multiplier if provided
    if (bundle_multiplier !== undefined) {
      await db
        .update(productVariants)
        .set({
          bundle_multiplier: Math.max(1, parseInt(bundle_multiplier, 10)),
          updated_at: new Date().toISOString(),
        })
        .where(eq(productVariants.id, variantIdNum));
    }

    // Update stock if quantity provided
    if (quantity !== undefined) {
      const newQty = Math.max(0, parseInt(quantity, 10));
      const type = adjustment_type || "manual_set";

      if (variant.master_product_id) {
        // Redirect to master product stock
        const [mp] = await db
          .select()
          .from(masterProducts)
          .where(eq(masterProducts.id, variant.master_product_id))
          .limit(1);

        const oldQty = mp ? mp.stock_quantity : 0;

        await db
          .update(masterProducts)
          .set({
            stock_quantity: newQty,
            updated_at: new Date().toISOString(),
          })
          .where(eq(masterProducts.id, variant.master_product_id));

        await db.insert(stockAdjustmentLog).values({
          variant_id: variantIdNum,
          adjustment_type: type,
          quantity_before: oldQty,
          quantity_after: newQty,
          reason: `Manual ${type} via dashboard (master product #${variant.master_product_id})`,
        });
      } else {
        // Update variant stock directly
        const currentStock = await db
          .select()
          .from(stock)
          .where(eq(stock.variant_id, variantIdNum))
          .limit(1);

        const oldQty = currentStock.length > 0 ? currentStock[0].quantity : 0;

        if (currentStock.length === 0) {
          await db.insert(stock).values({
            variant_id: variantIdNum,
            quantity: newQty,
          });
        } else {
          await db
            .update(stock)
            .set({
              quantity: newQty,
              updated_at: new Date().toISOString(),
            })
            .where(eq(stock.variant_id, variantIdNum));
        }

        await db.insert(stockAdjustmentLog).values({
          variant_id: variantIdNum,
          adjustment_type: type,
          quantity_before: oldQty,
          quantity_after: newQty,
          reason: `Manual ${type} via dashboard`,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
