/**
 * Evict Redis cache entries for years older than (current year - 1).
 * Keeps current and previous year; deletes older scrape:* and delivery:* keys,
 * and trims the failed-scrapes set.
 *
 * Run from project root: npx tsx scripts/evict-old-cache.ts
 * Loads Redis from .env / .env.local (KV_REST_API_URL, KV_REST_API_TOKEN or UPSTASH_*).
 */

import * as fs from "fs";
import * as path from "path";
import {
  evictScrapeAndDeliveryCacheOlderThanYear,
  trimFailedScrapesOlderThanYear,
} from "../src/lib/cache-redis";

function loadEnvFile(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

function loadEnv(): void {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env"));
  loadEnvFile(path.join(cwd, ".env.local"));
}

async function main(): Promise<void> {
  loadEnv();

  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.error(
      "Missing Redis config. Set KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN) in .env or .env.local."
    );
    process.exit(1);
  }

  const currentYear = new Date().getFullYear();
  const cutoffYear = currentYear - 1;

  console.log(
    `Evicting scrape and delivery cache for years before ${cutoffYear} (keeping ${cutoffYear} and ${currentYear})...`
  );

  const { deletedScrape, deletedDelivery } =
    await evictScrapeAndDeliveryCacheOlderThanYear(cutoffYear);
  console.log(`Deleted scrape keys: ${deletedScrape}, delivery keys: ${deletedDelivery}`);

  const trimmedFailed = await trimFailedScrapesOlderThanYear(cutoffYear);
  console.log(`Trimmed failed-scrapes set: ${trimmedFailed} members removed.`);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
