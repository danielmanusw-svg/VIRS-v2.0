import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  invoices,
  invoiceLineItems,
  supplierAliases,
  productVariants,
} from "@/db/schema";
import { ne, sql } from "drizzle-orm";
import { parseInvoiceMetadata } from "@/lib/invoice/snapshot";

export async function GET() {
  try {
    // 1. All non-void invoices with their snapshot data
    const allInvoices = await db
      .select({
        id: invoices.id,
        total_supplier_cost: invoices.total_supplier_cost,
        total_shipping_cost: invoices.total_shipping_cost,
        grand_total: invoices.grand_total,
        total_commission_gbp: invoices.total_commission_gbp,
        distinct_order_count: invoices.distinct_order_count,
        missing_order_numbers: invoices.missing_order_numbers,
      })
      .from(invoices)
      .where(ne(invoices.status, "void"));

    // Aggregate invoice-level totals
    let totalGoodsCost = 0;
    let totalShippingCost = 0;
    let totalCommission = 0;
    let totalGrand = 0;
    let totalOrders = 0;

    // Aggregate costs by market and supplier label from snapshots
    const costsByMarket: Record<string, { goods: number; shipping: number }> = {};
    const costsBySupplier: Record<
      string,
      { goods: number; shipping: number; quantity: number }
    > = {};

    for (const inv of allInvoices) {
      totalGoodsCost += inv.total_supplier_cost;
      totalShippingCost += inv.total_shipping_cost;
      totalCommission += inv.total_commission_gbp ?? 0;
      totalGrand += inv.grand_total;
      totalOrders += inv.distinct_order_count ?? 0;

      // Parse snapshot to extract per-market and per-supplier costs
      const { snapshot } = parseInvoiceMetadata(inv.missing_order_numbers);
      if (!snapshot?.supplier_groups) continue;

      for (const group of snapshot.supplier_groups) {
        const label = group.supplier_label;
        if (!costsBySupplier[label]) {
          costsBySupplier[label] = { goods: 0, shipping: 0, quantity: 0 };
        }
        costsBySupplier[label].goods += group.total_goods_cost;
        costsBySupplier[label].shipping += group.total_shipping_cost;
        costsBySupplier[label].quantity += group.total_quantity;

        for (const market of group.markets) {
          const mc = market.market_code ?? "Unknown";
          if (!costsByMarket[mc]) {
            costsByMarket[mc] = { goods: 0, shipping: 0 };
          }
          // Extract goods and shipping from market total_cost
          if (market.sets) {
            for (const set of market.sets) {
              costsByMarket[mc].goods +=
                set.goods_cost_per_set * set.quantity;
              costsByMarket[mc].shipping +=
                set.shipping_cost_per_set * set.quantity;
            }
          } else {
            costsByMarket[mc].goods +=
              market.goods_cost_per_unit * market.quantity;
            costsByMarket[mc].shipping +=
              market.shipping_cost_per_unit * market.quantity;
          }
        }
      }
    }

    // 2. Revenue from invoice line items (line_price = Shopify selling price)
    const [revenueRow] = await db
      .select({
        total_revenue: sql<number>`coalesce(sum(${invoiceLineItems.line_price}), 0)`,
      })
      .from(invoiceLineItems)
      .innerJoin(invoices, sql`${invoiceLineItems.invoice_id} = ${invoices.id}`)
      .where(ne(invoices.status, "void"));

    // 3. Revenue by market
    const revenueByMarketRows = await db
      .select({
        market_code: sql<string>`coalesce(${invoiceLineItems.market_code}, 'Unknown')`,
        total_revenue: sql<number>`coalesce(sum(${invoiceLineItems.line_price}), 0)`,
        order_count: sql<number>`count(distinct ${invoiceLineItems.order_id})`,
      })
      .from(invoiceLineItems)
      .innerJoin(invoices, sql`${invoiceLineItems.invoice_id} = ${invoices.id}`)
      .where(ne(invoices.status, "void"))
      .groupBy(invoiceLineItems.market_code)
      .orderBy(sql`sum(${invoiceLineItems.line_price}) desc`);

    // 4. Revenue by product title
    const revenueByProduct = await db
      .select({
        title: invoiceLineItems.title,
        total_revenue: sql<number>`coalesce(sum(${invoiceLineItems.line_price}), 0)`,
        total_quantity: sql<number>`coalesce(sum(${invoiceLineItems.quantity}), 0)`,
      })
      .from(invoiceLineItems)
      .innerJoin(invoices, sql`${invoiceLineItems.invoice_id} = ${invoices.id}`)
      .where(ne(invoices.status, "void"))
      .groupBy(invoiceLineItems.title)
      .orderBy(sql`sum(${invoiceLineItems.line_price}) desc`)
      .limit(20);

    // 5. Revenue by supplier label (via variant_id → supplier_aliases, with master_product fallback)
    const revenueBySupplier = await db
      .select({
        supplier_label: sql<string>`coalesce(${supplierAliases.supplier_label}, sa_master.supplier_label, 'Unmapped')`,
        total_revenue: sql<number>`coalesce(sum(${invoiceLineItems.line_price}), 0)`,
      })
      .from(invoiceLineItems)
      .innerJoin(invoices, sql`${invoiceLineItems.invoice_id} = ${invoices.id}`)
      .leftJoin(
        supplierAliases,
        sql`${invoiceLineItems.variant_id} = ${supplierAliases.variant_id}`
      )
      .leftJoin(
        productVariants,
        sql`${invoiceLineItems.variant_id} = ${productVariants.id}`
      )
      .leftJoin(
        sql`supplier_aliases as sa_master`,
        sql`${productVariants.master_product_id} = sa_master.master_product_id AND sa_master.variant_id IS NULL`
      )
      .where(ne(invoices.status, "void"))
      .groupBy(
        sql`coalesce(${supplierAliases.supplier_label}, sa_master.supplier_label, 'Unmapped')`
      )
      .orderBy(sql`sum(${invoiceLineItems.line_price}) desc`);

    const revenueBySupplierMap: Record<string, number> = {};
    for (const row of revenueBySupplier) {
      revenueBySupplierMap[row.supplier_label] = row.total_revenue;
    }

    // Allocate commission proportionally across markets by order count
    const totalOrderCount = revenueByMarketRows.reduce(
      (sum, r) => sum + r.order_count,
      0
    );

    // Merge revenue + costs per market
    const marketBreakdown = revenueByMarketRows.map((r) => {
      const mc = r.market_code;
      const costs = costsByMarket[mc] ?? { goods: 0, shipping: 0 };
      const marketCommission =
        totalOrderCount > 0
          ? Math.round(
              (totalCommission * (r.order_count / totalOrderCount)) * 100
            ) / 100
          : 0;
      return {
        market_code: mc,
        revenue: r.total_revenue,
        goods_cost: Math.round(costs.goods * 100) / 100,
        shipping_cost: Math.round(costs.shipping * 100) / 100,
        commission: marketCommission,
        total_cost:
          Math.round((costs.goods + costs.shipping + marketCommission) * 100) /
          100,
        order_count: r.order_count,
      };
    });

    // Supplier label breakdown with revenue
    const supplierBreakdown = Object.entries(costsBySupplier)
      .map(([label, data]) => ({
        supplier_label: label,
        revenue: revenueBySupplierMap[label] ?? 0,
        goods_cost: Math.round(data.goods * 100) / 100,
        shipping_cost: Math.round(data.shipping * 100) / 100,
        total_cost:
          Math.round((data.goods + data.shipping) * 100) / 100,
        quantity: data.quantity,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      invoice_summary: {
        total_invoices: allInvoices.length,
        total_revenue: revenueRow.total_revenue,
        total_goods_cost: Math.round(totalGoodsCost * 100) / 100,
        total_shipping_cost: Math.round(totalShippingCost * 100) / 100,
        total_commission: Math.round(totalCommission * 100) / 100,
        total_grand: Math.round(totalGrand * 100) / 100,
        total_orders: totalOrders,
      },
      market_breakdown: marketBreakdown,
      supplier_breakdown: supplierBreakdown,
      top_products_by_revenue: revenueByProduct,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch cost sheet data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
