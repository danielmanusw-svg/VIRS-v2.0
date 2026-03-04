import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// FORCE LOCAL SQLITE ONLY - REMOVED TURSO
const url = "file:local.db";

const client = createClient({ url });

export const db = drizzle(client, { schema });
