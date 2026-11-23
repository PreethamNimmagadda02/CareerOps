import type { Metadata, Viewport } from "next";

// Order matters: the cascade-layer declaration must load before any other CSS.
import "./layers.css";
import "./globals.css";

import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "CareerOps — Find jobs that fit you",
    template: "%s · CareerOps",
  },
  description:
    "Upload your résumé once. CareerOps finds open jobs, tells you how well each one fits, and keeps track of every application in one place.",
  applicationName: "CareerOps",
  keywords: ["job search", "career", "applications", "résumé", "job tracker"],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
