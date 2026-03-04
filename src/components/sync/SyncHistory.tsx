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

interface SyncRecord {
  id: number;
  sync_type: string;
  status: string;
  records_processed: number;
  records_created: number;
  records_updated: number;
  error_detail: string | null;
  started_at: string;
  completed_at: string | null;
}

export function SyncHistory() {
  const [history, setHistory] = useState<SyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data.sync_history ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  async function handleDelete(id: number) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/sync-history/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Sync history entry deleted");
      setDeleteConfirm(null);
      await fetchHistory();
    } catch {
      toast.error("Failed to delete sync history entry");
    } finally {
      setDeleting(false);
    }
  }

  function toggleError(id: number) {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading sync history...</p>
    );
  }

  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No sync history yet.</p>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Processed</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Error</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((record) => {
              const isExpanded = expandedErrors.has(record.id);
              const hasError = !!record.error_detail;

              return (
                <TableRow key={record.id}>
                  <TableCell>
                    <Badge variant="outline">{record.sync_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        record.status === "success"
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {record.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{record.records_processed}</TableCell>
                  <TableCell>{record.records_created}</TableCell>
                  <TableCell>{record.records_updated}</TableCell>
                  <TableCell className="text-sm">
                    {format(
                      new Date(record.started_at),
                      "dd MMM yyyy HH:mm:ss"
                    )}
                  </TableCell>
                  <TableCell className="max-w-md text-xs text-destructive">
                    {hasError ? (
                      <div>
                        {isExpanded ? (
                          <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                            {record.error_detail}
                          </pre>
                        ) : (
                          <span className="truncate block max-w-xs">
                            {record.error_detail!.length > 80
                              ? record.error_detail!.slice(0, 80) + "..."
                              : record.error_detail}
                          </span>
                        )}
                        <button
                          className="mt-1 text-xs text-blue-600 hover:underline"
                          onClick={() => toggleError(record.id)}
                        >
                          {isExpanded ? "Collapse" : "Expand"}
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => setDeleteConfirm(record.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation */}
      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sync History Entry?</DialogTitle>
            <DialogDescription>
              This will permanently remove this sync history record.
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
    </>
  );
}
