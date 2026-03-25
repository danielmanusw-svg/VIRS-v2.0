"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { MultiBoxOrder } from "@/lib/invoice/aliasAggregator";
import staticInvoice13Data from "../13-static-data.json";

interface InvoiceLine {
  id: number;
  order_number: number;
  variant_id: number | null;
  sku: string | null;
  title: string;
  quantity: number;
  market_code: string | null;
  supplier_cost: number;
  shipping_cost: number;
  line_total: number;
  line_price: number;
}

interface InvoiceRecord {
  id: number;
  start_order_number: number;
  end_order_number: number;
  status: string;
  total_supplier_cost: number;
  total_shipping_cost: number;
  grand_total: number;
  distinct_order_count: number | null;
  total_commission_gbp: number | null;
  created_at: string;
  confirmed_at: string | null;
  eu_shipping_override: number | null;
  uk_shipping_override: number | null;
  us_shipping_override: number | null;
  au_shipping_override: number | null;
}

interface MarketBreakdown {
  code: string;
  quantity: number;
  supplier_cost: number;
  shipping_cost: number;
}

interface ProductGroup {
  group_key: string;
  display_name: string;
  skus: string[];
  total_quantity: number;
  markets: MarketBreakdown[];
  total_supplier_cost: number;
  total_shipping_cost: number;
  line_total: number;
}

interface MarketDistributionEntry {
  market_code: string;
  order_count: number;
  total_quantity: number;
}

interface MultiItemOrderLine {
  title: string;
  sku: string | null;
  quantity: number;
  shipping_cost: number;
  shipping_per_unit: number;
}

interface MultiItemOrderEntry {
  order_number: number;
  market_code: string | null;
  lines: MultiItemOrderLine[];
  total_shipping_on_invoice: number;
  has_mixed_shipping_rates: boolean;
}

interface VerificationReport {
  order_completeness: {
    total_in_range: number;
    missing_count: number;
    missing_order_numbers: number[];
  };
  quantity_summary: {
    total_line_items: number;
    total_quantity: number;
    commissionable_quantity: number;
  };
  market_distribution: {
    markets: MarketDistributionEntry[];
    unattributed_orders: number;
  };
  commission: {
    distinct_order_count: number;
    rate_gbp: number;
    total_commission_gbp: number;
  };
  shipping_analysis: {
    single_item_order_count: number;
    multi_item_orders: MultiItemOrderEntry[];
  };
}

interface AliasLineDetail {
  order_number: number;
  variant_id: number | null;
  title: string;
  sku: string | null;
  quantity: number;
}

interface AliasSetBreakdown {
  set_size: number;
  quantity: number;
  lines: AliasLineDetail[];
  goods_cost_per_set: number;
  shipping_cost_per_set: number;
  total_cost: number;
}

interface AliasMarketBreakdown {
  market_code: string;
  quantity: number;
  lines: AliasLineDetail[];
  sets?: AliasSetBreakdown[];
  goods_cost_per_unit: number;
  shipping_cost_per_unit: number;
  total_cost: number;
}

interface AliasGroup {
  supplier_label: string;
  markets: AliasMarketBreakdown[];
  total_quantity: number;
  lines: AliasLineDetail[];
  is_set_eligible: boolean;
  total_goods_cost: number;
  total_shipping_cost: number;
  total_cost: number;
}

interface UnmappedItem {
  variant_id: number | null;
  title: string;
  sku: string | null;
  quantity: number;
  market_code: string | null;
  order_numbers: number[];
}

interface OverchargedOrderItem {
  title: string;
  quantity: number;
}

interface OverchargedOrder {
  order_number: number;
  market_code: string;
  product_count: number;
  overcharge: number;
  items: OverchargedOrderItem[];
}

interface InvoiceDetail {
  invoice: InvoiceRecord;
  lines: InvoiceLine[];
  missing_order_numbers: number[];
  product_groups: ProductGroup[];
  verification: VerificationReport;
  supplier_groups: AliasGroup[];
  unmapped_items: UnmappedItem[];
  multi_box_orders: MultiBoxOrder[];
}

