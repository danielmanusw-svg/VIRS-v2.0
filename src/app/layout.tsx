import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VIRS — Inventory Reconciliation",
  description: "Virtual Inventory Reconciliation System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="flex min-h-screen">
          <nav className="w-56 shrink-0 border-r bg-muted/40 p-4">
            <div className="mb-6 text-lg font-bold tracking-tight">VIRS</div>
            <ul className="space-y-1 text-sm">
              <li>
                <Link
                  href="/"
                  className="block rounded-md px-3 py-2 hover:bg-muted"
                >
                  Dashboard
                </Link>
              </li>
              <li>
                <Link
                  href="/inventory"
                  className="block rounded-md px-3 py-2 hover:bg-muted"
                >
                  Inventory
                </Link>
              </li>
              <li>
                <Link
                  href="/orders"
                  className="block rounded-md px-3 py-2 hover:bg-muted"
                >
                  Orders
                </Link>
              </li>
              <li>
                <Link
                  href="/orders/flagged"
                  className="block rounded-md px-3 py-2 pl-6 text-xs hover:bg-muted"
                >
                  Flagged Orders
                </Link>
              </li>
              <li>
                <Link
                  href="/orders/failed"
                  className="block rounded-md px-3 py-2 pl-6 text-xs hover:bg-muted"
                >
                  Failed Orders
                </Link>
              </li>
              <li>
                <Link
                  href="/sync-history"
                  className="block rounded-md px-3 py-2 hover:bg-muted"
                >
                  Sync History
                </Link>
              </li>
              <li>
                <Link
                  href="/invoices"
                  className="block rounded-md px-3 py-2 hover:bg-muted"
                >
                  Invoices
                </Link>
              </li>
              <li>
                <Link
                  href="/multi-box"
                  className="block rounded-md px-3 py-2 pl-6 text-xs hover:bg-muted"
                >
                  Multi-Box Orders
                </Link>
              </li>
              <li>
                <Link
                  href="/commission-orders"
                  className="block rounded-md px-3 py-2 pl-6 text-xs hover:bg-muted"
                >
                  Commission Orders
                </Link>
              </li>
              <li>
                <Link
                  href="/cost-sheet"
                  className="block rounded-md px-3 py-2 hover:bg-muted"
                >
                  Cost Sheet
                </Link>
              </li>
              <li>
                <Link
                  href="/settings"
                  className="block rounded-md px-3 py-2 hover:bg-muted"
                >
                  Settings
                </Link>
              </li>
              <li>
                <Link
                  href="/settings/supplier-aliases"
                  className="block rounded-md px-3 py-2 pl-6 text-xs hover:bg-muted"
                >
                  Supplier Aliases
                </Link>
              </li>
            </ul>
          </nav>
          <main className="flex-1 p-6">{children}</main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
