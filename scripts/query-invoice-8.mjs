import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
    console.log(`Using database: ${process.env.TURSO_DATABASE_URL}`);

    const res = await client.execute("SELECT * FROM invoices WHERE id = 8");
    console.log("INVOICE 8:");
    console.log(JSON.stringify(res.rows, null, 2));

    const lineItems = await client.execute("SELECT COUNT(*) as count, SUM(quantity), SUM(supplier_cost), SUM(shipping_cost) FROM invoice_line_items WHERE invoice_id = 8");
    console.log("INVOICE 8 LINE ITEMS AGGREGATION:");
    console.log(JSON.stringify(lineItems.rows, null, 2));

    if (res.rows.length > 0) {
        const startOrder = res.rows[0].start_order_number;
        const o = await client.execute({ sql: "SELECT id FROM orders WHERE order_number = ?", args: [startOrder] });
        if (o.rows.length > 0) {
            const orderId = o.rows[0].id;
            const items = await client.execute({ sql: "SELECT * FROM order_line_items WHERE order_id = ?", args: [orderId] });
            console.log(`Line Items for Order ${startOrder}:`);
            console.log(JSON.stringify(items.rows, null, 2));
        }
    }
}

main().catch(console.error);
