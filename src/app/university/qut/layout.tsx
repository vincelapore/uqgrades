import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "QUT Grades | Track Your Semester Progress",
    description:
        "Track your QUT semester progress, calculate grades, and see what you need to hit your target (7 or 4). Add units, enter marks, export calendars.",
    openGraph: {
        title: "QUT Grades | Track Your Semester Progress",
        description:
            "Track your QUT semester progress, calculate grades, and see what you need to hit your target.",
    },
};

export default function QUTLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return children;
}
