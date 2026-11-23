"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { Github, LogIn } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

type ProviderInfo = { id: string; name: string };

/**
 * Google's own four-colour "G" at 20px. The colours are Google's brand colours
 * (they can't come from our theme), and its brand rules ask for the mark to
 * sit on white — which also keeps it readable on our green main button.
 */
function GoogleLogo() {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white"
    >
      <svg viewBox="0 0 48 48" className="size-5" focusable="false">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
    </span>
  );
}

function providerIcon(id: string) {
  if (id === "google") return <GoogleLogo />;
  if (id === "github") return <Icon icon={Github} />;
  return <Icon icon={LogIn} />;
}

export function LoginForm({
  providers,
  callbackUrl,
  isOtherWaysOpen = false,
}: {
  providers: ProviderInfo[];
  callbackUrl: string;
  /**
   * Open "Other ways to sign in" from the start — for example, after being
   * told to use the way they signed in before.
   */
  isOtherWaysOpen?: boolean;
}) {
  const [pending, setPending] = React.useState<string | null>(null);

  if (providers.length === 0) {
    return (
      <Banner
        status="error"
        title="Sign-in isn't set up yet"
        description="Set AUTH_GOOGLE_ID / AUTH_GITHUB_ID (and their secrets) plus AUTH_SECRET in the environment, then restart."
        collapsible={false}
      />
    );
  }

  // Google is the one main way in. Anything else (GitHub, for people who use
  // it) stays available but tucked away underneath, so it never reads as an
  // equal choice to someone who has never heard of it.
  const main = providers.find((p) => p.id === "google") ?? providers[0];
  const others = providers.filter((p) => p.id !== main.id);

  const signInButton = (p: ProviderInfo, isMain: boolean) => (
    <Button
      key={p.id}
      label={`Continue with ${p.name}`}
      variant={isMain ? "primary" : "secondary"}
      size="lg"
      width="100%"
      icon={providerIcon(p.id)}
      isLoading={pending === p.id}
      isDisabled={pending !== null && pending !== p.id}
      onClick={() => {
        setPending(p.id);
        void signIn(p.id, { callbackUrl });
      }}
    />
  );

  return (
    <VStack gap={4}>
      {signInButton(main, true)}
      {others.length > 0 && (
        <Collapsible
          defaultIsOpen={isOtherWaysOpen}
          trigger={
            <HStack vAlign="center" className="min-h-11">
              <Text color="secondary">Other ways to sign in</Text>
            </HStack>
          }
        >
          <VStack gap={3} paddingBlockStart={2}>
            {others.map((p) => signInButton(p, false))}
          </VStack>
        </Collapsible>
      )}
    </VStack>
  );
}
