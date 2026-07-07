"use client";

import * as React from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LogOut, User as UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function UserMenu() {
  const { data: session, status } = useSession();
  const [profileName, setProfileName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    let cancelled = false;
    fetch("/api/profile", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.user?.name) setProfileName(d.user.name as string); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [status, session?.user]);

  if (status === "loading") {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />;
  }

  if (!session?.user) return null;

  const { image, email } = session.user;
  // Prefer the fresh name from Postgres (kept in sync with profile edits),
  // falling back to the session-cached name, then email.
  const label = profileName || session.user.name || email || "Account";

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/profile"
        className="flex items-center gap-2 rounded-full border border-border bg-card/50 py-1 pl-1 pr-3 transition-colors hover:border-primary/30 hover:bg-accent"
        title="View profile"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={label} className="h-7 w-7 rounded-full" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
            <UserIcon className="h-4 w-4" />
          </span>
        )}
        <span className="max-w-[12rem] truncate text-sm text-muted-foreground" title={email ?? undefined}>
          {label}
        </span>
      </Link>
      <Button
        variant="outline"
        size="sm"
        onClick={() => signOut({ callbackUrl: "/login" })}
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
        <span className="sr-only sm:not-sr-only">Sign out</span>
      </Button>
    </div>
  );
}
