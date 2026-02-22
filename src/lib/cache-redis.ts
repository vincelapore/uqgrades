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
