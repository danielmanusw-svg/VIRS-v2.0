import { db } from "@/db";
import { supplierAliases, productVariants } from "@/db/schema";
import { inArray } from "drizzle-orm";
import type { InvoiceLineResult } from "./calculator";
import { lookupPrice, checkNotifications } from "./priceSheet";

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Tap filter labels — each unit ships with FREE_CARTRIDGES_PER_TAP_FILTER
 * cartridges included. When the same order also contains paid cartridges,
 * those are absorbed into the tap filter's set.
 */
const TAP_FILTER_LABELS = new Set(["Stainless Steel", "Plastic Filter"]);

/** Number of free cartridges included with every single tap filter unit */
const FREE_CARTRIDGES_PER_TAP_FILTER = 2;

/** The supplier alias label for cartridge products */
const CARTRIDGE_LABEL = "Plastic and Stainless Steel Cartridges";

/** Small items that can be "tucked into" larger product boxes at no extra box cost */
const SMALL_ITEM_LABELS = new Set(["360° Adapters", "All Adapters"]);

/**
 * xProduct commission should not count adapter-only labels.
 * They still matter for packing logic, but not for commission.
 */
const XPRODUCT_EXCLUDED_LABELS = new Set(["360° Adapters", "All Adapters"]);

/** All labels that participate in set logic */
const SET_ELIGIBLE_LABELS = new Set([...TAP_FILTER_LABELS, CARTRIDGE_LABEL]);

/** Per-product market display order (to match supplier invoice layout) */
const MARKET_ORDER_BY_LABEL: Record<string, string[]> = {
    "Stainless Steel": ["UK", "US", "EU", "AU"],
    "360° Adapters": ["AU", "US", "EU", "UK"],
    "Shower Filter": ["UK", "EU", "US", "AU"],
    "Plastic Filter": ["UK", "EU", "US", "AU"],
    "Plastic Screen": ["UK", "EU", "US", "AU"],
    "All Adapters": ["UK", "EU", "AU", "US"],
    "Shower Filter Cartridge": ["AU", "UK", "EU", "US"],
    "Plastic and Stainless Steel Cartridges": ["UK", "AU", "US", "EU"],
    "Bath Filter": ["US", "EU", "AU", "UK"],
    "Small Bottle": ["UK", "US", "AU", "EU"],
    "650ml Bottle": ["UK", "US", "AU", "EU"],
    "1L Bottle": ["UK", "AU", "US", "EU"],
    "Black New Plastic Stock": ["UK", "US", "EU", "AU"],
};

