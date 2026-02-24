import { NextRequest, NextResponse } from "next/server";
import { fetchCourseAssessment } from "@/lib/uq-scraper";
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
    incrAnalytics
} from "../../../lib/cache-redis";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const courseCode =
        searchParams.get("courseCode") ?? searchParams.get("code");

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
              semester.delivery
          )
        : `scrape:${trimmedCode}`;

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
                        "Scraper limit reached. This course was previously attempted; try again later."
                },
                { status: 503 }
            );
        }

        const data = await fetchCourseAssessment(trimmedCode, semester);
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
        if (message.includes("reached its limit")) {
            await addFailedScrape(cacheKey);
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
