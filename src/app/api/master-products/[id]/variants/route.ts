import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterProducts, productVariants } from "@/db/schema";
import { eq } from "drizzle-orm";

// POST: link variants to this master product
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const mpId = parseInt(id, 10);
    const body = await request.json();
    const { variant_ids } = body as { variant_ids: number[] };

    // Verify master product exists
    const [mp] = await db
      .select()
      .from(masterProducts)
      .where(eq(masterProducts.id, mpId))
      .limit(1);

    if (!mp) {
      return NextResponse.json(
        { error: "Master product not found" },
        { status: 404 }
      );
    }

    for (const vid of variant_ids) {
      await db
        .update(productVariants)
        .set({
          master_product_id: mpId,
          updated_at: new Date().toISOString(),
        })
        .where(eq(productVariants.id, vid));
    }

    return NextResponse.json({ success: true, linked: variant_ids.length });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to link variants";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: unlink variants from this master product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const mpId = parseInt(id, 10);
    const body = await request.json();
    const { variant_ids } = body as { variant_ids: number[] };

    for (const vid of variant_ids) {
      await db
        .update(productVariants)
        .set({
          master_product_id: null,
          updated_at: new Date().toISOString(),
        })
        .where(eq(productVariants.id, vid));
    }

    return NextResponse.json({ success: true, unlinked: variant_ids.length });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to unlink variants";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
