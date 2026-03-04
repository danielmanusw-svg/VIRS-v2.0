import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../src/db/schema";
import { sql } from "drizzle-orm";

const TURSO_URL = "libsql://virs-production-danielmanusw.aws-eu-west-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzEyNDY1ODgsImlkIjoiNTk5ODRjMGUtYmZhMC00Y2I2LWI1NDEtMTNhNmM1YTRlMWVlIiwicmlkIjoiZDE5NzE2YWItOWI3OS00NzA1LTlkYmMtZmI5YjE5OWU0ODUwIn0.keby_itqispvKzzVgC1Zi8ovdxXzPCyF2cMsY2T3QJ_KyapijhENpqjHQX_Buz3VTNdzxm3VccrA_ChG4usqAQ";

const LOCAL_URL = "file:local.db";

async function main() {
    console.log("Connecting to Turso and Local DB...");
    const tursoDb = drizzle(createClient({ url: TURSO_URL, authToken: TURSO_TOKEN }), { schema });
    const localDb = drizzle(createClient({ url: LOCAL_URL }), { schema });

    const tablesInOrder = [
        { name: "markets", obj: schema.markets },
        { name: "marketCountries", obj: schema.marketCountries },
        { name: "masterProducts", obj: schema.masterProducts },
        { name: "products", obj: schema.products },
        { name: "productVariants", obj: schema.productVariants },
        { name: "stock", obj: schema.stock },
        { name: "productMarketShipping", obj: schema.productMarketShipping },
        { name: "orders", obj: schema.orders },
        { name: "orderLineItems", obj: schema.orderLineItems },
        { name: "stockAdjustmentLog", obj: schema.stockAdjustmentLog },
        { name: "syncHistory", obj: schema.syncHistory },
        { name: "settings", obj: schema.settings },
        { name: "invoices", obj: schema.invoices },
        { name: "invoiceLineItems", obj: schema.invoiceLineItems },
        { name: "collections", obj: schema.collections },
        { name: "collectionItems", obj: schema.collectionItems },
        { name: "supplierAliases", obj: schema.supplierAliases },
        { name: "failedOrders", obj: schema.failedOrders }
    ];

    console.log("Clearing Local DB...");
    for (let i = tablesInOrder.length - 1; i >= 0; i--) {
        const table = tablesInOrder[i];
        console.log(`  Deleting ${table.name}...`);
        await localDb.delete(table.obj);
    }

    console.log("\nMigrating data from Turso...");
    for (const table of tablesInOrder) {
        console.log(`  Fetching ${table.name}...`);
        const rows = await tursoDb.select().from(table.obj);

        if (rows.length > 0) {
            console.log(`    Inserting ${rows.length} rows into local DB...`);
            // we insert in chunks to avoid sqlite limits
            const chunkSize = 100;
            for (let i = 0; i < rows.length; i += chunkSize) {
                const chunk = rows.slice(i, i + chunkSize);
                await localDb.insert(table.obj).values(chunk);
            }
        } else {
            console.log(`    (Empty)`);
        }
    }

    console.log("\nMigration completed successfully!");
    process.exit(0);
}

main().catch(console.error);
