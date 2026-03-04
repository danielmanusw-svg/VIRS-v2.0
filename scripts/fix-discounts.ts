import { db } from "../src/db";
import { orders, orderLineItems } from "../src/db/schema";
import { and, gte, lte, eq, inArray } from "drizzle-orm";

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-01";

async function fetchOrdersByIds(ids: string[]) {
    const url = `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&ids=${ids.join(",")}`;
    const res = await fetch(url, {
        headers: {
            "X-Shopify-Access-Token": SHOPIFY_TOKEN,
            "Content-Type": "application/json",
        },
    });
    if (!res.ok) {
        console.error(`Failed to fetch batch: ${res.status}`);
        return [];
    }
    const data = await res.json();
    return data.orders || [];
}

async function main() {
    const START = 41952;
    const END = 44268;

    console.log(`Fixing total_discount for orders ${START}–${END}...`);

    const localOrders = await db
        .select({ id: orders.id, shopify_order_id: orders.shopify_order_id })
        .from(orders)
        .where(and(gte(orders.order_number, START), lte(orders.order_number, END)));

    const BATCH_SIZE = 50;
    let fixedCount = 0;

    for (let i = 0; i < localOrders.length; i += BATCH_SIZE) {
        const batch = localOrders.slice(i, i + BATCH_SIZE);
        const ids = batch.map((o) => o.shopify_order_id);

        const shopifyOrders = await fetchOrdersByIds(ids);

        for (const shopifyOrder of shopifyOrders) {
            const localOrder = batch.find((lo) => lo.shopify_order_id === String(shopifyOrder.id));
            if (!localOrder || !shopifyOrder.line_items) continue;

            const lines = await db.select().from(orderLineItems).where(eq(orderLineItems.order_id, localOrder.id));

            for (const li of lines) {
                const shopifyLi = shopifyOrder.line_items.find((sli: any) => String(sli.id) === li.shopify_line_item_id);
                if (shopifyLi) {
                    const rawPrice = parseFloat(shopifyLi.price) || 0;
                    const totalDiscount = parseFloat(shopifyLi.total_discount || "0");
                    const finalPrice = Math.max(0, (rawPrice * shopifyLi.quantity - totalDiscount) / (shopifyLi.quantity || 1));

                    if (finalPrice !== li.line_price) {
                        await db.update(orderLineItems).set({ line_price: finalPrice }).where(eq(orderLineItems.id, li.id));
                        fixedCount++;
                    }
                }
            }
        }

        process.stdout.write(`.`); // progress indicator
        await new Promise((r) => setTimeout(r, 500)); // rate limit 2req/sec
    }

    console.log(`\n✅ Done! Fixed prices on ${fixedCount} line items.`);
}

main().catch(console.error);
