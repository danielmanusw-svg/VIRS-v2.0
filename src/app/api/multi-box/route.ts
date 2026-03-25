import { NextResponse } from "next/server";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { desc, ne } from "drizzle-orm";
import { parseInvoiceMetadata } from "@/lib/invoice/snapshot";
import type { MultiBoxOrder } from "@/lib/invoice/aliasAggregator";

interface MultiBoxOrderWithInvoice extends MultiBoxOrder {
  invoice_id: number;
  invoice_range: string;
}

export async function GET() {
  try {
    // Fetch all non-void invoices ordered by start_order_number descending
    const allInvoices = await db
      .select({
        id: invoices.id,
        start_order_number: invoices.start_order_number,
        end_order_number: invoices.end_order_number,
        status: invoices.status,
        missing_order_numbers: invoices.missing_order_numbers,
      })
      .from(invoices)
      .where(ne(invoices.status, "void"))
      .orderBy(desc(invoices.start_order_number));

    const allMultiBoxOrders: MultiBoxOrderWithInvoice[] = [];

    for (const inv of allInvoices) {
      const { snapshot } = parseInvoiceMetadata(inv.missing_order_numbers);
      if (!snapshot || !Array.isArray(snapshot.multi_box_orders)) continue;

      const range = `#${inv.start_order_number} - #${inv.end_order_number}`;

      for (const mb of snapshot.multi_box_orders) {
        allMultiBoxOrders.push({
          ...mb,
          invoice_id: inv.id,
          invoice_range: range,
        });
      }
    }

    // Sort by order number descending (newest first)
    allMultiBoxOrders.sort((a, b) => b.order_number - a.order_number);

    return NextResponse.json({
      total: allMultiBoxOrders.length,
      orders: allMultiBoxOrders,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch multi-box orders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
