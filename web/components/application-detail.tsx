import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

import { GapQuest } from "@/components/gap-quest";
import { ADVICE_TEXT } from "@/lib/labels";
import type { Application, ScoreDimensionView } from "@/lib/types";

function barVariant(score: number): "success" | "warning" | "neutral" {
  if (score >= 4) return "success";
  if (score >= 3) return "warning";
  return "neutral";
}

/** The five factors behind the overall rating, each with its score in words. */
function ScoreBreakdown({ dimensions }: { dimensions: ScoreDimensionView[] }) {
  return (
    <VStack gap={4}>
      <VStack gap={0.5}>
        <Heading level={4}>How well each part fits</Heading>
        <Text color="secondary">Each part counts for a share of the overall fit.</Text>
        {/* Its own line, with a full-size tap area. */}
        <Link
          href="/help#fit"
          isStandalone
          className="inline-flex min-h-11 items-center self-start"
        >
          What do the dots and numbers mean?
        </Link>
      </VStack>
      {dimensions.map((d) => (
        <VStack key={d.key} gap={1}>
          <ProgressBar
            label={`${d.label} (counts for ${Math.round(d.weight * 100)}%)`}
            value={d.score}
            max={5}
            hasValueLabel
            // Non-breaking spaces: "5 out of 5" never wraps word by word.
            formatValueLabel={(v) => `${v}\u00a0out\u00a0of\u00a05`}
            variant={barVariant(d.score)}
          />
          {d.reason ? <Text color="secondary">{d.reason}</Text> : null}
        </VStack>
      ))}
    </VStack>
  );
}

/**
 * Everything the rating learned about a job — advice, a short summary,
 * missing requirements, the factor breakdown and job facts — without opening
 * the full report.
 */
export function ApplicationInsights({ app }: { app: Application }) {
  const hasDims = (app.dimensions?.length ?? 0) > 0;
  const hasGaps = (app.gaps?.length ?? 0) > 0;
  const hasFacts = Boolean(app.archetype || app.remote || app.comp);
  const hasAnything = hasDims || hasGaps || app.tldr || app.recommendation || hasFacts;

  if (!hasAnything) {
    return (
      <Text color="secondary">
        There&apos;s no summary for this job yet. Open the full report to read the whole assessment.
      </Text>
    );
  }

  const advice = app.recommendation ? ADVICE_TEXT[app.recommendation] : undefined;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <VStack gap={6} className="min-w-0">
        {/* The row already shows "Our advice: …" — here we say why. */}
        {(app.recommendationNote || advice || app.tldr) && (
          <VStack gap={2}>
            <Heading level={4}>Why we suggest this</Heading>
            {(app.recommendationNote || advice) && (
              <Text>{app.recommendationNote || advice?.hint}</Text>
            )}
            {app.tldr && <Text color="secondary">{app.tldr}</Text>}
          </VStack>
        )}

        {hasFacts && (
          <MetadataList
            title={<Heading level={4}>About the job</Heading>}
            label={{ position: "top" }}
          >
            {app.archetype ? (
              <MetadataListItem label="Type of role">{app.archetype}</MetadataListItem>
            ) : null}
            {app.remote ? (
              <MetadataListItem label="Where you'd work">{app.remote}</MetadataListItem>
            ) : null}
            {app.comp ? <MetadataListItem label="Pay">{app.comp}</MetadataListItem> : null}
          </MetadataList>
        )}

        {hasGaps && <GapQuest gaps={app.gaps!} />}
      </VStack>

      {hasDims && (
        <div className="min-w-0">
          <ScoreBreakdown dimensions={app.dimensions!} />
        </div>
      )}
    </div>
  );
}
