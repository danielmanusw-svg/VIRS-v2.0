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

    const res = await client.execute("SELECT * FROM invoices ORDER BY id DESC LIMIT 5");
    console.log("LATEST INVOICES:");
    console.log(JSON.stringify(res.rows, null, 2));

    for (const inv of res.rows) {
        const lines = await client.execute({ sql: "SELECT COUNT(*) as count, SUM(quantity) as qty FROM invoice_line_items WHERE invoice_id = ?", args: [inv.id] });
        console.log(`Invoice ${inv.id} line items: ${lines.rows[0].count} (qty: ${lines.rows[0].qty})`);
    }
}

main().catch(console.error);
