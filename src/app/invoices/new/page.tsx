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

interface InvoiceData {
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

export default function NewInvoicePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1: order range
  const [startOrder, setStartOrder] = useState("");
  const [endOrder, setEndOrder] = useState("");

  // Step 2: overrides
  const [overrides, setOverrides] = useState<Record<string, string>>({
    EU: "",
    UK: "",
    US: "",
    AU: "",
  });

  // Step 3: preview data
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Shipping analysis expand state
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());

  // Drilldown expand state for verification invoice ("label_market" keys)
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());

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

  async function handleCreate() {
    const start = parseInt(startOrder, 10);
    const end = parseInt(endOrder, 10);

    if (isNaN(start) || isNaN(end) || start > end) {
      toast.error("Enter a valid order range (start must be ≤ end)");
      return;
    }

    setCreating(true);
    try {
      const marketOverrides: Record<string, number> = {};
      for (const code of MARKET_CODES) {
        const val = parseFloat(overrides[code]);
        if (!isNaN(val) && val > 0) {
          marketOverrides[code] = val;
        }
      }

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_order_number: start,
          end_order_number: end,
          overrides:
            Object.keys(marketOverrides).length > 0
              ? marketOverrides
              : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setInvoiceData(data);
      setStep(3);
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
        body: JSON.stringify({ status: "confirmed" }),
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
        {[1, 2, 3].map((s) => (
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
              {s === 1 ? "Order Range" : s === 2 ? "Overrides" : "Verification"}
            </span>
            {s < 3 && <Separator className="mx-2 w-8" />}
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
            <div className="flex justify-end">
              <Button
                onClick={() => setStep(2)}
                disabled={!startOrder || !endOrder}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Warnings + Overrides */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Shipping Rate Overrides</CardTitle>
            <CardDescription>
              Optionally override the per-market shipping rate for this invoice.
              Leave blank to use the default per-variant rates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {MARKET_CODES.map((code) => (
                <div key={code} className="space-y-2">
                  <Label>{code} Shipping Override (£/unit)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Leave blank for default"
                    value={overrides[code]}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        [code]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Generating..." : "Generate Invoice"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Clean Invoice Verification */}
      {step === 3 && invoiceData && (
        <div className="space-y-4">
          {/* Unmapped Products Warning (minimal) */}
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
                      <TableHead className="w-[250px]">Products Name</TableHead>
                      <TableHead>Set</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
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
                        {invoiceData.supplier_groups.reduce((sum, g) => sum + g.total_quantity, 0)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Table 2: Orders & Commission */}
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
                      {invoiceData.verification.commission.distinct_order_count}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Commission Rate</TableCell>
                    <TableCell className="text-right font-mono">
                      {gbp(invoiceData.verification.commission.rate_gbp)} per order
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/30">
                    <TableCell className="font-bold">Total Commission</TableCell>
                    <TableCell className="text-right font-mono font-bold text-base">
                      {gbp(invoiceData.verification.commission.total_commission_gbp)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

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
