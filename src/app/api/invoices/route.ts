import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceLineItems } from "@/db/schema";
import { desc, sql, eq } from "drizzle-orm";
import {
  calculateInvoice,
  type MarketOverrides,
} from "@/lib/invoice/calculator";
import { aggregateByMasterProduct } from "@/lib/invoice/aggregator";
import { buildVerificationReport } from "@/lib/invoice/verification";
import { aggregateBySupplierAlias } from "@/lib/invoice/aliasAggregator";

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
        invoice: invoices,
        total_quantity: sql<number>`COALESCE(SUM(${invoiceLineItems.quantity}), 0)`.mapWith(Number),
      })
      .from(invoices)
      .leftJoin(invoiceLineItems, eq(invoices.id, invoiceLineItems.invoice_id))
      .groupBy(invoices.id)
      .orderBy(desc(invoices.created_at))
      .limit(limit)
      .offset(offset);

    const formattedData = data.map((row) => ({
      ...row.invoice,
      total_quantity: row.total_quantity,
    }));

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
      overrides,
    } = body as {
      start_order_number: number;
      end_order_number: number;
      overrides?: MarketOverrides;
    };

    if (!start_order_number || !end_order_number) {
      return NextResponse.json(
        { error: "start_order_number and end_order_number are required" },
        { status: 400 }
      );
    }

    // Run the calculator
    const calc = await calculateInvoice(
      start_order_number,
      end_order_number,
      overrides
    );

    // Build aggregation and verification report
    const productGroups = await aggregateByMasterProduct(calc.lines);
    const verification = buildVerificationReport(
      calc,
      start_order_number,
      end_order_number
    );

    // Build supplier-alias-grouped aggregation for invoice comparison
    const aliasAggregation = await aggregateBySupplierAlias(calc.lines);

    // Create the invoice record
    const [invoice] = await db
      .insert(invoices)
      .values({
        start_order_number,
        end_order_number,
        status: "draft",
        total_supplier_cost: calc.total_supplier_cost,
        total_shipping_cost: calc.total_shipping_cost,
        grand_total: calc.grand_total,
        missing_order_numbers:
          calc.missing_order_numbers.length > 0
            ? JSON.stringify(calc.missing_order_numbers)
            : null,
        eu_shipping_override: overrides?.EU ?? null,
        uk_shipping_override: overrides?.UK ?? null,
        us_shipping_override: overrides?.US ?? null,
        au_shipping_override: overrides?.AU ?? null,
        distinct_order_count: calc.distinct_order_count,
        total_commission_gbp: calc.total_commission_gbp,
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
          }))
        );
      }
    }

    return NextResponse.json({
      invoice,
      lines: calc.lines,
      missing_order_numbers: calc.missing_order_numbers,
      product_groups: productGroups,
      verification,
      supplier_groups: aliasAggregation.groups,
      unmapped_items: aliasAggregation.unmapped,
    });
  } catch (error) {
    console.error("Failed to create invoice:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
