import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { Providers } from "@/components/providers";
import "./globals.css";

/** Brand body face — humanist, highly legible at data-dense sizes. */
const dmSans = localFont({
  src: "./fonts/dm-sans-latin.woff2",
  weight: "100 1000",
  display: "swap",
  variable: "--font-sans",
});

/** Brand display face — geometric, used for the wordmark and headings. */
const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin.woff2",
  weight: "300 700",
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: {
    default: "CareerOps — The modern way to land your next role",
    template: "%s · CareerOps",
  },
  description:
    "CareerOps is the modern solution for job hunting and career building — it discovers roles that fit you, scores every match against your CV with AI, and tracks your whole pipeline in one command center.",
  applicationName: "CareerOps",
  keywords: ["job search", "career", "applications", "CV", "AI", "job tracker"],
};

export const viewport: Viewport = {
  themeColor: "#0b1417",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
