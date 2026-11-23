"use client";

import { Lock } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

import { AdviceBadge, FitMeter } from "@/components/status-badge";

/**
 * The product as its own pitch: one job exactly as it appears in the app —
 * how well it fits, our advice, and the reason in plain words.
 */
export function ExampleJob() {
  return (
    <figure className="max-w-[34rem]">
      <figcaption className="mb-3">
        <Text weight="semibold" color="secondary">
          Here&apos;s what every job looks like in CareerOps:
        </Text>
      </figcaption>
      <Card padding={6} elevation="low">
        <VStack gap={3}>
          <VStack gap={0.5}>
            <Text type="large" weight="semibold">
              Operations Manager
            </Text>
            <Text color="secondary">Northwind Health · Hybrid, Lagos</Text>
          </VStack>
          <FitMeter score={4.6} size="lg" />
          <AdviceBadge recommendation="APPLY_NOW" />
          {/* The reason, in the same words the job list uses — plain text, no
              box inside the card and no coloured side stripe. */}
          <Text as="p">
            <Text weight="semibold">Why: </Text>
            Your 9 years running clinic operations line up closely with what they need.
          </Text>
        </VStack>
      </Card>
    </figure>
  );
}

/** The privacy promise under the sign-in buttons. */
export function PrivacyNote() {
  return (
    <HStack gap={2} vAlign="start">
      <span className="pt-0.5 text-muted-foreground">
        <Icon icon={Lock} size="sm" />
      </span>
      <Text color="secondary">
        Your information stays private. We never post anything or email you without asking.
      </Text>
    </HStack>
  );
}
