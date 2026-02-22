/**
 * Fetches HTML from UQ (or any URL). When SCRAPER_API_KEY is set (e.g. on Vercel),
 * requests go through ScraperAPI so they are not blocked by UQ's IP restrictions.
 *
 * Set SCRAPER_API_KEY in Vercel → Project → Settings → Environment Variables.
 * Get a key at https://www.scraperapi.com (free tier: 1000 requests/month).
 */

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; uqgrades-bot/1.0; +https://uqgrades.com)",
};

const SCRAPER_API_BASE = "https://api.scraperapi.com";

/**
 * Fetch HTML from the given URL. Uses ScraperAPI when SCRAPER_API_KEY is set
 * (e.g. in Vercel env) so requests from cloud IPs are not blocked by UQ.
 */
export async function fetchUqHtml(url: string): Promise<string> {
  const apiKey = process.env.SCRAPER_API_KEY;

  const targetUrl = apiKey
    ? `${SCRAPER_API_BASE}?api_key=${apiKey}&url=${encodeURIComponent(url)}`
    : url;

  const res = await fetch(targetUrl, {
    headers: apiKey ? undefined : DEFAULT_HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (${res.status})`);
  }

  return res.text();
}
