// ─── Price Sheet ────────────────────────────────────────────────────────────
// Single source of truth for supplier pricing.
// Derived from "FINAL Price Sheet FP fix.csv".
// Prices are in GBP (£).
// ────────────────────────────────────────────────────────────────────────────

export interface ShippingByMarket {
    UK: number | null;
    AU: number | null;
    US: number | null;
    EU: number | null;
    RoW: number | null;
}

export interface PriceEntry {
    goods_cost: number;
    shipping: ShippingByMarket;
}

/** label → set_size/quantity → PriceEntry */
export type PriceSheet = Record<string, Record<number, PriceEntry>>;

// ─── The Price Data ─────────────────────────────────────────────────────────

export const PRICE_SHEET: PriceSheet = {
    // ── Plastic Filter ──────────────────────────────────────────────────────
    // Goods cost = 0 (bought in advance)
    "Plastic Filter": {
        2: { goods_cost: 0, shipping: { UK: 7.10, AU: 7.00, US: 9.60, EU: 7.20, RoW: 6.50 } },
        3: { goods_cost: 0, shipping: { UK: 8.70, AU: 8.60, US: 11.20, EU: 8.80, RoW: 8.10 } },
        4: { goods_cost: 0, shipping: { UK: 10.50, AU: 10.20, US: 12.80, EU: 10.40, RoW: 9.70 } },
        6: { goods_cost: 0, shipping: { UK: 13.90, AU: 13.40, US: 14.40, EU: 13.60, RoW: 12.90 } },
    },

    // ── Plastic Screen ──────────────────────────────────────────────────────
    "Plastic Screen": {
        1: { goods_cost: 4.50, shipping: { UK: 7.10, AU: 7.00, US: 9.60, EU: 7.20, RoW: 6.50 } },
    },

    // ── Stainless Steel ─────────────────────────────────────────────────────
    // Goods cost = 0 for all set sizes
    "Stainless Steel": {
        2: { goods_cost: 0, shipping: { UK: 7.20, AU: 7.20, US: 10.40, EU: 7.30, RoW: 7.00 } },
        3: { goods_cost: 0, shipping: { UK: 8.90, AU: 8.80, US: 13.00, EU: 8.90, RoW: 8.70 } },
        4: { goods_cost: 0, shipping: { UK: 10.60, AU: 10.40, US: 15.60, EU: 10.50, RoW: 10.40 } },
        6: { goods_cost: 0, shipping: { UK: 14.00, AU: 13.60, US: 20.80, EU: 13.70, RoW: 12.10 } },
    },

    // ── Plastic and Stainless Steel Cartridges ──────────────────────────────
    // Goods cost = £0.70 per filter
    "Plastic and Stainless Steel Cartridges": {
        1: { goods_cost: 0.70, shipping: { UK: 4.10, AU: 4.70, US: 4.10, EU: 5.00, RoW: 3.80 } },
        2: { goods_cost: 1.40, shipping: { UK: 4.20, AU: 4.80, US: 4.20, EU: 5.10, RoW: 3.90 } },
        3: { goods_cost: 2.10, shipping: { UK: 4.30, AU: 4.90, US: 5.70, EU: 5.20, RoW: 4.00 } },
        4: { goods_cost: 2.80, shipping: { UK: 4.40, AU: 5.00, US: 5.90, EU: 5.30, RoW: 4.10 } },
        5: { goods_cost: 3.50, shipping: { UK: 4.50, AU: 5.10, US: 6.10, EU: 5.40, RoW: 4.20 } },
        6: { goods_cost: 4.20, shipping: { UK: 4.60, AU: 5.20, US: 6.30, EU: 5.50, RoW: 4.30 } },
        7: { goods_cost: 4.90, shipping: { UK: 4.70, AU: 5.30, US: 6.50, EU: 5.60, RoW: 4.40 } },
        8: { goods_cost: 5.60, shipping: { UK: 4.80, AU: 5.40, US: 6.70, EU: 5.70, RoW: 4.50 } },
    },

    // ── Shower Filter ───────────────────────────────────────────────────────
    "Shower Filter": {
        1: { goods_cost: 4.80, shipping: { UK: 6.40, AU: 6.20, US: 10.60, EU: 6.30, RoW: 6.40 } },
    },

    // ── Shower Filter Cartridge ─────────────────────────────────────────────
    "Shower Filter Cartridge": {
        1: { goods_cost: 1.40, shipping: { UK: 4.30, AU: 4.90, US: 5.70, EU: 5.20, RoW: 4.30 } },
    },

    // ── 1L Bottle ───────────────────────────────────────────────────────────
    // Goods cost = 0
    "1L Bottle": {
        1: { goods_cost: 0, shipping: { UK: 8.90, AU: 9.30, US: 12.30, EU: 9.70, RoW: 8.90 } },
    },

    // ── 650ml Bottle ────────────────────────────────────────────────────────
    // Goods cost = 0
    "650ml Bottle": {
        1: { goods_cost: 0, shipping: { UK: 8.00, AU: 8.50, US: 10.40, EU: 8.80, RoW: 8.00 } },
    },

    // ── Bath Filter ─────────────────────────────────────────────────────────
    "Bath Filter": {
        1: { goods_cost: 4.80, shipping: { UK: 6.50, AU: 7.60, US: 10.80, EU: 7.20, RoW: 6.50 } },
    },

    // ── Bath Filter Cartridge ───────────────────────────────────────────────
    "Bath Filter Cartridge": {
        1: { goods_cost: 1.10, shipping: { UK: 2.90, AU: 4.60, US: 4.60, EU: 4.40, RoW: 3.80 } },
    },

    // ── 360° Adapters ───────────────────────────────────────────────────────
    "360° Adapters": {
        1: { goods_cost: 0.90, shipping: { UK: 0.50, AU: 0.70, US: 1.20, EU: 0.60, RoW: 0.40 } },
    },

    // ── All Adapters ────────────────────────────────────────────────────────
    // Goods cost = 0, UK shipping = null (should go through ShipBob — notify if it doesn't)
    "All Adapters": {
        1: { goods_cost: 0, shipping: { UK: null, AU: 3.00, US: 4.50, EU: 3.80, RoW: 3.40 } },
    },
};

