import { NextResponse } from "next/server";
import { shopifyFetch } from "@/lib/shopify/client";

export async function GET() {
  try {
    // Fetch a single product to verify credentials
    const result = await shopifyFetch<{ products: unknown[] }>({
      endpoint: "products.json",
      params: { limit: "1" },
    });

    return NextResponse.json({
      connected: true,
      product_count: result.data.products.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Shopify connection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
