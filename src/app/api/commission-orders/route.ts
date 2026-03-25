import { NextResponse } from "next/server";
import { db } from "@/db";
import { invoiceLineItems, invoices } from "@/db/schema";
import { desc, eq, ne } from "drizzle-orm";
import { aggregateBySupplierAlias, type AliasGroup } from "@/lib/invoice/aliasAggregator";
import { parseInvoiceMetadata } from "@/lib/invoice/snapshot";
import path from "node:path";
import { readdir } from "node:fs/promises";

const TAP_FILTER_SUPPLIER_LABELS = new Set(["stainless steel", "plastic filter"]);
const CARTRIDGE_SUPPLIER_LABEL = "plastic and stainless steel cartridges";
const INVOICE_RANGE_OVERRIDES: Record<
  number,
  { start_order_number?: number; end_order_number?: number }
> = {
  199: { start_order_number: 37504, end_order_number: 38402 },
};
const EXCLUDED_INVOICE_IDS = new Set([206]);
const CHANGE_DATE_ISO = "2025-08-27";
const CHANGE_TIMESTAMP = Date.parse(`${CHANGE_DATE_ISO}T00:00:00Z`);

interface CommissionOrderItem {
  title: string;
  quantity: number;
}

interface CommissionOrderRow {
  order_number: number;
  market_code: string;
  product_count: number;
  overcharge: number;
  items: CommissionOrderItem[];
  invoice_id: number;
  invoice_range: string;
  rate: number;
  is_standalone_cartridge_order: boolean;
}

function parseTimestamp(raw: unknown) {
  if (raw === null || raw === undefined) {
    return Number.NaN;
  }

  const numericValue = Number(raw);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  return Date.parse(String(raw));
}

async function loadInvoiceDateMap() {
  const invoiceDir = path.join(process.cwd(), "docs", "FP Invoices");
  const files = await readdir(invoiceDir);
  const map = new Map<string, number>();

  for (const fileName of files) {
    const match = fileName.match(/^(\d+)-(\d+) \((\d{2})`(\d{2})`(\d{2})\)/);
    if (!match) {
      continue;
    }

    const [, start, end, day, month, yearShort] = match;
    const year = 2000 + Number(yearShort);
    const timestamp = Date.parse(
      `${year.toString().padStart(4, "0")}-${month}-${day}T00:00:00Z`
    );

    map.set(`${start}-${end}`, timestamp);
  }

  return map;
}

function filterSupplierGroupsToRange(
  supplierGroups: AliasGroup[],
  effectiveStart: number,
  effectiveEnd: number
) {
  return supplierGroups
    .map((group) => ({
      ...group,
      markets: group.markets
        .map((market) => ({
          ...market,
          lines: market.lines.filter(
            (line) =>
              line.order_number >= effectiveStart &&
              line.order_number <= effectiveEnd
          ),
        }))
        .filter((market) => market.lines.length > 0),
    }))
    .filter((group) => group.markets.length > 0);
}

function buildOverchargedOrders(
  supplierGroups: AliasGroup[],
  invoiceId: number,
  invoiceRange: string,
  rate: number
) {
  const orderMap = new Map<number, CommissionOrderRow>();
  const tapFilterOrders = new Set<number>();
  const orderLabels = new Map<number, Set<string>>();

  for (const group of supplierGroups) {
    if (!TAP_FILTER_SUPPLIER_LABELS.has(group.supplier_label.toLowerCase())) {
      continue;
    }

    for (const market of group.markets) {
      for (const line of market.lines) {
        tapFilterOrders.add(line.order_number);
      }
    }
  }

  for (const group of supplierGroups) {
    const supplierLabel = group.supplier_label.toLowerCase();
    if (supplierLabel.includes("adapter")) {
      continue;
    }

    for (const market of group.markets) {
      for (const line of market.lines) {
        if (
          supplierLabel === CARTRIDGE_SUPPLIER_LABEL &&
          tapFilterOrders.has(line.order_number)
        ) {
          continue;
        }

        const labels = orderLabels.get(line.order_number) ?? new Set<string>();
        labels.add(group.supplier_label);
        orderLabels.set(line.order_number, labels);

        const existing = orderMap.get(line.order_number) ?? {
          order_number: line.order_number,
          market_code: market.market_code ?? "Unknown",
          product_count: 0,
          overcharge: 0,
          items: [],
          invoice_id: invoiceId,
          invoice_range: invoiceRange,
          rate,
          is_standalone_cartridge_order: false,
        };

        existing.product_count += line.quantity;
        existing.items.push({
          title: line.title,
          quantity: line.quantity,
        });

        orderMap.set(line.order_number, existing);
      }
    }
  }

  return [...orderMap.values()]
    .filter((order) => order.product_count > 1)
    .map((order) => ({
      ...order,
      overcharge: (order.product_count - 1) * rate,
      is_standalone_cartridge_order:
        Array.from(orderLabels.get(order.order_number) ?? []).every(
          (label) => label.toLowerCase() === CARTRIDGE_SUPPLIER_LABEL
        ),
    }))
    .sort((a, b) => b.order_number - a.order_number);
}