// ─── Notification Rules ─────────────────────────────────────────────────────

/** Products whose mere presence on an invoice should trigger a notification */
export const PRODUCTS_REQUIRING_NOTIFICATION = new Set<string>([]);

/** (label, market) combos that should trigger a notification if they appear */
export const MARKET_NOTIFICATION_RULES: Array<{
    label: string;
    market: string;
    message: string;
}> = [
        {
            label: "All Adapters",
            market: "UK",
            message:
                "UK 'All Adapters' order found that was NOT fulfilled by ShipBob — review needed.",
        },
    ];

// ─── Lookup Function ────────────────────────────────────────────────────────

export type MarketKey = "UK" | "AU" | "US" | "EU";

function resolveMarketKey(marketCode: string | null): keyof ShippingByMarket {
    if (!marketCode) return "RoW";
    const upper = marketCode.toUpperCase();
    if (upper === "UK" || upper === "AU" || upper === "US" || upper === "EU") {
        return upper as MarketKey;
    }
    return "RoW";
}

export interface PriceLookupResult {
    goods_cost: number;
    shipping_cost: number;
    /** True if the shipping price was null (missing) in the price sheet */
    missing_shipping: boolean;
}

/**
 * Look up goods cost + shipping cost for a given product, set size, and market.
 *
 * @returns The price, or null if the product/set_size combo doesn't exist at all.
 */
export function lookupPrice(
    label: string,
    setSize: number,
    marketCode: string | null
): PriceLookupResult | null {
    const productEntries = PRICE_SHEET[label];
    if (!productEntries) return null;

    const entry = productEntries[setSize];
    if (!entry) return null;

    const marketKey = resolveMarketKey(marketCode);
    const shippingCost = entry.shipping[marketKey];

    return {
        goods_cost: entry.goods_cost,
        shipping_cost: shippingCost ?? 0,
        missing_shipping: shippingCost === null,
    };
}

/**
 * Check if a (label, market) pair triggers a notification.
 * Returns the notification message(s), or empty array if none.
 */
export function checkNotifications(
    label: string,
    marketCode: string | null
): string[] {
    const messages: string[] = [];

    if (PRODUCTS_REQUIRING_NOTIFICATION.has(label)) {
        messages.push(
            `'${label}' order found on invoice — most prices are missing, review needed.`
        );
    }

    const resolvedMarket = resolveMarketKey(marketCode);
    for (const rule of MARKET_NOTIFICATION_RULES) {
        if (rule.label === label && rule.market === resolvedMarket) {
            messages.push(rule.message);
        }
    }

    return messages;
}
