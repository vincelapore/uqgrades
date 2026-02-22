import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
    display: "swap",
});

export const metadata: Metadata = {
    title: "UQ Grades | Track Your Semester Progress",
    description:
        "Track your UQ semester progress, calculate grades, and see what you need to hit your target (7 or 4). Add courses, enter marks, export calendars.",
    metadataBase: new URL(
        process.env.NEXT_PUBLIC_APP_URL ?? "https://uqgrades.com"
    ),
    openGraph: {
        title: "UQ Grades | Track Your Semester Progress",
        description:
            "Track your UQ semester progress, calculate grades, and see what you need to hit your target.",
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: "#0f172a",
};

export default function RootLayout({
    children
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang='en'>
            <body className={`${inter.variable} font-sans antialiased`}>
                {children}
            </body>
        </html>
    );
}
