import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load env vars synchronously BEFORE dynamic imports
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

async function main() {
    const { db } = await import("../src/db");
    const { orders, orderLineItems, markets } = await import("../src/db/schema");
    const { eq, and, gte, lte } = await import("drizzle-orm");
    const { aggregateBySupplierAlias } = await import("../src/lib/invoice/aliasAggregator");

    const START_ORDER = 39872;
    const END_ORDER = 40577;

    console.log(`\nFetching orders ${START_ORDER}–${END_ORDER} from local DB...\n`);

    // 1. Build market_id → code lookup
    const allMarkets = await db.select().from(markets);
    const marketCodeMap = new Map<number, string>();
    for (const m of allMarkets) {
        marketCodeMap.set(m.id, m.code);
    }
    console.log(`Loaded ${allMarkets.length} markets: ${allMarkets.map(m => m.code).join(", ")}`);

    // 2. Get orders in range (exclude ShipBob-fulfilled)
    const allOrders = await db
        .select()
        .from(orders)
        .where(
            and(
                gte(orders.order_number, START_ORDER),
                lte(orders.order_number, END_ORDER)
            )
        );

    console.log(`Found ${allOrders.length} orders in range.`);

    // Count by market
    const marketCounts: Record<string, number> = {};
    const flaggedOrders: number[] = [];
    const shipbobOrders: number[] = [];

    // Build InvoiceLineResult
    const lines: any[] = [];

    for (const order of allOrders) {
        // Skip ShipBob-fulfilled orders
        if (order.is_shipbob_fulfilled) {
            shipbobOrders.push(order.order_number);
            continue;
        }

        // Resolve market code
        const marketCode = order.market_id
            ? marketCodeMap.get(order.market_id) ?? "UNKNOWN"
            : "FLAGGED";

        if (order.is_flagged) {
            flaggedOrders.push(order.order_number);
        }

        // Count by market
        marketCounts[marketCode] = (marketCounts[marketCode] || 0) + 1;

        const items = await db
            .select()
            .from(orderLineItems)
            .where(eq(orderLineItems.order_id, order.id));

        for (const item of items) {
            lines.push({
                order_id: order.id,
                order_number: order.order_number,
                variant_id: item.variant_id,
                sku: item.sku,
                title: item.title,
                quantity: item.quantity,
                market_code: marketCode,
                supplier_cost: item.supplier_cost_snapshot * item.quantity,
                shipping_cost: 0,
                line_total: 0,
            });
        }
    }

    console.log(`Extracted ${lines.length} total line items.`);
    console.log(`Market breakdown:`, marketCounts);
    console.log(`Flagged orders: ${flaggedOrders.length}`);
    console.log(`ShipBob orders (excluded): ${shipbobOrders.length}`);
    console.log(`Running alias aggregator...`);

    const grouped = await aggregateBySupplierAlias(lines);

    // Write markdown
    const outLines: string[] = [];
    outLines.push(`# Invoice Debug — Orders ${START_ORDER}–${END_ORDER}`);
    outLines.push("");
    outLines.push(`**Total orders in range**: ${allOrders.length}`);
    outLines.push(`**ShipBob orders (excluded)**: ${shipbobOrders.length}`);
    outLines.push(`**Flagged orders**: ${flaggedOrders.length}`);
    outLines.push(`**Orders included in invoice**: ${allOrders.length - shipbobOrders.length}`);
    outLines.push("");
    outLines.push(`### Market Breakdown`);
    outLines.push("");
    outLines.push("| Market | Orders |");
    outLines.push("|---|---|");
    for (const [market, count] of Object.entries(marketCounts).sort()) {
        outLines.push(`| ${market} | ${count} |`);
    }
    outLines.push("");

    if (shipbobOrders.length > 0) {
        outLines.push(`### ShipBob Orders (excluded)`);
        outLines.push("");
        outLines.push(`${shipbobOrders.sort((a, b) => a - b).join(", ")}`);
        outLines.push("");
    }

    if (flaggedOrders.length > 0) {
        outLines.push(`### Flagged Orders`);
        outLines.push("");
        outLines.push(`${flaggedOrders.sort((a, b) => a - b).join(", ")}`);
        outLines.push("");
    }

    // Custom product order as specified by user
    const PRODUCT_ORDER = [
        "Stainless Steel",
        "360° Adapters",
        "Shower Filter",
        "Plastic Filter",
        "Plastic Screen",
        "All Adapters",
        "Shower Filter Cartridge",
        "Plastic and Stainless Steel Cartridges",
        "Bath Filter",
        "Small Bottle",
        "650ml Bottle",
        "1L Bottle",
        "Black New Plastic Stock",
    ];

    // Sort groups by custom order, unlisted ones go to the end
    const orderMap = new Map(PRODUCT_ORDER.map((label, idx) => [label.toLowerCase(), idx]));
    const sortedGroups = [...grouped.groups].sort((a, b) => {
        const posA = orderMap.get(a.supplier_label.toLowerCase()) ?? 999;
        const posB = orderMap.get(b.supplier_label.toLowerCase()) ?? 999;
        return posA - posB;
    });

    for (const group of sortedGroups) {
        // Count by market within this group
        const groupMarketTotals: Record<string, number> = {};
        for (const m of group.markets) {
            groupMarketTotals[m.market_code] = (groupMarketTotals[m.market_code] || 0) + m.quantity;
        }
        const marketSummary = Object.entries(groupMarketTotals)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");

        outLines.push(`## ${group.supplier_label} (${group.total_quantity} total — ${marketSummary})`);
        outLines.push("");

        // Flatten lines from all markets, tagging each with its parent market_code
        const allLines: any[] = [];
        for (const m of group.markets) {
            for (const line of (m.lines || [])) {
                allLines.push({ ...line, _market: m.market_code });
            }
        }
        // Sort by order number
        allLines.sort((a: any, b: any) => a.order_number - b.order_number);

        outLines.push("| Order # | Market | Variant | SKU | Qty |");
        outLines.push("|---|---|---|---|---|");

        for (const l of allLines) {
            outLines.push(`| ${l.order_number} | ${l._market} | ${l.title} | ${l.sku || '—'} | ${l.quantity} |`);
        }
        outLines.push("");
    }

    if (grouped.unmapped && grouped.unmapped.length > 0) {
        outLines.push(`## Unmapped Items`);
        outLines.push("");
        outLines.push("| Order # | Variant | SKU | Qty |");
        outLines.push("|---|---|---|---|");

        const unmappedRows: any[] = [];
        for (const u of grouped.unmapped) {
            for (const orderNum of u.order_numbers) {
                unmappedRows.push({ order_number: orderNum, title: u.title, sku: u.sku, qty: u.quantity });
            }
        }
        unmappedRows.sort((a, b) => a.order_number - b.order_number);

        for (const u of unmappedRows) {
            outLines.push(`| ${u.order_number} | ${u.title} | ${u.sku || '—'} | ${u.qty} |`);
        }
    }

    const artifactDir = path.resolve(
        process.env.USERPROFILE || process.env.HOME || ".",
        ".gemini/antigravity/brain/4674fede-9079-44c7-b561-604e2b61fd04"
    );
    const outPath = path.join(artifactDir, "invoice_debug.md");
    fs.writeFileSync(outPath, outLines.join("\n"), "utf-8");

    console.log(`\n✅ Output written to ${outPath}`);

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
