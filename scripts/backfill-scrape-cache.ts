/**
 * Backfill scrape cache and delivery-modes cache with fresh data using local scraping.
 * Run from project root: npm run backfill  (or npx tsx scripts/backfill-scrape-cache.ts)
 *
 * - Loads Redis config from .env or .env.local: KV_REST_API_URL + KV_REST_API_TOKEN
 *   (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
 * - Unsets SCRAPER_API_KEY so fetchUqHtml hits UQ directly (run from your machine, not Vercel).
 * - Lists all existing scrape:* keys, re-scrapes each course locally, overwrites scrape cache (no TTL).
 * - Then backfills delivery:* cache for each unique (course, year, semester) (no TTL).
 */

import * as fs from "fs";
import * as path from "path";
import {
    deliveryCacheKey,
    listScrapeCacheKeys,
    parseScrapeCacheKey,
    setCached
} from "../src/lib/cache-redis";
import { fetchAvailableDeliveryModes } from "../src/lib/delivery-modes";
import type { SemesterSelection } from "../src/lib/semester";
import { fetchCourseAssessment } from "../src/lib/uq-scraper";

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

const DELAY_MS = 2000;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
    loadEnv();

    // Use local scraping only (no ScraperAPI)
    delete process.env.SCRAPER_API_KEY;

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

    const keys = await listScrapeCacheKeys();
    if (keys.length === 0) {
        console.log("No scrape:* keys found in Redis. Nothing to backfill.");
        return;
    }

    console.log(
        `Found ${keys.length} scrape cache key(s). Re-scraping locally and updating cache...`
    );

    let done = 0;
    let failed = 0;

    for (const key of keys) {
        const parsed = parseScrapeCacheKey(key);
        if (!parsed) {
            console.warn(`Skip (invalid key): ${key}`);
            failed++;
            continue;
        }

        const semester: SemesterSelection | undefined =
            parsed.year != null &&
            parsed.semester != null &&
            parsed.delivery != null
                ? {
                      year: parsed.year,
                      semester: parsed.semester as
                          | "Semester 1"
                          | "Semester 2"
                          | "Summer",
                      delivery: parsed.delivery as "Internal" | "External"
                  }
                : undefined;

        try {
            const data = await fetchCourseAssessment(
                parsed.courseCode,
                semester
            );
            await setCached(key, data);
            done++;
            console.log(`[${done + failed}/${keys.length}] OK ${key}`);
        } catch (err) {
            failed++;
            console.warn(
                `[${done + failed}/${keys.length}] FAIL ${key}:`,
                err instanceof Error ? err.message : err
            );
        }

        if (done + failed < keys.length) {
            await delay(DELAY_MS);
        }
    }

    console.log(`Scrape backfill done. Updated: ${done}, Failed: ${failed}.`);

    // Backfill delivery modes for each unique (courseCode, year, semester) from scrape keys
    const deliveryTriples = new Map<string, { courseCode: string; year: number; semester: "Semester 1" | "Semester 2" | "Summer" }>();
    for (const key of keys) {
        const parsed = parseScrapeCacheKey(key);
        if (!parsed || parsed.year == null || parsed.semester == null) continue;
        const sem = parsed.semester as "Semester 1" | "Semester 2" | "Summer";
        const id = `${parsed.courseCode}:${parsed.year}:${parsed.semester}`;
        if (!deliveryTriples.has(id))
            deliveryTriples.set(id, { courseCode: parsed.courseCode, year: parsed.year, semester: sem });
    }

    if (deliveryTriples.size > 0) {
        console.log(
            `Backfilling ${deliveryTriples.size} delivery mode cache(s)...`
        );
        let dDone = 0;
        let dFailed = 0;
        for (const [, { courseCode, year, semester }] of deliveryTriples) {
            try {
                const modes = await fetchAvailableDeliveryModes(
                    courseCode,
                    year,
                    semester
                );
                if (modes.length > 0) {
                    await setCached(deliveryCacheKey(courseCode, year, semester), { modes });
                    dDone++;
                    console.log(
                        `[${dDone + dFailed}/${deliveryTriples.size}] OK delivery:${courseCode}:${year}:${semester}`
                    );
                } else {
                    dFailed++;
                    console.warn(
                        `[${dDone + dFailed}/${deliveryTriples.size}] SKIP (no modes) delivery:${courseCode}:${year}:${semester}`
                    );
                }
            } catch (err) {
                dFailed++;
                console.warn(
                    `[${dDone + dFailed}/${deliveryTriples.size}] FAIL delivery:${courseCode}:${year}:${semester}:`,
                    err instanceof Error ? err.message : err
                );
            }
            if (dDone + dFailed < deliveryTriples.size) await delay(DELAY_MS);
        }
        console.log(
            `Delivery backfill done. Updated: ${dDone}, Failed/Skipped: ${dFailed}.`
        );
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
