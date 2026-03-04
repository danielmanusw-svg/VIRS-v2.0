import { db } from "../src/db";
import { orders, orderLineItems, collectionItems, productVariants } from "../src/db/schema";
import { eq, inArray } from "drizzle-orm";

async function debug() {
    const targetOrders = [41992, 43775, 42039];

    console.log(`Debugging orders: ${targetOrders.join(', ')}\n`);

    for (const orderNum of targetOrders) {
        const [orderRec] = await db.select().from(orders).where(eq(orders.order_number, orderNum));
        if (!orderRec) {
            console.log(`Order ${orderNum}: NOT FOUND IN DB`);
            continue;
        }

        console.log(`Order ${orderNum} (Shopify ID: ${orderRec.shopify_order_id}):`);
        console.log(`  is_shipbob_fulfilled: ${orderRec.is_shipbob_fulfilled}`);
        console.log(`  market_id: ${orderRec.market_id}`);

        const lines = await db.select().from(orderLineItems).where(eq(orderLineItems.order_id, orderRec.id));
        console.log(`  Line Items (${lines.length}):`);

        for (const li of lines) {
            let isMapped = false;
            if (li.variant_id) {
                const [collItem] = await db.select().from(collectionItems).where(eq(collectionItems.item_id, li.variant_id));
                isMapped = !!collItem;
            }
            console.log(`    - ID: ${li.id}, Variant: ${li.variant_id}, Qty: ${li.quantity}, Price: ${li.line_price}, Mapped? ${isMapped}, Title: ${li.title}`);
        }
        console.log('');
    }
}

debug().catch(console.error);
