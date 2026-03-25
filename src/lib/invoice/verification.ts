import type { InvoiceCalculation, InvoiceLineResult } from "./calculator";

// ─── Check Result Types ────────────────────────────────────────────────────

export interface OrderCompletenessCheck {
  total_in_range: number;
  missing_count: number;
  missing_order_numbers: number[];
}

export interface QuantitySummaryCheck {
  total_line_items: number;
  total_quantity: number;
  commissionable_quantity: number;
}

export interface MarketDistributionEntry {
  market_code: string;
  order_count: number;   // distinct orders in this market
  total_quantity: number;
}

export interface MarketDistributionCheck {
  markets: MarketDistributionEntry[];
  unattributed_orders: number; // orders with no market_code
}

export interface CommissionCheck {
  distinct_order_count: number;
  rate_gbp: number;
  total_commission_gbp: number;
}

export interface MultiItemOrderEntry {
  order_number: number;
  market_code: string | null;
  lines: {
    title: string;
    sku: string | null;
    quantity: number;
    shipping_cost: number;
    shipping_per_unit: number;
  }[];
  total_shipping_on_invoice: number;
  /** True when at least two lines have different per-unit shipping costs */
  has_mixed_shipping_rates: boolean;
}

export interface ShippingAnalysisCheck {
  /** Orders with exactly one line item */
  single_item_order_count: number;
  /** Orders with more than one line item (potential per-item vs per-order issue) */
  multi_item_orders: MultiItemOrderEntry[];
}

export interface VerificationReport {
  order_completeness: OrderCompletenessCheck;
  quantity_summary: QuantitySummaryCheck;
  market_distribution: MarketDistributionCheck;
  commission: CommissionCheck;
  shipping_analysis: ShippingAnalysisCheck;
}

// ─── Builder ───────────────────────────────────────────────────────────────

export function buildVerificationReport(
  calc: InvoiceCalculation,
  startOrderNumber: number,
  endOrderNumber: number
): VerificationReport {
  const { lines, missing_order_numbers, distinct_order_count, total_commission_gbp } = calc;

  // 1. Order completeness
  const totalInRange = endOrderNumber - startOrderNumber + 1;
  const order_completeness: OrderCompletenessCheck = {
    total_in_range: totalInRange,
    missing_count: missing_order_numbers.length,
    missing_order_numbers,
  };

  // 2. Quantity summary
  const quantity_summary: QuantitySummaryCheck = {
    total_line_items: lines.length,
    total_quantity: lines.reduce((sum, l) => sum + l.quantity, 0),
    commissionable_quantity: calc.commissionable_product_count,
  };

  // 3. Market distribution — group by market, count distinct orders and total quantity
  const marketMap = new Map<string, { orderNums: Set<number>; quantity: number }>();
  let unattributedOrders = 0;

  // Use a set to track orders without a market
  const unattributedOrderNums = new Set<number>();

  for (const line of lines) {
    const code = line.market_code ?? null;
    if (code === null) {
      unattributedOrderNums.add(line.order_number);
      continue;
    }
    let entry = marketMap.get(code);
    if (!entry) {
      entry = { orderNums: new Set(), quantity: 0 };
      marketMap.set(code, entry);
    }
    entry.orderNums.add(line.order_number);
    entry.quantity += line.quantity;
  }

  unattributedOrders = unattributedOrderNums.size;

  const marketEntries: MarketDistributionEntry[] = [...marketMap.entries()]
    .map(([market_code, { orderNums, quantity }]) => ({
      market_code,
      order_count: orderNums.size,
      total_quantity: quantity,
    }))
    .sort((a, b) => a.market_code.localeCompare(b.market_code));

  const market_distribution: MarketDistributionCheck = {
    markets: marketEntries,
    unattributed_orders: unattributedOrders,
  };

  // 4. Commission
  const commission: CommissionCheck = {
    distinct_order_count,
    rate_gbp: 0.8,
    total_commission_gbp,
  };

  // 5. Shipping analysis — group lines by order, flag multi-item orders
  const orderLinesMap = new Map<number, InvoiceLineResult[]>();
  for (const line of lines) {
    let group = orderLinesMap.get(line.order_number);
    if (!group) {
      group = [];
      orderLinesMap.set(line.order_number, group);
    }
    group.push(line);
  }

  let singleItemOrderCount = 0;
  const multiItemOrders: MultiItemOrderEntry[] = [];

  for (const [order_number, orderLines] of orderLinesMap) {
    if (orderLines.length === 1) {
      singleItemOrderCount++;
      continue;
    }

    const totalShipping = orderLines.reduce((sum, l) => sum + l.shipping_cost, 0);

    const lineSummaries = orderLines.map((l) => ({
      title: l.title,
      sku: l.sku,
      quantity: l.quantity,
      shipping_cost: l.shipping_cost,
      shipping_per_unit: l.quantity > 0 ? l.shipping_cost / l.quantity : 0,
    }));

    // Check if any two lines have different per-unit shipping rates
    const uniqueRates = new Set(lineSummaries.map((l) => l.shipping_per_unit));
    const hasMixedRates = uniqueRates.size > 1;

    multiItemOrders.push({
      order_number,
      market_code: orderLines[0].market_code,
      lines: lineSummaries,
      total_shipping_on_invoice: totalShipping,
      has_mixed_shipping_rates: hasMixedRates,
    });
  }

  // Sort multi-item orders by order number for readability
  multiItemOrders.sort((a, b) => a.order_number - b.order_number);

  const shipping_analysis: ShippingAnalysisCheck = {
    single_item_order_count: singleItemOrderCount,
    multi_item_orders: multiItemOrders,
  };

  return {
    order_completeness,
    quantity_summary,
    market_distribution,
    commission,
    shipping_analysis,
  };
}
