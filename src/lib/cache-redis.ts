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
  } catch {
    // ignore
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
  } catch {
    // ignore
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

/** Number of course scrape entries currently in cache (scrape:* keys). */
export async function getScrapeCacheCount(): Promise<number> {
  const keys = await listScrapeCacheKeys();
  return keys.length;
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
