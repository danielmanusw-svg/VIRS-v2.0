import { db } from "@/db";
import {
  products,
  productVariants,
  stock,
  stockAdjustmentLog,
  syncHistory,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  fetchAllShopifyProducts,
  type ShopifyProduct,
} from "@/lib/shopify/products";

export async function syncProducts() {
  const startedAt = new Date().toISOString();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  try {
    const shopifyProducts = await fetchAllShopifyProducts();
    recordsProcessed = shopifyProducts.length;

    for (const sp of shopifyProducts) {
      const result = await upsertProduct(sp);
      recordsCreated += result.created;
      recordsUpdated += result.updated;
    }

    await db.insert(syncHistory).values({
      sync_type: "products",
      status: "success",
      records_processed: recordsProcessed,
      records_created: recordsCreated,
      records_updated: recordsUpdated,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });

    return {
      success: true,
      records_processed: recordsProcessed,
      records_created: recordsCreated,
      records_updated: recordsUpdated,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error during sync";

    await db.insert(syncHistory).values({
      sync_type: "products",
      status: "error",
      records_processed: recordsProcessed,
      records_created: recordsCreated,
      records_updated: recordsUpdated,
      error_detail: message,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });

    throw error;
  }
}

async function upsertProduct(sp: ShopifyProduct) {
  let created = 0;
  let updated = 0;
  const shopifyId = String(sp.id);

  // Upsert the product
  const existing = await db
    .select()
    .from(products)
    .where(eq(products.shopify_product_id, shopifyId))
    .limit(1);

  let productId: number;

  if (existing.length === 0) {
    const [inserted] = await db
      .insert(products)
      .values({
        shopify_product_id: shopifyId,
        title: sp.title,
        vendor: sp.vendor,
        image_url: sp.image?.src ?? null,
      })
      .returning({ id: products.id });
    productId = inserted.id;
    created++;
  } else {
    productId = existing[0].id;
    await db
      .update(products)
      .set({
        title: sp.title,
        vendor: sp.vendor,
        image_url: sp.image?.src ?? null,
        updated_at: new Date().toISOString(),
      })
      .where(eq(products.id, productId));
    updated++;
  }

  // Upsert variants
  for (const sv of sp.variants) {
    const variantShopifyId = String(sv.id);

    const existingVariant = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.shopify_variant_id, variantShopifyId))
      .limit(1);

    if (existingVariant.length === 0) {
      // New variant — insert it
      const [insertedVariant] = await db
        .insert(productVariants)
        .values({
          product_id: productId,
          shopify_variant_id: variantShopifyId,
          title: sv.title,
          sku: sv.sku,
        })
        .returning({ id: productVariants.id });

      // Init stock from Shopify quantity (only on first import)
      const qty = Math.max(0, sv.inventory_quantity ?? 0);
      await db.insert(stock).values({
        variant_id: insertedVariant.id,
        quantity: qty,
      });

      // Log the initial import
      await db.insert(stockAdjustmentLog).values({
        variant_id: insertedVariant.id,
        adjustment_type: "initial_import",
        quantity_before: 0,
        quantity_after: qty,
        reason: "Initial stock from Shopify product import",
      });

      // Mark as initialized
      await db
        .update(productVariants)
        .set({ initialized_from_shopify: true })
        .where(eq(productVariants.id, insertedVariant.id));

      created++;
    } else {
      // Existing variant — update title/sku only, never touch stock
      await db
        .update(productVariants)
        .set({
          title: sv.title,
          sku: sv.sku,
          updated_at: new Date().toISOString(),
        })
        .where(eq(productVariants.id, existingVariant[0].id));
      updated++;
    }
  }

  return { created, updated };
}
