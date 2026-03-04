import { db } from "@/db";
import { markets, marketCountries } from "@/db/schema";

export interface MarketInfo {
  marketId: number;
  marketCode: string;
}

export async function buildMarketLookup(): Promise<Map<string, MarketInfo>> {
  const allMarkets = await db.select().from(markets);
  const allCountries = await db.select().from(marketCountries);

  const marketCodeMap = new Map(allMarkets.map((m) => [m.id, m.code]));
  const lookup = new Map<string, MarketInfo>();

  for (const mc of allCountries) {
    const code = marketCodeMap.get(mc.market_id);
    if (code) {
      lookup.set(mc.country_code, {
        marketId: mc.market_id,
        marketCode: code,
      });
    }
  }

  // NZ orders are invoiced under AU market for shipping
  if (!lookup.has("NZ") && lookup.has("AU")) {
    lookup.set("NZ", lookup.get("AU")!);
  }

  return lookup;
}
