import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { InvoiceLineResult } from "./calculator";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
  },
  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#555",
  },
  detailsBlock: {
    alignItems: "flex-end" as const,
  },
  detailRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 2,
  },
  detailLabel: {
    fontFamily: "Helvetica-Bold",
    width: 100,
    textAlign: "right" as const,
  },
  detailValue: {
    width: 120,
  },
  // Warning box
  warningBox: {
    backgroundColor: "#FEF3C7",
    border: "1 solid #F59E0B",
    borderRadius: 3,
    padding: 8,
    marginBottom: 12,
  },
  warningTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#92400E",
    marginBottom: 4,
  },
  warningText: {
    fontSize: 8,
    color: "#92400E",
  },
  // Table
  table: {
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    borderBottom: "1 solid #9CA3AF",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5 solid #D1D5DB",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottom: "0.5 solid #D1D5DB",
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: "#F9FAFB",
  },
  // Column widths
  colNo: { width: 28 },
  colProduct: { width: 140 },
  colSKU: { width: 60 },
  colMarket: { width: 40 },
  colQty: { width: 35, textAlign: "right" as const },
  colSupplier: { width: 65, textAlign: "right" as const },
  colShipping: { width: 65, textAlign: "right" as const },
  colTotal: { width: 70, textAlign: "right" as const },
  // Summary section
  summarySection: {
    marginTop: 16,
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  summaryRowBorder: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderBottom: "0.5 solid #D1D5DB",
  },
  // Totals
  totalsBlock: {
    marginTop: 12,
    alignItems: "flex-end" as const,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 3,
    width: 250,
  },
  totalsLabel: {
    width: 130,
    textAlign: "right" as const,
    paddingRight: 10,
  },
  totalsValue: {
    width: 80,
    textAlign: "right" as const,
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 5,
    width: 250,
    borderTop: "1.5 solid #111",
    marginTop: 2,
  },
  grandTotalLabel: {
    width: 130,
    textAlign: "right" as const,
    paddingRight: 10,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  grandTotalValue: {
    width: 80,
    textAlign: "right" as const,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  // Footer
  footer: {
    marginTop: 20,
    fontSize: 7,
    color: "#6B7280",
    textAlign: "center" as const,
  },
  orderRange: {
    fontSize: 8,
    color: "#374151",
    marginTop: 6,
    textAlign: "center" as const,
  },
});

function fmt(n: number): string {
  return n.toFixed(2);
}

interface InvoicePDFProps {
  invoiceId: number;
  startOrderNumber: number;
  endOrderNumber: number;
  lines: InvoiceLineResult[];
  totalSupplierCost: number;
  totalShippingCost: number;
  grandTotal: number;
  missingOrderNumbers: number[];
  createdAt: string;
}

export function InvoicePDF({
  invoiceId,
  startOrderNumber,
  endOrderNumber,
  lines,
  totalSupplierCost,
  totalShippingCost,
  grandTotal,
  missingOrderNumbers,
  createdAt,
}: InvoicePDFProps) {
  // Build per-market summary
  const marketSummary = new Map<
    string,
    { qty: number; supplier: number; shipping: number; total: number }
  >();
  for (const line of lines) {
    const mkt = line.market_code || "Unknown";
    const existing = marketSummary.get(mkt) || {
      qty: 0,
      supplier: 0,
      shipping: 0,
      total: 0,
    };
    existing.qty += line.quantity;
    existing.supplier += line.supplier_cost;
    existing.shipping += line.shipping_cost;
    existing.total += line.line_total;
    marketSummary.set(mkt, existing);
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>INVOICE RECONCILIATION</Text>
            <Text style={styles.subtitle}>
              Orders #{startOrderNumber} — #{endOrderNumber}
            </Text>
          </View>
          <View style={styles.detailsBlock}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Invoice No.:</Text>
              <Text style={styles.detailValue}>VIRS-{invoiceId}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Date:</Text>
              <Text style={styles.detailValue}>
                {new Date(createdAt).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Order Range:</Text>
              <Text style={styles.detailValue}>
                {startOrderNumber}–{endOrderNumber}
              </Text>
            </View>
          </View>
        </View>

        {/* Missing order warnings */}
        {missingOrderNumbers.length > 0 && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>
              Missing Orders ({missingOrderNumbers.length})
            </Text>
            <Text style={styles.warningText}>
              The following order numbers were not found in the database:{" "}
              {missingOrderNumbers.join(", ")}
            </Text>
          </View>
        )}

        {/* Per-market summary */}
        <View style={styles.summarySection}>
          <Text style={styles.summaryTitle}>Summary by Market</Text>
          <View style={styles.tableHeader}>
            <Text style={{ width: 60 }}>Market</Text>
            <Text style={{ width: 50, textAlign: "right" as const }}>Qty</Text>
            <Text style={{ width: 90, textAlign: "right" as const }}>
              Supplier Cost
            </Text>
            <Text style={{ width: 90, textAlign: "right" as const }}>
              Shipping
            </Text>
            <Text style={{ width: 90, textAlign: "right" as const }}>
              Total
            </Text>
          </View>
          {Array.from(marketSummary.entries()).map(([mkt, data]) => (
            <View key={mkt} style={styles.summaryRowBorder}>
              <Text style={{ width: 60 }}>{mkt}</Text>
              <Text style={{ width: 50, textAlign: "right" as const }}>
                {data.qty}
              </Text>
              <Text style={{ width: 90, textAlign: "right" as const }}>
                £{fmt(data.supplier)}
              </Text>
              <Text style={{ width: 90, textAlign: "right" as const }}>
                £{fmt(data.shipping)}
              </Text>
              <Text style={{ width: 90, textAlign: "right" as const }}>
                £{fmt(data.total)}
              </Text>
            </View>
          ))}
        </View>

        {/* Detail table */}
        <Text style={styles.summaryTitle}>Line Item Detail</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colNo}>#</Text>
            <Text style={styles.colProduct}>Product</Text>
            <Text style={styles.colSKU}>SKU</Text>
            <Text style={styles.colMarket}>Market</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colSupplier}>Supplier</Text>
            <Text style={styles.colShipping}>Shipping</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {lines.map((line, idx) => (
            <View
              key={`${line.order_id}-${line.variant_id}-${idx}`}
              style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
            >
              <Text style={styles.colNo}>{line.order_number}</Text>
              <Text style={styles.colProduct}>{line.title}</Text>
              <Text style={styles.colSKU}>{line.sku || "—"}</Text>
              <Text style={styles.colMarket}>{line.market_code || "—"}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colSupplier}>£{fmt(line.supplier_cost)}</Text>
              <Text style={styles.colShipping}>
                £{fmt(line.shipping_cost)}
              </Text>
              <Text style={styles.colTotal}>£{fmt(line.line_total)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Supplier Cost:</Text>
            <Text style={styles.totalsValue}>£{fmt(totalSupplierCost)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Shipping Cost:</Text>
            <Text style={styles.totalsValue}>£{fmt(totalShippingCost)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Grand Total:</Text>
            <Text style={styles.grandTotalValue}>£{fmt(grandTotal)}</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.orderRange}>
          Order range: #{startOrderNumber} — #{endOrderNumber}
        </Text>
        <Text style={styles.footer}>
          Generated by VIRS (Virtual Inventory Reconciliation System)
        </Text>
      </Page>
    </Document>
  );
}
