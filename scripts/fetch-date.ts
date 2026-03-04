import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
async function run() {
    const url = `https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/orders.json?status=any&name=39872`;
    const url2 = `https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/orders.json?status=any&name=40577`;

    const h = { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN! };

    const [res1, res2] = await Promise.all([
        fetch(url, { headers: h }),
        fetch(url2, { headers: h })
    ]);

    const d1 = await res1.json();
    const d2 = await res2.json();

    console.log('Order 39872:', d1.orders?.[0]?.created_at);
    console.log('Order 40577:', d2.orders?.[0]?.created_at);
}
run();
