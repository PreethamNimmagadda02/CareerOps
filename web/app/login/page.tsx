import {
  CheckCircle2,
  FileUp,
  MousePointerClick,
  Radar,
  Sparkles,
  Zap,
} from "lucide-react";

import { enabledProviders } from "@/auth.config";
import { LoginForm } from "@/components/login-form";
import { BRAND, Logo, Wordmark } from "@/components/brand";
import { ScoreBadge, StatusBadge } from "@/components/status-badge";

export const metadata = {
  title: "Sign in",
};

/** Decorative pipeline rows for the product preview — value shown, not told. */
const PREVIEW_ROWS = [
  { company: "Northwind Labs", role: "Senior Software Engineer", score: 4.8, status: "interview" },
  { company: "Acme Cloud", role: "Staff Platform Engineer", score: 4.5, status: "applied" },
  { company: "Lumen AI", role: "Backend Engineer, Infra", score: 4.2, status: "evaluated" },
] as const;

const STEPS = [
  { icon: FileUp, title: "Upload your CV", text: "Your profile fills itself in." },
  { icon: Radar, title: "Scan job boards", text: "Matching roles found for you." },
  { icon: MousePointerClick, title: "Apply to the best", text: "AI scores tell you where to aim." },
] as const;

const CARD_POINTS = [
  "Upload your CV — profile auto-filled",
  "AI scores every role against you",
  "One dashboard, zero spreadsheets",
] as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Ambient backdrop: dot grid + brand light wash */}
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -top-48 left-1/4 h-[28rem] w-[46rem] -translate-x-1/2 rounded-full bg-[hsl(var(--brand-from))] opacity-[0.08] blur-3xl" />
      <div className="pointer-events-none absolute -top-32 right-[-10rem] h-[24rem] w-[40rem] rounded-full bg-[hsl(var(--brand-to))] opacity-[0.10] blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-10 px-4 py-10 sm:px-8 lg:grid lg:grid-cols-[1.15fr_minmax(0,25rem)] lg:items-center lg:gap-16">
        {/* ── Value panel ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-8">
          <div className="animate-fade-in-up space-y-5">
            <Wordmark size="lg" />
            <h1 className="max-w-xl font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              Your next role, <span className="brand-text">found and scored</span> for you.
            </h1>
            <p className="max-w-lg text-base leading-relaxed text-muted-foreground">
              Upload your CV once. CareerOps scans the boards, grades every role
              against your experience, and tracks each application — so you only
              spend time on the jobs worth having.
            </p>
          </div>

          {/* Sign-in card surfaces here on mobile — value above, action immediately after. */}
          <div className="lg:hidden">
            <SignInCard providers={enabledProviders} callbackUrl={callbackUrl || "/"} />
          </div>

          {/* Live product preview — the fastest way to "get it". */}
          <div
            aria-hidden="true"
            className="relative max-w-xl animate-fade-in-up [animation-delay:150ms]"
          >
            {/* Floating "new match" chip */}
            <div className="absolute -top-4 right-2 z-10 animate-float rounded-full border border-border bg-card/90 px-3 py-1.5 shadow-xl backdrop-blur sm:right-6">
              <div className="flex items-center gap-2 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-ctp-green" />
                <span className="font-medium">New match</span>
                <span className="text-muted-foreground">Staff Engineer</span>
                <ScoreBadge score={4.7} />
              </div>
            </div>

            <div className="brand-glow overflow-hidden rounded-2xl border border-border bg-card/80 shadow-2xl backdrop-blur">
              {/* Preview title bar */}
              <div className="flex items-center justify-between border-b border-border/80 px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute h-2 w-2 animate-pulse-dot rounded-full bg-ctp-green" />
                  </span>
                  Your pipeline
                </div>
                <span className="text-xs text-muted-foreground">live</span>
              </div>

              {/* Scanning strip */}
              <div className="border-b border-border/60 px-4 py-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-ctp-sky">
                    <Radar className="h-3.5 w-3.5" /> Scanning Greenhouse · Ashby · Lever
                  </span>
                  <span className="tabular-nums text-muted-foreground">24 matches</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-full animate-shimmer bg-[linear-gradient(90deg,transparent,hsl(var(--brand-from)/0.9),hsl(var(--brand-to)/0.9),transparent)] bg-[length:200%_100%]" />
                </div>
              </div>

              {/* Scored roles */}
              <ul className="divide-y divide-border/60">
                {PREVIEW_ROWS.map((r) => (
                  <li key={r.company} className="flex items-center gap-3 px-4 py-3">
                    <ScoreBadge score={r.score} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.company}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.role}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* How it works — three beats, one glance. */}
          <div className="max-w-xl animate-fade-in-up [animation-delay:300ms]">
            <ol className="grid gap-3 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <li
                  key={title}
                  className="rounded-xl border border-border/70 bg-card/50 p-3.5 backdrop-blur"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="brand-gradient flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="font-display text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p>
                </li>
              ))}
            </ol>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-ctp-yellow" />
              Setup takes about a minute — your CV does most of the work.
            </p>
          </div>
        </section>

        {/* ── Sign-in card (desktop) ──────────────────────────────────── */}
        <section className="hidden lg:block">
          <SignInCard providers={enabledProviders} callbackUrl={callbackUrl || "/"} />
        </section>
      </div>
    </main>
  );
}

function SignInCard({
  providers,
  callbackUrl,
}: {
  providers: { id: string; name: string }[];
  callbackUrl: string;
}) {
  return (
    <div className="brand-glow relative w-full animate-fade-in-up space-y-6 rounded-2xl border border-border bg-card/70 p-7 backdrop-blur [animation-delay:100ms]">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo className="h-11 w-11" />
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold tracking-tight">
            Get started — it&apos;s free
          </h2>
          <p className="text-sm text-muted-foreground">
            One click to sign in. No forms, no credit card.
          </p>
        </div>
      </div>

      <LoginForm providers={providers} callbackUrl={callbackUrl} />

      <ul className="space-y-2">
        {CARD_POINTS.map((point) => (
          <li key={point} className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-ctp-green" />
            {point}
          </li>
        ))}
      </ul>

      <p className="text-center text-xs text-muted-foreground/80">
        {BRAND.tagline}. Your data stays private to you — no spam, ever.
      </p>
    </div>
  );
}
