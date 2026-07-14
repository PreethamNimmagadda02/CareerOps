"use client";

import * as React from "react";
import { Radar, Sparkles } from "lucide-react";

import { ScoreBadge, StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

/**
 * The landing page's live product demo — a self-running "pipeline" that scans,
 * reveals scored roles one by one (scores counting up), and reacts to the
 * pointer with a subtle tilt. Purely decorative (aria-hidden) and fully
 * reduced-motion aware: motion-sensitive visitors get the same information as a
 * calm, static board.
 */

type Role = { company: string; role: string; score: number; status: string };

const POOL: Role[] = [
  { company: "Northwind Labs", role: "Senior Software Engineer", score: 4.8, status: "interview" },
  { company: "Acme Cloud", role: "Staff Platform Engineer", score: 4.5, status: "applied" },
  { company: "Lumen AI", role: "Backend Engineer, Infra", score: 4.2, status: "evaluated" },
  { company: "Vertex Systems", role: "Distributed Systems Engineer", score: 4.6, status: "applied" },
  { company: "Orbit Data", role: "Senior Backend Engineer", score: 4.3, status: "evaluated" },
  { company: "Helix Robotics", role: "Platform Engineer", score: 4.1, status: "interview" },
  { company: "Nimbus", role: "Staff Software Engineer", score: 4.7, status: "applied" },
  { company: "Cobalt", role: "Cloud Infrastructure Engineer", score: 4.4, status: "evaluated" },
];

const BOARDS = ["Greenhouse", "Ashby", "Lever", "Workday"];
const VISIBLE = 4;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(m.matches);
    on();
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

function useCountUp(target: number, run: boolean, duration = 700): number {
  const [v, setV] = React.useState(run ? 0 : target);
  React.useEffect(() => {
    if (!run) {
      setV(target);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / duration);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setV(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, duration]);
  return v;
}

function PreviewRow({ role, revealed, animate }: { role: Role; revealed: boolean; animate: boolean }) {
  const score = useCountUp(role.score, revealed && animate);
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-all duration-500 ease-out hover:bg-accent/40",
        revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <ScoreBadge score={revealed ? Number(score.toFixed(1)) : null} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{role.company}</p>
        <p className="truncate text-xs text-muted-foreground">{role.role}</p>
      </div>
      <StatusBadge status={role.status} />
    </li>
  );
}

export function LandingPreview() {
  const reduced = usePrefersReducedMotion();
  const [cycle, setCycle] = React.useState(0);
  const [revealed, setRevealed] = React.useState(0);
  const [board, setBoard] = React.useState(0);
  const [chip, setChip] = React.useState(0);
  const [tilt, setTilt] = React.useState({ rx: 0, ry: 0 });

  // Reveal rows one at a time, pause on a full board, then re-run with a fresh set.
  React.useEffect(() => {
    if (reduced) {
      setRevealed(VISIBLE);
      return;
    }
    const t =
      revealed < VISIBLE
        ? setTimeout(() => setRevealed((r) => r + 1), 850)
        : setTimeout(() => {
            setRevealed(0);
            setCycle((c) => c + 1);
          }, 2600);
    return () => clearTimeout(t);
  }, [revealed, reduced]);

  // Rotate the "scanning" board name and the floating "new match" chip.
  React.useEffect(() => {
    if (reduced) return;
    const b = setInterval(() => setBoard((x) => (x + 1) % BOARDS.length), 1500);
    const c = setInterval(() => setChip((x) => (x + 1) % POOL.length), 2400);
    return () => {
      clearInterval(b);
      clearInterval(c);
    };
  }, [reduced]);

  const rows = Array.from({ length: VISIBLE }, (_, i) => POOL[(cycle * VISIBLE + i) % POOL.length]);
  const matches = 18 + cycle * 3 + revealed;
  const chipRole = POOL[chip];
  const resting = tilt.rx === 0 && tilt.ry === 0;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ rx: -py * 6, ry: px * 6 });
  };

  return (
    <div aria-hidden="true" className="relative max-w-xl" style={{ perspective: "1200px" }}>
      {/* Floating "new match" chip — rotates through the pool. */}
      <div className="absolute -top-4 right-2 z-10 animate-float rounded-full border border-border bg-card/90 px-3 py-1.5 shadow-xl backdrop-blur sm:right-6">
        <div className="flex items-center gap-2 text-xs">
          <Sparkles className="h-3.5 w-3.5 text-ctp-green" />
          <span className="font-medium">New match</span>
          <span className="hidden max-w-[8rem] truncate text-muted-foreground sm:inline">
            {chipRole.role}
          </span>
          <ScoreBadge score={chipRole.score} />
        </div>
      </div>

      <div
        onMouseMove={onMove}
        onMouseLeave={() => setTilt({ rx: 0, ry: 0 })}
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transition: resting ? "transform 0.5s ease-out" : "transform 0.08s linear",
          transformStyle: "preserve-3d",
        }}
        className="brand-glow overflow-hidden rounded-2xl border border-border bg-card/80 shadow-2xl backdrop-blur"
      >
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-border/80 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="relative flex h-2 w-2">
              <span className="absolute h-2 w-2 animate-pulse-dot rounded-full bg-ctp-green" />
              <span className="relative h-2 w-2 rounded-full bg-ctp-green" />
            </span>
            Your pipeline
          </div>
          <span className="text-xs text-muted-foreground">live</span>
        </div>

        {/* Scanning strip */}
        <div className="border-b border-border/60 px-4 py-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-ctp-sky">
              <Radar className="h-3.5 w-3.5" />
              Scanning{" "}
              <span key={board} className="inline-block min-w-[5.5rem] animate-fade-in font-medium">
                {BOARDS[board]}…
              </span>
            </span>
            <span className="tabular-nums text-muted-foreground">{matches} matches</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-full animate-shimmer bg-[linear-gradient(90deg,transparent,hsl(var(--brand-from)/0.9),hsl(var(--brand-to)/0.9),transparent)] bg-[length:200%_100%]" />
          </div>
        </div>

        {/* Scored roles */}
        <ul className="divide-y divide-border/60">
          {rows.map((r, i) => (
            <PreviewRow key={`${cycle}-${i}`} role={r} revealed={i < revealed} animate={!reduced} />
          ))}
        </ul>
      </div>
    </div>
  );
}
