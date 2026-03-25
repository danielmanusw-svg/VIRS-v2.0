import type { AliasAggregationResult, MultiBoxOrder, UnmappedItem } from "./aliasAggregator";
import type { ProductGroup } from "./aggregator";
import type { VerificationReport } from "./verification";

export interface InvoiceViewSnapshot {
  product_groups: ProductGroup[];
  verification: VerificationReport;
  supplier_groups: AliasAggregationResult["groups"];
  unmapped_items: UnmappedItem[];
  notifications: string[];
  totals: AliasAggregationResult["totals"];
  multi_box_orders: MultiBoxOrder[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInvoiceViewSnapshot(value: unknown): value is InvoiceViewSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  const totals = value.totals;

  return (
    Array.isArray(value.product_groups) &&
    isRecord(value.verification) &&
    Array.isArray(value.supplier_groups) &&
    Array.isArray(value.unmapped_items) &&
    Array.isArray(value.notifications) &&
    isRecord(totals) &&
    typeof totals.total_goods_cost === "number" &&
    typeof totals.total_shipping_cost === "number" &&
    typeof totals.total_cost === "number" &&
    Array.isArray(value.multi_box_orders)
  );
}

export function parseInvoiceViewSnapshot(
  value: unknown
): InvoiceViewSnapshot | null {
  return isInvoiceViewSnapshot(value) ? value : null;
}

export function buildInvoiceViewSnapshot(params: {
  product_groups: ProductGroup[];
  verification: VerificationReport;
  aliasAggregation: AliasAggregationResult;
}): InvoiceViewSnapshot {
  const { product_groups, verification, aliasAggregation } = params;

  return {
    product_groups,
    verification,
    supplier_groups: aliasAggregation.groups,
    unmapped_items: aliasAggregation.unmapped,
    notifications: aliasAggregation.notifications,
    totals: aliasAggregation.totals,
    multi_box_orders: aliasAggregation.multi_box_orders,
  };
}

export function serializeInvoiceMetadata(
  missingOrderNumbers: number[],
  snapshot: InvoiceViewSnapshot
): string {
  return JSON.stringify({
    missing_order_numbers: missingOrderNumbers,
    snapshot,
  });
}

export function parseInvoiceMetadata(raw: string | null): {
  missing_order_numbers: number[];
  snapshot: InvoiceViewSnapshot | null;
} {
  if (!raw) {
    return { missing_order_numbers: [], snapshot: null };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return {
        missing_order_numbers: parsed.filter(
          (value): value is number => typeof value === "number"
        ),
        snapshot: null,
      };
    }

    if (!isRecord(parsed)) {
      return { missing_order_numbers: [], snapshot: null };
    }

    const missing_order_numbers = Array.isArray(parsed.missing_order_numbers)
      ? parsed.missing_order_numbers.filter(
          (value): value is number => typeof value === "number"
        )
      : [];

    const snapshot = isInvoiceViewSnapshot(parsed.snapshot)
      ? parsed.snapshot
      : null;

    return {
      missing_order_numbers,
      snapshot,
    };
  } catch {
    return { missing_order_numbers: [], snapshot: null };
  }
}
