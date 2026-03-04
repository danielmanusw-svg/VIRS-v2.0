import { calculateInvoice } from "../src/lib/invoice/calculator";
import { aggregateBySupplierAlias } from "../src/lib/invoice/aliasAggregator";

async function test() {
    const START = 41952;
    const END = 44268;

    console.log(`Calculating invoice ${START}–${END}...`);
    const result = await calculateInvoice(START, END);
    const aggregated = await aggregateBySupplierAlias(result.lines);

    // Check 1: Order 41992 (ShipBob)
    const is41992Included = result.lines.some(l => l.order_number === 41992);
    console.log(`\nCheck 1 (Order 41992 - ShipBob):`);
    console.log(`  Included in lines? ${is41992Included ? "❌ YES (FAIL)" : "✅ NO (SUCCESS)"}`);

    // Check 2: Order 43775 (6 SS Filters -> 6 x Set of 2)
    console.log(`\nCheck 2 (Order 43775 - 6 SS Filters):`);
    const ssGroup = aggregated.groups.find(g => g.supplier_label === "Stainless Steel");
    if (ssGroup) {
        const marketUK = ssGroup.markets.find(m => m.market_code === "US"); // Order 43775 is US
        const setOf2 = marketUK?.sets?.find(s => s.set_size === 2);
        const order43775Set = marketUK?.sets?.find(s => s.lines.some(l => l.order_number === 43775));

        console.log(`  Stainless Steel Sets found: ${marketUK?.sets?.map(s => `Set of ${s.set_size} (qty ${s.quantity})`).join(", ")}`);
        // Specific check for order 43775
        const orders43775InRange = marketUK?.lines.filter(l => l.order_number === 43775);
        console.log(`  Order 43775 quantity: ${orders43775InRange?.reduce((sum, l) => sum + l.quantity, 0)}`);
    } else {
        console.log("  ❌ Stainless Steel group not found");
    }

    // Check 3: Order 42039 (Paid Set of 2 + Cancelled Set of 2 -> Set of 2)
    console.log(`\nCheck 3 (Order 42039 - Paid vs Cancelled):`);
    const cartGroup = aggregated.groups.find(g => g.supplier_label === "Plastic and Stainless Steel Cartridges");
    const order42039Lines = result.lines.filter(l => l.order_number === 42039);
    console.log(`  Order 42039 line count in calculator: ${order42039Lines.length}`);
    order42039Lines.forEach(l => console.log(`    - ${l.title}: qty ${l.quantity}, price ${l.line_price}`));

    if (cartGroup) {
        const marketUK = cartGroup.markets.find(m => m.market_code === "UK"); // 42039 is UK
        const entry42039 = marketUK?.sets?.find(s => s.lines.some(l => l.order_number === 42039));
        console.log(`  Aggregated Set Size for 42039: ${entry42039?.set_size ?? "Not found"}`);
    }

}

test().catch(console.error);
