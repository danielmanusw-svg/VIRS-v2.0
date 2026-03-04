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
    const o = await client.execute("SELECT id, is_shipbob_fulfilled FROM orders WHERE order_number = 41952");
    console.log("Order 41952 shipbob status:");
    console.log(JSON.stringify(o.rows, null, 2));

    const items = await client.execute("SELECT * FROM collection_items WHERE item_id = 35 AND item_type = 'variant'");
    console.log("Variant 35 in collection_items:");
    console.log(JSON.stringify(items.rows, null, 2));

    // Check how many orders are in the range and match shipbob condition
    const ordersCnt = await client.execute(`
    SELECT COUNT(*) 
    FROM orders 
    WHERE order_number >= 41952 AND order_number <= 44268 
    AND (is_shipbob_fulfilled = 0 OR is_shipbob_fulfilled IS NULL)
  `);
    console.log("Valid orders in range:");
    console.log(JSON.stringify(ordersCnt.rows, null, 2));
}

main().catch(console.error);
