"use client";

import * as React from "react";
import { ChevronRight, Circle, CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

import { cn } from "@/lib/utils";
import { SECTION_NAV, type ChecklistItem, type SectionState } from "./completeness";

/** What the section list shows beside a section: where it stands, or that it has changes not saved yet. */
export type SectionMarker = SectionState | "unsaved";

/**
 * Where a section stands, as color + icon + word. The emphasis goes to what
 * still needs the person ("Needed", "Unsaved changes": a pale warning pill);
 * "Done" and "Optional" stay quiet. Every marker starts on the same left edge.
 */
export function SectionStatus({ state }: { state: SectionMarker }) {
  if (state === "needed" || state === "unsaved") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-warning/15 px-2 py-0.5">
        <Icon icon={state === "unsaved" ? TriangleAlert : CircleAlert} size="sm" color="warning" />
        <Text weight="semibold">{state === "unsaved" ? "Unsaved changes" : "Needed"}</Text>
      </span>
    );
  }
  if (state === "done") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <Icon icon={CircleCheck} size="sm" color="accent" />
        <Text color="secondary">Done</Text>
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <Icon icon={Circle} size="sm" color="secondary" />
      <Text color="secondary">Optional</Text>
    </span>
  );
}

/**
 * The profile's sections as a list of rows, each with its status under its name.
 *
 * - On phones it is its own screen: tall rows (56px+), each opening that
 *   section; the section then shows an "All sections" button to come back.
 *   No row looks selected there, since no section is open beside it.
 * - From `md` up it sits in a left column beside the open section. The open
 *   one is marked by bold accent-colored text and an arrow, not by a fill alone.
 */
export function SectionList({
  active,
  states,
  onSelect,
  className,
}: {
  active: string;
  states: Record<string, SectionMarker>;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <nav aria-label="Profile sections" className={cn("md:sticky md:top-24 md:self-start", className)}>
      <VStack gap={3}>
        <Text color="secondary" className="md:hidden">
          Choose a section to see or change it.
        </Text>
        {/* 12px between rows so neighbouring targets never touch. */}
        <ul className="flex flex-col gap-3">
          {SECTION_NAV.map((s) => {
            const isActive = active === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  aria-current={isActive ? "true" : undefined}
                  data-section-row={s.id}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted",
                    "md:min-h-11 md:border-transparent md:bg-transparent md:px-3 md:py-2",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    isActive && "md:bg-muted",
                  )}
                >
                  {/* Name, then status under it, so every status starts on the same edge. */}
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <Text weight="medium" color="inherit" className={cn(isActive && "md:font-bold md:text-primary")}>
                      {s.label}
                    </Text>
                    <SectionStatus state={states[s.id] ?? "optional"} />
                  </span>
                  {/* Phones: every row opens a screen, so every row gets the
                      same quiet arrow. Wider screens: only the open section has one. */}
                  <span
                    aria-hidden="true"
                    className={cn("shrink-0 text-muted-foreground", isActive ? "md:text-primary" : "md:invisible")}
                  >
                    <Icon icon={ChevronRight} color="inherit" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </VStack>
    </nav>
  );
}

/** Progress bar plus the missing items, each a button that jumps to where it's fixed. */
export function CompletenessCard({
  checklist,
  onGo,
}: {
  checklist: ChecklistItem[];
  onGo: (id: string) => void;
}) {
  const doneCount = checklist.filter((i) => i.done).length;
  const pct = Math.round((doneCount / checklist.length) * 100);
  const missing = checklist.filter((i) => !i.done);
  return (
    <Card variant="muted">
      <VStack gap={4}>
        <ProgressBar label={`Your profile is ${pct}% complete`} value={pct} />
        {missing.length > 0 ? (
          <VStack gap={3}>
            <Text color="secondary">Still to do</Text>
            <HStack gap={3} wrap="wrap">
              {missing.map((i, idx) => (
                <Button key={`${i.id}-${idx}`} label={i.label} onClick={() => onGo(i.id)} />
              ))}
            </HStack>
          </VStack>
        ) : null}
      </VStack>
    </Card>
  );
}
