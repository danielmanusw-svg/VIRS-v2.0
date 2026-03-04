import { db } from "@/db";
import { orders, settings, syncHistory } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import {
  fetchShopifyOrdersBefore,
  fetchShopifyOrdersSince,
} from "@/lib/shopify/orders";
import { processOrders, fixNzOrders } from "./orderSync";
import { subDays } from "date-fns";

interface SyncRunResult {
  status: "success" | "error" | "skipped";
  message: string;
  records_processed?: number;
  records_created?: number;
  records_updated?: number;
}

const FULL_HISTORY_START = new Date(0).toISOString();

function subtractOneMillisecond(isoDate: string): string | null {
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts) || ts <= 0) return null;
  return new Date(ts - 1).toISOString();
}

export async function runOrderSync(
  options: { force?: boolean; fullHistory?: boolean } = {}
): Promise<SyncRunResult> {
  // Read settings
  const allSettings = await db.select().from(settings);
  if (allSettings.length === 0) {
    return { status: "error", message: "No settings row found" };
  }

  const config = allSettings[0];

  // Check if sync is due (skip if not forced and not enough time has passed)
  if (!options.force && config.last_synced_at) {
    const lastSynced = new Date(config.last_synced_at);
    const nextDue = new Date(
      lastSynced.getTime() + config.sync_frequency_hours * 60 * 60 * 1000
    );
    if (new Date() < nextDue) {
      return {
        status: "skipped",
        message: `Not yet due. Next sync after ${nextDue.toISOString()}`,
      };
    }
  }

  // Determine the "since" cursor
  const sinceDate =
    config.shopify_orders_synced_until ??
    subDays(new Date(), 30).toISOString();

  const startedAt = new Date().toISOString();

  try {
    // Fix any existing NZ orders that were flagged before NZ→AU mapping
    await fixNzOrders();

    // Phase 1: fetch and process recent/new orders since the cursor.
    const forwardOrders = await fetchShopifyOrdersSince(sinceDate);
    const forwardResult = await processOrders(forwardOrders);

    let backfillOrders: Awaited<ReturnType<typeof fetchShopifyOrdersSince>> = [];

    if (options.fullHistory) {
      // Explicit all-history refresh path (safe with idempotent order upserts).
      backfillOrders = await fetchShopifyOrdersSince(FULL_HISTORY_START);
    } else {
      // Phase 2: backfill older history if local data does not yet start at the oldest order.
      const [oldestLocalOrder] = await db
        .select({ shopify_created_at: orders.shopify_created_at })
        .from(orders)
        .orderBy(asc(orders.shopify_created_at))
        .limit(1);

      if (oldestLocalOrder) {
        const beforeDate = subtractOneMillisecond(
          oldestLocalOrder.shopify_created_at
        );
        if (beforeDate) {
          backfillOrders = await fetchShopifyOrdersBefore(beforeDate);
        }
      } else {
        // No local orders yet: fetch full history.
        backfillOrders = await fetchShopifyOrdersSince(FULL_HISTORY_START);
      }
    }

    const backfillResult =
      backfillOrders.length > 0
        ? await processOrders(backfillOrders, {
            skipStockAdjustments: true,
            skipExistingUpdates: true,
          })
        : { processed: 0, created: 0, updated: 0, errors: [] as string[] };

    const result = {
      processed: forwardResult.processed + backfillResult.processed,
      created: forwardResult.created + backfillResult.created,
      updated: forwardResult.updated + backfillResult.updated,
      errors: [...forwardResult.errors, ...backfillResult.errors],
    };

    const completedAt = new Date().toISOString();

    // Write sync history
    await db.insert(syncHistory).values({
      sync_type: "orders",
      status: result.errors.length > 0 ? "error" : "success",
      records_processed: result.processed,
      records_created: result.created,
      records_updated: result.updated,
      error_detail:
        result.errors.length > 0 ? result.errors.join("\n") : null,
      started_at: startedAt,
      completed_at: completedAt,
    });

    // Update the sync cursor to now (so next run picks up from here)
    await db
      .update(settings)
      .set({
        shopify_orders_synced_until: completedAt,
        last_synced_at: completedAt,
        updated_at: completedAt,
      })
      .where(eq(settings.id, config.id));

    return {
      status: "success",
      message: `Synced ${result.processed} orders (${result.created} new, ${result.updated} updated${result.errors.length > 0 ? `, ${result.errors.length} errors` : ""})`,
      records_processed: result.processed,
      records_created: result.created,
      records_updated: result.updated,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error during sync";

    await db.insert(syncHistory).values({
      sync_type: "orders",
      status: "error",
      records_processed: 0,
      error_detail: message,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });

    return { status: "error", message };
  }
}
