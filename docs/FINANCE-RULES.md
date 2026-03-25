# VIRS Finance & Invoice Rules - Final Canonical Version

This document is the absolute **single source of truth** for how the VIRS backend parses Shopify Orders, groups products, counts commission, and calculates the final Multi-Box Invoice. 

If any older documents contradict this one, **this document takes precedence**.

---

## 1. Zero-Price £0.00 Cartridge Exclusion (The Golden Rule)
Any `Cartridge` line item that carries a price of exactly **£0.00** (e.g., from shipping/promotional replacements or test carts) is **completely ignored** by the system.
* It does NOT count towards Tap Filter Sets.
* It does NOT trigger a box or count towards Multi-Box rules.
* It does NOT count as a "Commissionable Product".

---

## 2. Supplier Labels and Aggregation
To match the supplier's literal PDF invoice, Shopify line items are aggregated and grouped into one of 13 primary "**Supplier Labels**":
1. Stainless Steel
2. 360° Adapters
3. Shower Filter
4. Plastic Filter
5. Plastic Screen
6. All Adapters
7. Shower Filter Cartridge
8. Plastic and Stainless Steel Cartridges
9. Bath Filter
10. Small Bottle
11. 650ml Bottle
12. 1L Bottle
13. Black New Plastic Stock

**Market Ordering:** Items under a label are further separated by the Market (Country) they shipped to. The standard display order is: `UK`, `EU`, `US`, `AU`.

---

## 3. The "Set Size" Logic (Tap Filters & Cartridges)
The supplier bills tap filters and cartridges in bundled "Sets."
* **Tap Filter Baseline:** Every single Stainless Steel or Plastic tap filter physically includes **2 free cartridges**.
* **Cartridge Multipliers:** Cartridges are sold in supply packs. A "3 Month Supply" is 1 cartridge. A "6 Month Supply" is 2 cartridges. A "1 Year Supply" is 4 cartridges.

**How Sets are Calculated:**
1. **Absorbing Paid Cartridges:** If a customer buys a Tap Filter AND extra *paid* Cartridges in the same order, the extra cartridges do NOT get their own box. They are packed *inside* the Tap Filter's box.
   * *Example:* 1 Tap Filter + 1 "1-Year Supply" (4 cartridges) = **"Set of 6"** (2 baseline + 4 extra).
2. **Multiple Tap Filters:** If an order has 2 Tap Filters and extra cartridges, the extra cartridges are distributed evenly across the filters.
   * *Example:* 2 Tap Filters + 3 extra cartridges. Tap A gets 1 extra. Tap B gets 2 extra. Result: One **Set of 4** and one **Set of 3**.
3. **Cartridges Only:** If an order has NO tap filters but buys cartridges, they are added up visually under the `Plastic and Stainless Steel Cartridges` label.
   * *Example:* No Tap Filter + 1 "1-Year Supply" (4 cartridges) = **"Set of 4"**.

---

## 4. Where Pricing Comes From
Pricing is strictly deterministic and looks exactly at the mapped **`FINAL Price Sheet FP fix.csv`**.

**The lookup key is:** `[Supplier Label] + [Market Code] + [Set Size (if applicable)]`.
If an exact match is found, the **Goods Cost** and **Shipping Cost** are pulled directly from the CSV into the Verification table. If a match is missing, the UI explicitly flags it as `<Missing>`.

---

## 5. Orders & Commission
There are two distinct Commission calculations shown on the invoice.

### A. Commission (Per Order)
* **Rule:** A flat fee charged linearly per *distinct* Shopify order.
* **Calculation:** `Total Unique Order Numbers × £0.80`.

### B. Commission (xProduct)
* **Rule:** A fee charged based on the number of physical "commissionable products" shipped.
* **No Set Aggregation:** Unlike Multi-Box logic, xProduct commission DOES NOT group products into sets. Every individual product purchased counts on its own.
* **Zero-Price Logic:** £0.00 items do NOT exist for this calculation and are ignored.
* **Calculation:** `Commissionable Quantity × £0.80`.

> ⚠️ **xProduct is NOT the same as Multi-Box logic.** Multi-Box only asks "how many physical shipping *boxes*?" — adapters tuck in for free and don't add a box, and extra cartridges are absorbed into the Tap Filter's box. xProduct asks "how many commissionable *products*?" — every distinct product counts individually regardless of how boxes are packed.

**Examples:**
* **1 Plastic Filter + 4 paid cartridges** → **2 products** (1 tap filter + 1 cartridge pack).
* **1 Plastic Filter + 1 × 360° Adapter** → **2 products** (1 tap filter + 1 adapter).
* **1 Shower Filter** → **1 product**.

---

## 6. Multi-Box Orders
This table specifically highlights orders that require the warehouse to manually pack more than one physical shipping box.

**The Box Logic:**
1. **Large Products = 1 Box:** Shower Filters, Bath Filters, Bottles, and Plastic Screens each occupy 1 box.
2. **Sets = 1 Box:** A Tap Filter + all of its absorbed purchased cartridges equals exactly 1 box.
3. **The Adapter Tuck-in:** Small items (`360° Adapters` and `All Adapters`) are so small they "tuck into" any Large Product or Set box for free.
   * *Example:* 1 Shower Filter + 5 Adapters = **1 Box**. 
4. **Standalone Small Items:** If an order consists *only* of Adapters, they all combine into exactly **1 Box**.
5. **Display:** The UI only displays orders where the total calculated `box_count` is 2 or higher.

---

## 7. Draft vs. Confirmed Invoices
* **Draft Invoices:** When an invoice is in the `draft` state, opening it will dynamically pull the **newest** schema, calculations, and rules.
* **Confirming:** Clicking "Confirm" saves a `snapshot` stringified JSON layout to the database. This explicitly freezes the visual UI formatting, exact quantities, and mapped prices forever. 
* **Viewing:** Opening a confirmed invoice reads directly from that frozen snapshot to guarantee historical accuracy.
