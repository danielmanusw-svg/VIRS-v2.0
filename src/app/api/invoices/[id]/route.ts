import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceLineItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { aggregateByMasterProduct } from "@/lib/invoice/aggregator";
import { aggregateBySupplierAlias } from "@/lib/invoice/aliasAggregator";
import { buildVerificationReport } from "@/lib/invoice/verification";
import type { InvoiceCalculation } from "@/lib/invoice/calculator";
import {
  buildInvoiceViewSnapshot,
  parseInvoiceMetadata,
  parseInvoiceViewSnapshot,
  serializeInvoiceMetadata,
} from "@/lib/invoice/snapshot";

// GET: fetch a single invoice with its line items
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoiceId = parseInt(id, 10);

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoice_id, invoiceId));

    const { missing_order_numbers: missingOrderNumbers } =
      parseInvoiceMetadata(invoice.missing_order_numbers);

    const calcLike: InvoiceCalculation = {
      lines: lines.map((l) => ({
        order_id: l.order_id,
        order_number: l.order_number,
        variant_id: l.variant_id,
        sku: l.sku,
        title: l.title,
        quantity: l.quantity,
        market_code: l.market_code,
        supplier_cost: l.supplier_cost,
        shipping_cost: l.shipping_cost,
        line_total: l.line_total,
        line_price: l.line_price,
      })),
      total_supplier_cost: invoice.total_supplier_cost,
      total_shipping_cost: invoice.total_shipping_cost,
      grand_total: invoice.grand_total,
      missing_order_numbers: missingOrderNumbers,
      distinct_order_count: invoice.distinct_order_count ?? new Set(lines.map((l) => l.order_number)).size,
      commissionable_product_count: new Set(lines.map((l) => l.order_number)).size, // Placeholder, replaced below
      order_commission_gbp: 0,
      product_commission_gbp: 0,
      total_commission_gbp: invoice.total_commission_gbp ?? 0,
    };

    const [productGroups, aliasResult] = await Promise.all([
      aggregateByMasterProduct(calcLike.lines),
      aggregateBySupplierAlias(calcLike.lines),
    ]);

    // Override naive counts with set-aware counts from the aggregator
    calcLike.commissionable_product_count = aliasResult.commissionable_product_count;
    calcLike.total_commission_gbp = calcLike.commissionable_product_count * 0.8;

    const verification = buildVerificationReport(
      calcLike,
      invoice.start_order_number,
      invoice.end_order_number
    );

    const rebuiltSnapshot = buildInvoiceViewSnapshot({
      product_groups: productGroups,
      verification,
      aliasAggregation: aliasResult,
    });

    return NextResponse.json({
      invoice,
      lines,
      missing_order_numbers: missingOrderNumbers,
      ...rebuiltSnapshot,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH: confirm or void an invoice
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoiceId = parseInt(id, 10);
    const body = await request.json();
    const { status, snapshot: snapshotInput } = body as {
      status: "confirmed" | "void";
      snapshot?: unknown;
    };

    if (!["confirmed", "void"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'confirmed' or 'void'" },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Confirmed invoices are immutable — can only void
    if (existing.status === "confirmed" && status !== "void") {
      return NextResponse.json(
        { error: "Confirmed invoices are immutable" },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = { status };
    if (status === "confirmed") {
      updates.confirmed_at = new Date().toISOString();

      const providedSnapshot = parseInvoiceViewSnapshot(snapshotInput);
      if (providedSnapshot) {
        const { missing_order_numbers: missingOrderNumbers } =
          parseInvoiceMetadata(existing.missing_order_numbers);
        updates.missing_order_numbers = serializeInvoiceMetadata(
          missingOrderNumbers,
          providedSnapshot
        );
      }
    }

    await db
      .update(invoices)
      .set(updates)
      .where(eq(invoices.id, invoiceId));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: delete a draft invoice
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoiceId = parseInt(id, 10);

    const [existing] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Delete line items first, then the invoice
    await db
      .delete(invoiceLineItems)
      .where(eq(invoiceLineItems.invoice_id, invoiceId));
    await db.delete(invoices).where(eq(invoices.id, invoiceId));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
