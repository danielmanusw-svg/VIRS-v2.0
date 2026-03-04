import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { supplierAliases } from "@/db/schema";
import { eq } from "drizzle-orm";

// PATCH /api/supplier-aliases/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const aliasId = parseInt(id);
    const body = await request.json();

    const { supplier_label, master_product_id, variant_id } = body as {
      supplier_label?: string;
      master_product_id?: number | null;
      variant_id?: number | null;
    };

    if (master_product_id !== undefined && variant_id !== undefined && master_product_id !== null && variant_id !== null) {
      return NextResponse.json(
        { error: "Only one of master_product_id or variant_id may be set" },
        { status: 400 }
      );
    }

    const updates: Partial<typeof supplierAliases.$inferInsert> = {};
    if (supplier_label !== undefined) updates.supplier_label = supplier_label.trim();
    if (master_product_id !== undefined) {
      updates.master_product_id = master_product_id;
      if (master_product_id !== null) updates.variant_id = null;
    }
    if (variant_id !== undefined) {
      updates.variant_id = variant_id;
      if (variant_id !== null) updates.master_product_id = null;
    }

    const [updated] = await db
      .update(supplierAliases)
      .set(updates)
      .where(eq(supplierAliases.id, aliasId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Alias not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update supplier alias";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/supplier-aliases/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const aliasId = parseInt(id);

    await db.delete(supplierAliases).where(eq(supplierAliases.id, aliasId));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete supplier alias";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
