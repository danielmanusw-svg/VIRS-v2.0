# Finance Update 1: Invoice Verification — Structured Internal View

## Objective
Present internal invoice data in a structured, supplier-comparable format so the user can visually verify against the supplier's PDF invoice (e.g., 2701.pdf) and detect overcharges.

### Suspected Overcharge Vectors
1. **Shipping bundled per item, not per order** — supplier appears to charge shipping per product line, but multi-item orders should have one shipping cost.
2. **Commission per product instead of per order** — should be GBP 0.80 per order, but appears to be added per product into unit price.
3. **Market misattribution** — supplier could assign orders to higher-shipping markets (e.g., US instead of UK) to increase shipping revenue.
4. **Quantity inflation** — supplier could add extra products to the invoice.

## Key Decisions
1. V1 presents internal data only — no supplier-side parsing or automated comparison.
2. Supplier invoices arrive as PDFs; text parsing and automated comparison are deferred to V2.
3. Mapping strategy: master-product-first grouping with per-market breakdowns.
4. Supplier label aliasing: DB table + management UI (prep for V2 automation).
5. Commission in V1: invoice-level total only (`distinct_order_count * GBP 0.80`).
6. The structured verification view replaces the current PDF preview step in the invoice creation wizard.
7. Confirmation behavior: allow confirm with visible data, no pass/fail gating in V1.

## Source of Truth Clarification
1. Shopify data is used for order and line-item structure.
2. Supplier cost is not taken from Shopify. It comes from VIRS-managed variant costs, snapshotted into order line items.
3. Shipping follows existing VIRS invoice calculation logic and override rules.

## V1 Scope

### 1. Schema Changes
1. Add columns to `invoices` table:
   - `distinct_order_count` (integer, nullable)
   - `total_commission_gbp` (real, nullable)
2. Add new `supplierAliases` table:
   - `id` (int, PK)
   - `supplier_label` (text) — the name the supplier uses
   - `master_product_id` (int, FK → masterProducts, nullable)
   - `variant_id` (int, FK → productVariants, nullable)
   - `created_at` (timestamp)
   - Constraint: exactly one of `master_product_id` or `variant_id` should be set.

### 2. Calculator Extension
1. Extend `calculateInvoice()` in `src/lib/invoice/calculator.ts` to return:
   - `distinct_order_count`: count of unique order numbers across line items.
   - `total_commission_gbp`: `distinct_order_count * 0.80`.
2. Add master-product aggregation (new file `src/lib/invoice/aggregator.ts` or within calculator):
   - Group invoice line items by `master_product_id` (fall back to `variant_id` for unlinked variants).
   - Within each group, break down by market (EU, UK, US, AU).
   - Output per group: product name, SKU(s), quantity per market, supplier cost, shipping cost, line total.

### 3. Supplier Alias Management
1. CRUD API at `/api/supplier-aliases` (GET, POST, PATCH, DELETE).
2. Management UI at `/settings/supplier-aliases` or within existing settings:
   - View all aliases.
   - Add new alias (text field for supplier label, dropdown for master product or variant).
   - Edit/delete existing aliases.
3. This is prep for V2 when supplier data can be parsed — aliases will map parsed supplier labels to internal products.

### 4. Internal Verification Checks
1. Create `src/lib/invoice/verification.ts` with internal consistency checks:
   - **Order completeness** — missing order numbers in range (already computed).
   - **Quantity summary** — total products across all orders.
   - **Market distribution** — breakdown of orders and quantities per market.
   - **Commission calculation** — `distinct_order_count * GBP 0.80`.
   - **Shipping analysis** — flag orders with multiple line items that have different per-variant shipping costs; show what correct shipping should be (one charge per order, not per item).
2. Output: `VerificationReport` with named data sections (not pass/fail, since there is no supplier-side data to compare against yet).

### 5. Structured Verification View (Replaces PDF Preview)
1. Replace Step 3 (PDF preview) in `src/app/invoices/new/page.tsx` with structured view.
2. Layout sections:
   - **Invoice Summary** — order range, distinct order count, total products, commission.
   - **Product Breakdown** (grouped by master product) — table with product name, SKU(s), quantity per market (EU | UK | US | AU columns), total quantity, supplier cost, shipping cost, line total.
   - **Shipping Analysis** — highlight multi-item orders, show shipping per order vs per item.
   - **Market Distribution** — orders per market, quantities per market.
   - **Commission** — `N orders x GBP 0.80 = GBP X.XX`.
