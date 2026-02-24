"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Counts = Record<string, number>;

const SCRAPE_LABELS: Record<string, string> = {
    "scrape:hits": "Cache hits",
    "scrape:misses": "Cache misses (ScraperAPI used)",
    "scrape:errors": "Errors",
    "scrape:failed_skip": "Limit reached – no retry"
};

const DELIVERY_LABELS: Record<string, string> = {
    "delivery:hits": "Cache hits",
    "delivery:misses": "Cache misses",
    "delivery:errors": "Errors"
};

const CLIENT_LABELS: Record<string, string> = {
    calendar_export: "Calendar exported",
    hurdle_clicked: "Hurdle info opened",
    copy_link: "Copy link",
    reset_confirmed: "Reset confirmed",
    remove_course: "Course removed",
    how_to_opened: "How to use opened",
    mark_help_opened: "Mark help opened",
    calendar_popup_opened: "Calendar popup opened"
};

const SCRAPE_KEYS = [
    "scrape:hits",
    "scrape:misses",
    "scrape:errors",
    "scrape:failed_skip"
];
const DELIVERY_KEYS = ["delivery:hits", "delivery:misses", "delivery:errors"];
const CLIENT_KEYS = [
    "calendar_export",
    "hurdle_clicked",
    "copy_link",
    "reset_confirmed",
    "remove_course",
    "how_to_opened",
    "mark_help_opened",
    "calendar_popup_opened"
];

function StatCard({ label, value }: { label: string; value: number }) {
    return (
        <div className='rounded-xl border border-slate-700/50 bg-slate-900/50 px-4 py-3 backdrop-blur-sm'>
            <p className='text-xs font-medium text-slate-400'>{label}</p>
            <p className='mt-1 text-2xl font-semibold tabular-nums text-slate-50'>
                {value.toLocaleString()}
            </p>
        </div>
    );
}

function Section({
    title,
    keys,
    labels,
    counts
}: {
    title: string;
    keys: string[];
    labels: Record<string, string>;
    counts: Counts;
}) {
    return (
        <section className='rounded-2xl border border-slate-800/50 bg-gradient-to-br from-slate-900/50 via-slate-950/50 to-slate-900/30 p-6 backdrop-blur-sm shadow-xl shadow-black/20 sm:p-8'>
            <h2 className='mb-4 text-lg font-semibold text-slate-100'>
                {title}
            </h2>
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                {keys.map((key) => (
                    <StatCard
                        key={key}
                        label={labels[key] ?? key}
                        value={counts[key] ?? 0}
                    />
                ))}
            </div>
        </section>
    );
}

function AnalyticsContent() {
    const searchParams = useSearchParams();
    const [counts, setCounts] = useState<Counts | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const secret =
        searchParams.get("secret") ??
        (typeof process.env.NEXT_PUBLIC_ANALYTICS_SECRET === "string"
            ? process.env.NEXT_PUBLIC_ANALYTICS_SECRET
            : "");

    const fetchCounts = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const url = `/api/analytics${secret ? `?secret=${encodeURIComponent(secret)}` : ""}`;
            const res = await fetch(url);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? `HTTP ${res.status}`);
            }
            const data = (await res.json()) as Counts;
            setCounts(data);
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Failed to load analytics"
            );
        } finally {
            setLoading(false);
        }
    }, [secret]);

    useEffect(() => {
        fetchCounts();
    }, [fetchCounts]);

    if (loading) {
        return (
            <div className='min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-slate-50'>
                <main className='mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-4 px-4'>
                    <p className='text-slate-400'>Loading analytics…</p>
                </main>
            </div>
        );
    }

    if (error) {
        return (
            <div className='min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-slate-50'>
                <main className='mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-4 px-4'>
                    <p className='text-rose-400'>{error}</p>
                    <button
                        type='button'
                        onClick={fetchCounts}
                        className='rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700'
                    >
                        Retry
                    </button>
                </main>
            </div>
        );
    }

    return (
        <div className='min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-slate-50'>
            <main className='mx-auto flex min-h-screen max-w-4xl flex-col gap-10 px-4 pb-20 pt-12 sm:px-6 lg:px-8'>
                <header className='flex flex-col gap-4 border-b border-slate-800/50 pb-6'>
                    <div className='flex items-center gap-4'>
                        <Link
                            href='/'
                            className='text-sm font-medium text-slate-400 underline-offset-2 hover:text-slate-200'
                        >
                            ← UQ Grades
                        </Link>
                    </div>
                    <h1 className='text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl'>
                        Analytics
                    </h1>
                </header>

                <div className='flex flex-col gap-8'>
                    <Section
                        title='Scrape (course lookups)'
                        keys={SCRAPE_KEYS}
                        labels={SCRAPE_LABELS}
                        counts={counts ?? {}}
                    />
                    <Section
                        title='Delivery modes'
                        keys={DELIVERY_KEYS}
                        labels={DELIVERY_LABELS}
                        counts={counts ?? {}}
                    />
                    <Section
                        title='Client events'
                        keys={CLIENT_KEYS}
                        labels={CLIENT_LABELS}
                        counts={counts ?? {}}
                    />
                </div>
            </main>
        </div>
    );
}

function AnalyticsLoading() {
    return (
        <div className='min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-slate-50'>
            <main className='mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-4 px-4'>
                <p className='text-slate-400'>Loading analytics…</p>
            </main>
        </div>
    );
}

export default function AnalyticsPage() {
    return (
        <Suspense fallback={<AnalyticsLoading />}>
            <AnalyticsContent />
        </Suspense>
    );
}
