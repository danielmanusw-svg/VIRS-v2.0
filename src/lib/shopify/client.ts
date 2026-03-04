const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";

const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 30_000;

interface ShopifyFetchOptions {
  endpoint: string;
  params?: Record<string, string>;
}

interface ShopifyPageResult<T> {
  data: T;
  nextPageInfo: string | null;
}

function buildUrl(endpoint: string, params?: Record<string, string>): string {
  const base = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/${endpoint}`;
  if (!params || Object.keys(params).length === 0) return base;
  const search = new URLSearchParams(params).toString();
  return `${base}?${search}`;
}

function parseNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Look for rel="next" in Link header
  const parts = linkHeader.split(",");
  for (const part of parts) {
    if (part.includes('rel="next"')) {
      const match = part.match(/page_info=([^>&]*)/);
      return match ? match[1] : null;
    }
  }
  return null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function shopifyFetch<T>(
  options: ShopifyFetchOptions
): Promise<ShopifyPageResult<T>> {
  const url = buildUrl(options.endpoint, options.params);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const waitMs = retryAfter
        ? Math.min(parseFloat(retryAfter) * 1000, MAX_BACKOFF_MS)
        : Math.min(1000 * Math.pow(2, attempt), MAX_BACKOFF_MS);
      console.warn(
        `Shopify rate limited (429). Retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
      );
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      lastError = new Error(
        `Shopify API error: ${res.status} ${res.statusText}`
      );
      // Retry on 5xx
      if (res.status >= 500) {
        const waitMs = Math.min(1000 * Math.pow(2, attempt), MAX_BACKOFF_MS);
        await sleep(waitMs);
        continue;
      }
      throw lastError;
    }

    const data = (await res.json()) as T;
    const linkHeader = res.headers.get("Link");
    const nextPageInfo = parseNextPageInfo(linkHeader);

    return { data, nextPageInfo };
  }

  throw lastError || new Error("Shopify fetch failed after max retries");
}

export async function shopifyFetchAllPages<T, R>(
  endpoint: string,
  baseParams: Record<string, string>,
  extractItems: (data: T) => R[]
): Promise<R[]> {
  const allItems: R[] = [];
  let pageInfo: string | null = null;
  let isFirstPage = true;

  while (true) {
    const params: Record<string, string> = isFirstPage
      ? { ...baseParams }
      : { limit: baseParams.limit || "250", page_info: pageInfo! };

    const result = await shopifyFetch<T>({ endpoint, params });
    const items = extractItems(result.data);
    allItems.push(...items);

    if (!result.nextPageInfo) break;
    pageInfo = result.nextPageInfo;
    isFirstPage = false;
  }

  return allItems;
}
