import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

/**
 * Re-assign market_id to all orders based on their shipping_country_code
 * and the market_countries table. This fixes orders that were synced before
 * markets were seeded.
 */
async function main() {
    const { db } = await import('../src/db');
    const { orders, markets, marketCountries } = await import('../src/db/schema');
    const { eq } = await import('drizzle-orm');

    // Build country_code → market_id lookup
    const allMarkets = await db.select().from(markets);
    const allCountries = await db.select().from(marketCountries);

    const marketCodeMap = new Map(allMarkets.map(m => [m.id, m.code]));
    const countryToMarket = new Map<string, number>();
    for (const mc of allCountries) {
        countryToMarket.set(mc.country_code, mc.market_id);
    }

    console.log(`Market lookup ready: ${countryToMarket.size} country codes mapped.`);

    // Get all orders
    const allOrders = await db.select().from(orders);
    console.log(`Processing ${allOrders.length} orders...`);

    let updated = 0;
    let flagged = 0;
    let noAddress = 0;

    for (const order of allOrders) {
        const cc = order.shipping_country_code;
        if (!cc) {
            noAddress++;
            continue;
        }

        const marketId = countryToMarket.get(cc) ?? null;
        const isFlagged = marketId === null;

        if (order.market_id !== marketId || order.is_flagged !== isFlagged) {
            await db.update(orders).set({
                market_id: marketId,
                is_flagged: isFlagged,
                updated_at: new Date().toISOString(),
            }).where(eq(orders.id, order.id));
            updated++;
        }

        if (isFlagged) flagged++;
    }

    console.log(`\n✅ Done.`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Flagged (unknown country): ${flagged}`);
    console.log(`  No shipping address: ${noAddress}`);

    process.exit(0);
}

main().catch(console.error);
