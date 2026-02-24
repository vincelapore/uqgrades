import { NextRequest, NextResponse } from "next/server";
import {
    getAnalyticsCounts,
    incrAnalytics,
    ANALYTICS_EVENTS
} from "@/lib/cache-redis";

export const dynamic = "force-dynamic";

const ALLOWLIST = new Set<string>(ANALYTICS_EVENTS);

function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.ANALYTICS_SECRET;
    if (!secret) return true;
    const provided = request.nextUrl.searchParams.get("secret");
    return provided === secret;
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const counts = await getAnalyticsCounts();
        return NextResponse.json(counts);
    } catch {
        return NextResponse.json(
            { error: "Failed to load analytics" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let body: { event?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 }
        );
    }
    const event = typeof body?.event === "string" ? body.event.trim() : "";
    if (!event || !ALLOWLIST.has(event)) {
        return NextResponse.json(
            { error: "Missing or invalid event name" },
            { status: 400 }
        );
    }
    await incrAnalytics(event);
    return new NextResponse(null, { status: 204 });
}
