import { NextRequest, NextResponse } from "next/server";
import { fetchCourseAssessment } from "@/lib/uq-scraper";
import {
  parseSemesterType,
  parseDeliveryMode,
  type SemesterSelection,
} from "@/lib/semester";
import {
  getCached,
  setCached,
  scrapeCacheKey,
} from "@/lib/cache-redis";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const courseCode = searchParams.get("courseCode") ?? searchParams.get("code");

  if (!courseCode?.trim()) {
    return NextResponse.json(
      { error: "Missing courseCode query parameter." },
      { status: 400 },
    );
  }

  const trimmedCode = courseCode.trim().toUpperCase();
  if (trimmedCode.length > 20) {
    return NextResponse.json(
      { error: "Invalid courseCode." },
      { status: 400 },
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
        { status: 400 },
      );
    }
    semester = { year, semester: semesterType, delivery };
  }

  try {
    const cacheKey = semester
      ? scrapeCacheKey(
          trimmedCode,
          semester.year,
          semester.semester,
          semester.delivery
        )
      : `scrape:${trimmedCode}`;
    const cached = await getCached<Awaited<ReturnType<typeof fetchCourseAssessment>>>(cacheKey);
    if (cached) return NextResponse.json(cached, { status: 200 });

    const data = await fetchCourseAssessment(trimmedCode, semester);
    await setCached(cacheKey, data);
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error scraping course.";
    console.error("[API] Scrape error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

