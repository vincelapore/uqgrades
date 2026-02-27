import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "UQ Grades | Track Your Semester Progress",
    description:
        "Track your UQ semester progress, calculate grades, and see what you need to hit your target (7 or 4). Add courses, enter marks, export calendars.",
    openGraph: {
        title: "UQ Grades | Track Your Semester Progress",
        description:
            "Track your UQ semester progress, calculate grades, and see what you need to hit your target.",
    },
};

export default function UQLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return children;
}
