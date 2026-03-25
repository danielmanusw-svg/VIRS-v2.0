"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface InvoiceLine {
  order_id: number;
  order_number: number;
  variant_id: number | null;
  sku: string | null;
  title: string;
  quantity: number;
  market_code: string | null;
  supplier_cost: number;
  shipping_cost: number;
  line_total: number;
}

interface InvoiceRecord {
  id: number;
  start_order_number: number;
  end_order_number: number;
  total_supplier_cost: number;
  total_shipping_cost: number;
  grand_total: number;
  distinct_order_count: number | null;
  total_commission_gbp: number | null;
  status: string;
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
  missing_price: boolean;
}

interface AliasMarketBreakdown {
  market_code: string;
  quantity: number;
  lines: AliasLineDetail[];
  sets?: AliasSetBreakdown[];
  goods_cost_per_unit: number;
  shipping_cost_per_unit: number;
  total_cost: number;
  missing_price: boolean;
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

export interface MultiBoxOrder {
  order_number: number;
  market_code: string;
  box_count: number;
  boxes: { label: string; quantity: number }[];
}

interface InvoiceData {
  invoice: InvoiceRecord;
  lines: InvoiceLine[];
  missing_order_numbers: number[];
  product_groups: ProductGroup[];
  verification: VerificationReport;
  supplier_groups: AliasGroup[];
  unmapped_items: UnmappedItem[];
  notifications: string[];
  totals: {
    total_goods_cost: number;
    total_shipping_cost: number;
    total_cost: number;
  };
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

export default function NewInvoicePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1: order range
  const [startOrder, setStartOrder] = useState("");
  const [endOrder, setEndOrder] = useState("");

  // Step 2: preview data
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Drilldown expand state for verification invoice
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());