3. Keep confirm/discard buttons at the bottom.
4. Existing PDF generation remains available via invoice detail page.

### 6. Invoice Detail Page Update
1. Add the same structured view sections to `src/app/invoices/[id]/page.tsx`.
2. Show `distinct_order_count` and `total_commission_gbp` in the summary section.

### 7. API Updates
1. Update `POST /api/invoices` to compute and store `distinct_order_count` and `total_commission_gbp`.
2. Return aggregated product groups and verification data in the response.

## Proposed Data and Interface Additions (V1)
1. Extend invoice calculation output:
   - `distinct_order_count`
   - `total_commission_gbp`
2. Add verification report contract:
   - `VerificationReport` (internal consistency data sections)
3. Add `supplierAliases` table and CRUD API.
4. Add `distinct_order_count` and `total_commission_gbp` columns to `invoices` table.

## Files to Modify/Create

| File | Action |
|---|---|
| `src/db/schema.ts` | Add columns to `invoices`, add `supplierAliases` table |
| `src/lib/invoice/calculator.ts` | Add `distinct_order_count`, `total_commission_gbp` |
| `src/lib/invoice/aggregator.ts` | **New** — master-product grouping + market breakdown |
| `src/lib/invoice/verification.ts` | **New** — internal consistency checks |
| `src/app/invoices/new/page.tsx` | Replace PDF preview with structured view |
| `src/app/invoices/[id]/page.tsx` | Add structured view sections |
| `src/app/api/invoices/route.ts` | Persist new fields, return aggregated data |
| `src/app/api/supplier-aliases/route.ts` | **New** — CRUD for aliases |
| `src/app/settings/supplier-aliases/page.tsx` | **New** — alias management UI |

## Existing Code to Reuse
- `calculateInvoice()` in `src/lib/invoice/calculator.ts` — extend, don't replace.
- `masterProducts` table and `productVariants.master_product_id` — for grouping logic.
- `buildMarketLookup()` in `src/lib/markets.ts` — market code resolution.
- `missing_order_numbers` computation in calculator — already handles order completeness.
- Shadcn UI components (Table, Card, Badge) — for the structured view.

## Implementation Sequence
1. Schema migration: add columns to `invoices`, create `supplierAliases` table.
2. Extend calculator: `distinct_order_count` + `total_commission_gbp`.
3. Build aggregator: master-product grouping with per-market breakdowns.
4. Build verification checks: shipping analysis, market distribution, commission.
5. Supplier alias CRUD API + management UI.
6. Replace PDF preview with structured verification view in invoice creation wizard.
7. Update invoice detail page with structured view sections.
8. Update invoice API to persist and return new data.

## Acceptance Criteria
1. Structured view groups products by master product with per-market quantity columns.
2. Distinct order count and commission total are computed and displayed.
3. Shipping analysis highlights multi-item orders and per-order vs per-item discrepancies.
4. Market distribution is visible for spotting misattribution.
5. Total quantity is clearly shown for spotting inflation.
6. User can confirm invoices from the structured view.
7. Confirmed invoices show the structured view on the detail page.
8. Supplier aliases can be created, edited, and deleted via the UI.

## V1 Non-Goals
1. Parsing supplier PDF or text input.
2. Automated comparison against supplier data.
3. Pass/fail verification gating.
4. Pixel-perfect duplication of supplier invoice layout.
5. Full supplier total monetary reconciliation across currencies.
6. Line-level commission allocation.

## V2 Upgrades (Explicitly Deferred)
1. PDF upload extraction and OCR/AI-assisted parsing of supplier invoices.
2. Automated comparison: parsed supplier data vs internal data.
3. Pass/warn/fail verification status per check with overall status.
4. Supplier label auto-matching using `supplierAliases` table.
5. Near-pixel or exact template fidelity for supplier invoice layout.
6. Stronger currency-aware monetary reconciliation.
7. Text paste input as an alternative to PDF parsing.
