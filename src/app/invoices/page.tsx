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

interface Invoice {
  id: number;
  start_order_number: number;
  end_order_number: number;
  status: string;
  total_supplier_cost: number;
  total_shipping_cost: number;
  grand_total: number;
  missing_order_numbers: string | null;
  order_commission_gbp: number;
  product_commission_gbp: number;
  multi_box_count?: number;
  created_at: string;
  confirmed_at: string | null;
}

const PAGE_SIZE = 100;

function statusBadge(status: string) {
  switch (status) {
    case "confirmed":
      return <Badge className="bg-green-600">Confirmed</Badge>;
    case "void":
      return <Badge variant="destructive">Void</Badge>;
    default:
      return <Badge variant="secondary">Draft</Badge>;
  }
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const res = await fetch(`/api/invoices?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setInvoices(data.data);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    setLoading(true);
    fetchInvoices();
  }, [fetchInvoices]);

  async function handleDelete(id: number) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast.success("Invoice deleted");
      setDeleteConfirm(null);
      await fetchInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <a href="/invoices/new">
          <Button>New Invoice</Button>
        </a>
      </div>

      {invoices.length === 0 ? (
        <p className="text-muted-foreground">
          No invoices yet. Create one to reconcile your orders.
        </p>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Order Range</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total Commission</TableHead>
                  <TableHead className="text-right">Total Commission xProduct</TableHead>
                  <TableHead className="text-right">Difference Commission</TableHead>
                  <TableHead className="text-right">Multi-Box Orders</TableHead>
                  <TableHead className="text-right">Grand Total</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const originalComm = inv.order_commission_gbp;
                  const commXProduct = inv.product_commission_gbp;
                  const diffComm = commXProduct - originalComm;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono">VIRS-{inv.id}</TableCell>
                      <TableCell className="font-mono">
                        #{inv.start_order_number} — #{inv.end_order_number}
                      </TableCell>
                      <TableCell>{statusBadge(inv.status)}</TableCell>
                      <TableCell className="text-right font-mono">
                        £{originalComm.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        £{commXProduct.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-600 font-bold">
                        £{diffComm.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {inv.multi_box_count ?? 0}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        £{inv.grand_total.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(() => {
                          const d = inv.created_at ? new Date(inv.created_at) : null;
                          return d && !isNaN(d.getTime()) ? format(d, "dd MMM yyyy") : "—";
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <a href={`/invoices/${inv.id}`}>
                            <Button variant="outline" size="sm">
                              View
                            </Button>
                          </a>
                          <a
                            href={`/api/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="outline" size="sm">
                              PDF
                            </Button>
                          </a>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteConfirm(inv.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Invoice?</DialogTitle>
            <DialogDescription>
              This will permanently delete this invoice and all its line
              items. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
