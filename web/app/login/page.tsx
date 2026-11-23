import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

import { enabledProviders } from "@/auth.config";
import { LoginForm } from "@/components/login-form";
import { Wordmark } from "@/components/brand";
import { ExampleJob, PrivacyNote } from "@/components/login-showcase";

export const metadata = {
  title: "Sign in",
};

type LoginSearchParams = { callbackUrl?: string | string[]; error?: string | string[] };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Auth.js sends people back here as `/login?error=<type>` (both `pages.signIn`
 * and `pages.error` point at this page). Only its client-safe types ever reach
 * the URL; anything else arrives as "Configuration". Pressing Cancel on
 * Google's or GitHub's consent screen comes back as `OAuthCallbackError`, and a
 * sign-in the app itself refuses as `AccessDenied`.
 */
function signInProblem(code: string): string {
  switch (code) {
    case "AccessDenied":
    case "OAuthCallbackError":
      return "Signing in was cancelled. Try again when you're ready.";
    case "OAuthAccountNotLinked":
    case "AccountNotLinked":
      return "This email is already linked to a different way of signing in. Please use the one you used before.";
    case "Configuration":
      return "Signing in isn't working right now. Please try again later.";
    default:
      return "We couldn't sign you in. Please try again.";
  }
}

const HOW_IT_WORKS = [
  "Add your résumé",
  "We find jobs and check how well each fits",
  "You keep track of where you are",
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const params = await searchParams;
  const callbackUrl = first(params.callbackUrl) || "/";
  const errorCode = first(params.error);
  const problem = errorCode ? signInProblem(errorCode) : null;
  // Told to use the way they signed in before — show every way straight away.
  const showOtherWays = errorCode === "OAuthAccountNotLinked" || errorCode === "AccountNotLinked";

  const card = <SignInCard callbackUrl={callbackUrl} problem={problem} showOtherWays={showOtherWays} />;

  return (
    <main className="min-h-dvh">
      <div className="mx-auto grid min-h-dvh w-full max-w-5xl items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
        <VStack gap={8}>
          <Wordmark size="lg" />

          <VStack gap={3}>
            <Heading level={1} type="display-2" textWrap="balance">
              Find jobs that fit you.
            </Heading>
            <Text type="large" color="secondary" textWrap="pretty" className="max-w-[34rem]">
              Upload your résumé once. We find open jobs, tell you how well each one fits, and keep
              track of your applications — all in one place.
            </Text>
          </VStack>

          <HowItWorks />

          {/* On small screens the sign-in card comes right after the pitch. */}
          <div className="lg:hidden">{card}</div>

          <ExampleJob />
        </VStack>

        <div className="hidden lg:block">{card}</div>
      </div>
    </main>
  );
}

/** Three calm, numbered steps: what happens after signing in. */
function HowItWorks() {
  return (
    <VStack gap={3}>
      <Text weight="semibold" id="how-it-works">
        How it works
      </Text>
      <ol aria-labelledby="how-it-works" className="flex flex-col gap-3">
        {HOW_IT_WORKS.map((step, i) => (
          <li key={step} className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Text weight="semibold" color="inherit" hasTabularNumbers>
                {i + 1}
              </Text>
            </span>
            <Text>{step}</Text>
          </li>
        ))}
      </ol>
    </VStack>
  );
}

function SignInCard({
  callbackUrl,
  problem,
  showOtherWays,
}: {
  callbackUrl: string;
  problem: string | null;
  showOtherWays: boolean;
}) {
  return (
    <Card padding={6} elevation="low">
      <VStack gap={5}>
        <VStack gap={1}>
          <Heading level={2}>Sign in</Heading>
          <Text color="secondary">New here? Signing in creates your free account.</Text>
        </VStack>

        {problem && <Banner status="error" role="alert" title={problem} collapsible={false} />}

        <LoginForm providers={enabledProviders} callbackUrl={callbackUrl} isOtherWaysOpen={showOtherWays} />

        <PrivacyNote />
      </VStack>
    </Card>
  );
}
