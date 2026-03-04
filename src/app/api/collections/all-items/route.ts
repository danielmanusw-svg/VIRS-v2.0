import { NextResponse } from "next/server";
import { db } from "@/db";
import { collectionItems } from "@/db/schema";

export async function GET() {
    try {
        const items = await db
            .select({
                collection_id: collectionItems.collection_id,
                item_type: collectionItems.item_type,
                item_id: collectionItems.item_id,
            })
            .from(collectionItems);

        return NextResponse.json(items);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to fetch all collection items" },
            { status: 500 }
        );
    }
}
