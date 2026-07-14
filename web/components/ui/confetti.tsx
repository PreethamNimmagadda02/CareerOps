"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * A lightweight, dependency-free confetti burst for peak-end celebration
 * moments (the onboarding reveal, a new personal-best match). Renders a fixed,
 * pointer-transparent overlay of brand-tinted shards that fall once and clean
 * themselves up.
 *
 * Respects `prefers-reduced-motion`: motion-sensitive users get a single, calm
 * fade instead of a shower — the moment is still marked, never jarring.
 */

const COLORS = [
  "hsl(var(--brand-from))",
  "hsl(var(--brand-to))",
  "hsl(var(--primary))",
  "hsl(var(--ctp-yellow))",
  "hsl(var(--ctp-mauve))",
  "hsl(var(--ctp-sky))",
];

interface Shard {
  id: number;
  left: number; // vw origin
  cx: string; // horizontal drift
  cy: string; // vertical fall
  cr: string; // rotation
  delay: string;
  duration: string;
  size: number;
  color: string;
  round: boolean;
}

function makeShards(count: number): Shard[] {
  return Array.from({ length: count }, (_, i) => {
    const drift = (Math.random() - 0.5) * 60; // vw
    const fall = 70 + Math.random() * 35; // vh
    const rot = 360 + Math.random() * 720;
    return {
      id: i,
      left: Math.random() * 100,
      cx: `${drift}vw`,
      cy: `${fall}vh`,
      cr: `${rot}deg`,
      delay: `${Math.random() * 0.25}s`,
      duration: `${2.2 + Math.random() * 1.4}s`,
      size: 6 + Math.random() * 7,
      color: COLORS[i % COLORS.length],
      round: Math.random() > 0.55,
    };
  });
}

export function Confetti({
  fire,
  count = 90,
  onDone,
}: {
  /** Flip to true to launch a burst. Re-arm by toggling back to false first. */
  fire: boolean;
  count?: number;
  onDone?: () => void;
}) {
  const [shards, setShards] = React.useState<Shard[] | null>(null);
  const [reduced, setReduced] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
  }, []);

  React.useEffect(() => {
    if (!fire) return;
    if (reduced) {
      const t = setTimeout(() => onDone?.(), 600);
      return () => clearTimeout(t);
    }
    setShards(makeShards(count));
    const t = setTimeout(() => {
      setShards(null);
      onDone?.();
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fire, reduced, count]);

  if (!fire || !mounted) return null;

  // Reduced-motion: a single soft radial glow that fades — the "moment" without motion.
  const content = reduced ? (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] animate-fade-in"
      style={{
        background:
          "radial-gradient(ellipse 60% 40% at 50% 30%, hsl(var(--brand-to)/0.18), transparent 70%)",
      }}
    />
  ) : shards ? (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {shards.map((s) => (
        <span
          key={s.id}
          className="absolute top-0 animate-confetti-fall will-change-transform"
          style={
            {
              left: `${s.left}vw`,
              width: s.size,
              height: s.round ? s.size : s.size * 0.4,
              backgroundColor: s.color,
              borderRadius: s.round ? "9999px" : "1px",
              animationDelay: s.delay,
              animationDuration: s.duration,
              "--cx": s.cx,
              "--cy": s.cy,
              "--cr": s.cr,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  ) : null;

  if (!content) return null;
  // Portal to <body> so a transformed/overflow-hidden ancestor (e.g. a card
  // mid fade-in) can never clip or re-anchor the full-viewport burst.
  return createPortal(content, document.body);
}
