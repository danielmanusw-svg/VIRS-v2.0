"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { SyncHistory } from "@/components/sync/SyncHistory";

interface Settings {
  id: number;
  sync_frequency_hours: number;
  shopify_orders_synced_until: string | null;
  last_synced_at: string | null;
}

const FREQUENCY_OPTIONS = [
  { value: "1", label: "Every 1 hour" },
  { value: "3", label: "Every 3 hours" },
  { value: "6", label: "Every 6 hours" },
  { value: "12", label: "Every 12 hours" },
  { value: "24", label: "Every 24 hours" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingFrequency, setSavingFrequency] = useState(false);
  const [syncingOrders, setSyncingOrders] = useState(false);
  const [syncingProducts, setSyncingProducts] = useState(false);
  const [shopifyStatus, setShopifyStatus] = useState<
    "idle" | "checking" | "connected" | "error"
  >("idle");
  const [shopifyError, setShopifyError] = useState("");

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setSettings(data.settings);
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleFrequencyChange(value: string) {
    setSavingFrequency(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync_frequency_hours: parseInt(value, 10) }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Sync frequency updated");
      await fetchSettings();
    } catch {
      toast.error("Failed to update frequency");
    } finally {
      setSavingFrequency(false);
    }
  }

  async function handleSyncOrders() {
    setSyncingOrders(true);
    try {
      const res = await fetch("/api/sync/orders", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      toast.success(data.message);
      await fetchSettings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Order sync failed");
    } finally {
      setSyncingOrders(false);
    }
  }

  async function handleSyncProducts() {
    setSyncingProducts(true);
    try {
      const res = await fetch("/api/sync/products", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(
        `Products synced: ${data.records_processed} processed, ${data.records_created} created, ${data.records_updated} updated`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Product sync failed");
    } finally {
      setSyncingProducts(false);
    }
  }

  async function checkShopifyConnection() {
    setShopifyStatus("checking");
    setShopifyError("");
    try {
      const res = await fetch("/api/shopify/check");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShopifyStatus("connected");
    } catch (err) {
      setShopifyStatus("error");
      setShopifyError(err instanceof Error ? err.message : "Connection failed");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Shopify Connection */}
      <Card>
        <CardHeader>
          <CardTitle>Shopify Connection</CardTitle>
          <CardDescription>
            Verify your Shopify API credentials are working.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={checkShopifyConnection}
            disabled={shopifyStatus === "checking"}
          >
            {shopifyStatus === "checking" ? "Checking..." : "Test Connection"}
          </Button>
          {shopifyStatus === "connected" && (
            <Badge className="bg-green-600">Connected</Badge>
          )}
          {shopifyStatus === "error" && (
            <span className="text-sm text-destructive">{shopifyError}</span>
          )}
        </CardContent>
      </Card>

      {/* Sync Frequency */}
      <Card>
        <CardHeader>
          <CardTitle>Sync Frequency</CardTitle>
          <CardDescription>
            How often the automated cron job should sync orders. The cron
            endpoint self-throttles based on this setting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select
              value={String(settings?.sync_frequency_hours ?? 6)}
              onValueChange={handleFrequencyChange}
              disabled={savingFrequency}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {settings?.last_synced_at && (
            <p className="text-sm text-muted-foreground">
              Last synced:{" "}
              {format(
                new Date(settings.last_synced_at),
                "dd MMM yyyy HH:mm:ss"
              )}
            </p>
          )}
          {settings?.shopify_orders_synced_until && (
            <p className="text-sm text-muted-foreground">
              Orders synced until:{" "}
              {format(
                new Date(settings.shopify_orders_synced_until),
                "dd MMM yyyy HH:mm:ss"
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Manual Sync */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Sync</CardTitle>
          <CardDescription>
            Trigger a sync immediately, bypassing the frequency check.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button onClick={handleSyncProducts} disabled={syncingProducts}>
            {syncingProducts ? "Syncing Products..." : "Sync Products"}
          </Button>
          <Button onClick={handleSyncOrders} disabled={syncingOrders}>
            {syncingOrders ? "Syncing Orders..." : "Sync Orders"}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Sync History */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Sync History</h2>
        <SyncHistory />
      </div>
    </div>
  );
}
