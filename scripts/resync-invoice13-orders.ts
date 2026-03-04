import { db } from "../src/db";
import { orders, orderLineItems } from "../src/db/schema";
import { and, gte, lte, eq, sql } from "drizzle-orm";

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-01";

interface ShopifyLineItem {
    id: number;
    variant_id: number | null;
    price: string;
}

interface ShopifyFulfillment {
    id: number;
    name: string | null;
    service: string | null;
}

interface ShopifyOrder {
    id: number;
    order_number: number;
    line_items: ShopifyLineItem[];
    fulfillments?: ShopifyFulfillment[];
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

    console.log(`Re-syncing orders ${START}–${END} for ShipBob flags and line_price...`);

    // Get all local orders in range
    const localOrders = await db
        .select()
        .from(orders)
        .where(and(gte(orders.order_number, START), lte(orders.order_number, END)));

    console.log(`Found ${localOrders.length} local orders to process`);

    let shipbobFixed = 0;
    let pricesFixed = 0;

    for (const localOrder of localOrders) {
        // Fetch from Shopify
        const shopifyOrder = await fetchOrder(localOrder.shopify_order_id);
        if (!shopifyOrder) {
            console.log(`  ⚠ Could not fetch Shopify order ${localOrder.order_number}`);
            continue;
        }

        // --- Fix 1: ShipBob Detection ---
        const hasShipBobFulfillment = (shopifyOrder.fulfillments ?? []).some(
            (f) =>
                f.name?.toLowerCase().includes("shipbob") ||
                f.service?.toLowerCase().includes("shipbob")
        );

        if (hasShipBobFulfillment && !localOrder.is_shipbob_fulfilled) {
            await db
                .update(orders)
                .set({ is_shipbob_fulfilled: true })
                .where(eq(orders.id, localOrder.id));
            shipbobFixed++;
            console.log(`  ✔ Order ${localOrder.order_number} → marked as ShipBob`);
        }

        // --- Fix 3: Populate line_price ---
        const lineItems = await db
            .select()
            .from(orderLineItems)
            .where(eq(orderLineItems.order_id, localOrder.id));

        for (const li of lineItems) {
            // Match local line item to Shopify line item by shopify_line_item_id
            const shopifyLi = shopifyOrder.line_items.find(
                (sli) => String(sli.id) === li.shopify_line_item_id
            );
            if (shopifyLi) {
                const price = parseFloat(shopifyLi.price) || 0;
                if (li.line_price !== price) {
                    await db
                        .update(orderLineItems)
                        .set({ line_price: price })
                        .where(eq(orderLineItems.id, li.id));
                    pricesFixed++;
                }
            }
        }

        // Rate limit: ~2 requests per second
        await new Promise((r) => setTimeout(r, 500));
    }

    console.log(`\n✅ Done!`);
    console.log(`  ShipBob orders fixed: ${shipbobFixed}`);
    console.log(`  Line prices updated: ${pricesFixed}`);
}

main().catch(console.error);
