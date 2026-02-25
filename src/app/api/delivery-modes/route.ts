import { NextRequest, NextResponse } from "next/server";
import { fetchAvailableDeliveryModes } from "@/lib/delivery-modes";
import { parseSemesterType } from "@/lib/semester";
import {
    getCached,
    setCached,
    deliveryCacheKey,
    incrAnalytics,
    pushRecentDeliveryError
} from "../../../lib/cache-redis";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const courseCode = searchParams.get("courseCode")?.trim()?.toUpperCase();
    const yearParam = searchParams.get("year");
    const semesterType = parseSemesterType(searchParams.get("semester"));

    if (!courseCode || !courseCode.length || courseCode.length > 20) {
        return NextResponse.json(
            { error: "Missing or invalid courseCode query parameter." },
            { status: 400 }
        );
    }
    if (!yearParam || !semesterType) {
        return NextResponse.json(
            { error: "Missing or invalid year/semester query parameters." },
            { status: 400 }
        );
    }

    const year = parseInt(yearParam, 10);
    if (Number.isNaN(year) || year < 2000 || year > 2100) {
        return NextResponse.json(
            { error: "Invalid year parameter." },
            { status: 400 }
        );
    }

    const cacheControl = "public, max-age=31536000, immutable"; // 1 year; keyed by course+year+semester

    try {
        const cacheKey = deliveryCacheKey(courseCode, year, semesterType);
        const cached = await getCached<{
            modes: Awaited<ReturnType<typeof fetchAvailableDeliveryModes>>;
        }>(cacheKey);
        if (cached) {
            await incrAnalytics("delivery:hits");
            return NextResponse.json(cached, {
                status: 200,
                headers: { "Cache-Control": cacheControl },
            });
        }

        const modes = await fetchAvailableDeliveryModes(
            courseCode,
            year,
            semesterType
        );

        if (modes.length === 0) {
            return NextResponse.json(
                {
                    error: `No delivery modes found for ${courseCode} ${semesterType} ${year}. Verify the semester and year.`,
                    reason: "no_offerings"
                },
                { status: 404 }
            );
        }

        await setCached(cacheKey, { modes });
        await incrAnalytics("delivery:misses");
        return NextResponse.json(
            { modes },
            { status: 200, headers: { "Cache-Control": cacheControl } }
        );
    } catch (err) {
        const message =
            err instanceof Error
                ? err.message
                : "Unknown error fetching delivery modes.";
        console.error("[API] Delivery modes error:", message, err);
        await incrAnalytics("delivery:errors");
        const label = `${courseCode} ${year} ${semesterType}`;
        await pushRecentDeliveryError(label);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
