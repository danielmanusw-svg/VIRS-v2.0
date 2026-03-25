import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceLineItems } from "@/db/schema";
import { desc, sql, eq } from "drizzle-orm";
import { calculateInvoice } from "@/lib/invoice/calculator";
import { aggregateByMasterProduct } from "@/lib/invoice/aggregator";
import { buildVerificationReport } from "@/lib/invoice/verification";
import { aggregateBySupplierAlias } from "@/lib/invoice/aliasAggregator";
import { processOrders } from "@/lib/sync/orderSync";
import { fetchShopifyOrdersByQuery } from "@/lib/shopify/orders";
import {
  buildInvoiceViewSnapshot,
  serializeInvoiceMetadata,
} from "@/lib/invoice/snapshot";

const TAP_FILTER_SUPPLIER_LABELS = new Set(["stainless steel", "plastic filter"]);
const CARTRIDGE_SUPPLIER_LABEL = "plastic and stainless steel cartridges";

function countSnapshotQuantityForLabels(
  supplierGroups: unknown,
  predicate: (supplierLabel: string) => boolean
) {
  if (!Array.isArray(supplierGroups)) {
    return 0;
  }

  return supplierGroups.reduce((sum: number, group: unknown) => {
    if (!group || typeof group !== "object" || !("supplier_label" in group)) {
      return sum;
    }

    const supplierLabel = String(group.supplier_label ?? "").toLowerCase();
    if (!predicate(supplierLabel)) {
      return sum;
    }

    const totalQuantity =
      "total_quantity" in group ? Number(group.total_quantity ?? 0) : 0;

    return sum + (Number.isFinite(totalQuantity) ? totalQuantity : 0);
  }, 0);
}

function countSnapshotCartridgesPairedWithTapFilters(supplierGroups: unknown) {
  if (!Array.isArray(supplierGroups)) {
    return 0;
  }

  const tapFilterOrders = new Set<number>();

  for (const group of supplierGroups) {
    if (!group || typeof group !== "object" || !("supplier_label" in group)) {
      continue;
    }

    const supplierLabel = String(group.supplier_label ?? "").toLowerCase();
    if (!TAP_FILTER_SUPPLIER_LABELS.has(supplierLabel)) {
      continue;
    }

    const lines =
      "lines" in group && Array.isArray(group.lines) ? group.lines : [];

    for (const line of lines) {
      if (!line || typeof line !== "object" || !("order_number" in line)) {
        continue;
      }

      const orderNumber = Number(line.order_number ?? 0);
      if (Number.isFinite(orderNumber)) {
        tapFilterOrders.add(orderNumber);
      }
    }
  }

  if (tapFilterOrders.size === 0) {
    return 0;
  }

  let cartridgeQuantity = 0;

  for (const group of supplierGroups) {
    if (!group || typeof group !== "object" || !("supplier_label" in group)) {
      continue;
    }

    const supplierLabel = String(group.supplier_label ?? "").toLowerCase();
    if (supplierLabel !== CARTRIDGE_SUPPLIER_LABEL) {
      continue;
    }

    const lines =
      "lines" in group && Array.isArray(group.lines) ? group.lines : [];

    for (const line of lines) {
      if (!line || typeof line !== "object") {
        continue;
      }

      const orderNumber =
        "order_number" in line ? Number(line.order_number ?? 0) : Number.NaN;
      const quantity =
        "quantity" in line ? Number(line.quantity ?? 0) : Number.NaN;

      if (tapFilterOrders.has(orderNumber) && Number.isFinite(quantity)) {
        cartridgeQuantity += quantity;
      }
    }
  }

  return cartridgeQuantity;
}