/** Get the sort position of a market code for a given label */
function marketSortPos(label: string, marketCode: string): number {
    const order = MARKET_ORDER_BY_LABEL[label];
    if (!order) return 999;
    const idx = order.indexOf(marketCode);
    return idx === -1 ? 999 : idx;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AliasLineDetail {
    order_number: number;
    variant_id: number | null;
    title: string;
    sku: string | null;
    quantity: number;
}

export interface AliasSetBreakdown {
    /** Number of filters/cartridges in this set (e.g. 2, 3, 4, 6, 8) */
    set_size: number;
    /** Number of orders (sets) with this set size */
    quantity: number;
    /** Individual line items contributing to this set size */
    lines: AliasLineDetail[];
    /** Goods cost per set from price sheet */
    goods_cost_per_set: number;
    /** Shipping cost per set from price sheet */
    shipping_cost_per_set: number;
    /** Total cost for all sets of this size: (goods + shipping) × quantity */
    total_cost: number;
    /** True if shipping price was missing from the price sheet */
    missing_price: boolean;
}

export interface AliasMarketBreakdown {
    market_code: string;
    quantity: number;
    lines: AliasLineDetail[];
    /** Set breakdown — only present for set-eligible supplier labels */
    sets?: AliasSetBreakdown[];
    /** Per-unit goods cost (non-set-eligible products only) */
    goods_cost_per_unit: number;
    /** Per-unit shipping cost (non-set-eligible products only) */
    shipping_cost_per_unit: number;
    /** Total cost for this market row */
    total_cost: number;
    /** True if shipping price was missing from the price sheet */
    missing_price: boolean;
}

export interface AliasGroup {
    /** The supplier invoice label (e.g. "Stainless Steel") */
    supplier_label: string;
    /** Per-market quantity breakdown */
    markets: AliasMarketBreakdown[];
    /** Total quantity across all markets */
    total_quantity: number;
    /** All individual line items in this group */
    lines: AliasLineDetail[];
    /** Whether this group uses set-based aggregation */
    is_set_eligible: boolean;
    /** Total goods cost for this product group */
    total_goods_cost: number;
    /** Total shipping cost for this product group */
    total_shipping_cost: number;
    /** Total cost (goods + shipping) for this product group */
    total_cost: number;
}

export interface UnmappedItem {
    variant_id: number | null;
    title: string;
    sku: string | null;
    quantity: number;
    market_code: string | null;
    order_numbers: number[];
}

export interface AliasAggregationResult {
    /** Invoice line items grouped by supplier alias label + market */
    groups: AliasGroup[];
    /** Line items whose variant could not be resolved to any supplier alias */
    unmapped: UnmappedItem[];
    /** Notification messages for missing prices, flagged products, etc. */
    notifications: string[];
    /** Grand totals computed from the price sheet */
    totals: {
        total_goods_cost: number;
        total_shipping_cost: number;
        total_cost: number;
    };
    /** Breakdown of orders containing > 1 box (price sheet row) */
    multi_box_orders: MultiBoxOrder[];
    /** Total number of products (counting sets as 1) for commission calculation */
    commissionable_product_count: number;
}

export interface MultiBoxOrder {
    order_number: number;
    market_code: string;
    box_count: number;
    boxes: { label: string; quantity: number }[];
}

// ─── Resolved line (internal) ───────────────────────────────────────────────

interface ResolvedLine {
    line: InvoiceLineResult;
    label: string;
    bundle_multiplier: number;
    detail: AliasLineDetail;
}

// ─── Aggregator ─────────────────────────────────────────────────────────────

/**
 * Groups invoice line items by their supplier alias label (matching the
 * supplier's invoice format), with per-market quantity breakdowns and
 * set-size breakdown for tap filters and cartridges.
 *
 * Set logic:
 *   - Tap filters (Stainless Steel, Plastic Filter) always include 2 free
 *     cartridges per unit. If the same order also has paid cartridges, those
 *     are absorbed into the tap filter's set (not counted under Cartridges).
 *     set_size = (tap_qty × 2) + paid_cartridge_count
 *   - Standalone cartridge orders (no tap filter) stay under Cartridges.
 *     set_size = total cartridge count in that order
 *
 * Resolution order for each line item variant:
 *   1. Direct variant_id match in supplier_aliases
 *   2. Variant's master_product_id match in supplier_aliases
 *   3. → unmapped
 */
export async function aggregateBySupplierAlias(
    lines: InvoiceLineResult[]
): Promise<AliasAggregationResult> {
    // 1. Fetch all supplier aliases
    const allAliases = await db.select().from(supplierAliases);

    // 2. Build lookup maps
    const variantToLabel = new Map<number, string>();
    const masterProductToLabel = new Map<number, string>();

    for (const alias of allAliases) {
        if (alias.variant_id !== null) {
            variantToLabel.set(alias.variant_id, alias.supplier_label);
        }
        if (alias.master_product_id !== null) {
            masterProductToLabel.set(alias.master_product_id, alias.supplier_label);
        }
    }

    // 3. Fetch variant info (master_product_id + bundle_multiplier)
    const variantIds = [
        ...new Set(
            lines
                .map((l) => l.variant_id)
                .filter((id): id is number => id !== null)
        ),
    ];

    const variantInfoMap = new Map<number, { master_product_id: number | null; bundle_multiplier: number }>();
    if (variantIds.length > 0) {
        const variants = await db
            .select({
                id: productVariants.id,
                master_product_id: productVariants.master_product_id,
                bundle_multiplier: productVariants.bundle_multiplier,
            })
            .from(productVariants)
            .where(inArray(productVariants.id, variantIds));

        for (const v of variants) {
            variantInfoMap.set(v.id, {
                master_product_id: v.master_product_id,
                bundle_multiplier: v.bundle_multiplier,
            });
        }
    }

    // 4. Resolve each line → supplier_label
    const resolvedLines: ResolvedLine[] = [];
    const unmappedMap = new Map<string, UnmappedItem>();

    for (const line of lines) {
        let label: string | null = null;

        if (line.variant_id !== null) {
            label = variantToLabel.get(line.variant_id) ?? null;
            if (!label) {
                const info = variantInfoMap.get(line.variant_id);
                const mpId = info?.master_product_id ?? null;
                if (mpId !== null) {
                    label = masterProductToLabel.get(mpId) ?? null;
                }
            }
        }

        if (label) {
            const bundleMultiplier = line.variant_id
                ? (variantInfoMap.get(line.variant_id)?.bundle_multiplier ?? 1)
                : 1;

            resolvedLines.push({
                line,
                label,
                bundle_multiplier: bundleMultiplier,
                detail: {
                    order_number: line.order_number,
                    variant_id: line.variant_id,
                    title: line.title,
                    sku: line.sku,
                    quantity: line.quantity,
                },
            });
        } else {
            const key = `${line.variant_id ?? "null"}_${line.sku ?? "null"}`;
            const existing = unmappedMap.get(key);
            if (existing) {
                existing.quantity += line.quantity;
                if (!existing.order_numbers.includes(line.order_number)) {
                    existing.order_numbers.push(line.order_number);
                }
            } else {
                unmappedMap.set(key, {
                    variant_id: line.variant_id,
                    title: line.title,
                    sku: line.sku,
                    quantity: line.quantity,
                    market_code: line.market_code,
                    order_numbers: [line.order_number],
                });
            }
        }
    }

    // 5. Group resolved lines by order_number for cross-label set analysis
    const orderGroups = new Map<number, ResolvedLine[]>();
    for (const rl of resolvedLines) {
        const orderLines = orderGroups.get(rl.line.order_number) ?? [];
        orderLines.push(rl);
        orderGroups.set(rl.line.order_number, orderLines);
    }

    // 6. Determine set sizes and which cartridge lines are absorbed by tap filters
    //    absorbed = Set of "orderNumber_variantId_idx" keys for cartridge lines
    //    that belong to a tap filter order → these won't appear in Cartridges section
    const absorbedKeys = new Set<string>();

    // orderNumber → { label → set_size[] } for set-eligible labels
    // Changed from single set_size to an ARRAY of set sizes (one per filter unit)
    const orderSetInfo = new Map<number, Map<string, number[]>>();

    for (const [orderNum, orderLines] of orderGroups) {
        // Find ONLY PAID tap filter lines and cartridge lines in this order
        const tapFilterLines = orderLines.filter((rl) => TAP_FILTER_LABELS.has(rl.label) && rl.line.line_price > 0);
        // Only count PAID cartridge lines (line_price > 0)
        const cartridgeLines = orderLines.filter(
            (rl) => rl.label === CARTRIDGE_LABEL && rl.line.line_price > 0
        );

        if (tapFilterLines.length > 0) {
            // Group tap filter lines by their specific label (SS vs Plastic)
            const tapByLabel = new Map<string, ResolvedLine[]>();
            for (const rl of tapFilterLines) {
                const arr = tapByLabel.get(rl.label) ?? [];
                arr.push(rl);
                tapByLabel.set(rl.label, arr);
            }

            const distinctTapLabels = tapByLabel.size;

            // Paid cartridges = sum of (qty × bundle_multiplier) for PAID cartridge lines
            const paidCartridges = cartridgeLines.reduce(
                (sum, rl) => sum + rl.line.quantity * rl.bundle_multiplier,
                0
            );

            // Compute per-label set sizes independently
            for (const [tapLabel, tapLines] of tapByLabel) {
                const tapQty = tapLines.reduce((sum, rl) => sum + rl.line.quantity, 0);

                // Only absorb paid cartridges when there's a SINGLE tap filter type.
                // When both SS + Plastic are in the same order, they ship in separate
                // boxes — each gets only its baseline, and cartridges stay standalone.
                const assignedPaid = distinctTapLabels === 1 ? paidCartridges : 0;

                // Distribute paid cartridges EVENLY across filter units
                // Each filter gets: 2 (free) + floor(assignedPaid / tapQty) cartridges
                // The remainder goes to the LAST filter(s)
                const perFilterBase = Math.floor(assignedPaid / tapQty);
                const remainder = assignedPaid % tapQty;

                const setSizes: number[] = [];
                for (let i = 0; i < tapQty; i++) {
                    // Last `remainder` filters get 1 extra cartridge
                    const extra = i >= (tapQty - remainder) ? 1 : 0;
                    setSizes.push(FREE_CARTRIDGES_PER_TAP_FILTER + perFilterBase + extra);
                }

                let labelSets = orderSetInfo.get(orderNum);
                if (!labelSets) {
                    labelSets = new Map();
                    orderSetInfo.set(orderNum, labelSets);
                }
                labelSets.set(tapLabel, setSizes);
            }

            // Only absorb cartridge lines when there's a single tap filter type
            if (distinctTapLabels === 1) {
                cartridgeLines.forEach((rl, idx) => {
                    absorbedKeys.add(`${orderNum}_${rl.line.variant_id}_${idx}`);
                });
            }
        } else if (cartridgeLines.length > 0) {
            // Standalone cartridge order (no tap filter)
            const totalCartridges = cartridgeLines.reduce(
                (sum, rl) => sum + rl.line.quantity * rl.bundle_multiplier,
                0
            );

            let labelSets = orderSetInfo.get(orderNum);
            if (!labelSets) {
                labelSets = new Map();
                orderSetInfo.set(orderNum, labelSets);
            }
            labelSets.set(CARTRIDGE_LABEL, [totalCartridges]);
        }
    }

    let commissionableProductCount = 0;
    for (const [, orderLines] of orderGroups) {
        const hasTapFilter = orderLines.some(
            (rl) => rl.line.line_price > 0 && TAP_FILTER_LABELS.has(rl.label)
        );

        for (const rl of orderLines) {
            if (rl.line.line_price <= 0 || XPRODUCT_EXCLUDED_LABELS.has(rl.label)) {
                continue;
            }

            if (hasTapFilter && rl.label === CARTRIDGE_LABEL) {
                continue;
            }

            commissionableProductCount += rl.line.quantity;
        }
    }

    // 6.5 Build Multi-Box order breakdown
    const multiBoxOrders: MultiBoxOrder[] = [];
    for (const [orderNum, orderLines] of orderGroups) {
        const market_code = orderLines[0]?.line.market_code ?? "Unknown";
        let large_box_count = 0;
        let has_small_items = false;
        const boxesMap = new Map<string, number>();

        const addBox = (labelText: string, qty: number) => {
            boxesMap.set(labelText, (boxesMap.get(labelText) ?? 0) + qty);
        };

        // 1. Process non-set lines
        for (const rl of orderLines) {
            // Skip if zero-price "free" item that shouldn't have a box
            if (rl.line.line_price <= 0) continue;

            if (SMALL_ITEM_LABELS.has(rl.label)) {
                has_small_items = true;
                addBox(rl.label, rl.line.quantity);
            } else if (!SET_ELIGIBLE_LABELS.has(rl.label)) {
                large_box_count += rl.line.quantity;
                addBox(rl.label, rl.line.quantity);
            }
        }

        // 2. Process set lines (Large items)
        const setsForOrder = orderSetInfo.get(orderNum);
        if (setsForOrder) {
            for (const [setLabel, setSizes] of setsForOrder) {
                for (const sz of setSizes) {
                    if (sz > 0) { // Don't create a box for a "set of 0"
                        const boxLabel = `${setLabel} (Set of ${sz})`;
                        large_box_count += 1;
                        addBox(boxLabel, 1);
                    }
                }
            }
        }

        // 3. Final Box Count Calculation
        // - If large items exist, small items are "tucked in" and don't add boxes
        // - If ONLY small items exist, they all fit in 1 box
        let final_box_count = large_box_count;
        if (large_box_count === 0 && has_small_items) {
            final_box_count = 1;
        }

        if (final_box_count > 1) {
            const boxes = Array.from(boxesMap.entries()).map(([label, quantity]) => ({ label, quantity }));
            multiBoxOrders.push({
                order_number: orderNum,
                market_code,
                box_count: final_box_count,
                boxes
            });
        }
    }

    // 7. Build groups — accumulate by (label, market) but skip absorbed cartridge lines
    //    Also track set breakdowns per (label, market, order → set_size)
    const groupMap = new Map<
        string,
        Map<string, { quantity: number; lines: AliasLineDetail[] }>
    >();

    // For set tracking: label → market → list of { set_size, lines }
    // Each entry represents one individual set (one filter unit or one standalone cartridge set)
    const setTracker = new Map<
        string,
        Map<string, { set_size: number; lines: AliasLineDetail[] }[]>
    >();

    // Track cartridge line indices per order for absorption matching
    const cartridgeIdxByOrder = new Map<number, number>();

    for (const rl of resolvedLines) {
        // Skip zero-price items entirely (cancelled/virtual lines / free cartridges)
        if (rl.line.line_price <= 0) {
            continue;
        }

        // Build absorption key for cartridge lines
        if (rl.label === CARTRIDGE_LABEL) {
            const currentIdx = cartridgeIdxByOrder.get(rl.line.order_number) ?? 0;
            const absKey = `${rl.line.order_number}_${rl.line.variant_id}_${currentIdx}`;
            cartridgeIdxByOrder.set(rl.line.order_number, currentIdx + 1);

            if (absorbedKeys.has(absKey)) {
                // This cartridge line is absorbed into a tap filter set — skip it
                continue;
            }
        }

        // Accumulate into group
        let markets = groupMap.get(rl.label);
        if (!markets) {
            markets = new Map();
            groupMap.set(rl.label, markets);
        }
        const marketCode = rl.line.market_code ?? "Unknown";
        const existing = markets.get(marketCode) ?? { quantity: 0, lines: [] };
        existing.quantity += rl.line.quantity;
        existing.lines.push(rl.detail);
        markets.set(marketCode, existing);

        // Track set info — each entry in setSizes[] becomes a separate set record
        if (SET_ELIGIBLE_LABELS.has(rl.label)) {
            const orderSets = orderSetInfo.get(rl.line.order_number);
            const setSizes = orderSets?.get(rl.label);

            if (setSizes !== undefined) {
                let marketSets = setTracker.get(rl.label);
                if (!marketSets) {
                    marketSets = new Map();
                    setTracker.set(rl.label, marketSets);
                }
                let setEntries = marketSets.get(marketCode);
                if (!setEntries) {
                    setEntries = [];
                    marketSets.set(marketCode, setEntries);
                }
                // Add one entry per set size in the array
                for (const sz of setSizes) {
                    setEntries.push({ set_size: sz, lines: [rl.detail] });
                }
                // Clear setSizes so we don't re-add for the same order+label
                // (the first resolved line for this order triggers all set entries)
                orderSets?.delete(rl.label);
            }
        }
    }

    // 8. Build output with pricing
    const groups: AliasGroup[] = [];
    const notifications: string[] = [];
    const seenNotifications = new Set<string>();

    let grandTotalGoods = 0;
    let grandTotalShipping = 0;

    for (const [label, markets] of groupMap) {
        const isSetEligible = SET_ELIGIBLE_LABELS.has(label);
        const allLines: AliasLineDetail[] = [];
        let groupGoodsCost = 0;
        let groupShippingCost = 0;

        const marketBreakdowns: AliasMarketBreakdown[] = [...markets.entries()]
            .map(([market_code, data]) => {
                allLines.push(...data.lines);

                // Check notifications for this (label, market) combo
                const msgs = checkNotifications(label, market_code);
                for (const msg of msgs) {
                    if (!seenNotifications.has(msg)) {
                        seenNotifications.add(msg);
                        notifications.push(msg);
                    }
                }

                const breakdown: AliasMarketBreakdown = {
                    market_code,
                    quantity: data.quantity,
                    lines: data.lines,
                    goods_cost_per_unit: 0,
                    shipping_cost_per_unit: 0,
                    total_cost: 0,
                    missing_price: false,
                };

                // Build set breakdown for set-eligible labels
                if (isSetEligible) {
                    const orderSetsMap = setTracker.get(label)?.get(market_code);
                    if (orderSetsMap) {
                        // Aggregate by set_size: set_size → { count, lines }
                        const setSizeMap = new Map<number, { count: number; lines: AliasLineDetail[] }>();
                        for (const setEntry of orderSetsMap) {
                            const entry = setSizeMap.get(setEntry.set_size) ?? { count: 0, lines: [] };
                            entry.count += 1;
                            entry.lines.push(...setEntry.lines);
                            setSizeMap.set(setEntry.set_size, entry);
                        }

                        breakdown.sets = [...setSizeMap.entries()]
                            .sort((a, b) => a[0] - b[0])
                            .map(([set_size, { count, lines: setLines }]) => {
                                const price = lookupPrice(label, set_size, market_code);
                                const goodsCost = price?.goods_cost ?? 0;
                                const shippingCost = price?.shipping_cost ?? 0;
                                const missingPrice = price === null || price.missing_shipping;
                                const totalCost = (goodsCost + shippingCost) * count;

                                if (missingPrice) {
                                    const msg = `Missing price: '${label}' set of ${set_size} in ${market_code}`;
                                    if (!seenNotifications.has(msg)) {
                                        seenNotifications.add(msg);
                                        notifications.push(msg);
                                    }
                                }

                                groupGoodsCost += goodsCost * count;
                                groupShippingCost += shippingCost * count;

                                return {
                                    set_size,
                                    quantity: count,
                                    lines: setLines,
                                    goods_cost_per_set: goodsCost,
                                    shipping_cost_per_set: shippingCost,
                                    total_cost: totalCost,
                                    missing_price: missingPrice,
                                };
                            });

                        // Sum set costs into the market breakdown
                        breakdown.total_cost = breakdown.sets.reduce((s, set) => s + set.total_cost, 0);
                        breakdown.missing_price = breakdown.sets.some(s => s.missing_price);
                    }
                } else {
                    // Non-set-eligible: price per unit
                    const price = lookupPrice(label, 1, market_code);
                    const goodsCost = price?.goods_cost ?? 0;
                    const shippingCost = price?.shipping_cost ?? 0;
                    const missingPrice = price === null || price.missing_shipping;

                    if (missingPrice) {
                        const msg = `Missing price: '${label}' in ${market_code}`;
                        if (!seenNotifications.has(msg)) {
                            seenNotifications.add(msg);
                            notifications.push(msg);
                        }
                    }

                    breakdown.goods_cost_per_unit = goodsCost;
                    breakdown.shipping_cost_per_unit = shippingCost;
                    breakdown.total_cost = (goodsCost + shippingCost) * data.quantity;
                    breakdown.missing_price = missingPrice;

                    groupGoodsCost += goodsCost * data.quantity;
                    groupShippingCost += shippingCost * data.quantity;
                }

                return breakdown;
            })
            .sort((a, b) => marketSortPos(label, a.market_code) - marketSortPos(label, b.market_code));

        const groupTotalCost = groupGoodsCost + groupShippingCost;
        grandTotalGoods += groupGoodsCost;
        grandTotalShipping += groupShippingCost;

        groups.push({
            supplier_label: label,
            markets: marketBreakdowns,
            total_quantity: marketBreakdowns.reduce((sum, m) => sum + m.quantity, 0),
            lines: allLines,
            is_set_eligible: isSetEligible,
            total_goods_cost: groupGoodsCost,
            total_shipping_cost: groupShippingCost,
            total_cost: groupTotalCost,
        });
    }

    // Sort by label for readability
    groups.sort((a, b) => a.supplier_label.localeCompare(b.supplier_label));

    return {
        groups,
        unmapped: [...unmappedMap.values()],
        notifications,
        totals: {
            total_goods_cost: grandTotalGoods,
            total_shipping_cost: grandTotalShipping,
            total_cost: grandTotalGoods + grandTotalShipping,
        },
        multi_box_orders: multiBoxOrders.sort((a, b) => b.box_count - a.box_count),
        commissionable_product_count: commissionableProductCount,
    };
}
