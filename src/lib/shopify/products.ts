import { shopifyFetchAllPages } from "./client";

export interface ShopifyVariant {
  id: number;
  title: string;
  sku: string | null;
  inventory_quantity: number;
  price: string;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  vendor: string | null;
  image: { src: string } | null;
  variants: ShopifyVariant[];
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

export async function fetchAllShopifyProducts(): Promise<ShopifyProduct[]> {
  return shopifyFetchAllPages<ShopifyProductsResponse, ShopifyProduct>(
    "products.json",
    { limit: "250" },
    (data) => data.products
  );
}
