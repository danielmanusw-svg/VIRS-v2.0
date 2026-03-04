import { db } from "@/db";
import { productVariants, masterProducts } from "@/db/schema";
import { inArray } from "drizzle-orm";
import type { InvoiceLineResult } from "./calculator";

export interface MarketBreakdown {
  code: string;
  quantity: number;
  supplier_cost: number;
  shipping_cost: number;
}

export interface ProductGroup {
  /** Grouping key: "master_{id}" or "variant_{id}" */
  group_key: string;
  master_product_id: number | null;
  master_product_name: string | null;
  /** Display name: master product name if linked, otherwise variant title */
  display_name: string;
  variant_ids: number[];
  skus: string[];
  total_quantity: number;
  markets: MarketBreakdown[];
  total_supplier_cost: number;
  total_shipping_cost: number;
  line_total: number;
}

/**
 * Aggregates invoice line items by master product (or by variant if unlinked),
 * with per-market breakdowns for each group.
 */
export async function aggregateByMasterProduct(
  lines: InvoiceLineResult[]
): Promise<ProductGroup[]> {
  // 1. Collect all unique variant IDs from lines
  const variantIds = [
    ...new Set(lines.map((l) => l.variant_id).filter((id): id is number => id !== null)),
  ];

  if (variantIds.length === 0) {
    return [];
  }

  // 2. Fetch variant → master_product_id mapping
  const variants = await db
    .select({
      id: productVariants.id,
      title: productVariants.title,
      sku: productVariants.sku,
      master_product_id: productVariants.master_product_id,
    })
    .from(productVariants)
    .where(inArray(productVariants.id, variantIds));

  const variantMap = new Map(
    variants.map((v) => [v.id, v])
  );

  // 3. Fetch master product names for linked variants
  const masterProductIds = [
    ...new Set(
      variants
        .map((v) => v.master_product_id)
        .filter((id): id is number => id !== null)
    ),
  ];

  const masterProductMap = new Map<number, string>();
  if (masterProductIds.length > 0) {
    const mps = await db
      .select({ id: masterProducts.id, name: masterProducts.name })
      .from(masterProducts)
      .where(inArray(masterProducts.id, masterProductIds));
    for (const mp of mps) {
      masterProductMap.set(mp.id, mp.name);
    }
  }

  // 4. Group lines by master_product_id or variant_id
  const groupMap = new Map<string, {
    master_product_id: number | null;
    master_product_name: string | null;
    display_name: string;
    variant_ids: Set<number>;
    skus: Set<string>;
    markets: Map<string, MarketBreakdown>;
    total_quantity: number;
    total_supplier_cost: number;
    total_shipping_cost: number;
  }>();

  for (const line of lines) {
    const variant = line.variant_id ? variantMap.get(line.variant_id) : null;
    const mpId = variant?.master_product_id ?? null;

    // Determine group key and display name
    let groupKey: string;
    let displayName: string;
    let masterName: string | null = null;

    if (mpId !== null) {
      groupKey = `master_${mpId}`;
      masterName = masterProductMap.get(mpId) ?? null;
      displayName = masterName ?? `Master Product ${mpId}`;
    } else if (line.variant_id !== null) {
      groupKey = `variant_${line.variant_id}`;
      displayName = variant?.title ?? line.title;
    } else {
      groupKey = `unknown_${line.title}`;
      displayName = line.title;
    }

    // Get or create group
    let group = groupMap.get(groupKey);
    if (!group) {
      group = {
        master_product_id: mpId,
        master_product_name: masterName,
        display_name: displayName,
        variant_ids: new Set(),
        skus: new Set(),
        markets: new Map(),
        total_quantity: 0,
        total_supplier_cost: 0,
        total_shipping_cost: 0,
      };
      groupMap.set(groupKey, group);
    }

    // Add variant/SKU to group
    if (line.variant_id !== null) {
      group.variant_ids.add(line.variant_id);
    }
    if (line.sku) {
      group.skus.add(line.sku);
    }

    // Accumulate totals
    group.total_quantity += line.quantity;
    group.total_supplier_cost += line.supplier_cost;
    group.total_shipping_cost += line.shipping_cost;

    // Accumulate market breakdown
    const marketCode = line.market_code ?? "Unknown";
    let market = group.markets.get(marketCode);
    if (!market) {
      market = { code: marketCode, quantity: 0, supplier_cost: 0, shipping_cost: 0 };
      group.markets.set(marketCode, market);
    }
    market.quantity += line.quantity;
    market.supplier_cost += line.supplier_cost;
    market.shipping_cost += line.shipping_cost;
  }

  // 5. Convert to output format
  const groups: ProductGroup[] = [];
  for (const [groupKey, group] of groupMap) {
    groups.push({
      group_key: groupKey,
      master_product_id: group.master_product_id,
      master_product_name: group.master_product_name,
      display_name: group.display_name,
      variant_ids: [...group.variant_ids],
      skus: [...group.skus],
      total_quantity: group.total_quantity,
      markets: [...group.markets.values()].sort((a, b) =>
        a.code.localeCompare(b.code)
      ),
      total_supplier_cost: group.total_supplier_cost,
      total_shipping_cost: group.total_shipping_cost,
      line_total: group.total_supplier_cost + group.total_shipping_cost,
    });
  }

  // Sort groups by display name
  groups.sort((a, b) => a.display_name.localeCompare(b.display_name));

  return groups;
}
