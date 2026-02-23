import { Redis } from "@upstash/redis";

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

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

export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds: number = CACHE_TTL_SECONDS
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(key, value, { ex: ttlSeconds });
  } catch {
    // ignore
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
