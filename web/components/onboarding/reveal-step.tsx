"use client";

import * as React from "react";
import { ArrowRight, MapPin, RotateCw } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

import { PageHeader } from "@/components/page";
import { AdviceBadge, FitMeter } from "@/components/status-badge";
import type { Application, OnboardingState } from "@/lib/types";

/** The real, static rubric — what every job is checked on, and how much each part counts. */
const DIMENSIONS = [
  { label: "Skills and experience", weight: 35 },
  { label: "Seniority", weight: 20 },
  { label: "Location or remote", weight: 15 },
  { label: "Room to grow", weight: 15 },
  { label: "Industry", weight: 15 },
];

type BestJob = Pick<
  Application,
  "num" | "role" | "company" | "score" | "recommendation" | "recommendationNote"
>;

/** The highest-scoring job in the list (ties go to the newest, which comes first). */
function pickBest(jobs: BestJob[]): BestJob | null {
  let best: BestJob | null = null;
  for (const j of jobs) {
    if (j.score === null || j.score === undefined) continue;
    if (best === null || j.score > (best.score ?? -1)) best = j;
  }
  return best;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function BestJobCard({ job }: { job: BestJob }) {
  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={1}>
          <Text color="secondary">Your best match</Text>
          <Heading level={2}>{job.role}</Heading>
          <Text>{job.company}</Text>
        </VStack>
        <FitMeter score={job.score} size="lg" />
        {(job.recommendation || job.recommendationNote) && (
          <VStack gap={1}>
            <AdviceBadge recommendation={job.recommendation} />
            {job.recommendationNote && <Text color="secondary">{job.recommendationNote}</Text>}
          </VStack>
        )}
      </VStack>
    </Card>
  );
}

export function RevealStep({
  onboarding,
  telTop,
  onFinish,
  onRescan,
}: {
  onboarding: OnboardingState;
  telTop: number | null;
  /** Mark onboarding finished, then go to `to` (the job list by default). */
  onFinish: (to?: string) => void | Promise<void>;
  onRescan: () => void;
}) {
  const top = onboarding.topScore ?? telTop ?? 0;
  const strong = onboarding.evaluate.strong;

  // The saved jobs, to name the best one. `undefined` = still loading,
  // `null` = couldn't load (we fall back to just the top number).
  const [jobs, setJobs] = React.useState<BestJob[] | null | undefined>(undefined);

  // Fetched here rather than handed down from the scan step: this step can
  // render straight after a reload, with no job feed in memory. 500 = the
  // server's max page size, so the best job is always in the page.
  React.useEffect(() => {
    if (strong === 0) return;
    let stop = false;
    void (async () => {
      try {
        const res = await fetch("/api/applications?limit=500", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!stop) setJobs((data.applications ?? []) as BestJob[]);
      } catch {
        if (!stop) setJobs(null);
      }
    })();
    return () => {
      stop = true;
    };
  }, [strong]);

  // Honest weak-scan branch: setup done, nothing cleared the bar.
  if (strong === 0) {
    const checked = onboarding.scan.count;
    return (
      <VStack gap={6}>
        <PageHeader
          title="No strong matches yet"
          description={`We checked ${checked} ${plural(checked, "job", "jobs")}, but none of them fit you well enough to recommend.`}
        />
        <Text>
          That&apos;s normal on a first search. Widening your search usually helps — for example, adding more
          places you&apos;d work, or saying you&apos;re open to remote jobs. Then search again.
        </Text>
        <HStack gap={3} wrap="wrap" vAlign="center">
          {/* Finishes onboarding first, so "My jobs" no longer sends them back
              here; `from=nomatch` lets the profile page offer to search again
              once they've saved their changes. */}
          <Button
            variant="primary"
            size="lg"
            label="Add more cities or allow remote jobs"
            icon={<Icon icon={MapPin} />}
            clickAction={() => onFinish("/profile?from=nomatch#section-matching")}
            // Long label: wrap on a narrow phone rather than cut it off.
            className="h-auto min-h-14 w-full whitespace-normal py-2 sm:w-auto"
          />
          <Button label="Go to my jobs" clickAction={() => onFinish("/")} />
          <Button
            variant="secondary"
            label="Search again"
            icon={<Icon icon={RotateCw} />}
            onClick={onRescan}
          />
        </HStack>
      </VStack>
    );
  }

  const best = jobs ? pickBest(jobs) : null;

  // "N more" under the best job counts the same thing the heading does
  // (`strong` — jobs that cleared the bar), so the two numbers always agree.
  const others = strong - 1;
  const more =
    jobs !== undefined && others > 0
      ? `${others} more good ${plural(others, "match is", "matches are")} waiting in your job list.`
      : null;

  return (
    <VStack gap={6}>
      <PageHeader
        title={`We found ${strong} ${plural(strong, "job", "jobs")} that fit you`}
        description="Here's the one that fits you best."
      />

      {jobs === undefined ? (
        <Card>
          <VStack gap={3} aria-busy="true" aria-label="Loading your best match">
            <Skeleton index={0} height={20} width="40%" />
            <Skeleton index={1} height={32} width="75%" />
            <Skeleton index={2} height={20} width="50%" />
            <Skeleton index={3} height={28} width="60%" />
          </VStack>
        </Card>
      ) : best ? (
        <BestJobCard job={best} />
      ) : (
        <Card>
          <VStack gap={2}>
            <Text color="secondary">Your best match</Text>
            <FitMeter score={top} size="lg" />
          </VStack>
        </Card>
      )}

      {more && <Text>{more}</Text>}

      {jobs !== undefined && (
        <HStack gap={3} wrap="wrap" vAlign="center">
          {best ? (
            <>
              <Button
                variant="primary"
                size="lg"
                label="See this job"
                endContent={<Icon icon={ArrowRight} />}
                clickAction={() => onFinish(`/?job=${encodeURIComponent(best.num)}`)}
              />
              <Button size="lg" label="See all my jobs" clickAction={() => onFinish("/")} />
            </>
          ) : (
            <Button
              variant="primary"
              size="lg"
              label="See my jobs"
              endContent={<Icon icon={ArrowRight} />}
              clickAction={() => onFinish("/")}
            />
          )}
        </HStack>
      )}

      {/* The whole row is the button: full width and at least 56px tall. */}
      <Collapsible
        defaultIsOpen={false}
        className="border-y border-border"
        trigger={
          <HStack vAlign="center" className="min-h-14">
            <Text weight="semibold">How we check how well a job fits</Text>
          </HStack>
        }
      >
        <VStack gap={2} paddingBlockEnd={4}>
          <Text color="secondary">
            Every job gets a number out of 5 — the higher it is, the better the job fits you. Five things go into
            it, and some count more than others:
          </Text>
          <List hasDividers>
            {DIMENSIONS.map((d) => (
              <ListItem
                key={d.label}
                label={d.label}
                endContent={<Text hasTabularNumbers>Counts for {d.weight}%</Text>}
              />
            ))}
          </List>
        </VStack>
      </Collapsible>
    </VStack>
  );
}
