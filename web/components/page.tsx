import * as React from "react";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

/**
 * Shared page frame: one centered, comfortably narrow column with generous
 * spacing. `narrow` suits forms and step-by-step flows (shorter line length is
 * easier to read); `wide` suits lists of jobs.
 */
export function Page({
  children,
  width = "wide",
}: {
  children: React.ReactNode;
  width?: "narrow" | "wide";
}) {
  return (
    <VStack
      gap={6}
      maxWidth={width === "narrow" ? 760 : 1080}
      paddingInline={4}
      paddingBlockEnd={10}
      // Less space above the title on phones, so the content starts higher.
      className="mx-auto w-full pt-5 sm:pt-8"
    >
      {children}
    </VStack>
  );
}

/** Page title, one plain sentence of context, and optional actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <HStack gap={4} vAlign="end" hAlign="between" wrap="wrap">
      <VStack gap={1} className="min-w-0 max-w-[40rem]">
        <Heading level={1} textWrap="balance">
          {title}
        </Heading>
        {description ? (
          <Text type="large" color="secondary" textWrap="pretty">
            {description}
          </Text>
        ) : null}
      </VStack>
      {actions ? (
        <HStack gap={2} wrap="wrap">
          {actions}
        </HStack>
      ) : null}
    </HStack>
  );
}
