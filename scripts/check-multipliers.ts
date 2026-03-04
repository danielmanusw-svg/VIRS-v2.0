import { db } from "../src/db";
import { productVariants } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
    const variants = await db.select().from(productVariants);
    console.log(`Found ${variants.length} total variants.`);

    let updatedCount = 0;
    for (const v of variants) {
        const t = v.title.toLowerCase();
        let newMulti = v.bundle_multiplier;

        // Cartridges logic
        if (t.includes("3 month") || t.includes("3-month") || t.includes("3 months") || t.includes("3-months")) {
            newMulti = 1;
        } else if (t.includes("6 month") || t.includes("6-month") || t.includes("6 months") || t.includes("6-months")) {
            newMulti = 2;
        } else if (t.includes("1 year") || t.includes("1-year") || t.includes("1 yr")) {
            newMulti = 4;
        }

        if (newMulti !== v.bundle_multiplier) {
            console.log(`[Variant ${v.id}] "${v.title}" / "${v.sku}" -> updating multiplier ${v.bundle_multiplier} to ${newMulti}`);
            await db.update(productVariants).set({ bundle_multiplier: newMulti }).where(eq(productVariants.id, v.id));
            updatedCount++;
        }
    }
    console.log(`Done. Updated ${updatedCount} variants.`);
    process.exit(0);
}

main().catch(console.error);
