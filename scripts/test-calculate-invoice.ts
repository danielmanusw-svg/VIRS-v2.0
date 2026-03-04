import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

async function main() {
    const { calculateInvoice } = await import("../src/lib/invoice/calculator");
    console.log("Testing calculateInvoice 41952 - 44268 ...");
    const calc = await calculateInvoice(41952, 44268);
    console.log(`Lines generated: ${calc.lines.length}`);
    console.log(`Total Quantity: ${calc.lines.reduce((s: any, l: any) => s + l.quantity, 0)}`);
    console.log(`Grand Total: £${calc.grand_total.toFixed(2)}`);

    // Sample random line
    if (calc.lines.length > 0) {
        console.log("Sample Line:", JSON.stringify(calc.lines[0], null, 2));
    }
}

main().catch(console.error);
