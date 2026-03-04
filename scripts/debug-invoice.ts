/**
 * Debug script: Fetches orders directly from Shopify API for range 39872–40577
 * and outputs per-variant detail to help identify counting issues.
 *
 * Usage: npx tsx scripts/debug-invoice.ts
 *
 * No database required — queries Shopify directly.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";

const START_ORDER = 39872;
const END_ORDER = 40577;

// ─── Shopify fetch helpers ──────────────────────────────────────────────────

function parseNextPageInfo(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    const parts = linkHeader.split(",");
    for (const part of parts) {
        if (part.includes('rel="next"')) {
            const match = part.match(/page_info=([^>&]*)/);
            return match ? match[1] : null;
        }
    }
    return null;
}

interface ShopifyLineItem {
    id: number;
    variant_id: number | null;
    title: string;
    sku: string | null;
    quantity: number;
    fulfillment_service: string | null;
}

interface ShopifyOrder {
    id: number;
    order_number: number;
    financial_status: string | null;
    fulfillment_status: string | null;
    created_at: string;
    shipping_address: { country_code: string } | null;
    line_items: ShopifyLineItem[];
}

async function fetchAllOrders(): Promise<ShopifyOrder[]> {
    const allOrders: ShopifyOrder[] = [];
    let pageInfo: string | null = null;
    let isFirst = true;
    let page = 0;

    while (true) {
        page++;
        const params: Record<string, string> = isFirst
            ? {
                limit: "250",
                status: "any",
                created_at_min: "2024-01-01T00:00:00Z",
                created_at_max: "2026-12-31T23:59:59Z",
                order: "created_at asc",
            }
            : { limit: "250", page_info: pageInfo! };

        const search = new URLSearchParams(params).toString();
        const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/orders.json?${search}`;

        console.log(`Fetching page ${page}...`);
        const res = await fetch(url, {
            headers: {
                "X-Shopify-Access-Token": SHOPIFY_TOKEN,
                "Content-Type": "application/json",
            },
        });

        if (res.status === 429) {
            const wait = parseFloat(res.headers.get("Retry-After") ?? "2") * 1000;
            console.log(`Rate limited, waiting ${wait}ms...`);
            await new Promise((r) => setTimeout(r, wait));
            continue;
        }

        if (!res.ok) {
            throw new Error(`Shopify error: ${res.status} ${res.statusText}`);
        }

        const data = (await res.json()) as { orders: ShopifyOrder[] };
        const orders = data.orders;

        // Only keep orders in our range
        for (const o of orders) {
            if (o.order_number >= START_ORDER && o.order_number <= END_ORDER) {
                allOrders.push(o);
            }
        }

        // If we've gone past our range, stop
        const maxOrder = orders.length > 0 ? Math.max(...orders.map((o) => o.order_number)) : 0;
        console.log(
            `  → Got ${orders.length} orders (range ${orders[0]?.order_number}–${orders[orders.length - 1]?.order_number}), kept ${allOrders.length} in range so far`
        );

        if (maxOrder > END_ORDER + 500) {
            console.log("Past target range, stopping.");
            break;
        }

        const linkHeader = res.headers.get("Link");
        const next = parseNextPageInfo(linkHeader);
        if (!next) break;
        pageInfo = next;
        isFirst = false;
    }

    return allOrders.sort((a, b) => a.order_number - b.order_number);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\nFetching orders ${START_ORDER}–${END_ORDER} from Shopify...\n`);
    const orders = await fetchAllOrders();
    console.log(`\nTotal orders in range: ${orders.length}\n`);

    // Group line items by variant_id + title + sku
    interface VariantGroup {
        variant_id: number | null;
        title: string;
        sku: string | null;
        total_qty: number;
        order_count: number;
        orders: { order_number: number; qty: number; country: string }[];
        fulfillment_service: string | null;
    }

    const variantMap = new Map<string, VariantGroup>();

    for (const order of orders) {
        const country = order.shipping_address?.country_code ?? "??";

        for (const li of order.line_items) {
            const key = `${li.variant_id ?? "null"}_${li.sku ?? "null"}`;
            let group = variantMap.get(key);
            if (!group) {
                group = {
                    variant_id: li.variant_id,
                    title: li.title,
                    sku: li.sku,
                    total_qty: 0,
                    order_count: 0,
                    orders: [],
                    fulfillment_service: li.fulfillment_service,
                };
                variantMap.set(key, group);
            }
            group.total_qty += li.quantity;
            group.order_count++;
            group.orders.push({
                order_number: order.order_number,
                qty: li.quantity,
                country,
            });
        }
    }

    // Sort by total quantity descending
    const sortedGroups = [...variantMap.values()].sort(
        (a, b) => b.total_qty - a.total_qty
    );

    // Build markdown output
    const lines: string[] = [];
    lines.push(`# Invoice Debug — Orders ${START_ORDER}–${END_ORDER}`);
    lines.push("");
    lines.push(`**Total orders**: ${orders.length}`);
    lines.push(
        `**Total line items**: ${sortedGroups.reduce((s, g) => s + g.order_count, 0)}`
    );
    lines.push(
        `**Total product quantity**: ${sortedGroups.reduce((s, g) => s + g.total_qty, 0)}`
    );
    lines.push(
        `**Distinct variants**: ${sortedGroups.length}`
    );
    lines.push("");

    // Summary table
    lines.push("## Product Summary");
    lines.push("");
    lines.push(
        "| Variant ID | Title | SKU | Fulfillment | Total Qty | Orders |"
    );
    lines.push("|---|---|---|---|---|---|");
    for (const g of sortedGroups) {
        lines.push(
            `| ${g.variant_id ?? "—"} | ${g.title} | ${g.sku ?? "—"} | ${g.fulfillment_service ?? "manual"} | **${g.total_qty}** | ${g.order_count} |`
        );
    }
    lines.push("");

    // Detailed breakdown per variant
    lines.push("## Per-Variant Order Detail");
    lines.push("");
    lines.push(
        "> Click any section to see every order that contains this variant."
    );
    lines.push("");

    for (const g of sortedGroups) {
        lines.push(
            `### ${g.title} (SKU: ${g.sku ?? "—"}) — ${g.total_qty} total`
        );
        lines.push("");
        lines.push(`- **Variant ID**: ${g.variant_id ?? "—"}`);
        lines.push(`- **Fulfillment**: ${g.fulfillment_service ?? "manual"}`);
        lines.push("");
        lines.push("| Order # | Country | Qty |");
        lines.push("|---|---|---|");
        for (const o of g.orders) {
            lines.push(`| ${o.order_number} | ${o.country} | ${o.qty} |`);
        }
        lines.push("");
    }

    // Write to artifact
    const artifactDir = path.resolve(
        process.env.USERPROFILE || process.env.HOME || ".",
        ".gemini/antigravity/brain/4674fede-9079-44c7-b561-604e2b61fd04"
    );
    const outputPath = path.join(artifactDir, "invoice_debug.md");
    fs.writeFileSync(outputPath, lines.join("\n"), "utf-8");
    console.log(`\n✅ Debug artifact written to: ${outputPath}`);
    console.log(`Total variants: ${sortedGroups.length}`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
