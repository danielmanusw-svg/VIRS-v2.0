import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

async function main() {
    const { db } = await import("../src/db");
    const { settings } = await import("../src/db/schema");
    await db.insert(settings).values({});
    console.log("Settings row inserted.");
    process.exit(0);
}

main().catch(console.error);