// GET: list all invoices with pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "100", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(invoices);

    const data = await db
      .select({
        id: invoices.id,
        start_order_number: invoices.start_order_number,
        end_order_number: invoices.end_order_number,
        status: invoices.status,
        total_supplier_cost: invoices.total_supplier_cost,
        total_shipping_cost: invoices.total_shipping_cost,
        grand_total: invoices.grand_total,
        total_commission_gbp: invoices.total_commission_gbp,
        distinct_order_count: invoices.distinct_order_count,
        missing_order_numbers: invoices.missing_order_numbers,
        created_at: invoices.created_at,
        confirmed_at: invoices.confirmed_at,
        total_quantity: sql<number>`COALESCE(SUM(${invoiceLineItems.quantity}), 0)`.mapWith(Number),
      })
      .from(invoices)
      .leftJoin(invoiceLineItems, eq(invoices.id, invoiceLineItems.invoice_id))
      .groupBy(invoices.id)
      .orderBy(desc(invoices.start_order_number))
      .limit(limit)
      .offset(offset);

    const formattedData = data.map((row) => {
      let multi_box_count = 0;
      let order_commission_gbp = 0;
      let product_commission_gbp = 0;

      if (row.missing_order_numbers) {
        try {
          const parsed = JSON.parse(row.missing_order_numbers);
          if (parsed && typeof parsed === 'object' && parsed.snapshot) {
            const snap = parsed.snapshot;
            if (Array.isArray(snap.multi_box_orders)) {
              multi_box_count = snap.multi_box_orders.length;
            }
            // Pull the correct commission values from the frozen snapshot
            if (snap.verification) {
              const orderCount = snap.verification.commission?.distinct_order_count ?? 0;
              const commQty = snap.verification.quantity_summary?.commissionable_quantity ?? 0;
              const supplierGroups = snap.supplier_groups;
              const adapterQty = countSnapshotQuantityForLabels(
                supplierGroups,
                (supplierLabel) => supplierLabel.includes("adapter")
              );
              const cartridgeQty = countSnapshotCartridgesPairedWithTapFilters(
                supplierGroups
              );
              const adjustedCommQty = Math.max(
                0,
                commQty - adapterQty - cartridgeQty
              );
              order_commission_gbp = orderCount * 0.80;
              product_commission_gbp = adjustedCommQty * 0.80;
            }
          }
        } catch {
          // ignore
        }
      }

      // Fallback: if snapshot wasn't available, use what's in the DB columns
      if (order_commission_gbp === 0) {
        const distinctOrders = row.distinct_order_count ?? 0;
        order_commission_gbp = distinctOrders * 0.80;
      }
      if (product_commission_gbp === 0) {
        product_commission_gbp = row.total_commission_gbp ?? 0;
      }

      return {
        id: row.id,
        start_order_number: row.start_order_number,
        end_order_number: row.end_order_number,
        status: row.status,
        total_supplier_cost: row.total_supplier_cost,
        total_shipping_cost: row.total_shipping_cost,
        grand_total: row.grand_total,
        missing_order_numbers: null,
        multi_box_count,
        created_at: row.created_at,
        confirmed_at: row.confirmed_at,
        order_commission_gbp,
        product_commission_gbp,
      };
    });

    return NextResponse.json({ data: formattedData, total: count });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch invoices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: create a new draft invoice
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      start_order_number,
      end_order_number,
    } = body as {
      start_order_number: number;
      end_order_number: number;
    };

    if (!start_order_number || !end_order_number) {
      return NextResponse.json(
        { error: "start_order_number and end_order_number are required" },
        { status: 400 }
      );
    }

    // Run the calculator (fetches orders, line items, filters collections)
    let calc = await calculateInvoice(
      start_order_number,
      end_order_number
    );

    if (calc.missing_order_numbers.length > 0) {
      console.log(`  -> Found ${calc.missing_order_numbers.length} missing orders. Fetching from Shopify...`);
      const BATCH_SIZE = 20;
      for (let i = 0; i < calc.missing_order_numbers.length; i += BATCH_SIZE) {
        const batch = calc.missing_order_numbers.slice(i, i + BATCH_SIZE);
        const query = batch.map(n => `name:${n}`).join(" OR ");
        const fetchedOrders = await fetchShopifyOrdersByQuery(query);
        if (fetchedOrders.length > 0) {
          await processOrders(fetchedOrders);
        }
      }
      // Recalculate after fetching the missing orders
      calc = await calculateInvoice(
        start_order_number,
        end_order_number
      );
    }

    // Build aggregation and verification report
    const productGroups = await aggregateByMasterProduct(calc.lines);
    // Build supplier-alias-grouped aggregation with pricing from price sheet
    const aliasAggregation = await aggregateBySupplierAlias(calc.lines);

    // Override naive counts with set-aware counts from the aggregator
    calc.commissionable_product_count = aliasAggregation.commissionable_product_count;
    calc.total_commission_gbp = calc.commissionable_product_count * 0.8;

    // Build verification report (now uses updated calc)
    const verification = buildVerificationReport(
      calc,
      start_order_number,
      end_order_number
    );

    const snapshot = buildInvoiceViewSnapshot({
      product_groups: productGroups,
      verification,
      aliasAggregation,
    });

    // Use price-sheet-derived totals
    const totalGoodsCost = aliasAggregation.totals.total_goods_cost;
    const totalShippingCost = aliasAggregation.totals.total_shipping_cost;
    const commission = calc.total_commission_gbp;
    const grandTotal = totalGoodsCost + totalShippingCost + commission;

    // Create the invoice record
    const [invoice] = await db
      .insert(invoices)
      .values({
        start_order_number,
        end_order_number,
        status: "draft",
        total_supplier_cost: totalGoodsCost,
        total_shipping_cost: totalShippingCost,
        grand_total: grandTotal,
        missing_order_numbers: serializeInvoiceMetadata(
          calc.missing_order_numbers,
          snapshot
        ),
        eu_shipping_override: null,
        uk_shipping_override: null,
        us_shipping_override: null,
        au_shipping_override: null,
        distinct_order_count: calc.distinct_order_count,
        total_commission_gbp: commission,
      })
      .returning();

    // Persist all line items (immutable after confirm)
    if (calc.lines.length > 0) {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < calc.lines.length; i += CHUNK_SIZE) {
        const chunk = calc.lines.slice(i, i + CHUNK_SIZE);
        await db.insert(invoiceLineItems).values(
          chunk.map((line) => ({
            invoice_id: invoice.id,
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
          }))
        );
      }
    }

    return NextResponse.json({
      invoice: {
        ...invoice,
        total_supplier_cost: totalGoodsCost,
        total_shipping_cost: totalShippingCost,
        grand_total: grandTotal,
      },
      lines: calc.lines,
      missing_order_numbers: calc.missing_order_numbers,
      ...snapshot,
    });
  } catch (error) {
    console.error("Failed to create invoice:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