function spreadStandaloneCartridgeOrders(
  invoiceOrders: CommissionOrderRow[]
) {
  if (invoiceOrders.length < 6) {
    return invoiceOrders;
  }

  const standaloneCartridgeOrders = invoiceOrders.filter(
    (order) => order.is_standalone_cartridge_order
  );
  const otherOrders = invoiceOrders.filter(
    (order) => !order.is_standalone_cartridge_order
  );

  if (standaloneCartridgeOrders.length === 0 || otherOrders.length === 0) {
    return invoiceOrders;
  }

  const hashOrder = (order: CommissionOrderRow) =>
    Math.abs((order.order_number * 2654435761) % 2147483647);

  const shuffledStandaloneOrders = [...standaloneCartridgeOrders].sort(
    (a, b) => hashOrder(a) - hashOrder(b) || a.order_number - b.order_number
  );
  const result = [...otherOrders];
  const finalLength = invoiceOrders.length;
  const firstAllowedIndex = Math.max(2, Math.ceil(finalLength * 0.22));
  const lastAllowedIndex = Math.min(
    result.length,
    Math.max(firstAllowedIndex, Math.floor(finalLength * 0.78))
  );
  const slotSpan = Math.max(1, lastAllowedIndex - firstAllowedIndex + 1);
  const jitterRange = Math.max(
    1,
    Math.floor(slotSpan / Math.max(shuffledStandaloneOrders.length * 3, 3))
  );
  const usedIndexes = new Set<number>();
  const placements = shuffledStandaloneOrders.map((order, index) => {
    const baseIndex =
      firstAllowedIndex +
      Math.floor(((index + 0.5) / shuffledStandaloneOrders.length) * slotSpan);
    const hash = hashOrder(order);
    let targetIndex =
      baseIndex + ((hash % (jitterRange * 2 + 1)) - jitterRange);
    targetIndex = Math.max(
      firstAllowedIndex,
      Math.min(lastAllowedIndex, targetIndex)
    );

    if (usedIndexes.has(targetIndex)) {
      let radius = 1;
      while (radius <= slotSpan) {
        const backward = targetIndex - radius;
        const forward = targetIndex + radius;

        if (
          backward >= firstAllowedIndex &&
          !usedIndexes.has(backward)
        ) {
          targetIndex = backward;
          break;
        }

        if (forward <= lastAllowedIndex && !usedIndexes.has(forward)) {
          targetIndex = forward;
          break;
        }

        radius += 1;
      }
    }

    usedIndexes.add(targetIndex);
    return { targetIndex, order };
  });

  placements
    .sort((a, b) => a.targetIndex - b.targetIndex)
    .forEach(({ targetIndex, order }, offset) => {
      result.splice(Math.min(result.length, targetIndex + offset), 0, order);
    });

  return result;
}

export async function GET() {
  try {
    const [invoiceDateMap, allInvoices] = await Promise.all([
      loadInvoiceDateMap(),
      db
        .select({
          id: invoices.id,
          start_order_number: invoices.start_order_number,
          end_order_number: invoices.end_order_number,
          status: invoices.status,
          confirmed_at: invoices.confirmed_at,
          missing_order_numbers: invoices.missing_order_numbers,
        })
        .from(invoices)
        .where(ne(invoices.status, "void"))
        .orderBy(desc(invoices.start_order_number)),
    ]);

    const commissionOrdersByInvoice = new Map<number, CommissionOrderRow[]>();

    for (const inv of allInvoices) {
      if (EXCLUDED_INVOICE_IDS.has(inv.id)) {
        continue;
      }

      const rangeOverride = INVOICE_RANGE_OVERRIDES[inv.id];
      const effectiveStart =
        rangeOverride?.start_order_number ?? inv.start_order_number;
      const effectiveEnd =
        rangeOverride?.end_order_number ?? inv.end_order_number;
      const invoiceRange = `#${effectiveStart} - #${effectiveEnd}`;
      const rangeKey = `${effectiveStart}-${effectiveEnd}`;
      const timestamp =
        invoiceDateMap.get(rangeKey) ?? parseTimestamp(inv.confirmed_at);
      const rate =
        Number.isFinite(timestamp) && timestamp < CHANGE_TIMESTAMP ? 1.0 : 0.8;

      const { snapshot } = parseInvoiceMetadata(inv.missing_order_numbers);

      let supplierGroups: AliasGroup[] = [];

      if (snapshot?.supplier_groups) {
        supplierGroups = filterSupplierGroupsToRange(
          snapshot.supplier_groups,
          effectiveStart,
          effectiveEnd
        );
      } else {
        const lines = await db
          .select()
          .from(invoiceLineItems)
          .where(eq(invoiceLineItems.invoice_id, inv.id));

        const filteredLines = lines
          .filter(
            (line) =>
              line.order_number >= effectiveStart &&
              line.order_number <= effectiveEnd
          )
          .map((line) => ({
            order_id: line.order_id,
            order_number: line.order_number,
            variant_id: line.variant_id,
            sku: line.sku,
            title: line.title,
            quantity: line.quantity,
            market_code: line.market_code,
            supplier_cost: line.supplier_cost,
            shipping_cost: line.shipping_cost,
            line_total: line.line_total,
            line_price: line.line_price,
          }));

        const aliasAggregation = await aggregateBySupplierAlias(filteredLines);
        supplierGroups = aliasAggregation.groups;
      }

      const invoiceOrders = buildOverchargedOrders(
        supplierGroups,
        inv.id,
        invoiceRange,
        rate
      );

      commissionOrdersByInvoice.set(
        inv.id,
        spreadStandaloneCartridgeOrders(invoiceOrders)
      );
    }

    const allCommissionOrders = allInvoices
      .filter((inv) => !EXCLUDED_INVOICE_IDS.has(inv.id))
      .flatMap((inv) => commissionOrdersByInvoice.get(inv.id) ?? []);

    const totalOvercharge = allCommissionOrders.reduce(
      (sum, order) => sum + order.overcharge,
      0
    );

    return NextResponse.json({
      total: allCommissionOrders.length,
      total_overcharge: totalOvercharge,
      rate_change_date: CHANGE_DATE_ISO,
      excluded_invoice_ids: [...EXCLUDED_INVOICE_IDS],
      orders: allCommissionOrders,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch commission orders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
