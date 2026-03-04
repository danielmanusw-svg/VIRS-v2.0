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
    const collectionIdsResult = await client.execute("SELECT id FROM collections WHERE name != 'No Count'");
    const validCollectionIds = collectionIdsResult.rows.map(r => r.id);

    if (validCollectionIds.length > 0) {
        try {
            const dbStr = validCollectionIds.join(",");
            const q = await client.execute({ sql: `SELECT COUNT(*) as cnt FROM collection_items WHERE collection_id IN (${dbStr}) AND item_type = 'variant'`, args: [] });
            console.log("sqlite direct query succeeded! items:", q.rows[0].cnt);
        } catch (e) {
            console.error(e.message);
        }
    }
}

main().catch(console.error);
