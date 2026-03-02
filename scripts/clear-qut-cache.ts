import { Redis } from "@upstash/redis";
import { readFileSync } from "fs";
import { join } from "path";

// Load .env manually
const envPath = join(process.cwd(), ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^=]+)=["']?(.+?)["']?$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
} catch {
  console.error("Could not read .env file");
}

async function clearQUTCache() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  
  if (!url || !token) {
    console.error("No Redis URL/token found. Need UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN");
    console.error("Found env vars:", Object.keys(process.env).filter(k => k.includes("KV") || k.includes("REDIS")));
    process.exit(1);
  }

  console.log("Connecting to:", url);
  const client = new Redis({ url, token });

  // Find all QUT-related cache keys using SCAN
  let cursor = 0;
  const keysToDelete: string[] = [];

  do {
    const result = await client.scan(cursor, { match: "scrape:qut:*", count: 100 });
    cursor = result[0];
    keysToDelete.push(...result[1]);
  } while (cursor !== 0);

  cursor = 0;
  do {
    const result = await client.scan(cursor, { match: "delivery:qut:*", count: 100 });
    cursor = result[0];
    keysToDelete.push(...result[1]);
  } while (cursor !== 0);

  if (keysToDelete.length === 0) {
    console.log("No QUT cache keys found");
  } else {
    console.log(`Found ${keysToDelete.length} QUT cache keys:`);
    for (const key of keysToDelete) {
      console.log(`  Deleting: ${key}`);
      await client.del(key);
    }
    console.log("Done!");
  }
}

clearQUTCache().catch(console.error);
