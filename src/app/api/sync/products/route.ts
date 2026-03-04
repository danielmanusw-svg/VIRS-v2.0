import { NextResponse } from "next/server";
import { syncProducts } from "@/lib/sync/productSync";

export async function POST() {
  try {
    const result = await syncProducts();
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Product sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
