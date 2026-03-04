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
import { format } from "date-fns";
interface Order {
  id: number;
  shopify_order_id: string;
  order_number: number;
  market_id: number | null;
  shipping_country_code: string | null;
  is_flagged: boolean;
  shipping_cost_override: number | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  shopify_created_at: string;
  market_code: string | null;
}

const PAGE_SIZE = 100;

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (showFlaggedOnly) params.set("flagged", "true");
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);

      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setOrders(data.data);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [showFlaggedOnly, page, dateFrom, dateTo]);

  useEffect(() => {
    setLoading(true);
    fetchOrders();
  }, [fetchOrders]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/orders", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.message);
      await fetchOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function marketBadge(order: Order) {
    if (order.is_flagged) {
      return (
        <Badge variant="destructive">
          Flagged ({order.shipping_country_code})
        </Badge>
      );
    }
    if (order.market_code) {
      return <Badge variant="secondary">{order.market_code}</Badge>;
    }
    return <Badge variant="outline">Unknown</Badge>;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="flex items-center gap-2">
          <Button
            variant={showFlaggedOnly ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setShowFlaggedOnly(!showFlaggedOnly);
              setPage(0);
            }}
          >
            {showFlaggedOnly ? "Show All" : "Show Flagged Only"}
          </Button>
          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync Now"}
          </Button>
        </div>
      </div>

      {/* Date filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">From:</span>
          <Input
            type="date"
            className="h-8 w-40"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">To:</span>
          <Input
            type="date"
            className="h-8 w-40"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(0);
            }}
          />
        </div>
        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setPage(0);
            }}
          >
            Clear
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {total} order{total !== 1 ? "s" : ""}
        </span>
      </div>

      {orders.length === 0 ? (
        <p className="text-muted-foreground">
          {showFlaggedOnly
            ? "No flagged orders."
            : 'No orders yet. Click "Sync Now" to fetch from Shopify.'}
        </p>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Fulfillment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono font-medium">
                      #{order.order_number}
                    </TableCell>
                    <TableCell>
                      {format(
                        new Date(order.shopify_created_at),
                        "dd MMM yyyy HH:mm"
                      )}
                    </TableCell>
                    <TableCell>{marketBadge(order)}</TableCell>
                    <TableCell className="font-mono">
                      {order.shipping_country_code || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {order.financial_status || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {order.fulfillment_status || "unfulfilled"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

    </div>
  );
}
