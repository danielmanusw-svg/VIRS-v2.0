import { shopifyFetchAllPages } from "./client";

export interface ShopifyLineItem {
  id: number;
  variant_id: number | null;
  title: string;
  sku: string | null;
  quantity: number;
  price: string;
  total_discount?: string | null;
  discount_allocations?: { amount: string }[];
  fulfillment_service: string | null;
}

export interface ShopifyFulfillment {
  id: number;
  name: string | null;
  service: string | null;
  status: string | null;
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  financial_status: string | null;
  fulfillment_status: string | null;
  cancelled_at: string | null;
  created_at: string;
  shipping_address: {
    country_code: string;
  } | null;
  line_items: ShopifyLineItem[];
  fulfillments?: ShopifyFulfillment[];
}

interface ShopifyOrdersResponse {
  orders: ShopifyOrder[];
}

export async function fetchShopifyOrdersSince(
  sinceDate: string
): Promise<ShopifyOrder[]> {
  return shopifyFetchAllPages<ShopifyOrdersResponse, ShopifyOrder>(
    "orders.json",
    {
      limit: "250",
      status: "any",
      created_at_min: sinceDate,
      order: "created_at asc",
    },
    (data) => data.orders
  );
}

export async function fetchShopifyOrdersBefore(
  beforeDate: string
): Promise<ShopifyOrder[]> {
  return shopifyFetchAllPages<ShopifyOrdersResponse, ShopifyOrder>(
    "orders.json",
    {
      limit: "250",
      status: "any",
      created_at_max: beforeDate,
      order: "created_at desc",
    },
    (data) => data.orders
  );
}

export async function fetchShopifyOrdersByQuery(
  query: string
): Promise<ShopifyOrder[]> {
  return shopifyFetchAllPages<ShopifyOrdersResponse, ShopifyOrder>(
    "orders.json",
    {
      limit: "250",
      status: "any",
      query,
    },
    (data) => data.orders
  );
}
