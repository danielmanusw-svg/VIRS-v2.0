import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { collections, collectionItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/collections/[id]
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const collectionId = parseInt(id);

        const [collection] = await db
            .select()
            .from(collections)
            .where(eq(collections.id, collectionId))
            .limit(1);

        if (!collection) {
            return NextResponse.json({ error: "Collection not found" }, { status: 404 });
        }

        const items = await db
            .select()
            .from(collectionItems)
            .where(eq(collectionItems.collection_id, collectionId));

        return NextResponse.json({ ...collection, items });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to fetch collection" },
            { status: 500 }
        );
    }
}

// PUT /api/collections/[id] - Update details OR add/remove items
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const collectionId = parseInt(id);
        const body = await request.json();

        // 1. Update metadata if provided
        if (body.name !== undefined || body.description !== undefined) {
            await db
                .update(collections)
                .set({
                    name: body.name,
                    description: body.description,
                    updated_at: new Date().toISOString(),
                })
                .where(eq(collections.id, collectionId));
        }

        // 2. Manage items (add/remove)
        // Expect body.items to be the FULL new list of items, or specific add/remove actions
        // Simpler approach: if body.items provided, REPLACE all items (or smart diff)
        // Let's support "add_items" and "remove_items" arrays for atomic updates

        if (body.add_items && Array.isArray(body.add_items)) {
            for (const item of body.add_items) {
                // item: { item_type: 'variant' | 'master_product', item_id: number }
                // Check if exists to avoid duplicates
                const existing = await db.select().from(collectionItems).where(
                    and(
                        eq(collectionItems.collection_id, collectionId),
                        eq(collectionItems.item_type, item.item_type),
                        eq(collectionItems.item_id, item.item_id)
                    )
                ).limit(1);

                if (existing.length === 0) {
                    await db.insert(collectionItems).values({
                        collection_id: collectionId,
                        item_type: item.item_type,
                        item_id: item.item_id
                    });
                }
            }
        }

        if (body.remove_items && Array.isArray(body.remove_items)) {
            for (const item of body.remove_items) {
                await db.delete(collectionItems).where(
                    and(
                        eq(collectionItems.collection_id, collectionId),
                        eq(collectionItems.item_type, item.item_type),
                        eq(collectionItems.item_id, item.item_id)
                    )
                );
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to update collection" },
            { status: 500 }
        );
    }
}

// DELETE /api/collections/[id]
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const collectionId = parseInt(id);

        await db.delete(collections).where(eq(collections.id, collectionId));

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to delete collection" },
            { status: 500 }
        );
    }
}
