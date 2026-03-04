import { db } from "../src/db";
import { supplierAliases, productVariants } from "../src/db/schema";
import { like, or, eq } from "drizzle-orm";

async function main() {
    // 1. Get all variants that look like cartridges (month/year)
    const variants = await db.select().from(productVariants)
        .where(
            or(
                like(productVariants.title, "%Month%"),
                like(productVariants.title, "%month%"),
                like(productVariants.title, "%Year%"),
                like(productVariants.title, "%year%"),
                like(productVariants.sku, "%MNT%"),
                like(productVariants.sku, "%YR%")
            )
        );

    // 2. Get existing mappings to Plastic and Stainless Steel Cartridges
    const existingMappings = await db.select().from(supplierAliases).where(eq(supplierAliases.supplier_label, "Plastic and Stainless Steel Cartridges"));
    const mappedVariantIds = new Set(existingMappings.map(a => a.variant_id).filter(id => id !== null));

    // We also need to get mapped master_product_ids for completeness, but we can just check if the variant itself is already mapped to ANYTHING.

    let mappedCount = 0;
    for (const v of variants) {
        if (!mappedVariantIds.has(v.id)) {
            // Check if it's mapped to any other label by variant_id
            const existingOther = await db.select().from(supplierAliases).where(eq(supplierAliases.variant_id, v.id)).limit(1);
            if (existingOther.length === 0) {
                console.log(`[Variant ${v.id}] ${v.sku} - ${v.title} is NOT mapped. Mapping it now...`);
                await db.insert(supplierAliases).values({
                    supplier_label: "Plastic and Stainless Steel Cartridges",
                    master_product_id: null,
                    variant_id: v.id,
                });
                mappedCount++;
            } else {
                console.log(`[Variant ${v.id}] ${v.sku} - ${v.title} is already mapped to '${existingOther[0].supplier_label}'`);
            }
        }
    }
    console.log(`Done mapping ${mappedCount} missed cartridges.`);
    process.exit(0);
}

main().catch(console.error);
