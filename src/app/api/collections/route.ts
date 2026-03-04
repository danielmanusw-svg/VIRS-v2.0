import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { collections, collectionItems } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

// GET /api/collections
export async function GET() {
    try {
        // Fetch collections with item count
        const allCollections = await db
            .select({
                id: collections.id,
                name: collections.name,
                description: collections.description,
                itemCount: sql<number>`count(${collectionItems.id})`,
                created_at: collections.created_at,
            })
            .from(collections)
            .leftJoin(collectionItems, sql`${collections.id} = ${collectionItems.collection_id}`)
            .groupBy(collections.id)
            .orderBy(desc(collections.created_at));

        return NextResponse.json(allCollections);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to fetch collections" },
            { status: 500 }
        );
    }
}

// POST /api/collections
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, description } = body;

        if (!name) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        const [newCollection] = await db
            .insert(collections)
            .values({
                name,
                description,
            })
            .returning();

        return NextResponse.json(newCollection);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to create collection" },
            { status: 500 }
        );
    }
}
