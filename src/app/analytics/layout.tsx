import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics | UQ Grades",
};

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
