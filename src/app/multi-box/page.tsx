"use client";

import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MultiBoxOrderWithInvoice {
  order_number: number;
  market_code: string;
  box_count: number;
  boxes: { label: string; quantity: number }[];
  invoice_id: number;
  invoice_range: string;
}

export default function MasterMultiBoxPage() {
  const [orders, setOrders] = useState<MultiBoxOrderWithInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/multi-box");
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        setOrders(json.orders);
        setTotal(json.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-amber-900">Master Multi-Box Orders</h1>
        <p className="text-muted-foreground">Loading all multi-box orders...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-amber-900">Master Multi-Box Orders</h1>
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-amber-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-amber-900">
            Master Multi-Box Orders
          </h1>
          <p className="text-sm text-amber-700/80 mt-1">
            All orders requiring multiple boxes across all invoices. Every order is
            expanded to show box contents.
          </p>
        </div>
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-100 text-amber-800 text-lg px-4 py-1"
        >
          {total} orders
        </Badge>
      </div>

      {/* Table — all expanded, print-friendly */}
      <Table>
        <TableHeader>
          <TableRow className="bg-amber-50 border-amber-200">
            <TableHead className="text-amber-900 font-bold">Order #</TableHead>
            <TableHead className="text-amber-900 font-bold">Market</TableHead>
            <TableHead className="text-amber-900 font-bold text-right">
              Boxes
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((mb) => (
            <React.Fragment key={mb.order_number}>
              {/* Order header row */}
              <TableRow className="border-t-2 border-amber-200">
                <TableCell className="font-mono font-bold text-amber-950 text-base">
                  #{mb.order_number}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="border-amber-200 text-amber-800 bg-white"
                  >
                    {mb.market_code}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono font-bold text-amber-700 text-base">
                  {mb.box_count} Boxes
                </TableCell>
              </TableRow>
              {/* Box detail rows — always visible */}
              {mb.boxes.map((box, idx) => (
                <TableRow
                  key={`${mb.order_number}_${idx}`}
                  className="bg-amber-50/30 border-none"
                >
                  <TableCell />
                  <TableCell
                    colSpan={1}
                    className="text-sm text-amber-900/80 italic"
                  >
                    {box.label}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-amber-900/70">
                    x{box.quantity}
                  </TableCell>
                </TableRow>
              ))}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>

      {/* Footer */}
      <div className="flex justify-between items-center border-t-2 border-amber-200 pt-4 text-sm text-amber-800">
        <span>Total multi-box orders: <strong>{total}</strong></span>
        <span className="text-xs text-amber-600">
          Generated from all non-void invoices
        </span>
      </div>
    </div>
  );
}
