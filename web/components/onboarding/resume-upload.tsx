"use client";

import * as React from "react";
import { CircleAlert, FileUp } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

import { cn } from "@/lib/utils";

/** The file types the résumé reader understands. */
const ACCEPT = ".pdf,.doc,.docx";

function isAccepted(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPT.split(",").some((ext) => name.endsWith(ext));
}

/**
 * A hidden native file picker and the function that opens it. A dropped file
 * of the wrong type is refused here (the picker's `accept` only filters the
 * dialog, not drag and drop).
 */
function useResumePicker(onFile: (file: File) => void) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [wrongType, setWrongType] = React.useState(false);

  const take = (file: File | undefined) => {
    if (!file) return;
    if (!isAccepted(file)) {
      setWrongType(true);
      return;
    }
    setWrongType(false);
    onFile(file);
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      tabIndex={-1}
      aria-hidden="true"
      className="sr-only"
      onChange={(e) => {
        take(e.target.files?.[0]);
        // Clear it so picking the same file again (for example, after an error) still fires.
        e.target.value = "";
      }}
    />
  );

  return { input, open: () => inputRef.current?.click(), take, wrongType };
}

function WrongTypeMessage() {
  return (
    <HStack gap={2} vAlign="center" role="alert">
      <Icon icon={CircleAlert} color="error" size="md" />
      <Text>That file won&apos;t work. Please choose a PDF or Word document.</Text>
    </HStack>
  );
}

/**
 * The one way to add a résumé: a large drop area with its own clearly named
 * button inside. On a phone (no drag and drop) the button does all the work.
 */
export function ResumeDropZone({
  onFile,
  busyText,
  isPrimary = true,
}: {
  onFile: (file: File) => void;
  /** While uploading/reading, what we're doing — replaces the button. */
  busyText: string | null;
  /** False when another step action is already the screen's main button. */
  isPrimary?: boolean;
}) {
  const picker = useResumePicker(onFile);
  const [isOver, setIsOver] = React.useState(false);
  // Fixed ids (there is only ever one drop zone on a page): `useId` values
  // here could differ between server and client when a portalled Astryx
  // overlay elsewhere in the tree shifts the client's component path.
  const titleId = "resume-drop-title";
  const hintId = "resume-drop-hint";
  const busy = busyText !== null;

  const onDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    setIsOver(true);
  };

  return (
    <VStack
      role="group"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      aria-busy={busy || undefined}
      gap={5}
      hAlign="center"
      paddingInline={4}
      paddingBlock={8}
      className={cn(
        "rounded-lg border-2 border-dashed text-center transition-colors",
        isOver ? "border-primary bg-primary/10" : "border-input bg-card",
      )}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        // Moving over the area's own children fires dragleave too — only a
        // leave that really exits the area ends the highlight.
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
        setIsOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOver(false);
        if (!busy) picker.take(e.dataTransfer.files?.[0]);
      }}
    >
      <span className="rounded-full bg-primary/10 p-3 text-primary" aria-hidden="true">
        <Icon icon={FileUp} size="lg" />
      </span>

      <VStack gap={1} hAlign="center">
        <Text as="p" type="large" id={titleId} textWrap="balance">
          {isOver ? "Drop it here" : "Choose your résumé, or drag it here"}
        </Text>
        <Text as="p" color="secondary" id={hintId}>
          A PDF or Word document
        </Text>
      </VStack>

      {busy ? (
        <HStack gap={3} vAlign="center" role="status">
          <Spinner size="lg" />
          <Text type="large">{busyText}</Text>
        </HStack>
      ) : (
        <Button
          variant={isPrimary ? "primary" : "secondary"}
          size="lg"
          label="Choose my résumé"
          icon={<Icon icon={FileUp} />}
          onClick={picker.open}
        />
      )}
      {picker.input}

      {picker.wrongType && !busy && <WrongTypeMessage />}
    </VStack>
  );
}

/**
 * A plain secondary button to pick a résumé file: after one is read, to swap
 * in a different one; after typing details in, to use a file after all.
 */
export function ReplaceResumeButton({
  onFile,
  label = "Use a different résumé",
}: {
  onFile: (file: File) => void;
  label?: string;
}) {
  const picker = useResumePicker(onFile);
  return (
    <VStack gap={3} hAlign="start">
      <Button label={label} icon={<Icon icon={FileUp} />} onClick={picker.open} />
      {picker.input}
      {picker.wrongType && <WrongTypeMessage />}
    </VStack>
  );
}
