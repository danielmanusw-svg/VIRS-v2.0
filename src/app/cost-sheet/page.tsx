"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  Truck,
  Users,
  TrendingUp,
  ShoppingCart,
  Percent,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRICE_SHEET, type ShippingByMarket } from "@/lib/invoice/priceSheet";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceSummary {
  total_invoices: number;
  total_revenue: number;
  total_goods_cost: number;
  total_shipping_cost: number;
  total_commission: number;
  total_grand: number;
  total_orders: number;
}

interface MarketBreakdown {
  market_code: string;
  revenue: number;
  goods_cost: number;
  shipping_cost: number;
  commission: number;
  total_cost: number;
  order_count: number;
}

interface SupplierBreakdown {
  supplier_label: string;
  revenue: number;
  goods_cost: number;
  shipping_cost: number;
  total_cost: number;
  quantity: number;
}

interface ProductRevenue {
  title: string;
  total_revenue: number;
  total_quantity: number;
}

interface CostSheetData {
  invoice_summary: InvoiceSummary;
  market_breakdown: MarketBreakdown[];
  supplier_breakdown: SupplierBreakdown[];
  top_products_by_revenue: ProductRevenue[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MARKETS = ["UK", "AU", "US", "EU", "RoW"] as const;

const CHART_COLORS = [
  "oklch(0.646 0.222 41.116)",
  "oklch(0.6 0.118 184.704)",
  "oklch(0.398 0.07 227.392)",
  "oklch(0.828 0.189 84.429)",
  "oklch(0.769 0.188 70.08)",
];

const MARKET_COLORS: Record<string, string> = {
  UK: "#3b82f6",
  AU: "#10b981",
  US: "#f59e0b",
  EU: "#8b5cf6",
  RoW: "#6b7280",
  Unknown: "#9ca3af",
};

// ─── Cost Sheet Only: real goods costs for pre-ordered products ───────────────
// These are NOT in priceSheet.ts because invoices should not include them
// (products are pre-ordered separately). Only used for margin calculations here.
const COST_SHEET_GOODS_OVERRIDES: Record<string, number> = {
  "Stainless Steel": 5.85,
  "1L Bottle": 6.80,
  "650ml Bottle": 6.80,
};

// ─── Subscription data (hardcoded from flowpure.com) ─────────────────────────
// Update these if subscription prices change on the storefront.
const SUBSCRIPTION_DATA: Record<string, {
  displayTitle: string;
  initialSubscriptionPriceUSD: number;  // first order subscription price
  plans: { name: string; intervalMonths: number; recurringPriceUSD: number }[];
  tapKey: string;                // PRICE_SHEET key for the tap
  cartridgeKey: string;          // PRICE_SHEET key for cartridge refills
  cartridgesPerDelivery: number;
}> = {
  "Stainless Steel": {
    displayTitle: "FP® Stainless Steel Tap Filter",
    initialSubscriptionPriceUSD: 55.09,  // £41.24
    plans: [
      { name: "Every 4 months", intervalMonths: 4, recurringPriceUSD: 45.42 },
      { name: "Every 6 months", intervalMonths: 6, recurringPriceUSD: 45.42 },
    ],
    tapKey: "Stainless Steel",
    cartridgeKey: "Plastic and Stainless Steel Cartridges",
    cartridgesPerDelivery: 2,
  },
  "Classic Filter": {
    displayTitle: "FlowPure® Classic Tap Filter",
    initialSubscriptionPriceUSD: 51.06,  // £38.24
    plans: [
      { name: "Every 4 months", intervalMonths: 4, recurringPriceUSD: 38.73 },
      { name: "Every 6 months", intervalMonths: 6, recurringPriceUSD: 38.73 },
    ],
    tapKey: "Plastic Filter",
    cartridgeKey: "Plastic and Stainless Steel Cartridges",
    cartridgesPerDelivery: 2,
  },
};

// ─── Currency ─────────────────────────────────────────────────────────────────
// Price sheet and supplier costs are already in USD.
// Shopify data (revenue, commission) is in GBP and must be converted.
const GBP_TO_USD = 1.26;

function gbpToUsd(gbpValue: number): number {
  return gbpValue * GBP_TO_USD;
}

function usdToGbp(usdValue: number): number {
  return usdValue / GBP_TO_USD;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function gbp(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  return `£${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format a USD value in the currently selected display currency.
function fmtMoney(
  usdValue: number | null | undefined,
  currency: "USD" | "GBP"
): string {
  if (usdValue === null || usdValue === undefined) return "N/A";
  return currency === "GBP" ? gbp(usdToGbp(usdValue)) : usd(usdValue);
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function marginClass(margin: number): string {
  if (margin >= 50) return "text-green-600 dark:text-green-400";
  if (margin >= 25) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function profitClass(profit: number): string {
  return profit >= 0
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";
}

function shippingCellClass(value: number | null): string {
  if (value === null)
    return "bg-gray-100 text-gray-400 italic dark:bg-gray-800 dark:text-gray-500";
  if (value <= 4.0)
    return "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400";
  if (value <= 8.0)
    return "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400";
  return "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400";
}

// Soft per-market column tints — coordinated light shades across distinct
// hues so each market column reads as its own vertical band.
const MARKET_COL_TINT: Record<string, string> = {
  UK: "bg-sky-100/70 dark:bg-sky-900/25",
  AU: "bg-amber-100/70 dark:bg-amber-900/25",
  US: "bg-rose-100/70 dark:bg-rose-900/25",
  EU: "bg-indigo-100/70 dark:bg-indigo-900/25",
  RoW: "bg-emerald-100/70 dark:bg-emerald-900/25",
};

function marketColClass(market: string): string {
  return MARKET_COL_TINT[market] ?? "";
}

// Alternating product-group tint. Each product "box" gets one of two soft
// backgrounds so groups stand apart. Within a group, the second row gets a
// very subtle stripe to help track across columns.
function groupRowClass(groupIdx: number, posInGroup: number): string {
  const groupTint =
    groupIdx % 2 === 0
      ? "bg-slate-50/70 dark:bg-slate-900/30"
      : "bg-white dark:bg-transparent";
  const stripe =
    posInGroup % 2 === 1 ? "bg-slate-100/60 dark:bg-slate-800/30" : "";
  return stripe || groupTint;
}

interface PriceRow {
  label: string;
  setSize: number;
  setSizeLabel: string;
  goodsCost: number;
  shipping: ShippingByMarket;
  isFirstInGroup: boolean;
}

function buildPriceRows(): PriceRow[] {
  const rows: PriceRow[] = [];
  for (const [label, entries] of Object.entries(PRICE_SHEET)) {
    const sizes = Object.keys(entries).map(Number).sort((a, b) => a - b);
    sizes.forEach((size, idx) => {
      const entry = entries[size];
      const overriddenGoodsCost =
        COST_SHEET_GOODS_OVERRIDES[label] ?? entry.goods_cost;
      rows.push({
        label,
        setSize: size,
        setSizeLabel: size === 1 ? "1" : `${size}`,
        goodsCost: overriddenGoodsCost,
        shipping: entry.shipping,
        isFirstInGroup: idx === 0,
      });
    });
  }
  return rows;
}

function buildShippingComparisonData() {
  const data: Array<Record<string, string | number>> = [];
  for (const [label, entries] of Object.entries(PRICE_SHEET)) {
    const sizes = Object.keys(entries).map(Number).sort((a, b) => a - b);
    const entry = entries[sizes[0]];
    const row: Record<string, string | number> = {
      name: label.length > 18 ? label.substring(0, 16) + "..." : label,
      fullName: label,
    };
    for (const market of MARKETS) {
      row[market] = entry.shipping[market] ?? 0;
    }
    data.push(row);
  }
  return data;
}

function buildCostBreakdownData(
  supplierData?: SupplierBreakdown[]
) {
  // Build a lookup from supplier label → revenue & quantity from real data
  const realData: Record<string, { revenue: number; quantity: number }> = {};
  if (supplierData) {
    for (const s of supplierData) {
      realData[s.supplier_label] = {
        revenue: s.revenue,
        quantity: s.quantity,
      };
    }
  }

  const data: Array<{
    name: string;
    fullName: string;
    goods: number;
    shipping: number;
    commission: number;
    shopifyPrice: number;
  }> = [];
  for (const [label, entries] of Object.entries(PRICE_SHEET)) {
    const sizes = Object.keys(entries).map(Number).sort((a, b) => a - b);
    const entry = entries[sizes[0]];
    const shippingValues = MARKETS.map((m) => entry.shipping[m]).filter(
      (v): v is number => v !== null
    );
    const avgShipping =
      shippingValues.length > 0
        ? shippingValues.reduce((a, b) => a + b, 0) / shippingValues.length
        : 0;

    // Average Shopify selling price per unit from real data (GBP → USD)
    const real = realData[label];
    const avgPrice =
      real && real.quantity > 0
        ? Math.round((gbpToUsd(real.revenue) / real.quantity) * 100) / 100
        : 0;

    const overriddenGoodsCost =
      COST_SHEET_GOODS_OVERRIDES[label] ?? entry.goods_cost;

    data.push({
      name: label.length > 18 ? label.substring(0, 16) + "..." : label,
      fullName: label,
      goods: overriddenGoodsCost,
      shipping: Math.round(avgShipping * 100) / 100,
      commission: 0.8,
      shopifyPrice: avgPrice,
    });
  }
  return data;
}

// ─── Custom Tooltips ──────────────────────────────────────────────────────────

function CustomBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const fullName = d?.fullName ?? label;
  // Calculate margin if this chart has shopifyPrice and cost data
  let marginLine: React.ReactNode = null;
  if (d?.shopifyPrice && d.shopifyPrice > 0) {
    const totalCost =
      (d.goods ?? 0) + (d.shipping ?? 0) + (d.commission ?? 0);
    const margin = d.shopifyPrice - totalCost;
    marginLine = (
      <p
        className="text-xs font-semibold mt-1 pt-1 border-t border-border"
        style={{ color: margin >= 0 ? "#16a34a" : "#dc2626" }}
      >
        Margin: {usd(margin)}
      </p>
    );
  }
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="mb-1 text-sm font-semibold">{fullName}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: {usd(entry.value)}
        </p>
      ))}
      {marginLine}
    </div>
  );
}

function MarginTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const profit = (d.revenue ?? 0) - (d.cost ?? d.total_cost ?? 0);
  const margin = d.revenue > 0 ? (profit / d.revenue) * 100 : 0;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="mb-1 text-sm font-semibold">{d.fullName ?? d.name}</p>
      {d.revenue !== undefined && (
        <p className="text-xs text-emerald-600">Revenue: {usd(d.revenue)}</p>
      )}
      <p className="text-xs text-red-500">
        Total Cost: {usd(d.cost ?? d.total_cost)}
      </p>
      {d.revenue !== undefined && (
        <>
          <p className={`text-xs ${profitClass(profit)}`}>
            Profit: {usd(profit)}
          </p>
          <p className="text-xs font-semibold">Margin: {pct(margin)}</p>
        </>
      )}
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function CostSheetPage() {
  const [data, setData] = useState<CostSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [combinedPriceView, setCombinedPriceView] = useState(false);
  const [priceSheetCurrency, setPriceSheetCurrency] = useState<"USD" | "GBP">(
    "USD"
  );

  useEffect(() => {
    // Try API first (local dev), fall back to static snapshot (Vercel)
    fetch("/api/cost-sheet")
      .then((res) => {
        if (!res.ok) throw new Error("API unavailable");
        return res.json();
      })
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch(() => {
        fetch("/cost-sheet-data.json")
          .then((res) => res.json())
          .then((json) => setData(json))
          .catch(console.error);
      })
      .finally(() => setLoading(false));
  }, []);

  const priceRows = buildPriceRows();
  const shippingComparisonData = buildShippingComparisonData();
  const hasInvoiceData =
    data && data.invoice_summary && data.invoice_summary.total_invoices > 0;
  const costBreakdownData = buildCostBreakdownData(
    hasInvoiceData ? data.supplier_breakdown : undefined
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-8">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  // Apply cost-sheet-only goods cost overrides to supplier breakdown
  // This adds the real pre-order cost that isn't tracked in invoices
  const adjustedSupplierBreakdown = hasInvoiceData
    ? data.supplier_breakdown.map((s) => {
        const override = COST_SHEET_GOODS_OVERRIDES[s.supplier_label];
        if (override === undefined) return s;
        const additionalGoods = override * s.quantity;
        return {
          ...s,
          goods_cost: Math.round((s.goods_cost + additionalGoods) * 100) / 100,
          total_cost: Math.round((s.total_cost + additionalGoods) * 100) / 100,
        };
      })
    : [];

  // Extra goods cost from pre-ordered products (not in invoice totals)
  const preOrderGoodsAdjustment = hasInvoiceData
    ? adjustedSupplierBreakdown.reduce((sum, s) => {
        const original = data.supplier_breakdown.find(
          (o) => o.supplier_label === s.supplier_label
        );
        return sum + (s.goods_cost - (original?.goods_cost ?? 0));
      }, 0)
    : 0;

  const summary = data?.invoice_summary;
  // Convert Shopify revenue from GBP → USD; costs are already in USD
  const totalRevenueUsd = summary ? gbpToUsd(summary.total_revenue) : 0;
  const adjustedGoodsCost = summary
    ? summary.total_goods_cost + preOrderGoodsAdjustment
    : 0;
  const totalCosts = summary
    ? adjustedGoodsCost + summary.total_shipping_cost + summary.total_commission
    : 0;
  const totalProfit = totalRevenueUsd - totalCosts;
  const overallMargin =
    totalRevenueUsd > 0
      ? (totalProfit / totalRevenueUsd) * 100
      : 0;

  // Chart data for market margin comparison
  const marketMarginData = hasInvoiceData
    ? data.market_breakdown
        .filter((m) => m.revenue > 0 || m.total_cost > 0)
        .map((m) => {
          const revUsd = gbpToUsd(m.revenue);
          return {
            name: m.market_code,
            revenue: Math.round(revUsd * 100) / 100,
            cost: m.total_cost,
            profit: Math.round((revUsd - m.total_cost) * 100) / 100,
            margin:
              revUsd > 0
                ? Math.round(((revUsd - m.total_cost) / revUsd) * 1000) / 10
                : 0,
          };
        })
    : [];

  // Pie chart: revenue distribution by market
  const revenueByMarketPie = hasInvoiceData
    ? data.market_breakdown
        .filter((m) => m.revenue > 0)
        .map((m) => ({
          name: m.market_code,
          value: Math.round(gbpToUsd(m.revenue) * 100) / 100,
        }))
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-20 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-500 bg-clip-text text-transparent dark:from-white dark:to-gray-400">
          Cost Sheet
        </h1>
        <p className="text-muted-foreground mt-1">
          Pricing reference, revenue vs. costs, margins, and profit analysis.
        </p>
      </div>

      {/* KPI Summary Cards */}
      {hasInvoiceData && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background border-emerald-200/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue</CardTitle>
              <ShoppingCart className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {usd(totalRevenueUsd)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary!.total_orders} orders
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background border-blue-200/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Goods Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {usd(adjustedGoodsCost)}
              </div>
              <p className="text-xs text-muted-foreground">Incl. pre-ordered</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-background border-amber-200/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Shipping</CardTitle>
              <Truck className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {usd(summary!.total_shipping_cost)}
              </div>
              <p className="text-xs text-muted-foreground">All markets</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-background border-purple-200/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Commission</CardTitle>
              <Users className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {usd(summary!.total_commission)}
              </div>
              <p className="text-xs text-muted-foreground">@ $0.80/order</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-white dark:from-green-950/20 dark:to-background border-green-200/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${profitClass(totalProfit)}`}
              >
                {usd(totalProfit)}
              </div>
              <p className="text-xs text-muted-foreground">
                Revenue − All costs
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-teal-50 to-white dark:from-teal-950/20 dark:to-background border-teal-200/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Margin</CardTitle>
              <Percent className="h-4 w-4 text-teal-500" />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${marginClass(overallMargin)}`}
              >
                {pct(overallMargin)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary!.total_invoices} invoice
                {summary!.total_invoices !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="price-sheet" className="space-y-4">
        <TabsList>
          <TabsTrigger value="price-sheet">Price Sheet Reference</TabsTrigger>
          <TabsTrigger value="visualizations">Visualizations</TabsTrigger>
          <TabsTrigger value="margins">Revenue & Margins</TabsTrigger>
          <TabsTrigger value="calculator">Pricing Calculator</TabsTrigger>
          <TabsTrigger value="subscription-roi">Subscription ROI</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Price Sheet Reference ───────────────────────────────── */}
        <TabsContent value="price-sheet" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Button
                    variant={combinedPriceView ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCombinedPriceView((v) => !v)}
                  >
                    {combinedPriceView ? "Split View" : "Combined View"}
                  </Button>
                  <CardTitle>Supplier Price Sheet</CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPriceSheetCurrency((c) =>
                      c === "USD" ? "GBP" : "USD"
                    )
                  }
                  title={`Switch to ${priceSheetCurrency === "USD" ? "GBP" : "USD"} (rate: 1 GBP = $${GBP_TO_USD})`}
                >
                  {priceSheetCurrency === "USD" ? "$ USD" : "£ GBP"}
                </Button>
              </div>
              <CardDescription>
                {combinedPriceView
                  ? "Combined view: each market cell shows goods + shipping as a single total. Rows are grouped per product with alternating tints for readability."
                  : "Full pricing reference derived from the supplier price sheet. Shipping cells are color-coded: green (≤£4), amber (≤£8), red (>£8). Grey cells indicate missing prices."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Product</TableHead>
                      <TableHead className="text-center">Qty / Set</TableHead>
                      {!combinedPriceView && (
                        <TableHead className="text-right">Goods Cost</TableHead>
                      )}
                      {MARKETS.map((m) => (
                        <TableHead
                          key={m}
                          className={`text-right ${combinedPriceView ? marketColClass(m) : ""}`}
                        >
                          {m}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      let groupIdx = -1;
                      let posInGroup = 0;
                      return priceRows.map((row, idx) => {
                        if (row.isFirstInGroup) {
                          groupIdx += 1;
                          posInGroup = 0;
                        } else {
                          posInGroup += 1;
                        }
                        const rowBg = groupRowClass(groupIdx, posInGroup);
                        const borderCls =
                          row.isFirstInGroup && idx > 0
                            ? "border-t-2 border-gray-300 dark:border-gray-600"
                            : "";
                        return (
                          <TableRow
                            key={`${row.label}-${row.setSize}`}
                            className={`${borderCls} ${rowBg} transition-colors hover:bg-violet-200 dark:hover:bg-violet-900/50 hover:[&>td]:!bg-violet-200 dark:hover:[&>td]:!bg-violet-900/50`}
                          >
                            <TableCell className="font-medium">
                              {row.isFirstInGroup ? row.label : ""}
                            </TableCell>
                            <TableCell className="text-center">
                              {row.setSizeLabel}
                            </TableCell>
                            {!combinedPriceView && (
                              <TableCell className="text-right">
                                {row.goodsCost === 0 ? (
                                  <span className="text-gray-400">—</span>
                                ) : (
                                  fmtMoney(row.goodsCost, priceSheetCurrency)
                                )}
                              </TableCell>
                            )}
                            {MARKETS.map((market) => {
                              const val = row.shipping[market];
                              const colTint = marketColClass(market);
                              if (combinedPriceView) {
                                const missing =
                                  val === null || row.goodsCost === 0;
                                return (
                                  <TableCell
                                    key={market}
                                    className={`text-right text-xs font-mono ${colTint}`}
                                  >
                                    {missing ? (
                                      <span className="text-gray-400">
                                        N/A
                                      </span>
                                    ) : (
                                      fmtMoney(
                                        row.goodsCost + (val ?? 0),
                                        priceSheetCurrency
                                      )
                                    )}
                                  </TableCell>
                                );
                              }
                              return (
                                <TableCell
                                  key={market}
                                  className={`text-right text-xs font-mono ${shippingCellClass(val)}`}
                                >
                                  {val === null
                                    ? "N/A"
                                    : fmtMoney(val, priceSheetCurrency)}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Average Order Metrics */}
          {hasInvoiceData && summary && summary.total_orders > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Average Order Metrics</CardTitle>
                <CardDescription>
                  Per-order revenue, cost, and margin across all{" "}
                  {summary.total_orders} orders. Commission is a flat $0.80 per
                  order. Values shown in{" "}
                  {priceSheetCurrency === "USD" ? "USD" : "GBP"}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const orders = summary.total_orders;
                  const avgRevenue = totalRevenueUsd / orders;
                  const avgGoods = adjustedGoodsCost / orders;
                  const avgShipping = summary.total_shipping_cost / orders;
                  const avgCommission = 0.8;
                  const avgCost = avgGoods + avgShipping + avgCommission;
                  const avgMargin = avgRevenue - avgCost;
                  const avgMarginPct =
                    avgRevenue > 0 ? (avgMargin / avgRevenue) * 100 : 0;
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="rounded-lg border p-4 space-y-1">
                        <div className="text-sm text-muted-foreground">
                          Avg Order Revenue
                        </div>
                        <div className="text-2xl font-semibold">
                          {fmtMoney(avgRevenue, priceSheetCurrency)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Shopify order value
                        </div>
                      </div>
                      <div className="rounded-lg border p-4 space-y-1">
                        <div className="text-sm text-muted-foreground">
                          Avg Order Cost
                        </div>
                        <div className="text-2xl font-semibold">
                          {fmtMoney(avgCost, priceSheetCurrency)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Goods {fmtMoney(avgGoods, priceSheetCurrency)} + Ship{" "}
                          {fmtMoney(avgShipping, priceSheetCurrency)} + Comm{" "}
                          {fmtMoney(avgCommission, priceSheetCurrency)}
                        </div>
                      </div>
                      <div className="rounded-lg border p-4 space-y-1">
                        <div className="text-sm text-muted-foreground">
                          Avg Order Margin
                        </div>
                        <div
                          className={`text-2xl font-semibold ${profitClass(avgMargin)}`}
                        >
                          {fmtMoney(avgMargin, priceSheetCurrency)}
                        </div>
                        <div className={`text-xs ${marginClass(avgMarginPct)}`}>
                          {pct(avgMarginPct)} margin
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* ── Tab 2: Visualizations ──────────────────────────────────────── */}
        <TabsContent value="visualizations" className="space-y-6">
          {/* Chart A: Shipping Cost Comparison by Market */}
          <Card>
            <CardHeader>
              <CardTitle>Shipping Cost Comparison by Market</CardTitle>
              <CardDescription>
                Shipping cost per product across all markets (smallest set size
                shown for multi-set products).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={shippingComparisonData}
                    margin={{ top: 10, right: 30, left: 10, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="name"
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                      tick={{ fontSize: 11 }}
                      height={80}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: 12 }} />
                    {MARKETS.map((market) => (
                      <Bar
                        key={market}
                        dataKey={market}
                        fill={MARKET_COLORS[market]}
                        radius={[2, 2, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Chart B: Full Cost + Margin per Product */}
          <Card>
            <CardHeader>
              <CardTitle>Full Cost Breakdown per Product</CardTitle>
              <CardDescription>
                Goods (blue) + avg shipping (amber) + commission (red) stacked
                as total cost, with the avg Shopify selling price (green) for
                comparison.
                {!hasInvoiceData &&
                  " Shopify prices will appear once invoices exist."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={costBreakdownData}
                    margin={{ top: 10, right: 30, left: 10, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="name"
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                      tick={{ fontSize: 11 }}
                      height={80}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: 12 }} />
                    <Bar
                      dataKey="shopifyPrice"
                      name="Shopify Price"
                      fill="#10b981"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="goods"
                      name="Goods Cost"
                      stackId="cost"
                      fill="#3b82f6"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="shipping"
                      name="Avg Shipping"
                      stackId="cost"
                      fill="#f59e0b"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="commission"
                      name="Commission"
                      stackId="cost"
                      fill="#ef4444"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

        </TabsContent>

        {/* ── Tab 3: Revenue & Margins ───────────────────────────────────── */}
        <TabsContent value="margins" className="space-y-6">
          {!hasInvoiceData ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <DollarSign className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  No invoice data available yet
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create an invoice to see revenue, margins, and profit
                  analysis.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Revenue vs Cost by Market */}
              {marketMarginData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue vs. Cost by Market</CardTitle>
                    <CardDescription>
                      Shopify revenue compared to supplier + shipping costs for
                      each market.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[380px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={marketMarginData}
                          margin={{
                            top: 10,
                            right: 30,
                            left: 10,
                            bottom: 20,
                          }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            opacity={0.3}
                          />
                          <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                          <YAxis
                            tick={{ fontSize: 12 }}
                            tickFormatter={(v) =>
                              `$${(v / 1000).toFixed(0)}k`
                            }
                          />
                          <Tooltip content={<MarginTooltip />} />
                          <Legend wrapperStyle={{ paddingTop: 12 }} />
                          <Bar
                            dataKey="revenue"
                            name="Revenue"
                            fill="#10b981"
                            radius={[2, 2, 0, 0]}
                          />
                          <Bar
                            dataKey="cost"
                            name="Total Cost"
                            fill="#ef4444"
                            radius={[2, 2, 0, 0]}
                          />
                          <Bar
                            dataKey="profit"
                            name="Profit"
                            fill="#3b82f6"
                            radius={[2, 2, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Revenue Distribution Donut */}
              {revenueByMarketPie.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue Distribution by Market</CardTitle>
                    <CardDescription>
                      Share of total Shopify revenue by shipping market.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={revenueByMarketPie}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={120}
                            paddingAngle={3}
                            dataKey="value"
                            label={(props: any) =>
                              `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(1)}%`
                            }
                          >
                            {revenueByMarketPie.map((entry, index) => (
                              <Cell
                                key={entry.name}
                                fill={
                                  MARKET_COLORS[entry.name] ||
                                  CHART_COLORS[index % CHART_COLORS.length]
                                }
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: any) => usd(Number(value))}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Market Profitability Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Market Profitability</CardTitle>
                  <CardDescription>
                    Revenue from Shopify, actual costs from invoices (incl.
                    commission), and profit margins by market.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Market</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Goods</TableHead>
                        <TableHead className="text-right">Shipping</TableHead>
                        <TableHead className="text-right">
                          Commission
                        </TableHead>
                        <TableHead className="text-right">
                          Total Cost
                        </TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                        <TableHead className="text-right">Margin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.market_breakdown.map((market) => {
                        const revUsd = gbpToUsd(market.revenue);
                        const profit = revUsd - market.total_cost;
                        const margin =
                          revUsd > 0
                            ? (profit / revUsd) * 100
                            : 0;
                        return (
                          <TableRow key={market.market_code}>
                            <TableCell>
                              <Badge variant="outline">
                                {market.market_code}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {market.order_count}
                            </TableCell>
                            <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                              {usd(revUsd)}
                            </TableCell>
                            <TableCell className="text-right">
                              {usd(market.goods_cost)}
                            </TableCell>
                            <TableCell className="text-right">
                              {usd(market.shipping_cost)}
                            </TableCell>
                            <TableCell className="text-right text-purple-600 dark:text-purple-400">
                              {usd(market.commission)}
                            </TableCell>
                            <TableCell className="text-right text-red-600 dark:text-red-400">
                              {usd(market.total_cost)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-semibold ${profitClass(profit)}`}
                            >
                              {usd(profit)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-semibold ${marginClass(margin)}`}
                            >
                              {pct(margin)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Supplier Label Profitability Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Profitability by Supplier Label</CardTitle>
                  <CardDescription>
                    Shopify revenue vs. actual costs per product category, with
                    profit and margin.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier Label</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Goods</TableHead>
                        <TableHead className="text-right">Shipping</TableHead>
                        <TableHead className="text-right">
                          Total Cost
                        </TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                        <TableHead className="text-right">Margin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustedSupplierBreakdown.map((supplier) => {
                        const revUsd = gbpToUsd(supplier.revenue);
                        const profit = revUsd - supplier.total_cost;
                        const margin =
                          revUsd > 0
                            ? (profit / revUsd) * 100
                            : 0;
                        return (
                          <TableRow key={supplier.supplier_label}>
                            <TableCell className="font-medium">
                              {supplier.supplier_label}
                            </TableCell>
                            <TableCell className="text-right">
                              {supplier.quantity}
                            </TableCell>
                            <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                              {usd(revUsd)}
                            </TableCell>
                            <TableCell className="text-right">
                              {usd(supplier.goods_cost)}
                            </TableCell>
                            <TableCell className="text-right">
                              {usd(supplier.shipping_cost)}
                            </TableCell>
                            <TableCell className="text-right text-red-600 dark:text-red-400">
                              {usd(supplier.total_cost)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-semibold ${profitClass(profit)}`}
                            >
                              {usd(profit)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-semibold ${marginClass(margin)}`}
                            >
                              {pct(margin)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Top Products by Revenue */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Products by Revenue</CardTitle>
                  <CardDescription>
                    Highest-revenue products from Shopify across all invoices.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">
                          Avg Price
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.top_products_by_revenue.map((product) => (
                        <TableRow key={product.title}>
                          <TableCell className="font-medium max-w-[300px] truncate">
                            {product.title}
                          </TableCell>
                          <TableCell className="text-right">
                            {product.total_quantity}
                          </TableCell>
                          <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                            {usd(gbpToUsd(product.total_revenue))}
                          </TableCell>
                          <TableCell className="text-right">
                            {product.total_quantity > 0
                              ? usd(
                                  gbpToUsd(product.total_revenue) /
                                    product.total_quantity
                                )
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Tab 4: Pricing Calculator ─────────────────────────────────── */}
        <TabsContent value="calculator">
          <PricingCalculator />
        </TabsContent>

        {/* ── Tab 5: Subscription ROI ────────────────────────────────────── */}
        <TabsContent value="subscription-roi">
          <SubscriptionROI />
        </TabsContent>
      </Tabs>
    </div>
  );
}


// ─── Pricing Calculator Component ─────────────────────────────────────────────

function PricingCalculator() {
  const productLabels = Object.keys(PRICE_SHEET);
  const [selectedProduct, setSelectedProduct] = useState(productLabels[0]);
  const [selectedMarket, setSelectedMarket] = useState<string>("UK");
  const [selectedSetSize, setSelectedSetSize] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<string>("");

  const entries = PRICE_SHEET[selectedProduct];
  const setSizes = Object.keys(entries)
    .map(Number)
    .sort((a, b) => a - b);

  // Reset set size when product changes
  const activeSetSize =
    selectedSetSize && setSizes.includes(selectedSetSize)
      ? selectedSetSize
      : setSizes[0];

  const entry = entries[activeSetSize];
  const shippingRaw =
    entry.shipping[selectedMarket as keyof ShippingByMarket];
  const shippingCost = shippingRaw ?? 0;
  const shippingMissing = shippingRaw === null;

  // Goods cost with cost-sheet override
  const goodsCost =
    COST_SHEET_GOODS_OVERRIDES[selectedProduct] ?? entry.goods_cost;

  const commission = 0.8;
  const totalCost = goodsCost + shippingCost + commission;

  const price = parseFloat(sellingPrice) || 0;
  const profit = price - totalCost;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const breakEvenAd = profit > 0 ? profit : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing Calculator</CardTitle>
        <CardDescription>
          Select a product and market, enter your selling price in $, and see
          your profit margin and break-even ad spend per customer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Product</Label>
            <Select
              value={selectedProduct}
              onValueChange={(v) => {
                setSelectedProduct(v);
                setSelectedSetSize(0);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {productLabels.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Market</Label>
            <Select value={selectedMarket} onValueChange={setSelectedMarket}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARKETS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {setSizes.length > 1 && (
            <div className="space-y-2">
              <Label>Set Size</Label>
              <Select
                value={String(activeSetSize)}
                onValueChange={(v) => setSelectedSetSize(Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {setSizes.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Selling Price ($)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 49.99"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
            />
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Goods Cost</span>
                <span className="font-mono">{usd(goodsCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Shipping ({selectedMarket})
                  {shippingMissing && (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      N/A
                    </Badge>
                  )}
                </span>
                <span className="font-mono">{usd(shippingCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Commission</span>
                <span className="font-mono">{usd(commission)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total Cost</span>
                <span className="font-mono text-red-600 dark:text-red-400">
                  {usd(totalCost)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Profitability</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Selling Price</span>
                <span className="font-mono">
                  {price > 0 ? usd(price) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Cost</span>
                <span className="font-mono">{usd(totalCost)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">Profit</span>
                <span
                  className={`font-mono font-semibold ${profitClass(profit)}`}
                >
                  {price > 0 ? usd(profit) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Margin</span>
                <span
                  className={`font-mono font-semibold ${price > 0 ? marginClass(margin) : ""}`}
                >
                  {price > 0 ? pct(margin) : "—"}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">
                  Break-even Ad Spend
                </span>
                <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                  {price > 0 ? usd(breakEvenAd) : "—"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1">
                Max you can spend to acquire one customer and still break even.
              </p>
            </CardContent>
          </Card>
        </div>

        {shippingMissing && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Shipping cost for {selectedProduct} to {selectedMarket} is not
            available in the price sheet. Calculation uses $0.00 for shipping.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Subscription ROI Component ────────────────────────────────────────────────

function SubscriptionROI() {
  const productKeys = Object.keys(SUBSCRIPTION_DATA);
  const [selectedKey, setSelectedKey] = useState<string>(productKeys[0]);
  const [selectedPlanIdx, setSelectedPlanIdx] = useState<number>(0);
  const [market, setMarket] = useState<string>("UK");
  const [tapSetSize, setTapSetSize] = useState<number>(0);
  const [adSpendStr, setAdSpendStr] = useState<string>("");
  const [paybackMonthsStr, setPaybackMonthsStr] = useState<string>("");


  const product = SUBSCRIPTION_DATA[selectedKey];
  const plan = product.plans[selectedPlanIdx] ?? product.plans[0];

  const tapEntries = PRICE_SHEET[product.tapKey];
  const sizes = tapEntries ? Object.keys(tapEntries).map(Number).sort((a, b) => a - b) : [];
  const activeTapSetSize = tapSetSize && sizes.includes(tapSetSize) ? tapSetSize : sizes[0] ?? 2;
  const activeTapEntry = PRICE_SHEET[product.tapKey]?.[activeTapSetSize];

  const tapGoodsCost = activeTapEntry
    ? (COST_SHEET_GOODS_OVERRIDES[product.tapKey] ?? activeTapEntry.goods_cost)
    : 0;
  const tapShippingRaw = activeTapEntry?.shipping[market as keyof ShippingByMarket] ?? null;
  const tapShipping = tapShippingRaw ?? 0;
  const tapCost = tapGoodsCost + tapShipping + 0.80;
  const tapInitialPrice = product.initialSubscriptionPriceUSD;
  const tapMargin = tapInitialPrice - tapCost;

  const cartEntry = PRICE_SHEET[product.cartridgeKey]?.[product.cartridgesPerDelivery];
  const cartGoodsCost = cartEntry?.goods_cost ?? 0;
  const cartShippingRaw = cartEntry?.shipping[market as keyof ShippingByMarket] ?? null;
  const cartShipping = cartShippingRaw ?? 0;
  const cartCost = cartGoodsCost + cartShipping + 0.80;
  const cartRecurringPrice = plan.recurringPriceUSD;
  const cartMargin = cartRecurringPrice - cartCost;

  const adSpend = parseFloat(adSpendStr) || 0;
  const netInvestment = adSpend - tapMargin;
  const deliveriesToBreakEven = netInvestment <= 0 ? 0 : Math.ceil(netInvestment / cartMargin);
  const monthsToBreakEven = deliveriesToBreakEven * plan.intervalMonths;

  const paybackMonths = parseFloat(paybackMonthsStr) || 0;
  const maxDeliveries = paybackMonths > 0 ? Math.floor(paybackMonths / plan.intervalMonths) : 0;
  const maxAdSpend = tapMargin + maxDeliveries * cartMargin;

  function breakEvenClass(d: number): string {
    if (d === 0) return "text-green-600 dark:text-green-400";
    if (d <= 3) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription ROI Calculator</CardTitle>
        <CardDescription>
          Calculate how long it takes to recover ad spend through recurring subscription
          deliveries, or find the maximum ad spend for a given payback period.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">

        {/* Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Product</Label>
            <Select value={selectedKey} onValueChange={(v) => { setSelectedKey(v); setSelectedPlanIdx(0); setTapSetSize(0); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {productKeys.map((k) => (
                  <SelectItem key={k} value={k}>{SUBSCRIPTION_DATA[k].displayTitle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Market</Label>
            <Select value={market} onValueChange={setMarket}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MARKETS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Subscription Interval</Label>
            <Select value={String(selectedPlanIdx)} onValueChange={(v) => setSelectedPlanIdx(Number(v))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {product.plans.map((p, i) => (
                  <SelectItem key={i} value={String(i)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {sizes.length > 1 && (
            <div className="space-y-2">
              <Label>Tap Set Size</Label>
              <Select value={String(activeTapSetSize)} onValueChange={(v) => setTapSetSize(Number(v))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sizes.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Subscription Economics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Initial Tap Sale</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Subscription price: {usd(tapInitialPrice)}
              </p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Cost</span>
                <span className="font-mono text-red-600 dark:text-red-400">{usd(tapCost)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-2">
                <span>Margin</span>
                <span className={`font-mono ${profitClass(tapMargin)}`}>{usd(tapMargin)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Per Subscription Delivery</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {product.cartridgesPerDelivery}× cartridges {plan.name.toLowerCase()} at {usd(cartRecurringPrice)}
              </p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Cost</span>
                <span className="font-mono text-red-600 dark:text-red-400">{usd(cartCost)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-2">
                <span>Margin per Delivery</span>
                <span className={`font-mono ${profitClass(cartMargin)}`}>{usd(cartMargin)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ROI Calculators */}
        {cartMargin > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <Card className="border-blue-200/50 dark:border-blue-800/50 bg-blue-50/30 dark:bg-blue-950/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-blue-700 dark:text-blue-400">
                  Ad Spend → Break-even
                </CardTitle>
                <CardDescription>
                  Enter your cost per acquisition to see how long it takes to recover.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-2">
                  <Label>Ad Spend per Customer ($)</Label>
                  <Input type="number" min="0" step="0.01" placeholder="e.g. 50.00"
                    value={adSpendStr} onChange={(e) => setAdSpendStr(e.target.value)} />
                </div>
                {adSpend > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ad Spend</span>
                      <span className="font-mono">{usd(adSpend)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">− Tap Margin</span>
                      <span className={`font-mono ${profitClass(tapMargin)}`}>{usd(tapMargin)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground">Net to Recover</span>
                      <span className="font-mono font-semibold">
                        {netInvestment <= 0
                          ? <span className="text-green-600 dark:text-green-400">Already profitable</span>
                          : usd(netInvestment)}
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold pt-1">
                      <span>Break-even</span>
                      <span className={`font-mono ${breakEvenClass(deliveriesToBreakEven)}`}>
                        {deliveriesToBreakEven === 0
                          ? "Immediate"
                          : `${deliveriesToBreakEven} deliver${deliveriesToBreakEven === 1 ? "y" : "ies"} (${monthsToBreakEven} months)`}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-purple-200/50 dark:border-purple-800/50 bg-purple-50/30 dark:bg-purple-950/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-purple-700 dark:text-purple-400">
                  Payback Period → Max Ad Spend
                </CardTitle>
                <CardDescription>
                  Enter how long you&apos;re willing to wait to find the maximum you can spend on ads.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-2">
                  <Label>Acceptable Payback Period (months)</Label>
                  <Input type="number" min="1" step="1" placeholder="e.g. 12"
                    value={paybackMonthsStr} onChange={(e) => setPaybackMonthsStr(e.target.value)} />
                </div>
                {paybackMonths > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deliveries in Window</span>
                      <span className="font-mono">{maxDeliveries}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{maxDeliveries}× {usd(cartMargin)} delivery margin</span>
                      <span className="font-mono">{usd(maxDeliveries * cartMargin)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">+ Tap Margin</span>
                      <span className={`font-mono ${profitClass(tapMargin)}`}>{usd(tapMargin)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <span>Max Ad Spend</span>
                      <span className={`font-mono ${profitClass(maxAdSpend)}`}>{usd(maxAdSpend)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        ) : (
          <p className="text-sm text-red-600 dark:text-red-400">
            Subscription deliveries are not profitable at current costs for this market.
          </p>
        )}

      </CardContent>
    </Card>
  );
}
