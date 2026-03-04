import { createClient } from "@libsql/client";

async function main() {
    const url = process.env.TURSO_DATABASE_URL?.replace("libsql://", "https://");
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
        console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN env vars.");
        process.exit(1);
    }

    console.log(`Connecting to ${url}...`);

    const client = createClient({
        url,
        authToken,
    });

    try {
        const rs = await client.execute("SELECT 1 as passed");
        console.log("Connection successful!", rs);
        process.exit(0);
    } catch (e) {
        console.error("Connection failed:", e);
        process.exit(1);
    } finally {
        client.close();
    }
}

main();
