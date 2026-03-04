import { db } from "../src/db";
import { orderLineItems } from "../src/db/schema";
import { count } from "drizzle-orm";

async function run() {
    const c = await db.select({ value: count() }).from(orderLineItems);
    console.log("Total order_line_items:", c[0].value);
}
run().catch(console.error);
