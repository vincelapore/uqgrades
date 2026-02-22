import { NextRequest, NextResponse } from "next/server";
import { fetchAvailableDeliveryModes } from "@/lib/delivery-modes";
import { parseSemesterType } from "@/lib/semester";
import {
  getCached,
  setCached,
  deliveryCacheKey,
} from "@/lib/cache-redis";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const courseCode = searchParams.get("courseCode")?.trim()?.toUpperCase();
  const yearParam = searchParams.get("year");
  const semesterType = parseSemesterType(searchParams.get("semester"));

  if (!courseCode || !courseCode.length || courseCode.length > 20) {
    return NextResponse.json(
      { error: "Missing or invalid courseCode query parameter." },
      { status: 400 },
    );
  }
  if (!yearParam || !semesterType) {
    return NextResponse.json(
      { error: "Missing or invalid year/semester query parameters." },
      { status: 400 },
    );
  }

  const year = parseInt(yearParam, 10);
  if (Number.isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: "Invalid year parameter." },
      { status: 400 },
    );
  }

  try {
    const cacheKey = deliveryCacheKey(courseCode, year, semesterType);
    const cached = await getCached<{ modes: Awaited<ReturnType<typeof fetchAvailableDeliveryModes>> }>(cacheKey);
    if (cached) return NextResponse.json(cached, { status: 200 });

    const modes = await fetchAvailableDeliveryModes(courseCode, year, semesterType);

    if (modes.length === 0) {
      return NextResponse.json(
        {
          error: `No delivery modes found for ${courseCode} ${semesterType} ${year}. Verify the semester and year.`,
        },
        { status: 404 },
      );
    }

    await setCached(cacheKey, { modes });
    return NextResponse.json({ modes }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unknown error fetching delivery modes.";
    console.error("[API] Delivery modes error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
