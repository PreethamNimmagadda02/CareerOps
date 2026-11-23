"use client";

import type { ReactNode } from "react";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

import { Page, PageHeader } from "@/components/page";
import { AdviceBadge, FitMeter } from "@/components/status-badge";
import { ADVICE_TEXT } from "@/lib/labels";

/** The rubric every job is checked against, and how much each part counts. */
const FIT_PARTS = [
  { label: "Skills and experience", weight: 35 },
  { label: "Seniority", weight: 20 },
  { label: "Location or remote", weight: 15 },
  { label: "Room to grow", weight: 15 },
  { label: "Industry", weight: 15 },
];

const STEPS = ["I applied", "I heard back", "I have an interview", "I got an offer"];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <Card padding={6}>
        <VStack gap={4}>
          <Heading level={2} id={`${id}-title`}>
            {title}
          </Heading>
          {children}
        </VStack>
      </Card>
    </section>
  );
}

/**
 * Short, task-shaped answers to the questions people actually have: what the
 * dots mean, what our advice means, and how to keep track of a job.
 */
export function HelpView() {
  return (
    <Page width="narrow">
      <PageHeader title="Help" description="Short answers to the questions people ask most." />

      <Section id="fit" title="What the dots and numbers mean">
        <Text>
          Every job gets a number out of 5 for how well it fits you. The five dots show the same
          number, and the words say it plainly.
        </Text>
        <ul className="flex flex-col gap-3">
          {[4.6, 3.7, 3.1, 2.4].map((score) => (
            <li key={score}>
              <FitMeter score={score} />
            </li>
          ))}
        </ul>
        <Text>Five things go into the number. Some count more than others:</Text>
        <ul className="flex flex-col divide-y divide-border">
          {FIT_PARTS.map((p) => (
            <li key={p.label} className="flex min-h-11 items-center justify-between gap-4 py-2">
              <Text>{p.label}</Text>
              <Text color="secondary" hasTabularNumbers>
                Counts for {p.weight}%
              </Text>
            </li>
          ))}
        </ul>
        <Text color="secondary">
          Open &quot;See details&quot; on any job to see how it did on each part.
        </Text>
      </Section>

      <Section id="advice" title="What our advice means">
        <Text>Under each job you haven&apos;t acted on yet, we suggest what to do with it.</Text>
        <ul className="flex flex-col gap-4">
          {Object.entries(ADVICE_TEXT).map(([key, advice]) => (
            <li key={key}>
              <VStack gap={1}>
                <div>
                  <AdviceBadge recommendation={key} />
                </div>
                <Text color="secondary">{advice.hint}</Text>
              </VStack>
            </li>
          ))}
        </ul>
        <Text color="secondary">It&apos;s only advice — you decide what to do with every job.</Text>
      </Section>

      <Section id="status" title="Keeping track of where you are">
        <Text>Each job has one button for your next step. Press it as things happen:</Text>
        <ol className="flex list-decimal flex-col gap-1 ps-6">
          {STEPS.map((s) => (
            <li key={s}>
              <Text>&quot;{s}&quot;</Text>
            </li>
          ))}
        </ol>
        <Text>
          Pressed the wrong one? Press <Text weight="semibold">Undo</Text> straight away, or tap
          where you are with the job (for example &quot;Applied&quot;) and pick the right step.
        </Text>
        <Text>
          Don&apos;t want a job? Open <Text weight="semibold">More options</Text> (the ··· button)
          and choose &quot;Not for me&quot;. It moves out of your list, and you can always find it
          again under &quot;Not for me&quot;.
        </Text>
      </Section>

      <Section id="find" title="Finding new jobs">
        <Text>
          On <Link href="/">My jobs</Link>, press <Text weight="semibold">Find new jobs</Text>. We
          search job sites, then check how well each new job fits you. It takes a few minutes, and
          you can leave the page while we work.
        </Text>
        <Text>
          Not finding enough? In <Link href="/profile#section-matching">My profile</Link>, add more
          cities you&apos;d work in, or allow remote jobs. Then search again.
        </Text>
      </Section>

      <Section id="profile" title="Changing your details">
        <Text>
          Everything we know about you is in <Link href="/profile">My profile</Link>. You can change
          any of it, or upload a newer résumé, at any time. The next search uses your changes.
        </Text>
      </Section>
    </Page>
  );
}
