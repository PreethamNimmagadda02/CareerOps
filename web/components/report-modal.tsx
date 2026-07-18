"use client";

import * as React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink, FileText } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReportPayload } from "@/lib/types";

interface ReportModalProps {
  reportNumber: string | null;
  title?: string;
  onClose: () => void;
}

export function ReportModal({ reportNumber, title, onClose }: ReportModalProps) {
  const [report, setReport] = React.useState<ReportPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
        if (!res.ok) throw new Error(data.error || "Failed to load report");
        if (!cancelled) setReport(data.report);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reportNumber]);

  const subtitle = (
    <div className="flex flex-wrap items-center gap-3">
      {report?.url && (
        <a
          href={report.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-ctp-blue hover:text-ctp-sky"
        >
          View job posting <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {report?.absolutePath && (
        <a
          href={`file://${report.absolutePath}`}
          className="inline-flex items-center gap-1 text-ctp-green hover:text-ctp-sky"
          title={report.absolutePath}
        >
          <FileText className="h-3 w-3" /> Open report file
        </a>
      )}
      {!report?.url && !report?.absolutePath && report?.provider && (
        <span className="text-muted-foreground">{report.provider}</span>
      )}
    </div>
  );

  return (
    <Modal
      open={reportNumber !== null}
      onClose={onClose}
      title={title ?? (report ? `${report.company} — ${report.role}` : "Report")}
      subtitle={subtitle}
      className="max-w-4xl"
    >
      {loading && (
        <div className="space-y-3 py-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-1/2" />
          <div className="pt-2">
            <Skeleton className="h-4 w-1/3" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      )}
      {error && <div className="py-6 text-ctp-red">Error: {error}</div>}
      {report && !loading && (
        <article className="markdown-body">
          <Markdown remarkPlugins={[remarkGfm]}>{report.markdown}</Markdown>
        </article>
      )}
    </Modal>
  );
}
