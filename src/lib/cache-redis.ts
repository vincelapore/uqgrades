import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function normalizeSemester(semester: string): string {
  return semester.replace(/\s+/g, "_");
}

export function scrapeCacheKey(
  courseCode: string,
  year: number,
  semester: string,
  delivery: string
): string {
  return `scrape:${courseCode}:${year}:${normalizeSemester(semester)}:${delivery}`;
}

export function deliveryCacheKey(
  courseCode: string,
  year: number,
  semester: string
): string {
  return `delivery:${courseCode}:${year}:${normalizeSemester(semester)}`;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const value = await client.get(key);
    return value as T | null;
  } catch {
    return null;
  }
}

/**
 * Store value in Redis. By default keys do not expire (saves ScraperAPI credits).
 * Pass ttlSeconds to set an expiry (e.g. for short-lived data).
 */
export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    if (ttlSeconds != null && ttlSeconds > 0) {
      await client.set(key, value, { ex: ttlSeconds });
    } else {
      await client.set(key, value);
    }
  } catch (err) {
    console.warn("[cache] setCached failed:", err instanceof Error ? err.message : "unknown");
  }
}

const ANALYTICS_KEY_PREFIX = "analytics:";

/** Event names used for analytics (server + optional client). Used for read path and POST allowlist. */
export const ANALYTICS_EVENTS = [
  "scrape:hits",
  "scrape:misses",
  "scrape:errors",
  "scrape:failed_skip",
  "delivery:hits",
  "delivery:misses",
  "delivery:errors",
  "calendar_export",
  "hurdle_clicked",
  "copy_link",
  "reset_confirmed",
  "remove_course",
  "how_to_opened",
  "mark_help_opened",
  "calendar_popup_opened",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/** Increment an analytics counter. Best-effort; failures are ignored. */
export async function incrAnalytics(event: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.incr(`${ANALYTICS_KEY_PREFIX}${event}`);
  } catch (err) {
    console.warn("[cache] incrAnalytics failed:", err instanceof Error ? err.message : "unknown");
  }
}

/** Read current analytics counts for all known events. Missing keys or Redis errors return 0. */
export async function getAnalyticsCounts(): Promise<Record<string, number>> {
  const client = getRedis();
  const out: Record<string, number> = {};
  for (const event of ANALYTICS_EVENTS) {
    out[event] = 0;
  }
  if (!client) return out;
  try {
    for (const event of ANALYTICS_EVENTS) {
      const val = await client.get(`${ANALYTICS_KEY_PREFIX}${event}`);
      const n = typeof val === "number" ? val : Number(val);
      if (!Number.isNaN(n) && Number.isInteger(n) && n >= 0) {
        out[event] = n;
      }
    }
  } catch {
    // leave zeros
  }
  return out;
}

const RECENT_SCRAPE_ERRORS_KEY = "analytics:recent_scrape_errors";
const RECENT_DELIVERY_ERRORS_KEY = "analytics:recent_delivery_errors";
const MAX_RECENT_ERRORS = 20;

/** Append a human-readable course label to the recent scrape errors list (bounded). Best-effort. */
export async function pushRecentScrapeError(label: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.rpush(RECENT_SCRAPE_ERRORS_KEY, label);
    await client.ltrim(RECENT_SCRAPE_ERRORS_KEY, -MAX_RECENT_ERRORS, -1);
  } catch {
    // ignore
  }
}

/** Append a human-readable course label to the recent delivery errors list (bounded). Best-effort. */
export async function pushRecentDeliveryError(label: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.rpush(RECENT_DELIVERY_ERRORS_KEY, label);
    await client.ltrim(RECENT_DELIVERY_ERRORS_KEY, -MAX_RECENT_ERRORS, -1);
  } catch {
    // ignore
  }
}

