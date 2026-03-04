"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  Package,
  RefreshCcw,
  AlertOctagon,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // We need to fetch data to calculate these KPIs.
  // Ideally, create a specific /api/dashboard endpoint to aggregate this on the server.
  // But for now, we can fetch products + settings + failed orders manually.
  // Let's create a specialized useEffect that fetches from multiple points.

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [productsRes, settingsRes, failedRes] = await Promise.all([
          fetch("/api/products"),
          fetch("/api/settings"), // We assume this exists or use sync history
          fetch("/api/orders?flagged=true") // or check specific "failed" count
        ]);

        // Mocking some data structure since we don't have a dedicated endpoint yet
        // 1. Total Stock Value
        const products = await productsRes.json();
        let totalValue = 0;
        let totalProducts = 0;

        products.forEach((p: any) => {
          p.variants.forEach((v: any) => {
            totalValue += v.stock_quantity * v.supplier_cost;
            totalProducts++;
          });
        });

        // 2. Settings / Sync Status
        // const settings = await settingsRes.json(); // May not exist yet, fallback
        const lastSync = new Date().toISOString(); // Placeholder

        setStats({
          totalValue,
          totalProducts,
          lastSync,
          failedOrders: 0 // Placeholder
        });
      } catch (e) {
        console.error("Dashboard load failed", e);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  if (loading) {
    return <div className="p-8 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    </div>
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-500 bg-clip-text text-transparent dark:from-white dark:to-gray-400">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Overview of your inventory health and performance.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory">
            <Button>Manage Inventory <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Stock Value */}
        <Card className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background border-blue-200/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stock Value</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">£{stats?.totalValue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">Based on supplier cost</p>
          </CardContent>
        </Card>

        {/* Total Variants */}
        <Card className="bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-background border-purple-200/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Variants</CardTitle>
            <Package className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalProducts}</div>
            <p className="text-xs text-muted-foreground">Tracked SKUs</p>
          </CardContent>
        </Card>

        {/* Sync Status */}
        <Card className="bg-gradient-to-br from-green-50 to-white dark:from-green-950/20 dark:to-background border-green-200/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Sync</CardTitle>
            <RefreshCcw className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {/* Placeholder time math */}
              Just now
            </div>
            <p className="text-xs text-muted-foreground">System is healthy</p>
          </CardContent>
        </Card>

        {/* Failed Orders */}
        <Card className="bg-gradient-to-br from-red-50 to-white dark:from-red-950/20 dark:to-background border-red-200/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Orders</CardTitle>
            <AlertOctagon className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.failedOrders}</div>
            <p className="text-xs text-muted-foreground">Requires attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Areas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Inventory Trends</CardTitle>
            <CardDescription>Stock movement over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground border-dashed border-2 rounded-lg m-4">
            Chart Placeholder (Top Selling, Low Stock)
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest syncs and updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">Sync Completed</p>
                  <p className="text-xs text-muted-foreground">2 minutes ago</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">Manual Stock Update</p>
                  <p className="text-xs text-muted-foreground">1 hour ago</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
