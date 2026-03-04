import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { markets, marketCountries, settings } from "./schema";

async function seed() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const db = drizzle(client);

  console.log("Seeding markets...");
  const marketRows = await db
    .insert(markets)
    .values([
      { code: "EU", name: "European Union" },
      { code: "UK", name: "United Kingdom" },
      { code: "US", name: "United States" },
      { code: "AU", name: "Australia" },
    ])
    .onConflictDoNothing()
    .returning();

  // Build a lookup from code to id (handles both fresh insert and re-run)
  const marketLookup: Record<string, number> = {};
  if (marketRows.length > 0) {
    for (const row of marketRows) {
      marketLookup[row.code] = row.id;
    }
  } else {
    // Already seeded — fetch existing
    const existing = await db.select().from(markets);
    for (const row of existing) {
      marketLookup[row.code] = row.id;
    }
  }

  console.log("Seeding market countries...");

  // 27 EU country codes
  const euCountries = [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  ];

  const countryRows = [
    ...euCountries.map((code) => ({
      market_id: marketLookup["EU"],
      country_code: code,
    })),
    { market_id: marketLookup["UK"], country_code: "GB" },
    { market_id: marketLookup["US"], country_code: "US" },
    { market_id: marketLookup["AU"], country_code: "AU" },
  ];

  // 29 total rows (27 EU + GB + US + AU = 30 actually... let me recount)
  // The roadmap says 29: 27 EU + GB + US = 29? But AU makes 30.
  // The roadmap says "market_countries (29 rows)" but lists 4 markets including AU.
  // 27 EU + 1 GB + 1 US + 1 AU = 30. We'll seed all 30 — the data is correct.

  await db.insert(marketCountries).values(countryRows).onConflictDoNothing();

  console.log("Seeding settings...");
  await db
    .insert(settings)
    .values({
      sync_frequency_hours: 6,
    })
    .onConflictDoNothing();

  const allCountries = await db.select().from(marketCountries);
  const allSettings = await db.select().from(settings);

  console.log(`Done! Markets: ${Object.keys(marketLookup).length}, Countries: ${allCountries.length}, Settings: ${allSettings.length}`);

  client.close();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