const PRODUCT_ORDER = [
  "Stainless Steel",
  "360° Adapters",
  "Shower Filter",
  "Plastic Filter",
  "Plastic Screen",
  "All Adapters",
  "Shower Filter Cartridge",
  "Plastic and Stainless Steel Cartridges",
  "Bath Filter",
  "Small Bottle",
  "650ml Bottle",
  "1L Bottle",
  "Black New Plastic Stock",
];

const productOrderMap = new Map(PRODUCT_ORDER.map((label, idx) => [label.toLowerCase(), idx]));

function sortSupplierGroups(groups: AliasGroup[]): AliasGroup[] {
  return [...groups].sort((a, b) => {
    const posA = productOrderMap.get(a.supplier_label.toLowerCase()) ?? 999;
    const posB = productOrderMap.get(b.supplier_label.toLowerCase()) ?? 999;
    return posA - posB;
  });
}

function gbp(value: number): string {
  return `£${value.toFixed(2)}`;
}

const TAP_FILTER_SUPPLIER_LABELS = new Set(["stainless steel", "plastic filter"]);
const CARTRIDGE_SUPPLIER_LABEL = "plastic and stainless steel cartridges";

function isExcludedXProductSupplierLabel(label: string): boolean {
  return label.toLowerCase().includes("adapter");
}

