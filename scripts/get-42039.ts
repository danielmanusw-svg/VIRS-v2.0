import { fetchShopifyOrdersBefore } from "../src/lib/shopify/orders";

async function run() {
    const url = `https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/${process.env.SHOPIFY_API_VERSION}/orders/7976493383947.json`;
    const res = await fetch(url, {
        headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN! }
    });
    const data = await res.json();
    const li = data.order.line_items;
    for (const l of li) {
        if (l.title.includes("3 Months")) {
            console.log(JSON.stringify(l, null, 2));
        }
    }
}

run().catch(console.error);
