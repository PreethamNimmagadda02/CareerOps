"use client";

import * as React from "react";
import Link from "next/link";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider, useTheme } from "next-themes";
import { Theme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";

import { themes, defaultThemeSlug } from "../astryx-themes";
import { ToastProvider } from "@/components/ui/toast";
import { PipelineProvider } from "@/components/pipeline-provider";

/**
 * Bridges next-themes (persisted choice + no-flash script, writing
 * `data-theme` on <html>) to the Astryx root <Theme>, which reads the same
 * attribute to switch every token between light and dark.
 */
function AstryxTheme({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  // The server can't know the stored choice, so render "system" until mounted
  // (keeps hydration identical). A layout effect flips it before first paint,
  // and next-themes' inline script has already set <html data-theme>, so an
  // explicit light/dark choice never flashes.
  const [mounted, setMounted] = React.useState(false);
  React.useLayoutEffect(() => setMounted(true), []);
  const mode = mounted && (theme === "light" || theme === "dark") ? theme : "system";
  return (
    <Theme theme={themes[defaultThemeSlug]} mode={mode}>
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AstryxTheme>
        <SessionProvider>
          <ToastProvider>
            <PipelineProvider>{children}</PipelineProvider>
          </ToastProvider>
        </SessionProvider>
      </AstryxTheme>
    </ThemeProvider>
  );
}
