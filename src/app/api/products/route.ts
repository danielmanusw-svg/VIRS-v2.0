import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productVariants, stock, productMarketShipping, markets, masterProducts } from "@/db/schema";

export async function GET() {
  try {
    const allProducts = await db.select().from(products);
    const allVariants = await db.select().from(productVariants);
    const allStock = await db.select().from(stock);
    const allShipping = await db.select().from(productMarketShipping);
    const allMarkets = await db.select().from(markets);
    const allMasters = await db.select().from(masterProducts);

    // Build a map of variant_id -> stock quantity
    const stockMap = new Map(allStock.map((s) => [s.variant_id, s.quantity]));

    // Build a map of master_product_id -> master product
    const masterMap = new Map(allMasters.map((mp) => [mp.id, mp]));

    // Build a map of variant_id -> shipping costs by market code
    const shippingMap = new Map<number, Record<string, number>>();
    const marketCodeMap = new Map(allMarkets.map((m) => [m.id, m.code]));

    for (const sh of allShipping) {
      const marketCode = marketCodeMap.get(sh.market_id);
      if (!marketCode) continue;
      if (!shippingMap.has(sh.variant_id)) {
        shippingMap.set(sh.variant_id, {});
      }
      shippingMap.get(sh.variant_id)![marketCode] = sh.shipping_cost;
    }

    // Assemble the response
    const result = allProducts.map((p) => {
      const variants = allVariants
        .filter((v) => v.product_id === p.id)
        .map((v) => {
          const mp = v.master_product_id
            ? masterMap.get(v.master_product_id)
            : null;

          return {
            id: v.id,
            shopify_variant_id: v.shopify_variant_id,
            title: v.title,
            sku: v.sku,
            supplier_cost: v.supplier_cost,
            bundle_multiplier: v.bundle_multiplier,
            master_product_id: v.master_product_id,
            master_product_name: mp?.name ?? null,
            stock_quantity: mp ? mp.stock_quantity : (stockMap.get(v.id) ?? 0),
            shipping_costs: shippingMap.get(v.id) ?? {},
          };
        });

      return {
        id: p.id,
        shopify_product_id: p.shopify_product_id,
        title: p.title,
        vendor: p.vendor,
        image_url: p.image_url,
        variants,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch products";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
