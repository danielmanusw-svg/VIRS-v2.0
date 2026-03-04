import { createClient } from "@libsql/client";

async function main() {
    const url = process.env.TURSO_DATABASE_URL?.replace("libsql://", "https://");
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
        console.error("Missing TURSO env vars");
        process.exit(1);
    }

    console.log(`Connecting to ${url}...`);
    const client = createClient({ url, authToken });

    try {
        // Check connection first
        await client.execute("SELECT 1");
        console.log("Connected. Applying schema updates...");

        // 1. Collections
        await client.execute(`
      CREATE TABLE IF NOT EXISTS collections (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        name text NOT NULL,
        description text,
        created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
        updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
      );
    `);
        console.log("Collections table created/verified.");

        // 2. Collection Items
        await client.execute(`
      CREATE TABLE IF NOT EXISTS collection_items (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        collection_id integer NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        item_type text NOT NULL,
        item_id integer NOT NULL,
        created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
      );
    `);
        console.log("Collection Items table created/verified.");

        // 3. Update Master Products (add columns if not exists)
        // SQLite doesn't have "ADD COLUMN IF NOT EXISTS", so we check pragma or just try/catch
        try {
            await client.execute(`ALTER TABLE master_products ADD COLUMN is_manual_stock integer DEFAULT 0 NOT NULL;`);
            console.log("Added is_manual_stock column.");
        } catch (e: any) {
            if (!e.message.includes("duplicate column")) console.warn("Note on is_manual_stock:", e.message);
        }

        try {
            await client.execute(`ALTER TABLE master_products ADD COLUMN image_url text;`);
            console.log("Added image_url column.");
        } catch (e: any) {
            if (!e.message.includes("duplicate column")) console.warn("Note on image_url:", e.message);
        }

        console.log("Schema update complete!");
    } catch (e) {
        console.error("Migration failed:", e);
        process.exit(1);
    } finally {
        client.close();
    }
}

main();
