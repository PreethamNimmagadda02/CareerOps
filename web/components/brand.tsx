import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";

/** Brand voice — single source of truth for product messaging. */
export const BRAND = {
  name: "CareerOps",
  tagline: "Find jobs that fit you",
  mission:
    "Upload your résumé once. We find open jobs, tell you how well each one fits, and keep track of every application.",
} as const;

/**
 * CareerOps mark — a plain tile with an up-and-to-the-right arrow ("your next
 * step"). Drawn with theme tokens, so it follows light/dark mode and the
 * active Astryx accent without any gradients or effects.
 */
export function Logo({
  size = 28,
  title = "CareerOps",
  decorative = false,
}: {
  size?: number;
  title?: string;
  /** Hide from screen readers when the product name is already written next to it. */
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": title })}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
      <path
        d="M10.5 21.5 21.5 10.5M13.5 10.5h8v8"
        fill="none"
        stroke="var(--color-on-accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Logo mark + product name. */
export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <HStack gap={2} vAlign="center">
      <Logo size={size === "lg" ? 36 : 28} decorative />
      <Text weight="bold" size={size === "lg" ? "xl" : "lg"}>
        {BRAND.name}
      </Text>
    </HStack>
  );
}
