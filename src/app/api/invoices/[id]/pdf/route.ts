export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { db } from "@/db";
import { invoices, invoiceLineItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { InvoicePDF } from "@/lib/invoice/pdfTemplate";

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

    const missingOrderNumbers: number[] = invoice.missing_order_numbers
      ? JSON.parse(invoice.missing_order_numbers)
      : [];

    const element = React.createElement(InvoicePDF, {
      invoiceId: invoice.id,
      startOrderNumber: invoice.start_order_number,
      endOrderNumber: invoice.end_order_number,
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
      })),
      totalSupplierCost: invoice.total_supplier_cost,
      totalShippingCost: invoice.total_shipping_cost,
      grandTotal: invoice.grand_total,
      missingOrderNumbers,
      createdAt: invoice.created_at,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="VIRS-${invoice.id}.pdf"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
