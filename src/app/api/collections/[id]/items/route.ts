import { NextResponse } from "next/server";
import { db } from "@/db";
import { collectionItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const collectionId = parseInt(resolvedParams.id);
        const body = await req.json();
        const { items } = body as { items: { type: 'variant' | 'master_product', id: number }[] };

        if (!items || !Array.isArray(items)) {
            return NextResponse.json({ error: "Invalid items" }, { status: 400 });
        }

        // Insert items, ignoring duplicates (logic handled by not erroring, or checking first)
        // Simple approach: check existence then insert. 
        // Or just insert and ignore conflicts if unique constraint exists. 
        // Schema doesn't strictly adhere to unique constraint on (collection_id, item_type, item_id) unless added.
        // Let's check first to avoid duplicates.

        let addedCount = 0;

        for (const item of items) {
            const existing = await db.select().from(collectionItems).where(
                and(
                    eq(collectionItems.collection_id, collectionId),
                    eq(collectionItems.item_type, item.type),
                    eq(collectionItems.item_id, item.id)
                )
            ).limit(1);

            if (existing.length === 0) {
                await db.insert(collectionItems).values({
                    collection_id: collectionId,
                    item_type: item.type,
                    item_id: item.id,
                });
                addedCount++;
            }
        }

        return NextResponse.json({ success: true, added: addedCount });
    } catch (error) {
        console.error("Error adding to collection:", error);
        return NextResponse.json(
            { error: "Failed to add items" },
            { status: 500 }
        );
    }
}
