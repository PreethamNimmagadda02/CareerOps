"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { Github, LogIn, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type ProviderInfo = { id: string; name: string };

function ProviderIcon({ id }: { id: string }) {
  if (id === "github") return <Github className="h-4 w-4" />;
  if (id === "google") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 11v2.8h3.9c-.2 1-1.3 3-3.9 3-2.4 0-4.3-2-4.3-4.4S9.6 8 12 8c1.3 0 2.2.6 2.7 1l1.9-1.8C15.4 6 13.9 5.3 12 5.3 8.3 5.3 5.3 8.3 5.3 12s3 6.7 6.7 6.7c3.9 0 6.4-2.7 6.4-6.6 0-.4 0-.8-.1-1.1H12Z"
        />
      </svg>
    );
  }
  return <LogIn className="h-4 w-4" />;
}

export function LoginForm({
  providers,
  callbackUrl,
}: {
  providers: ProviderInfo[];
  callbackUrl: string;
}) {
  const [pending, setPending] = React.useState<string | null>(null);

  if (providers.length === 0) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        No sign-in providers are configured. Set <code>AUTH_GOOGLE_ID</code> /{" "}
        <code>AUTH_GITHUB_ID</code> (and their secrets) plus <code>AUTH_SECRET</code> in the
        environment, then restart.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {providers.map((p) => (
        <Button
          key={p.id}
          size="lg"
          variant="outline"
          className="w-full justify-center gap-3"
          disabled={pending !== null}
          onClick={() => {
            setPending(p.id);
            void signIn(p.id, { callbackUrl });
          }}
        >
          {pending === p.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ProviderIcon id={p.id} />
          )}
          Continue with {p.name}
        </Button>
      ))}
    </div>
  );
}
