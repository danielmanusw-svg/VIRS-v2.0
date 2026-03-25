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

interface CommissionOrderItem {
  title: string;
  quantity: number;
}

interface CommissionOrderRow {
  order_number: number;
  market_code: string;
  product_count: number;
  overcharge: number;
  items: CommissionOrderItem[];
  invoice_id: number;
  invoice_range: string;
  rate: number;
}

function usd(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function MasterCommissionOrdersPage() {
  const [orders, setOrders] = useState<CommissionOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/commission-orders");
        if (!res.ok) {
          throw new Error("Failed to fetch");
        }

        const json = await res.json();
        setOrders(json.orders);
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
        <h1 className="text-2xl font-bold text-red-900">
          Master Commission Orders
        </h1>
        <p className="text-muted-foreground">
          Loading all overcharged commission orders...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-red-900">
          Master Commission Orders
        </h1>
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      <div className="flex items-center justify-between border-b border-red-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-red-900">
            Master Commission Orders
          </h1>
          <p className="mt-1 text-sm text-red-700/80">
            All overcharged commission orders across invoices, expanded to show
            the exact counted items.
          </p>
        </div>
        <div />
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-red-50 border-red-200">
            <TableHead className="font-bold text-red-900">Invoice</TableHead>
            <TableHead className="font-bold text-red-900">Order #</TableHead>
            <TableHead className="font-bold text-red-900">Market</TableHead>
            <TableHead className="text-right font-bold text-red-900">
              Products
            </TableHead>
            <TableHead className="text-right font-bold text-red-900">
              Rate
            </TableHead>
            <TableHead className="text-right font-bold text-red-900">
              Overcharge
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <React.Fragment key={`${order.invoice_id}_${order.order_number}`}>
              <TableRow className="border-t-2 border-red-200">
                <TableCell className="font-mono text-sm text-red-900">
                  VIRS-{order.invoice_id}
                  <div className="text-xs text-red-700/70">
                    {order.invoice_range}
                  </div>
                </TableCell>
                <TableCell className="font-mono font-bold text-red-950 text-base">
                  #{order.order_number}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="border-red-200 bg-white text-red-800"
                  >
                    {order.market_code}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono font-bold text-red-700 text-base">
                  {order.product_count}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-red-900/80">
                  {usd(order.rate)}
                </TableCell>
                <TableCell className="text-right font-mono font-bold text-red-700 text-base">
                  {usd(order.overcharge)}
                </TableCell>
              </TableRow>
              {order.items.map((item, idx) => (
                <TableRow
                  key={`${order.invoice_id}_${order.order_number}_${idx}`}
                  className="bg-red-50/30 border-none"
                >
                  <TableCell />
                  <TableCell />
                  <TableCell
                    colSpan={3}
                    className="text-sm text-red-900/80 italic"
                  >
                    {item.title}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-red-900/70">
                    x{item.quantity}
                  </TableCell>
                </TableRow>
              ))}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>

      <div className="border-t-2 border-red-200 pt-4" />
    </div>
  );
}
