import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterProducts, productVariants } from "@/db/schema";
import { eq } from "drizzle-orm";

// PUT /api/master-products/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const mpId = parseInt(id);
    const body = await request.json();

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updates.name = body.name;
    if (body.image_url !== undefined) updates.image_url = body.image_url;

    // Manual stock update
    if (body.stock_quantity !== undefined) {
      updates.stock_quantity = body.stock_quantity;
      updates.is_manual_stock = true; // Flag as manually set
    }

    // Allow resetting the manual flag (e.g. "Recalculate from variants")
    if (body.is_manual_stock !== undefined) {
      updates.is_manual_stock = body.is_manual_stock;
    }

    const [updatedMp] = await db
      .update(masterProducts)
      .set(updates)
      .where(eq(masterProducts.id, mpId))
      .returning();

    return NextResponse.json(updatedMp);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update master product" },
      { status: 500 }
    );
  }
}

// DELETE /api/master-products/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const mpId = parseInt(id);

    // Unlink variants first
    await db
      .update(productVariants)
      .set({ master_product_id: null })
      .where(eq(productVariants.master_product_id, mpId));

    // Delete master product
    await db.delete(masterProducts).where(eq(masterProducts.id, mpId));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete master product" },
      { status: 500 }
    );
  }
}
