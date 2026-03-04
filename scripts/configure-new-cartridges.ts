import { db } from "../src/db";
import { productVariants, supplierAliases } from "../src/db/schema";
import { inArray, eq } from "drizzle-orm";

async function main() {
    const targetSkus = ["FIL003CLR", "FIL003CLR6MNT", "FIL003CLR1YR"];
    const variants = await db.select().from(productVariants).where(inArray(productVariants.sku, targetSkus));

    for (const v of variants) {
        let expectedMulti = 1;
        if (v.sku === "FIL003CLR6MNT") expectedMulti = 2;
        if (v.sku === "FIL003CLR1YR") expectedMulti = 4;

        if (v.bundle_multiplier !== expectedMulti) {
            console.log(`[Variant] SKU ${v.sku} updating multiplier: ${v.bundle_multiplier} -> ${expectedMulti}`);
            await db.update(productVariants)
                .set({ bundle_multiplier: expectedMulti })
                .where(eq(productVariants.id, v.id));
        }

        const mapping = await db.select()
            .from(supplierAliases)
            .where(eq(supplierAliases.variant_id, v.id))
            .limit(1);

        if (mapping.length === 0) {
            console.log(`[Variant] SKU ${v.sku} mapping to 'Plastic and Stainless Steel Cartridges'`);
            await db.insert(supplierAliases).values({
                supplier_label: "Plastic and Stainless Steel Cartridges",
                master_product_id: null,
                variant_id: v.id,
            });
        } else if (mapping[0].supplier_label !== "Plastic and Stainless Steel Cartridges") {
            console.log(`[Variant] SKU ${v.sku} is currently mapped to '${mapping[0].supplier_label}', fixing mapping...`);
            await db.update(supplierAliases)
                .set({ supplier_label: "Plastic and Stainless Steel Cartridges" })
                .where(eq(supplierAliases.id, mapping[0].id));
        } else {
            console.log(`[Variant] SKU ${v.sku} is perfectly mapped and multiplier is ${expectedMulti}`);
        }
    }

    // Quick log of any missing SKUs from the DB
    const foundSkus = variants.map(v => v.sku);
    for (const sku of targetSkus) {
        if (!foundSkus.includes(sku)) {
            console.warn(`[WARNING] SKU ${sku} was NOT found in the local database. Ensure inventory sync has run.`);
        }
    }

    process.exit(0);
}

main().catch(console.error);