  function toggleMarketExpand(key: string) {
    setExpandedMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleOrderExpand(orderNum: number) {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderNum)) next.delete(orderNum);
      else next.add(orderNum);
      return next;
    });
  }

  async function handleCreate() {
    const start = parseInt(startOrder, 10);
    const end = parseInt(endOrder, 10);

    if (isNaN(start) || isNaN(end) || start > end) {
      toast.error("Enter a valid order range (start must be ≤ end)");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_order_number: start,
          end_order_number: end,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setInvoiceData(data);
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setCreating(false);
    }
  }

  async function handleConfirm() {
    if (!invoiceData) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceData.invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "confirmed",
          snapshot: {
            product_groups: invoiceData.product_groups,
            verification: invoiceData.verification,
            supplier_groups: invoiceData.supplier_groups,
            unmapped_items: invoiceData.unmapped_items,
            notifications: invoiceData.notifications,
            totals: invoiceData.totals,
            multi_box_orders: invoiceData.multi_box_orders,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to confirm");
      toast.success("Invoice confirmed and locked");
      router.push(`/invoices/${invoiceData.invoice.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm");
    } finally {
      setConfirming(false);
    }
  }

  async function handleDiscard() {
    if (!invoiceData) return;
    try {
      await fetch(`/api/invoices/${invoiceData.invoice.id}`, {
        method: "DELETE",
      });
      toast.success("Draft discarded");
      router.push("/invoices");
    } catch {
      toast.error("Failed to discard");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">New Invoice</h1>

      {/* Step indicators */}
      <div className="flex items-center gap-2 text-sm">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step >= s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
                }`}
            >
              {s}
            </div>
            <span className={step >= s ? "font-medium" : "text-muted-foreground"}>
              {s === 1 ? "Order Range" : "Verification"}
            </span>
            {s < 2 && <Separator className="mx-2 w-8" />}
          </div>
        ))}
      </div>

      {/* Step 1: Order Range */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Enter Order Range</CardTitle>
            <CardDescription>
              Specify the start and end order numbers for this invoice, matching
              your supplier invoice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Order #</Label>
                <Input
                  type="number"
                  placeholder="e.g. 39872"
                  value={startOrder}
                  onChange={(e) => setStartOrder(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Order #</Label>
                <Input
                  type="number"
                  placeholder="e.g. 40577"
                  value={endOrder}
                  onChange={(e) => setEndOrder(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                onClick={handleCreate}
                disabled={!startOrder || !endOrder || creating}
              >
                {creating ? "Generating..." : "Generate Invoice"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Clean Invoice Verification */}
      {step === 2 && invoiceData && (
        <div className="space-y-4">
          {/* Notifications */}
          {(invoiceData.notifications?.length > 0) && (
            <div className="space-y-2">
              {invoiceData.notifications.map((msg, idx) => (
                <div key={idx} className="rounded-md border border-amber-500/50 bg-amber-950/20 px-4 py-3">
                  <p className="text-sm text-amber-400">⚠️ {msg}</p>
                </div>
              ))}
            </div>
          )}

          {/* Unmapped Products Warning */}
          {invoiceData.unmapped_items.length > 0 && (
            <div className="rounded-md border border-amber-500/50 bg-amber-950/20 px-4 py-3">
              <p className="text-sm font-medium text-amber-400">
                ⚠️ {invoiceData.unmapped_items.length} unmapped product{invoiceData.unmapped_items.length !== 1 ? "s" : ""} found in orders
              </p>
              <p className="text-xs text-amber-400/70 mt-1">
                {invoiceData.unmapped_items.map((item) => item.title).join(", ")}
              </p>
            </div>
          )}

          {/* Quick Summary Sidebar-style Card */}
          <Card className="bg-muted/30 border-primary/20 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex flex-wrap justify-between items-end gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice Breakdown</span>
                  <div className="flex gap-6 text-sm">
                    <p>Goods: <span className="font-mono font-bold">{gbp(invoiceData.invoice.total_supplier_cost)}</span></p>
                    <p>Shipping: <span className="font-mono font-bold">{gbp(invoiceData.invoice.total_shipping_cost)}</span></p>
                    <p>Comm. (Order): <span className="font-mono font-bold text-blue-600">{gbp(invoiceData.verification.commission.distinct_order_count * 0.8)}</span></p>
                    <p>Comm. (xProd): <span className="font-mono font-bold text-red-600">{gbp(invoiceData.verification.quantity_summary.commissionable_quantity * 0.8)}</span></p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grand Total</span>
                  <p className="text-4xl font-mono font-bold text-primary">
                    {gbp(
                      invoiceData.invoice.total_supplier_cost +
                      invoiceData.invoice.total_shipping_cost +
                      (invoiceData.verification.commission.distinct_order_count * 0.8) +
                      (invoiceData.verification.quantity_summary.commissionable_quantity * 0.8)
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table 1: Invoice-format table */}
          <Card>
            <CardHeader>
              <CardTitle>Verification Invoice</CardTitle>
              <CardDescription>
                Orders #{invoiceData.invoice.start_order_number} — #{invoiceData.invoice.end_order_number} · Compare this against the supplier invoice line by line.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Products Name</TableHead>
                      <TableHead>Set</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Goods £</TableHead>
                      <TableHead className="text-right">Shipping £</TableHead>
                      <TableHead className="text-right">Total £</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortSupplierGroups(invoiceData.supplier_groups).map((group) => (
                      <React.Fragment key={group.supplier_label}>
                        {/* Category header row */}
                        <TableRow className="bg-muted/30 border-t-2 border-muted">
                          <TableCell className="font-semibold" colSpan={4}>
                            {group.supplier_label}
                          </TableCell>
                        </TableRow>
                        {/* Per-market rows — with set breakdown for set-eligible */}
                        {group.markets.map((market) => {
                          if (group.is_set_eligible && market.sets && market.sets.length > 0) {
                            // Render one row per set size
                            return market.sets.map((setEntry) => {
                              const expandKey = `${group.supplier_label}_${market.market_code}_${setEntry.set_size}`;
                              const isExpanded = expandedMarkets.has(expandKey);
                              return (
                                <React.Fragment key={expandKey}>
                                  <TableRow
                                    className={`cursor-pointer hover:bg-muted/20 ${setEntry.missing_price ? "bg-amber-950/10" : ""}`}
                                    onClick={() => toggleMarketExpand(expandKey)}
                                  >
                                    <TableCell className="text-xs text-muted-foreground">
                                      {isExpanded ? "▼" : "▶"} {setEntry.lines.length} line{setEntry.lines.length !== 1 ? "s" : ""}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {setEntry.set_size} filter{setEntry.set_size !== 1 ? "s" : ""}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline">{market.market_code}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {setEntry.quantity}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                      {gbp(setEntry.goods_cost_per_set)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                      {gbp(setEntry.shipping_cost_per_set)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-medium">
                                      {gbp(setEntry.total_cost)}
                                    </TableCell>
                                  </TableRow>
                                  {isExpanded && setEntry.lines.map((line, idx) => (
                                    <TableRow
                                      key={`${expandKey}_${idx}`}
                                      className="bg-muted/10"
                                    >
                                      <TableCell className="pl-8 text-xs text-muted-foreground font-mono">
                                        #{line.order_number}
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground" />
                                      <TableCell className="text-xs text-muted-foreground" colSpan={2}>
                                        {line.sku ? `${line.sku} — ` : ""}{line.title}
                                      </TableCell>
                                      <TableCell />
                                      <TableCell />
                                      <TableCell />
                                    </TableRow>
                                  ))}
                                </React.Fragment>
                              );
                            });
                          }

                          // Non-set-eligible: original single row per market
                          const expandKey = `${group.supplier_label}_${market.market_code}`;
                          const isExpanded = expandedMarkets.has(expandKey);
                          return (
                            <React.Fragment key={expandKey}>
                              <TableRow
                                className={`cursor-pointer hover:bg-muted/20 ${market.missing_price ? "bg-amber-950/10" : ""}`}
                                onClick={() => toggleMarketExpand(expandKey)}
                              >
                                <TableCell className="text-xs text-muted-foreground">
                                  {isExpanded ? "▼" : "▶"} {market.lines.length} line{market.lines.length !== 1 ? "s" : ""}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">—</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{market.market_code}</Badge>
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {market.quantity}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs">
                                  {gbp(market.goods_cost_per_unit)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs">
                                  {gbp(market.shipping_cost_per_unit)}
                                </TableCell>
                                <TableCell className="text-right font-mono font-medium">
                                  {gbp(market.total_cost)}
                                </TableCell>
                              </TableRow>
                              {isExpanded && market.lines.map((line, idx) => (
                                <TableRow
                                  key={`${expandKey}_${idx}`}
                                  className="bg-muted/10"
                                >
                                  <TableCell className="pl-8 text-xs text-muted-foreground font-mono">
                                    #{line.order_number}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground" />
                                  <TableCell className="text-xs text-muted-foreground" colSpan={2}>
                                    {line.sku ? `${line.sku} — ` : ""}{line.title}
                                  </TableCell>
                                  <TableCell />
                                  <TableCell />
                                  <TableCell />
                                </TableRow>
                              ))}
                            </React.Fragment>
                          );
                        })}

                      </React.Fragment>
                    ))}
                    {/* Grand total */}
                    <TableRow className="bg-muted/50 border-t-2">
                      <TableCell className="font-bold">Total</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right font-mono font-bold">
                        {invoiceData.supplier_groups.reduce((sum, g) => sum + g.total_quantity, 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {gbp(invoiceData.totals?.total_goods_cost ?? 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {gbp(invoiceData.totals?.total_shipping_cost ?? 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-base">
                        {gbp(invoiceData.totals?.total_cost ?? 0)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
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
                    <span className="font-mono font-bold text-lg">{invoiceData.verification.commission.distinct_order_count}</span>
                  </div>
                  <div className="flex justify-between items-center p-3">
                    <span className="text-sm">Rate</span>
                    <span className="font-mono">£0.80 per order</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center bg-blue-100/50 p-4 rounded-xl border-t-2 border-blue-200">
                    <span className="font-bold text-blue-900">Total Per Order</span>
                    <span className="text-xl font-mono font-extrabold text-blue-950">
                      {gbp(invoiceData.verification.commission.distinct_order_count * 0.80)}
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
                    <span className="font-mono font-bold text-lg">{invoiceData.verification.quantity_summary.commissionable_quantity}</span>
                  </div>
                  <div className="flex justify-between items-center p-3">
                    <span className="text-sm">Rate</span>
                    <span className="font-mono">£0.80 per product/set</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center bg-red-100/50 p-4 rounded-xl border-t-2 border-red-200">
                    <span className="font-bold text-red-900">Total Per Product</span>
                    <span className="text-xl font-mono font-extrabold text-red-950">
                      {gbp(invoiceData.verification.quantity_summary.commissionable_quantity * 0.80)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Table 3: Multi-Box Orders */}
          {invoiceData.multi_box_orders && invoiceData.multi_box_orders.length > 0 && (
            <Card className="border-amber-200 shadow-sm">
              <CardHeader className="bg-amber-50/50 pb-4">
                <CardTitle className="text-amber-900">
                  Multi-Box Orders
                  <Badge variant="outline" className="ml-3 border-amber-300 bg-amber-100 text-amber-800">
                    {invoiceData.multi_box_orders.length} orders
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
                    {invoiceData.multi_box_orders.map((mb) => {
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
          <div className="flex justify-between">
            <Button variant="destructive" onClick={handleDiscard}>
              Discard Draft
            </Button>
            <Button onClick={handleConfirm} disabled={confirming}>
              {confirming ? "Confirming..." : "Confirm Invoice"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
