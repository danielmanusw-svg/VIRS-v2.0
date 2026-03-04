import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { supplierAliases, masterProducts, productVariants } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

// GET: list all supplier aliases with resolved names
export async function GET() {
  try {
    const aliases = await db.select().from(supplierAliases);

    const mpIds = [...new Set(aliases.map((a) => a.master_product_id).filter((id): id is number => id !== null))];
    const variantIds = [...new Set(aliases.map((a) => a.variant_id).filter((id): id is number => id !== null))];

    const mpMap = new Map<number, string>();
    if (mpIds.length > 0) {
      const mps = await db
        .select({ id: masterProducts.id, name: masterProducts.name })
        .from(masterProducts)
        .where(inArray(masterProducts.id, mpIds));
      for (const mp of mps) mpMap.set(mp.id, mp.name);
    }

    const variantMap = new Map<number, { title: string; sku: string | null; product_id: number; bundle_multiplier: number }>();
    if (variantIds.length > 0) {
      const variants = await db
        .select({
          id: productVariants.id,
          title: productVariants.title,
          sku: productVariants.sku,
          product_id: productVariants.product_id,
          bundle_multiplier: productVariants.bundle_multiplier,
        })
        .from(productVariants)
        .where(inArray(productVariants.id, variantIds));
      for (const v of variants) variantMap.set(v.id, { title: v.title, sku: v.sku, product_id: v.product_id, bundle_multiplier: v.bundle_multiplier });
    }

    const result = aliases.map((a) => ({
      id: a.id,
      supplier_label: a.supplier_label,
      master_product_id: a.master_product_id,
      master_product_name: a.master_product_id ? (mpMap.get(a.master_product_id) ?? null) : null,
      variant_id: a.variant_id,
      variant_title: a.variant_id ? (variantMap.get(a.variant_id)?.title ?? null) : null,
      variant_sku: a.variant_id ? (variantMap.get(a.variant_id)?.sku ?? null) : null,
      bundle_multiplier: a.variant_id ? (variantMap.get(a.variant_id)?.bundle_multiplier ?? 1) : 1,
      created_at: a.created_at,
    }));

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch supplier aliases";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: create supplier alias(es) — supports single or bulk via variant_ids array
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supplier_label, master_product_id, variant_id, variant_ids } = body as {
      supplier_label: string;
      master_product_id?: number | null;
      variant_id?: number | null;
      variant_ids?: number[];
    };

    if (!supplier_label?.trim()) {
      return NextResponse.json({ error: "supplier_label is required" }, { status: 400 });
    }

    // Bulk creation: multiple variant_ids for grouped mappings (e.g. "All Adapters")
    if (variant_ids && variant_ids.length > 0) {
      const values = variant_ids.map((vid) => ({
        supplier_label: supplier_label.trim(),
        master_product_id: null,
        variant_id: vid,
      }));
      const created = await db.insert(supplierAliases).values(values).returning();
      return NextResponse.json(created, { status: 201 });
    }

    // Single creation
    if (!master_product_id && !variant_id) {
      return NextResponse.json(
        { error: "Either master_product_id or variant_id is required" },
        { status: 400 }
      );
    }
    if (master_product_id && variant_id) {
      return NextResponse.json(
        { error: "Only one of master_product_id or variant_id may be set" },
        { status: 400 }
      );
    }

    const [alias] = await db
      .insert(supplierAliases)
      .values({
        supplier_label: supplier_label.trim(),
        master_product_id: master_product_id ?? null,
        variant_id: variant_id ?? null,
      })
      .returning();

    return NextResponse.json(alias, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create supplier alias";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: delete all aliases with a given label (query param ?label=...)
export async function DELETE(request: NextRequest) {
  try {
    const label = request.nextUrl.searchParams.get("label");
    if (!label) {
      return NextResponse.json({ error: "label query parameter is required" }, { status: 400 });
    }
    await db.delete(supplierAliases).where(eq(supplierAliases.supplier_label, label));
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete aliases";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
