# VIRS Finance & Invoice Rules

This document outlines the core business logic used by VIRS to generate the **Verification Invoice** and calculate order costs. It serves as the single source of truth for how Shopify orders are mapped to the supplier's billing format.

---

## 1. Supplier Aliases (Product Mapping)
To match the supplier's invoice, Shopify product variants must be mapped to specific **Invoice Categories** (Supplier Aliases).
- **Unmapped Products:** Any product variant not explicitly mapped to a Supplier Alias will appear in the "Unmapped Items" section of the invoice and will **not** be calculated in the main invoice tables.
- **Grouped Products:** Multiple variants can be mapped to a single alias (e.g., all adapter variants mapped to "All Adapters").

---

## 2. Market (Country) Ordering
For each Supplier Alias, the invoice breaks down quantities by market (shipping destination). The markets are strictly ordered to match the supplier's visual layout.
- The default priority is: **UK, EU, US, AU**. *(Note: Some specific products like 360 Adapters or Bath Filters have slightly different hardcoded orderings to match the real invoice).*
- If an order ships to a country outside these four, it is grouped under **"Other"**.

---

## 3. The "Set" Calculation Logic
The supplier groups products into "Sets" based on the number of filters/cartridges included in a single shipped box. This logic is crucial for matching the unit price.

### A. Tap Filters (Stainless Steel & Plastic Filter)
1. **Baseline Included Filters:** Every single tap filter unit (Stainless Steel or Plastic) includes **2 free cartridges** in the box by default.
2. **Absorbing Paid Cartridges:** If a customer buys a Tap Filter AND additional PAID Cartridges in the *same order*, those extra cartridges are put into the *same boxes*.
   - If there is only 1 filter, all cartridges go into its box: `Set Size = 2 (baseline) + (Purchased Cartridge Quantity × Cartridge Multiplier)`
   - If there are multiple filters of the same type, the cartridges are **distributed evenly** across the boxes. Any remainders are added to the last box(es).
   - *Example 1:* 1 Stainless Steel Filter + 1 "6 Month Supply" (multiplier = 2) = **1x Set of 4**.
   - *Example 2:* 2 Stainless Steel Filters + 1 "6 Month Supply" (multiplier = 2) = **2x Set of 3** (1 extra cartridge each).
   - *Example 3:* 3 Stainless Steel Filters + 1 "1 Year Supply" (multiplier = 4) = **2x Set of 3, 1x Set of 4**.
3. **Mixed Tap Filters:** If an order contains *both* a Stainless Steel Filter and a Plastic Filter, they are shipped in **separate boxes**.
   - In this case, **no paid cartridges are absorbed**. The Stainless Steel filter gets a Set of 2, the Plastic Filter gets a Set of 2, and the paid cartridges remain separate.

### B. Cartridge Multipliers (`bundle_multiplier`)
In the VIRS Inventory, each Cartridge variant MUST have a `bundle_multiplier` set. This multiplier represents how many actual filters are in that variant.
- **3 Month Supply:** Multiplier = **1**
- **6 Month Supply:** Multiplier = **2**
- **1 Year Supply:** Multiplier = **4**
*Note: This multiplier does NOT multiply the price; it only tells the invoice generator how many physical filters to add to the "Set Size".*

### C. Standalone Cartridges
If a customer orders ONLY cartridges (no tap filters in the order):
- The cartridges are grouped under the "Plastic and Stainless Steel Cartridges" category.
- **Formula:** `Set Size = Purchased Cartridge Quantity × Cartridge Multiplier`
- *Example:* 2 units of "1 Year Supply" (multiplier = 4) = **1x Set of 8**.

---

## 4. Shipping Costs
Shipping is charged **per order**, not per product.
- **Multiple Products:** If an order contains multiple products, the shipping cost is only applied **once** to that order.
- **Pre-bought Items (e.g., Bottles):** Certain items are marked as "pre-bought" (stock already paid for). For these items, the invoice should ideally only calculate the shipping cost, not the product cost (unless they are bundled with standard items, in which case the standard item's shipping covers the box).

---

## 5. Excluded Orders & Lines
- **ShipBob Fulfilled Orders:** Any order fulfilled by ShipBob (indicated by fulfillment names containing "shipbob") is entirely excluded from the invoice, as it ships from existing local inventory rather than directly from the supplier.
- **Zero-Price / Cancelled Lines:** Line items with an effective price of £0 (such as cancelled cartridges added during ShipBob checkout checks or free promotional items) do **not** contribute to the invoice cartridge count. Only paid cartridge lines are absorbed into tap filter sets or counted individually.
- **Zero Value Orders:** Orders with a total price of 0.00 (100% discount or replacements) are automatically excluded from the invoice calculation entirely.

---

## Quick Reference Guide (Invoice Math)

Use this table to quickly verify if the "Set Size" on the invoice is correct based on a customer's order.

| Order Contents | Tap Filter Set Size | Cartridge Set Size | Invoice Breakdown |
| :--- | :--- | :--- | :--- |
| **1 Tap Filter only** | 2 | - | 1x Tap Filter (Set: 2) |
| **2 Tap Filters (Same type)** | 2 each | - | 2x Tap Filter (Set: 2) |
| **1 Stainless Steel + 1 Plastic** | SS: 2 <br> Plastic: 2 | - | 1x SS Filter (Set: 2)<br>1x Plastic Filter (Set: 2) |
| **1 Tap Filter + 3 Month supply** | 3 | - | 1x Tap Filter (Set: 3) |
| **1 Tap Filter + 6 Month supply** | 4 | - | 1x Tap Filter (Set: 4) |
| **1 Tap Filter + 1 Year supply** | 6 | - | 1x Tap Filter (Set: 6) |
| **2 Tap Filters + 6 Month supply** | 3 each | - | 2x Tap Filter (Set: 3) |
| **3 Tap Filters + 1 Year supply** | 3, 3, 4 | - | 2x Tap Filter (Set: 3)<br>1x Tap Filter (Set: 4) |
| **1 SS + 1 Plastic + 6 Month Supply** | SS: 2 <br> Plastic: 2 | 2 | 1x SS Filter (Set: 2)<br>1x Plastic Filter (Set: 2)<br>1x Cartridges (Set: 2) |
| **No Filter + 6 Month Supply** | - | 2 | 1x Cartridges (Set: 2) |
| **No Filter + 1 Year Supply** | - | 4 | 1x Cartridges (Set: 4) |
| **No Filter + 2x 1 Year Supply** | - | 8 | 1x Cartridges (Set: 8) |
