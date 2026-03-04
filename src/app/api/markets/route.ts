import { NextResponse } from "next/server";
import { db } from "@/db";
import { markets } from "@/db/schema";

export async function GET() {
  try {
    const allMarkets = await db.select().from(markets);
    return NextResponse.json(allMarkets);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch markets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
