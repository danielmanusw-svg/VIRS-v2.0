import { db } from "../src/db";
import { collections } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
    const allCollections = await db.select().from(collections);
    const target = allCollections.find(c => c.name.toLowerCase().includes("no count"));

    if (target) {
        console.log(`Found collection: "${target.name}" (ID: ${target.id}). Deleting...`);
        await db.delete(collections).where(eq(collections.id, target.id));
        console.log("Successfully deleted the collection. Associated items will be cascade-deleted.");
    } else {
        console.log("Could not find any collection named 'no count'.");
    }
    process.exit(0);
}

main().catch(console.error);
