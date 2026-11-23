"use client";

import * as React from "react";
import { ChevronRight, Download, Ellipsis, FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

import { FriendlyError, friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { RESUME_ANCHOR } from "./completeness";
import type { CvData, ProfileData } from "./types";

const ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** Mirrors the server limit (RESUME_MAX_BYTES in lib/storage.ts). */
const MAX_BYTES = 8 * 1024 * 1024;

function fmt(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * The stored file's name as people read it. The original file name isn't
 * kept (the server stores every upload as `resume.<ext>`), so say what it is.
 */
function resumeName(resumeKey: string): string {
  const ext = resumeKey.split(".").pop()?.toLowerCase();
  return ext === "doc" || ext === "docx" ? "Your résumé (Word file)" : "Your résumé (PDF)";
}

/**
 * Downloads the stored résumé through a plain, throwaway anchor. The app's
 * link provider routes `href`s through Next.js client navigation, which an API
 * file download must skip; the route answers with
 * `Content-Disposition: attachment`.
 */
function downloadResume() {
  const a = document.createElement("a");
  a.href = "/api/profile/resume";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

type Problem = { title: string; message: string };

export function ResumeCard({
  resumeKey,
  resumeUpdatedAt,
  onUploaded,
  onExtracted,
  className,
}: {
  resumeKey: string | null;
  resumeUpdatedAt: string | null;
  onUploaded: (key: string, updatedAt: string) => void;
  onExtracted: (profile: ProfileData | null, cv: CvData | null) => void;
  className?: string;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [extracting, setExtracting] = React.useState(false);
  const [error, setError] = React.useState<Problem | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isReplacing, setIsReplacing] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const fileHintId = React.useId();

  async function runExtract() {
    setExtracting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/profile/resume/extract", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      onExtracted((data.profile ?? null) as ProfileData | null, (data.cv ?? null) as CvData | null);
      setNotice("We filled in your profile from your résumé. Check each section and change anything that isn't right.");
    } catch (err) {
      setNotice(null);
      setError({ title: "We couldn't read your résumé", message: friendlyError(err) });
    } finally {
      setExtracting(false);
    }
  }

  async function handleFile(f: File) {
    setError(null);
    setNotice(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/profile/resume", { method: "POST", body: form });
      const data = await res.json();
      // A 400 means the file itself can't be used (wrong kind, too big).
      if (res.status === 400) throw new FriendlyError("That file can't be used. Choose a PDF or Word file up to 8 MB.");
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onUploaded(data.resumeKey as string, data.resumeUpdatedAt as string);
      setIsReplacing(false);
      // Auto-extract right after a successful upload.
      void runExtract();
    } catch (err) {
      setError({ title: "We couldn't upload your résumé", message: friendlyError(err) });
    } finally {
      setUploading(false);
      setFile(null);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/profile/resume", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      onUploaded("", "");
      setIsReplacing(false);
    } catch (err) {
      setError({ title: "We couldn't remove your résumé", message: friendlyError(err) });
    } finally {
      setDeleting(false);
      setConfirmRemove(false);
    }
  }

  const busy = uploading || extracting || deleting;
  const showUpload = !resumeKey || isReplacing;
  const uploadedOn = fmt(resumeUpdatedAt);

  return (
    <Card id={RESUME_ANCHOR} className={cn("scroll-mt-24", className)}>
      <VStack gap={4}>
        {/* Phones with a file uploaded: the one-row summary below stands in for this. */}
        <VStack gap={1} className={resumeKey ? "hidden md:flex" : undefined}>
          <Heading level={2}>Your résumé</Heading>
          <Text color="secondary" textWrap="pretty">
            {resumeKey
              ? "We use it to fill in your profile and to see how well each job fits you."
              : "Upload your résumé and we'll fill in your profile from it. You can change anything afterwards."}
          </Text>
        </VStack>

        {error ? (
          <Banner
            status="error"
            title={error.title}
            description={error.message}
            isDismissable
            onDismiss={() => setError(null)}
          />
        ) : null}

        {extracting ? (
          <HStack gap={2} vAlign="center" role="status">
            <Spinner size="md" aria-hidden />
            <Text>Reading your résumé…</Text>
          </HStack>
        ) : null}

        {notice && !extracting ? (
          <Banner status="success" title={notice} isDismissable onDismiss={() => setNotice(null)} />
        ) : null}

        {resumeKey ? (
          <>
            {/* Phones: one row, so the profile sections stay in view. "Change"
                holds everything the wider layout shows as buttons. */}
            <HStack gap={3} vAlign="center" className="min-h-11 min-w-0 md:hidden">
              <Icon icon={FileText} color="secondary" />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <Text weight="semibold">{resumeName(resumeKey)}</Text>
                {uploadedOn ? <Text color="secondary">{` · Uploaded ${uploadedOn}`}</Text> : null}
              </span>
              <DropdownMenu
                button={{
                  label: "Change",
                  endContent: <Icon icon={ChevronRight} />,
                  variant: "secondary",
                  isDisabled: busy,
                }}
                alignment="end"
                items={[
                  {
                    id: "replace",
                    label: "Replace with a new file",
                    icon: <Icon icon={Upload} />,
                    onClick: () => setIsReplacing(true),
                    isDisabled: isReplacing,
                  },
                  {
                    id: "fill",
                    label: "Fill empty fields from my résumé",
                    icon: <Icon icon={RefreshCw} />,
                    onClick: () => void runExtract(),
                  },
                  { id: "download", label: "Download", icon: <Icon icon={Download} />, onClick: downloadResume },
                  {
                    id: "remove",
                    label: "Remove",
                    icon: <Icon icon={Trash2} />,
                    variant: "destructive",
                    onClick: () => setConfirmRemove(true),
                  },
                ]}
              />
            </HStack>

            <VStack gap={4} className="hidden md:flex">
              <HStack gap={3} vAlign="center" className="min-w-0">
                <Icon icon={FileText} size="lg" color="secondary" />
                <VStack gap={0.5} className="min-w-0">
                  <Text weight="semibold">{resumeName(resumeKey)}</Text>
                  {uploadedOn ? <Text color="secondary">Uploaded {uploadedOn}</Text> : null}
                </VStack>
              </HStack>
              {/* Three choices at most: the two common actions, then "More". */}
              <HStack gap={3} wrap="wrap">
                <Button
                  label="Replace"
                  icon={<Icon icon={Upload} />}
                  onClick={() => setIsReplacing(true)}
                  isDisabled={busy || isReplacing}
                />
                {/* The server only fills fields that are still empty — it never
                    overwrites what's already in the profile. */}
                <Button
                  label="Fill empty fields from my résumé"
                  icon={<Icon icon={RefreshCw} />}
                  onClick={() => void runExtract()}
                  isLoading={extracting}
                  isDisabled={uploading || deleting}
                />
                <DropdownMenu
                  button={{ label: "More", icon: <Icon icon={Ellipsis} />, variant: "secondary" }}
                  alignment="end"
                  items={[
                    { id: "download", label: "Download", icon: <Icon icon={Download} />, onClick: downloadResume },
                    {
                      id: "remove",
                      label: "Remove",
                      icon: <Icon icon={Trash2} />,
                      variant: "destructive",
                      onClick: () => setConfirmRemove(true),
                      isDisabled: busy,
                    },
                  ]}
                />
              </HStack>
            </VStack>
          </>
        ) : null}

        {showUpload ? (
          <VStack gap={3}>
            <FileInput
              label={resumeKey ? "Choose a new résumé file" : "Choose your résumé file"}
              // FileInput's own `description` renders below our 16px floor;
              // the hint is the Text right under it.
              aria-describedby={fileHintId}
              mode="dropzone"
              placeholder="Drag your file here, or click to choose one"
              accept={ACCEPT}
              maxSize={MAX_BYTES}
              value={file}
              isLoading={uploading}
              isDisabled={deleting}
              onChange={(next) => {
                const f = Array.isArray(next) ? (next[0] ?? null) : next;
                setFile(f);
                if (f) void handleFile(f);
              }}
            />
            <Text id={fileHintId} color="secondary">
              PDF or Word file, up to 8 MB.
            </Text>
            {isReplacing && resumeKey ? (
              <HStack>
                <Button
                  variant="ghost"
                  label="Keep my current file"
                  onClick={() => setIsReplacing(false)}
                  isDisabled={uploading}
                />
              </HStack>
            ) : null}
          </VStack>
        ) : null}
      </VStack>

      <AlertDialog
        isOpen={confirmRemove}
        onOpenChange={(open) => {
          if (!deleting) setConfirmRemove(open);
        }}
        title="Remove your résumé?"
        description="This deletes the file you uploaded. The details already in your profile stay as they are."
        actionLabel="Remove résumé"
        onAction={() => void handleDelete()}
        isActionLoading={deleting}
      />
    </Card>
  );
}
