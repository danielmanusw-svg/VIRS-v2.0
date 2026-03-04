"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface FlaggedOrder {
  id: number;
  order_number: number;
  shipping_country_code: string | null;
  shopify_created_at: string;
  market_code: string | null;
}

export default function FlaggedOrdersPage() {
  const [orders, setOrders] = useState<FlaggedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const fetchFlagged = useCallback(async () => {
    try {
      const res = await fetch("/api/orders?flagged=true");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setOrders(json.data);
    } catch {
      toast.error("Failed to load flagged orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlagged();
  }, [fetchFlagged]);

  async function handleOverride(orderId: number) {
    const value = overrides[orderId];
    if (!value || isNaN(parseFloat(value))) {
      toast.error("Enter a valid shipping cost");
      return;
    }

    setSaving((prev) => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipping_cost_override: parseFloat(value) }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Shipping cost override saved — order unflagged");
      await fetchFlagged();
    } catch {
      toast.error("Failed to save override");
    } finally {
      setSaving((prev) => ({ ...prev, [orderId]: false }));
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Flagged Orders</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Flagged Orders</h1>
        <p className="text-sm text-muted-foreground">
          These orders have shipping addresses with unrecognised country codes.
          Enter a shipping cost override to resolve them.
        </p>
      </div>

      {orders.length === 0 ? (
        <p className="text-muted-foreground">
          No flagged orders. All orders have recognised markets.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Country Code</TableHead>
                <TableHead>Shipping Cost (GBP)</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono font-medium">
                    #{order.order_number}
                  </TableCell>
                  <TableCell>
                    <Badge variant="destructive">
                      {order.shipping_country_code || "Unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="h-8 w-28"
                      value={overrides[order.id] ?? ""}
                      onChange={(e) =>
                        setOverrides((prev) => ({
                          ...prev,
                          [order.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleOverride(order.id);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() => handleOverride(order.id)}
                      disabled={saving[order.id]}
                    >
                      {saving[order.id] ? "Saving..." : "Save"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
