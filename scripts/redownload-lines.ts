import { db } from "../src/db";
import { orders, orderLineItems, productVariants } from "../src/db/schema";
import { and, gte, lte, eq } from "drizzle-orm";

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-01";

interface ShopifyLineItem {
    id: number;
    variant_id: number | null;
    sku: string | null;
    title: string;
    quantity: number;
    price: string;
}

interface ShopifyOrder {
    id: number;
    order_number: number;
    line_items: ShopifyLineItem[];
}

async function fetchOrder(orderId: string): Promise<ShopifyOrder | null> {
    const url = `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}.json`;
    const res = await fetch(url, {
        headers: {
            "X-Shopify-Access-Token": SHOPIFY_TOKEN,
            "Content-Type": "application/json",
        },
    });
    if (!res.ok) {
        console.error(`Failed to fetch order ${orderId}: ${res.status}`);
        return null;
    }
    const data = await res.json();
    return data.order as ShopifyOrder;
}

async function main() {
    const START = 41952;
    const END = 44268;

    console.log(`Re-downloading line items for orders ${START}–${END}...`);

    // Get local orders missing line items
    const localOrders = await db
        .select()
        .from(orders)
        .where(and(gte(orders.order_number, START), lte(orders.order_number, END)));

    let linesInserted = 0;

    for (const lo of localOrders) {
        // Check if it already has line items (in case of restart)
        const existing = await db.select().from(orderLineItems).where(eq(orderLineItems.order_id, lo.id)).limit(1);
        if (existing.length > 0) continue;

        const so = await fetchOrder(lo.shopify_order_id);
        if (!so) {
            console.log(`  ⚠ Could not fetch Shopify order ${lo.order_number}`);
            continue;
        }

        // Insert line items
        for (const li of so.line_items) {
            let localVariantId: number | null = null;
            let supplierCostSnapshot = 0;

            if (li.variant_id) {
                const variant = await db
                    .select()
                    .from(productVariants)
                    .where(eq(productVariants.shopify_variant_id, String(li.variant_id)))
                    .limit(1);
                if (variant.length > 0) {
                    localVariantId = variant[0].id;
                    supplierCostSnapshot = variant[0].supplier_cost;
                }
            }

            await db.insert(orderLineItems).values({
                order_id: lo.id,
                variant_id: localVariantId,
                shopify_line_item_id: String(li.id),
                title: li.title,
                sku: li.sku,
                quantity: li.quantity,
                supplier_cost_snapshot: supplierCostSnapshot,
                line_price: parseFloat(li.price) || 0,
            });
            linesInserted++;
        }

        if (linesInserted % 100 === 0) {
            console.log(`  Inserted ${linesInserted} lines so far...`);
        }

        // Rate limit
        await new Promise((r) => setTimeout(r, 400));
    }

    console.log(`\n✅ Done! Inserted ${linesInserted} line items.`);
}

main().catch(console.error);