/** Get the most recent scrape error labels (newest last). */
export async function getRecentScrapeErrors(): Promise<string[]> {
  const client = getRedis();
  if (!client) return [];
  try {
    const list = await client.lrange(RECENT_SCRAPE_ERRORS_KEY, 0, -1);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Get the most recent delivery error labels (newest last). */
export async function getRecentDeliveryErrors(): Promise<string[]> {
  const client = getRedis();
  if (!client) return [];
  try {
    const list = await client.lrange(RECENT_DELIVERY_ERRORS_KEY, 0, -1);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const FAILED_SCRAPES_SET = "failed-scrapes:v1";

/** Parse a scrape cache key into courseCode and optional semester. Returns null if key format is invalid. */
export function parseScrapeCacheKey(
  key: string
): { courseCode: string; year?: number; semester?: string; delivery?: string } | null {
  if (!key.startsWith("scrape:")) return null;
  const parts = key.split(":");
  if (parts.length === 2) {
    return { courseCode: parts[1] };
  }
  if (parts.length >= 5) {
    const year = parseInt(parts[2], 10);
    if (Number.isNaN(year)) return null;
    const semesterNorm = parts[3];
    const delivery = parts[4];
    const semester = semesterNorm.replace(/_/g, " ");
    return {
      courseCode: parts[1],
      year,
      semester,
      delivery,
    };
  }
  return null;
}

/** List all Redis keys that are scrape cache entries. */
export async function listScrapeCacheKeys(): Promise<string[]> {
  const client = getRedis();
  if (!client) return [];
  try {
    const all = await client.keys("scrape:*");
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
}

export type ScrapeCacheCountResult = { count: number; capped: boolean };

/**
 * Number of course scrape entries in cache (scrape:* keys).
 * If maxKeys is set, stops counting at maxKeys and returns capped: true (avoids loading all keys when using SCAN).
 */
export async function getScrapeCacheCount(
  maxKeys?: number
): Promise<ScrapeCacheCountResult> {
  const client = getRedis();
  if (!client) return { count: 0, capped: false };

  if (maxKeys == null || maxKeys <= 0) {
    try {
      const keys = await listScrapeCacheKeys();
      return { count: keys.length, capped: false };
    } catch {
      return { count: 0, capped: false };
    }
  }

  try {
    let cursor: number | string = 0;
    let total = 0;
    let capped = false;
    do {
      const result = (await client.scan(cursor, {
        match: "scrape:*",
        count: 500,
      })) as [string | number, string[]];
      const nextCursor = result[0];
      const keys = Array.isArray(result[1]) ? result[1] : [];
      total += keys.length;
      if (total >= maxKeys) {
        total = maxKeys;
        capped = true;
        break;
      }
      cursor = nextCursor;
    } while (String(cursor) !== "0");
    return { count: total, capped };
  } catch {
    const keys = await listScrapeCacheKeys();
    const count = Math.min(keys.length, maxKeys);
    return { count, capped: keys.length > maxKeys };
  }
}

/** Add a course+semester to the set of failed scrape attempts (e.g. limit reached). */
export async function addFailedScrape(cacheKey: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.sadd(FAILED_SCRAPES_SET, cacheKey);
  } catch {
    // ignore
  }
}

/** True if we previously failed to scrape this key (e.g. API limit). Avoids burning credits retrying. */
export async function isFailedScrape(cacheKey: string): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    return (await client.sismember(FAILED_SCRAPES_SET, cacheKey)) === 1;
  } catch {
    return false;
  }
}

/** Extract year from a delivery cache key (delivery:COURSE:YEAR:SEMESTER). Returns undefined if invalid. */
function yearFromDeliveryKey(key: string): number | undefined {
  if (!key.startsWith("delivery:")) return undefined;
  const parts = key.split(":");
  if (parts.length < 4) return undefined;
  const y = parseInt(parts[2], 10);
  return Number.isNaN(y) ? undefined : y;
}

const BATCH_SIZE = 100;

/**
 * Delete scrape:* and delivery:* keys whose year is strictly less than cutoffYear.
 * Keeps current and previous year. Deletes in batches. Returns counts deleted.
 */
export async function evictScrapeAndDeliveryCacheOlderThanYear(
  cutoffYear: number
): Promise<{ deletedScrape: number; deletedDelivery: number }> {
  const client = getRedis();
  let deletedScrape = 0;
  let deletedDelivery = 0;
  if (!client) return { deletedScrape, deletedDelivery };

  try {
    const scrapeKeys = await listScrapeCacheKeys();
    const toDeleteScrape: string[] = [];
    for (const key of scrapeKeys) {
      const parsed = parseScrapeCacheKey(key);
      if (parsed?.year != null && parsed.year < cutoffYear) {
        toDeleteScrape.push(key);
        if (toDeleteScrape.length >= BATCH_SIZE) {
          await client.del(...toDeleteScrape);
          deletedScrape += toDeleteScrape.length;
          toDeleteScrape.length = 0;
        }
      }
    }
    if (toDeleteScrape.length > 0) {
      await client.del(...toDeleteScrape);
      deletedScrape += toDeleteScrape.length;
    }
  } catch {
    // leave deletedScrape as is
  }

  try {
    const deliveryKeys = await client.keys("delivery:*");
    const list = Array.isArray(deliveryKeys) ? deliveryKeys : [];
    const toDeleteDelivery: string[] = [];
    for (const key of list) {
      const year = yearFromDeliveryKey(key);
      if (year != null && year < cutoffYear) {
        toDeleteDelivery.push(key);
        if (toDeleteDelivery.length >= BATCH_SIZE) {
          await client.del(...toDeleteDelivery);
          deletedDelivery += toDeleteDelivery.length;
          toDeleteDelivery.length = 0;
        }
      }
    }
    if (toDeleteDelivery.length > 0) {
      await client.del(...toDeleteDelivery);
      deletedDelivery += toDeleteDelivery.length;
    }
  } catch {
    // leave deletedDelivery as is
  }

  return { deletedScrape, deletedDelivery };
}

/**
 * Remove from failed-scrapes set any member whose key's year is < cutoffYear.
 * Returns number of members removed.
 */
export async function trimFailedScrapesOlderThanYear(
  cutoffYear: number
): Promise<number> {
  const client = getRedis();
  if (!client) return 0;
  try {
    const members = await client.smembers(FAILED_SCRAPES_SET);
    const toRemove: string[] = [];
    for (const key of members) {
      const parsed = parseScrapeCacheKey(key);
      if (parsed?.year != null && parsed.year < cutoffYear) {
        toRemove.push(key);
      }
    }
    if (toRemove.length > 0) {
      await client.srem(FAILED_SCRAPES_SET, ...toRemove);
      return toRemove.length;
    }
  } catch {
    // ignore
  }
  return 0;
}
