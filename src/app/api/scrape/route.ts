import { NextRequest, NextResponse } from "next/server";
import { fetchCourseAssessment } from "@/lib/uq-scraper";
import { fetchQUTCourseAssessment } from "@/lib/qut-scraper";
import {
    parseSemesterType,
    parseDeliveryMode,
    type SemesterSelection
} from "@/lib/semester";
import {
    getCached,
    setCached,
    scrapeCacheKey,
    addFailedScrape,
    isFailedScrape,
    incrAnalytics,
    pushRecentScrapeError,
    parseScrapeCacheKey
} from "../../../lib/cache-redis";

export const dynamic = "force-dynamic";

const SUPPORTED_UNIVERSITIES = ["uq", "qut"] as const;
type SupportedUniversity = (typeof SUPPORTED_UNIVERSITIES)[number];

function isSupportedUniversity(value: string): value is SupportedUniversity {
    return SUPPORTED_UNIVERSITIES.includes(value as SupportedUniversity);
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const courseCode =
        searchParams.get("courseCode") ?? searchParams.get("code");
    const universityParam = searchParams.get("university")?.toLowerCase() ?? "uq";

    if (!isSupportedUniversity(universityParam)) {
        return NextResponse.json(
            { error: `Unsupported university: ${universityParam}. Supported: ${SUPPORTED_UNIVERSITIES.join(", ")}` },
            { status: 400 }
        );
    }

    if (!courseCode?.trim()) {
        return NextResponse.json(
            { error: "Missing courseCode query parameter." },
            { status: 400 }
        );
    }

    const trimmedCode = courseCode.trim().toUpperCase();
    if (trimmedCode.length > 20) {
        return NextResponse.json(
            { error: "Invalid courseCode." },
            { status: 400 }
        );
    }

    let semester: SemesterSelection | undefined;
    const yearParam = searchParams.get("year");
    const semesterType = parseSemesterType(searchParams.get("semester"));
    const delivery = parseDeliveryMode(searchParams.get("delivery"));

    if (yearParam && semesterType && delivery) {
        const year = parseInt(yearParam, 10);
        if (Number.isNaN(year) || year < 2000 || year > 2100) {
            return NextResponse.json(
                { error: "Invalid year parameter." },
                { status: 400 }
            );
        }
        semester = { year, semester: semesterType, delivery };
    }

    const cacheKey = semester
        ? scrapeCacheKey(
              trimmedCode,
              semester.year,
              semester.semester,
              semester.delivery,
              universityParam
          )
        : `scrape:${universityParam}:${trimmedCode}`;

    const cacheControl = "public, max-age=31536000, immutable"; // 1 year; data keyed by course+semester

    try {
        const cached =
            await getCached<Awaited<ReturnType<typeof fetchCourseAssessment>>>(
                cacheKey
            );
        if (cached) {
            await incrAnalytics("scrape:hits");
            return NextResponse.json(cached, {
                status: 200,
                headers: { "Cache-Control": cacheControl },
            });
        }

        if (await isFailedScrape(cacheKey)) {
            await incrAnalytics("scrape:failed_skip");
            return NextResponse.json(
                {
                    error:
                        "We've hit a temporary limit for this course. Please try again in a few hours or tomorrow."
                },
                { status: 503 }
            );
        }

        // Call the appropriate scraper based on university
        let data;
        if (universityParam === "qut") {
            data = await fetchQUTCourseAssessment(trimmedCode, semester);
        } else {
            data = await fetchCourseAssessment(trimmedCode, semester);
        }
        await setCached(cacheKey, data);
        await incrAnalytics("scrape:misses");
        return NextResponse.json(data, {
            status: 200,
            headers: { "Cache-Control": cacheControl },
        });
    } catch (err) {
        const message =
            err instanceof Error
                ? err.message
                : "Unknown error scraping course.";
        console.error("[API] Scrape error:", message, err);
        await incrAnalytics("scrape:errors");
        const parsed = parseScrapeCacheKey(cacheKey);
        const label = parsed
            ? `${parsed.courseCode} ${parsed.year ?? "?"} ${(parsed.semester ?? "?").replace(/_/g, " ")} ${parsed.delivery ?? "?"}`
            : cacheKey;
        await pushRecentScrapeError(label);
        if (message.includes("reached its limit")) {
            await addFailedScrape(cacheKey);
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