function buildOverchargedOrders(supplierGroups: AliasGroup[]): OverchargedOrder[] {
  const orderMap = new Map<number, OverchargedOrder>();
  const tapFilterOrders = new Set<number>();

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
    if (isExcludedXProductSupplierLabel(supplierLabel)) {
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

        const existing = orderMap.get(line.order_number) ?? {
          order_number: line.order_number,
          market_code: market.market_code ?? "Unknown",
          product_count: 0,
          overcharge: 0,
          items: [],
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
      overcharge: order.product_count * 0.8 - 0.8,
    }))
    .sort((a, b) => b.overcharge - a.overcharge || a.order_number - b.order_number);
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());
  const [expandedOverchargedOrders, setExpandedOverchargedOrders] = useState<Set<number>>(new Set());
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());

  const invoiceId = params.id as string;

  const fetchInvoice = useCallback(async () => {
    try {
      if (invoiceId === "13") {
        setData(staticInvoice13Data as unknown as InvoiceDetail);
        return;
      }

      const res = await fetch(`/api/invoices/${invoiceId}`);
      if (!res.ok) throw new Error("Not found");
      const json = await res.json();
      setData(json);
    } catch {
      toast.error("Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  function toggleOrderExpand(orderNum: number) {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderNum)) next.delete(orderNum);
      else next.add(orderNum);
      return next;
    });
  }

  function toggleMarketExpand(key: string) {
    setExpandedMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleOverchargedOrderExpand(orderNum: number) {
    setExpandedOverchargedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderNum)) next.delete(orderNum);
      else next.add(orderNum);
      return next;
    });
  }

  async function handleVoid() {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "void" }),
      });
      if (!res.ok) throw new Error("Failed to void");
      toast.success("Invoice voided");
      await fetchInvoice();
    } catch {
      toast.error("Failed to void invoice");
    }
  }

  async function handleConfirm() {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed" }),
      });
      if (!res.ok) throw new Error("Failed to confirm");
      toast.success("Invoice confirmed");
      await fetchInvoice();
    } catch {
      toast.error("Failed to confirm invoice");
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Invoice deleted");
      router.push("/invoices");
    } catch {
      toast.error("Failed to delete invoice");
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Invoice Detail</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const { invoice, verification } = data;
  const overchargedOrders = buildOverchargedOrders(data.supplier_groups ?? []);
  const totalOvercharge = overchargedOrders.reduce((sum, order) => sum + order.overcharge, 0);

  function statusBadge() {
    switch (invoice.status) {
      case "confirmed":
        return <Badge className="bg-green-600">Confirmed</Badge>;
      case "void":
        return <Badge variant="destructive">Void</Badge>;
      default:
        return <Badge variant="secondary">Draft</Badge>;
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">VIRS-{invoice.id}</h1>
          <p className="text-sm text-muted-foreground">
            Orders #{invoice.start_order_number} — #{invoice.end_order_number}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge()}
          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              Download PDF
            </Button>
          </a>
        </div>
      </div>

      {/* Quick Summary Sidebar-style Card */}
      <Card className="bg-muted/30 border-primary/20 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-wrap justify-between items-end gap-4">
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice Breakdown</span>
              <div className="flex gap-6 text-sm">
                <p>Goods: <span className="font-mono font-bold">{gbp(invoice.total_supplier_cost)}</span></p>
                <p>Shipping: <span className="font-mono font-bold">{gbp(invoice.total_shipping_cost)}</span></p>
                <p>Comm. (Order): <span className="font-mono font-bold text-blue-600">{gbp(verification.commission.distinct_order_count * 0.8)}</span></p>
                <p>Comm. (xProd): <span className="font-mono font-bold text-red-600">{gbp(verification.quantity_summary.commissionable_quantity * 0.8)}</span></p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grand Total</span>
              <p className="text-4xl font-mono font-bold text-primary">
                {gbp(
                  invoice.total_supplier_cost +
                  invoice.total_shipping_cost +
                  (verification.commission.distinct_order_count * 0.8) +
                  (verification.quantity_summary.commissionable_quantity * 0.8)
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 1. Verification Invoice */}
      <Card>
        <CardHeader>
          <CardTitle>1. Verification Invoice</CardTitle>
          <CardDescription>
            Detailed breakdown for verification against supplier invoice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[280px]">Product Name</TableHead>
                <TableHead>Set/Type</TableHead>
                <TableHead>Country</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Shipping</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortSupplierGroups(data.supplier_groups ?? []).map((group) => (
                <React.Fragment key={group.supplier_label}>
                  <TableRow className="bg-muted/30 border-t-2 border-muted/40 font-bold">
                    <TableCell colSpan={4}>{group.supplier_label}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{gbp(group.total_goods_cost)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{gbp(group.total_shipping_cost)}</TableCell>
                    <TableCell className="text-right font-mono text-[13px] text-blue-900">{gbp(group.total_cost)}</TableCell>
                  </TableRow>
                  {group.markets.map((market) => {
                    if (group.is_set_eligible && market.sets && market.sets.length > 0) {
                      return market.sets.map((setEntry, sIdx) => {
                        const expandKey = `${group.supplier_label}_${market.market_code}_${setEntry.set_size}`;
                        const isExpanded = expandedMarkets.has(expandKey);
                        return (
                          <React.Fragment key={`${expandKey}_${sIdx}`}>
                            <TableRow className="cursor-pointer hover:bg-muted/5" onClick={() => toggleMarketExpand(expandKey)}>
                              <TableCell className="text-xs text-muted-foreground pl-6">
                                {isExpanded ? "▼" : "▶"} {setEntry.lines.length} lines
                              </TableCell>
                              <TableCell className="text-sm italic">{setEntry.set_size} unit set</TableCell>
                              <TableCell><Badge variant="outline" className="font-mono text-[10px]">{market.market_code}</Badge></TableCell>
                              <TableCell className="text-right font-mono">{setEntry.quantity}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{gbp(setEntry.goods_cost_per_set)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{gbp(setEntry.shipping_cost_per_set)}</TableCell>
                              <TableCell className="text-right font-mono font-semibold">{gbp(setEntry.total_cost)}</TableCell>
                            </TableRow>
                            {isExpanded && setEntry.lines.map((l, i) => (
                              <TableRow key={i} className="bg-muted/5 text-[10px] border-none">
                                <TableCell className="pl-12 font-mono text-muted-foreground">#{l.order_number}</TableCell>
                                <TableCell colSpan={6} className="text-muted-foreground italic">{l.title} (x{l.quantity})</TableCell>
                              </TableRow>
                            ))}
                          </React.Fragment>
                        );
                      });
                    }
                    const expandKey = `${group.supplier_label}_${market.market_code}`;
                    const isExpanded = expandedMarkets.has(expandKey);
                    return (
                      <React.Fragment key={expandKey}>
                        <TableRow className="cursor-pointer hover:bg-muted/5" onClick={() => toggleMarketExpand(expandKey)}>
                          <TableCell className="text-xs text-muted-foreground pl-6">
                            {isExpanded ? "▼" : "▶"} {market.lines.length} lines
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">—</TableCell>
                          <TableCell><Badge variant="outline" className="font-mono text-[10px]">{market.market_code}</Badge></TableCell>
                          <TableCell className="text-right font-mono">{market.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{gbp(market.goods_cost_per_unit)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{gbp(market.shipping_cost_per_unit)}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{gbp(market.total_cost)}</TableCell>
                        </TableRow>
                        {isExpanded && market.lines.map((l, i) => (
                          <TableRow key={i} className="bg-muted/5 text-[10px] border-none">
                            <TableCell className="pl-12 font-mono text-muted-foreground">#{l.order_number}</TableCell>
                            <TableCell colSpan={6} className="text-muted-foreground italic">{l.title} (x{l.quantity})</TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              ))}
              {/* Summary Sub-total Row */}
              <TableRow className="bg-muted/80 border-t-4 border-double font-bold h-12">
                <TableCell colSpan={3} className="text-sm uppercase tracking-wider pl-4">Supplier Sub-Total</TableCell>
                <TableCell className="text-right font-mono text-base">
                  {(data.supplier_groups ?? []).reduce((sum, g) => sum + g.total_quantity, 0)}
                </TableCell>
                <TableCell className="text-right font-mono text-base">{gbp(invoice.total_supplier_cost)}</TableCell>
                <TableCell className="text-right font-mono text-base">{gbp(invoice.total_shipping_cost)}</TableCell>
                <TableCell className="text-right font-mono text-[22px] text-primary">
                  {gbp(invoice.total_supplier_cost + invoice.total_shipping_cost)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 2. Orders & Commission */}
        <Card className="border-blue-100 shadow-sm">
          <CardHeader className="bg-blue-50/50 pb-3">
            <CardTitle className="text-lg text-blue-900 font-bold">2. Orders & Commission</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-blue-100 italic">
                <span className="text-sm font-medium">Distinct Order Count</span>
                <span className="font-mono font-bold text-lg">{verification.commission.distinct_order_count}</span>
              </div>
              <div className="flex justify-between items-center p-3">
                <span className="text-sm">Rate</span>
                <span className="font-mono">£0.80 per order</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center bg-blue-100/50 p-4 rounded-xl border-t-2 border-blue-200">
                <span className="font-bold text-blue-900">Total Per Order</span>
                <span className="text-xl font-mono font-extrabold text-blue-950">
                  {gbp(verification.commission.distinct_order_count * 0.80)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Orders & Commission xProduct */}
        <Card className="border-red-100 shadow-sm">
          <CardHeader className="bg-red-50/50 pb-3">
            <CardTitle className="text-lg text-red-900 font-bold">3. Orders & Commission xProduct</CardTitle>
            <CardDescription className="text-red-700/70">Fee per product (Sets count as 1, £0 omitted)</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-red-100 italic">
                <span className="text-sm font-medium">Commissionable Products</span>
                <span className="font-mono font-bold text-lg">{verification.quantity_summary.commissionable_quantity}</span>
              </div>
              <div className="flex justify-between items-center p-3">
                <span className="text-sm">Rate</span>
                <span className="font-mono">£0.80 per product/set</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center bg-red-100/50 p-4 rounded-xl border-t-2 border-red-200">
                <span className="font-bold text-red-900">Total Per Product</span>
                <span className="text-xl font-mono font-extrabold text-red-950">
                  {gbp(verification.quantity_summary.commissionable_quantity * 0.80)}
                </span>
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900">Overcharged Orders</span>
                  <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800">
                    {overchargedOrders.length} orders
                  </Badge>
                </div>
                {overchargedOrders.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Market</TableHead>
                        <TableHead className="text-right">Products</TableHead>
                        <TableHead className="text-right">Overcharge</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overchargedOrders.map((order) => {
                        const isExpanded = expandedOverchargedOrders.has(order.order_number);
                        return (
                          <React.Fragment key={order.order_number}>
                            <TableRow
                              className="cursor-pointer hover:bg-amber-50/30"
                              onClick={() => toggleOverchargedOrderExpand(order.order_number)}
                            >
                              <TableCell className="font-mono font-bold text-amber-950">#{order.order_number}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="border-amber-200 text-amber-800 bg-white">
                                  {order.market_code}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-amber-700">
                                {order.product_count}
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-red-700">
                                {gbp(order.overcharge)}
                              </TableCell>
                              <TableCell className="text-xs text-amber-700/50 w-8 text-right">
                                {isExpanded ? "â–²" : "â–¼"}
                              </TableCell>
                            </TableRow>
                            {isExpanded &&
                              order.items.map((item, idx) => (
                                <TableRow key={`${order.order_number}_${idx}`} className="bg-amber-50/30 border-none">
                                  <TableCell />
                                  <TableCell colSpan={3} className="text-sm text-amber-900/80 italic">
                                    {item.title}
                                  </TableCell>
                                  <TableCell className="text-center font-mono text-xs font-bold text-amber-900/70">
                                    x{item.quantity}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="rounded-lg border border-amber-100 bg-amber-50/30 p-3 text-sm text-amber-900/70">
                    No overcharged orders in this invoice snapshot.
                  </div>
                )}
                <div className="flex justify-between items-center bg-amber-100/50 p-4 rounded-xl border-t-2 border-amber-200">
                  <span className="font-bold text-amber-900">Total Overcharge</span>
                  <span className="text-xl font-mono font-extrabold text-red-950">
                    {gbp(totalOvercharge)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4. Multi-Box Orders */}
      {data.multi_box_orders && data.multi_box_orders.length > 0 && (
        <Card className="border-amber-200 shadow-sm">
          <CardHeader className="bg-amber-50/50 pb-4">
            <CardTitle className="text-amber-900">
              4. Multi-Box Orders
              <Badge variant="outline" className="ml-3 border-amber-300 bg-amber-100 text-amber-800">
                {data.multi_box_orders.length} orders
              </Badge>
            </CardTitle>
            <CardDescription className="text-amber-700/80">
              Orders requiring multiple boxes to be shipped, based on your price sheet logic.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead className="text-right">Boxes</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.multi_box_orders.map((mb) => {
                  const isExpanded = expandedOrders.has(mb.order_number);
                  return (
                    <React.Fragment key={mb.order_number}>
                      <TableRow
                        className="cursor-pointer hover:bg-amber-50/30"
                        onClick={() => toggleOrderExpand(mb.order_number)}
                      >
                        <TableCell className="font-mono font-bold text-amber-950">#{mb.order_number}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-amber-200 text-amber-800 bg-white">{mb.market_code}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-amber-700">
                          {mb.box_count} Boxes
                        </TableCell>
                        <TableCell className="text-xs text-amber-700/50 w-8 text-right">
                          {isExpanded ? "▲" : "▼"}
                        </TableCell>
                      </TableRow>
                      {isExpanded &&
                        mb.boxes.map((box, idx) => (
                          <TableRow key={`${mb.order_number}_${idx}`} className="bg-amber-50/30 border-none">
                            <TableCell />
                            <TableCell colSpan={2} className="text-sm text-amber-900/80 italic">
                              {box.label}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs font-bold text-amber-900/70">
                              x{box.quantity}
                            </TableCell>
                          </TableRow>
                        ))}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center border-t pt-8">
        <div className="flex gap-2">
          {invoice.status === "draft" && (
            <Button variant="destructive" onClick={handleDelete} className="shadow-sm">
              Delete Draft
            </Button>
          )}
          <Button variant="outline" onClick={handleVoid}>
            Void Invoice
          </Button>
        </div>
        {invoice.status === "draft" && (
          <Button onClick={handleConfirm} size="lg" className="px-8 font-bold shadow-md bg-green-600 hover:bg-green-700">
            Confirm & Finalize Invoice
          </Button>
        )}
      </div>
    </div>
  );
}
