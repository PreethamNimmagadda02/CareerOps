"use client";

import * as React from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/VStack";

import { AdviceBadge, FitMeter } from "@/components/status-badge";
import { friendlyError } from "@/lib/errors";
import type { ReportPayload } from "@/lib/types";

/** The job whose write-up is open, with what the header shows about it. */
export interface ReportTarget {
  reportNumber: string;
  title: string;
  score: number | null;
  recommendation: string | null;
  jobUrl: string | null;
}

interface ReportModalProps {
  target: ReportTarget | null;
  onClose: () => void;
}

/** The dialog header already names the job, so drop a leading "# Title" line. */
function withoutLeadingTitle(markdown: string): string {
  return markdown.replace(/^\s*#\s[^\n]*\n+/, "");
}

/** The full written assessment of one job, in a readable dialog. */
export function ReportModal({ target, onClose }: ReportModalProps) {
  const reportNumber = target?.reportNumber ?? null;
  const [report, setReport] = React.useState<ReportPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!reportNumber) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/reports/${reportNumber}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!cancelled) setReport(data.report);
      })
      .catch((err) => !cancelled && setError(friendlyError(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reportNumber, attempt]);

  const heading = target?.title ?? (report ? `${report.role} at ${report.company}` : "Full write-up");
  const jobUrl = report?.url ?? target?.jobUrl ?? null;

  return (
    <Dialog
      isOpen={reportNumber !== null}
      onOpenChange={(open) => !open && onClose()}
      width="min(880px, calc(100vw - 2rem))"
      maxHeight="88dvh"
    >
      <DialogHeader
        title={heading}
        // How well it fits and our advice, in the same words as the job list —
        // so the person doesn't have to find a score inside the report text.
        subtitle={
          <VStack gap={2} className="pt-1">
            {target && (
              <HStack gap={3} wrap="wrap" vAlign="center">
                <FitMeter score={target.score} />
                <AdviceBadge recommendation={target.recommendation} />
              </HStack>
            )}
            {jobUrl && (
              <Link href={jobUrl} isExternalLink>
                Open the job post
              </Link>
            )}
          </VStack>
        }
        onOpenChange={(open) => !open && onClose()}
      />
      <VStack gap={4} padding={6}>
        {loading && (
          <VStack gap={3}>
            <Skeleton height={24} width="60%" />
            <Skeleton height={16} />
            <Skeleton height={16} />
            <Skeleton height={16} width="80%" />
          </VStack>
        )}
        {error && (
          <Banner
            status="error"
            title="We couldn't open this write-up"
            description={error}
            collapsible={false}
            endContent={
              <Button label="Try again" variant="secondary" onClick={() => setAttempt((n) => n + 1)} />
            }
          />
        )}
        {report && !loading && (
          <Markdown headingLevelStart={2} contentWidth="100%">
            {withoutLeadingTitle(report.markdown)}
          </Markdown>
        )}
      </VStack>
    </Dialog>
  );
}
