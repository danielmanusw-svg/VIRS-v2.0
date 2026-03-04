import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
                <a
                  href="/"
                  className="block rounded-md px-3 py-2 hover:bg-muted"
                >
                  Dashboard
                </a>
              </li>
              <li>
                <a
                  href="/inventory"
                  className="block rounded-md px-3 py-2 hover:bg-muted"
                >
                  Inventory
                </a>
              </li>
              <li>
                <a
                  href="/orders"
                  className="block rounded-md px-3 py-2 hover:bg-muted"
                >
                  Orders
                </a>
              </li>
              <li>
                <a
                  href="/orders/flagged"
                  className="block rounded-md px-3 py-2 pl-6 text-xs hover:bg-muted"
                >
                  Flagged Orders
                </a>
              </li>
              <li>
                <a
                  href="/orders/failed"
                  className="block rounded-md px-3 py-2 pl-6 text-xs hover:bg-muted"
                >
                  Failed Orders
                </a>
              </li>
              <li>
                <a
                  href="/sync-history"
                  className="block rounded-md px-3 py-2 hover:bg-muted"
                >
                  Sync History
                </a>
              </li>
              <li>
                <a
                  href="/invoices"
                  className="block rounded-md px-3 py-2 hover:bg-muted"
                >
                  Invoices
                </a>
              </li>
              <li>
                <a
                  href="/settings"
                  className="block rounded-md px-3 py-2 hover:bg-muted"
                >
                  Settings
                </a>
              </li>
              <li>
                <a
                  href="/settings/supplier-aliases"
                  className="block rounded-md px-3 py-2 pl-6 text-xs hover:bg-muted"
                >
                  Supplier Aliases
                </a>
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
