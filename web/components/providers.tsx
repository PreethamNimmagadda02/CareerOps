"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";

import { ToastProvider } from "@/components/ui/toast";
import { PipelineProvider } from "@/components/pipeline-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionProvider>
        <ToastProvider>
          <PipelineProvider>{children}</PipelineProvider>
        </ToastProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
