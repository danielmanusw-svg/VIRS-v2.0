import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env vars synchronously BEFORE dynamic imports
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function run() {
    console.log('Fetching orders from Jan 19 to Jan 27 2026...');

    const { shopifyFetchAllPages } = await import('../src/lib/shopify/client');
    const { processOrders } = await import('../src/lib/sync/orderSync');
    const { db } = await import('../src/db');
    const { orders } = await import('../src/db/schema');
    const { gte, and, lte } = await import('drizzle-orm');

    const allOrders = await shopifyFetchAllPages(
        "orders.json",
        {
            limit: "250",
            status: "any",
            created_at_min: "2026-01-19T00:00:00Z",
            created_at_max: "2026-01-27T00:00:00Z",
            order: "created_at asc",
        },
        (data: any) => data.orders
    );

    console.log(`Pulled ${allOrders.length} orders from Shopify for the target range.`);
    console.log('Processing and saving to local database...');

    const result = await processOrders(allOrders as any, { skipStockAdjustments: true, skipExistingUpdates: true });
    console.log('Sync result:', result);

    const total = await db.select().from(orders).where(
        and(
            gte(orders.order_number, 39872),
            lte(orders.order_number, 40577)
        )
    );
    console.log(`Total orders in DB strictly between 39872 and 40577: ${total.length}`);
}

run().catch(console.error).finally(() => process.exit(0));
