"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";

interface FailedOrder {
  id: number;
  shopify_order_id: string;
  order_number: number;
  error_reason: string | null;
  resolved_at: string | null;
  created_at: string;
}

export default function FailedOrdersPage() {
  const [failedOrders, setFailedOrders] = useState<FailedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    id: number;
    type: "retry" | "dismiss";
  } | null>(null);

  const fetchFailedOrders = useCallback(async () => {
    try {
      const url = showAll
        ? "/api/orders/failed?all=true"
        : "/api/orders/failed";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setFailedOrders(data);
    } catch {
      toast.error("Failed to load failed orders");
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    setLoading(true);
    fetchFailedOrders();
  }, [fetchFailedOrders]);

  async function handleRetry(id: number) {
    setActionId(id);
    setConfirmAction(null);
    try {
      const res = await fetch("/api/orders/failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.message);
      await fetchFailedOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setActionId(null);
    }
  }

  async function handleDismiss(id: number) {
    setActionId(id);
    setConfirmAction(null);
    try {
      const res = await fetch("/api/orders/failed", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to dismiss");
      toast.success("Failed order dismissed");
      await fetchFailedOrders();
    } catch {
      toast.error("Failed to dismiss order");
    } finally {
      setActionId(null);
    }
  }

  const unresolvedCount = failedOrders.filter((o) => !o.resolved_at).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Failed Orders</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Failed Orders</h1>
          {unresolvedCount > 0 && (
            <Badge variant="destructive">{unresolvedCount} unresolved</Badge>
          )}
        </div>
        <Button
          variant={showAll ? "default" : "outline"}
          size="sm"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show Unresolved Only" : "Show All"}
        </Button>
      </div>

      {failedOrders.length === 0 ? (
        <p className="text-muted-foreground">
          {showAll
            ? "No failed orders recorded."
            : "No unresolved failed orders."}
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Shopify ID</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono font-medium">
                    #{order.order_number}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {order.shopify_order_id}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-destructive">
                    {order.error_reason || "Unknown"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(order.created_at), "dd MMM yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    {order.resolved_at ? (
                      <Badge variant="secondary">Resolved</Badge>
                    ) : (
                      <Badge variant="destructive">Unresolved</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {!order.resolved_at && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actionId === order.id}
                          onClick={() =>
                            setConfirmAction({ id: order.id, type: "retry" })
                          }
                        >
                          Retry
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actionId === order.id}
                          onClick={() =>
                            setConfirmAction({ id: order.id, type: "dismiss" })
                          }
                        >
                          Dismiss
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Confirmation dialog */}
      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === "retry"
                ? "Retry Failed Order?"
                : "Dismiss Failed Order?"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "retry"
                ? "This will attempt to re-process the order. If successful, it will be marked as resolved."
                : "This will mark the failed order as resolved without re-processing it."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant={
                confirmAction?.type === "retry" ? "default" : "destructive"
              }
              onClick={() => {
                if (confirmAction?.type === "retry") {
                  handleRetry(confirmAction.id);
                } else if (confirmAction) {
                  handleDismiss(confirmAction.id);
                }
              }}
            >
              {confirmAction?.type === "retry" ? "Retry" : "Dismiss"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
