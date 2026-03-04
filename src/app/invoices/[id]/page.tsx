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
}

interface AliasMarketBreakdown {
  market_code: string;
  quantity: number;
  lines: AliasLineDetail[];
  sets?: AliasSetBreakdown[];
}

interface AliasGroup {
  supplier_label: string;
  markets: AliasMarketBreakdown[];
  total_quantity: number;
  lines: AliasLineDetail[];
  is_set_eligible: boolean;
}

interface UnmappedItem {
  variant_id: number | null;
  title: string;
  sku: string | null;
  quantity: number;
  market_code: string | null;
  order_numbers: number[];
}

interface InvoiceDetail {
  invoice: InvoiceRecord;
  lines: InvoiceLine[];
  missing_order_numbers: number[];
  product_groups: ProductGroup[];
  verification: VerificationReport;
  supplier_groups: AliasGroup[];
  unmapped_items: UnmappedItem[];
}

const MARKET_CODES = ["EU", "UK", "US", "AU"] as const;

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

import staticInvoice13Data from "../13-static-data.json";

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());

  const invoiceId = params.id as string;

  const fetchInvoice = useCallback(async () => {
    try {
      if (invoiceId === "13") {
        setData(staticInvoice13Data as InvoiceDetail);
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

  const { invoice, lines, missing_order_numbers, product_groups, verification } = data;

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
    <div className="mx-auto max-w-5xl space-y-6">
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

      {/* Missing Orders Warning */}
      {missing_order_numbers.length > 0 && (
        <Card className="border-yellow-400 bg-yellow-50">
          <CardContent className="pt-4">
            <p className="text-sm font-semibold text-yellow-800">
              Missing Orders ({missing_order_numbers.length})
            </p>
            <p className="text-xs text-yellow-700">
              {missing_order_numbers.join(", ")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
            <div>
              <span className="text-muted-foreground">Distinct Orders</span>
              <p className="font-mono font-bold">
                {verification.commission.distinct_order_count}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Total Products</span>
              <p className="font-mono font-bold">
                {verification.quantity_summary.total_quantity}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Commission</span>
              <p className="font-mono font-bold">
                {gbp(verification.commission.total_commission_gbp)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Product Groups</span>
              <p className="font-mono font-bold">{product_groups.length}</p>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Total Supplier Cost:</span>
              <span className="font-mono">{gbp(invoice.total_supplier_cost)}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Shipping Cost:</span>
              <span className="font-mono">{gbp(invoice.total_shipping_cost)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>Grand Total:</span>
              <span className="font-mono">{gbp(invoice.grand_total)}</span>
            </div>
          </div>

          {(invoice.eu_shipping_override !== null ||
            invoice.uk_shipping_override !== null ||
            invoice.us_shipping_override !== null ||
            invoice.au_shipping_override !== null) && (
              <>
                <Separator className="my-3" />
                <p className="text-xs text-muted-foreground">
                  Shipping overrides applied:
                  {invoice.eu_shipping_override !== null &&
                    ` EU: ${gbp(invoice.eu_shipping_override)}`}
                  {invoice.uk_shipping_override !== null &&
                    ` UK: ${gbp(invoice.uk_shipping_override)}`}
                  {invoice.us_shipping_override !== null &&
                    ` US: ${gbp(invoice.us_shipping_override)}`}
                  {invoice.au_shipping_override !== null &&
                    ` AU: ${gbp(invoice.au_shipping_override)}`}
                </p>
              </>
            )}
        </CardContent>
      </Card>

      {/* Verification Invoice */}
      <Card>
        <CardHeader>
          <CardTitle>Verification Invoice</CardTitle>
          <CardDescription>
            Orders #{invoice.start_order_number} — #{invoice.end_order_number} · Compare this against the supplier invoice line by line.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Products Name</TableHead>
                  <TableHead>Set</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortSupplierGroups(data.supplier_groups ?? []).map((group) => (
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
                                className="cursor-pointer hover:bg-muted/20"
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
                              </TableRow>
                              {/* Expanded order lines */}
                              {isExpanded && setEntry.lines.map((line, idx) => (
                                <TableRow
                                  key={`${expandKey}_${idx}`}
                                  className="bg-muted/10"
                                >
                                  <TableCell className="pl-8 text-xs text-muted-foreground font-mono">
                                    #{line.order_number}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground" />
                                  <TableCell className="text-xs text-muted-foreground">
                                    {line.sku ? `${line.sku} — ` : ""}{line.title}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs">
                                    {line.quantity}
                                  </TableCell>
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
                            className="cursor-pointer hover:bg-muted/20"
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
                          </TableRow>
                          {/* Expanded order lines */}
                          {isExpanded && market.lines.map((line, idx) => (
                            <TableRow
                              key={`${expandKey}_${idx}`}
                              className="bg-muted/10"
                            >
                              <TableCell className="pl-8 text-xs text-muted-foreground font-mono">
                                #{line.order_number}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground" />
                              <TableCell className="text-xs text-muted-foreground">
                                {line.sku ? `${line.sku} — ` : ""}{line.title}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {line.quantity}
                              </TableCell>
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
                  <TableCell className="text-right font-mono font-bold text-base">
                    {(data.supplier_groups ?? []).reduce((sum, g) => sum + g.total_quantity, 0)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Orders & Commission */}
      <Card>
        <CardHeader>
          <CardTitle>Orders & Commission</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Total Orders</TableCell>
                <TableCell className="text-right font-mono font-bold text-base">
                  {verification.commission.distinct_order_count}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Commission Rate</TableCell>
                <TableCell className="text-right font-mono">
                  {gbp(verification.commission.rate_gbp)} per order
                </TableCell>
              </TableRow>
              <TableRow className="bg-muted/30">
                <TableCell className="font-bold">Total Commission</TableCell>
                <TableCell className="text-right font-mono font-bold text-base">
                  {gbp(verification.commission.total_commission_gbp)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Shipping Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>
            Shipping Analysis
            {verification.shipping_analysis.multi_item_orders.length > 0 && (
              <Badge variant="outline" className="ml-2">
                {verification.shipping_analysis.multi_item_orders.length} multi-item orders
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Multi-item orders where shipping may be charged per item instead of per order.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            {verification.shipping_analysis.single_item_order_count} single-item orders |{" "}
            {verification.shipping_analysis.multi_item_orders.length} multi-item orders
          </p>
          {verification.shipping_analysis.multi_item_orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No multi-item orders — shipping analysis not applicable.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total Shipping</TableHead>
                  <TableHead>Rates</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {verification.shipping_analysis.multi_item_orders.map((order) => (
                  <React.Fragment key={order.order_number}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => toggleOrderExpand(order.order_number)}
                    >
                      <TableCell className="font-mono">#{order.order_number}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{order.market_code ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {order.lines.length}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {gbp(order.total_shipping_on_invoice)}
                      </TableCell>
                      <TableCell>
                        {order.has_mixed_shipping_rates ? (
                          <Badge variant="destructive">Mixed</Badge>
                        ) : (
                          <Badge variant="outline">Uniform</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {expandedOrders.has(order.order_number) ? "▲" : "▼"}
                      </TableCell>
                    </TableRow>
                    {expandedOrders.has(order.order_number) &&
                      order.lines.map((line, idx) => (
                        <TableRow key={`${order.order_number}_${idx}`} className="bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={2} className="text-xs text-muted-foreground">
                            {line.sku ? `${line.sku} – ` : ""}{line.title} (x{line.quantity})
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {gbp(line.shipping_cost)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {gbp(line.shipping_per_unit)}/unit
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Granular Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items ({lines.length})</CardTitle>
          <CardDescription>Full line-by-line breakdown per order.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Supplier</TableHead>
                  <TableHead className="text-right">Shipping</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, idx) => (
                  <TableRow key={`${line.order_number}-${idx}`}>
                    <TableCell className="font-mono">#{line.order_number}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{line.title}</TableCell>
                    <TableCell className="font-mono text-xs">{line.sku || "—"}</TableCell>
                    <TableCell>
                      {line.market_code ? (
                        <Badge variant="secondary">{line.market_code}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">{line.quantity}</TableCell>
                    <TableCell className="text-right font-mono">
                      {gbp(line.supplier_cost)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {gbp(line.shipping_cost)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {gbp(line.line_total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <div className="flex gap-2">
          {invoice.status === "draft" && (
            <>
              <Button variant="destructive" onClick={handleDelete}>
                Delete Draft
              </Button>
              <Button variant="outline" onClick={handleVoid}>
                Void
              </Button>
            </>
          )}
          {invoice.status === "confirmed" && (
            <Button variant="destructive" onClick={handleVoid}>
              Void Invoice
            </Button>
          )}
        </div>
        {invoice.status === "draft" && (
          <Button onClick={handleConfirm}>Confirm Invoice</Button>
        )}
      </div>
    </div>
  );
}
