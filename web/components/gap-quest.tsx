"use client";

import { ArrowRight, CircleAlert } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

/**
 * What a job asks for that the résumé doesn't show — a plain list, and one
 * honest way to act on it: add what you have to your profile, and the next
 * check will count it. (No checkboxes: ticking here would save nothing.)
 */
export function GapQuest({ gaps }: { gaps: string[] }) {
  return (
    <VStack gap={3}>
      <VStack gap={0.5}>
        <Heading level={4}>What this job asks for that your résumé doesn&apos;t show</Heading>
        <Text color="secondary">
          Have any of these? Add them to your profile and we&apos;ll count them the next time we
          check your jobs.
        </Text>
      </VStack>

      <ul className="flex flex-col gap-2">
        {gaps.map((gap, i) => (
          <li key={i}>
            <HStack gap={2} vAlign="start">
              <span className="pt-0.5">
                <Icon icon={CircleAlert} size="md" color="warning" />
              </span>
              <Text>{gap}</Text>
            </HStack>
          </li>
        ))}
      </ul>

      <div>
        <Button
          label="Add to my profile"
          href="/profile#section-skills"
          variant="secondary"
          endContent={<Icon icon={ArrowRight} />}
        />
      </div>
    </VStack>
  );
}
