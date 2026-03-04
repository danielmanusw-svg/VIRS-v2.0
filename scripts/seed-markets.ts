import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    const { db } = await import('../src/db');
    const { markets, marketCountries } = await import('../src/db/schema');

    // Check if already seeded
    const existing = await db.select().from(markets);
    if (existing.length > 0) {
        console.log(`Markets already seeded (${existing.length} found). Skipping.`);
        process.exit(0);
    }

    // Insert markets
    const [uk] = await db.insert(markets).values({ code: 'UK', name: 'United Kingdom' }).returning({ id: markets.id });
    const [eu] = await db.insert(markets).values({ code: 'EU', name: 'European Union' }).returning({ id: markets.id });
    const [au] = await db.insert(markets).values({ code: 'AU', name: 'Australia' }).returning({ id: markets.id });
    const [us] = await db.insert(markets).values({ code: 'US', name: 'United States' }).returning({ id: markets.id });

    console.log(`Created markets: UK(${uk.id}), EU(${eu.id}), AU(${au.id}), US(${us.id})`);

    // Insert country code mappings
    const countryMappings = [
        // UK
        { market_id: uk.id, country_code: 'GB' },
        // EU countries
        { market_id: eu.id, country_code: 'AT' },
        { market_id: eu.id, country_code: 'BE' },
        { market_id: eu.id, country_code: 'BG' },
        { market_id: eu.id, country_code: 'HR' },
        { market_id: eu.id, country_code: 'CY' },
        { market_id: eu.id, country_code: 'CZ' },
        { market_id: eu.id, country_code: 'DK' },
        { market_id: eu.id, country_code: 'EE' },
        { market_id: eu.id, country_code: 'FI' },
        { market_id: eu.id, country_code: 'FR' },
        { market_id: eu.id, country_code: 'DE' },
        { market_id: eu.id, country_code: 'GR' },
        { market_id: eu.id, country_code: 'HU' },
        { market_id: eu.id, country_code: 'IE' },
        { market_id: eu.id, country_code: 'IT' },
        { market_id: eu.id, country_code: 'LV' },
        { market_id: eu.id, country_code: 'LT' },
        { market_id: eu.id, country_code: 'LU' },
        { market_id: eu.id, country_code: 'MT' },
        { market_id: eu.id, country_code: 'NL' },
        { market_id: eu.id, country_code: 'PL' },
        { market_id: eu.id, country_code: 'PT' },
        { market_id: eu.id, country_code: 'RO' },
        { market_id: eu.id, country_code: 'SK' },
        { market_id: eu.id, country_code: 'SI' },
        { market_id: eu.id, country_code: 'ES' },
        { market_id: eu.id, country_code: 'SE' },
        // Australia + NZ
        { market_id: au.id, country_code: 'AU' },
        { market_id: au.id, country_code: 'NZ' },
        // US
        { market_id: us.id, country_code: 'US' },
    ];

    for (const mapping of countryMappings) {
        await db.insert(marketCountries).values(mapping);
    }

    console.log(`Inserted ${countryMappings.length} country code mappings.`);
    process.exit(0);
}

main().catch(console.error);
