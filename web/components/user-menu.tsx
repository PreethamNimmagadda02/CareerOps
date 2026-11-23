"use client";

import * as React from "react";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { CircleHelp, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { Avatar } from "@astryxdesign/core/Avatar";
import {
  DropdownMenu,
  DropdownMenuDivider,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { Skeleton } from "@astryxdesign/core/Skeleton";

/**
 * Account menu: who you're signed in as, your profile, help, the appearance
 * choice (match device / light / dark), and sign out — everything
 * account-related in one predictable place. The trigger says "Account" in
 * words, not just initials.
 */
export function UserMenu() {
  const { data: session, status } = useSession();
  const { theme, setTheme } = useTheme();
  const [profileName, setProfileName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    let cancelled = false;
    fetch("/api/profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.user?.name) setProfileName(d.user.name as string);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, session?.user]);

  if (status === "loading") return <Skeleton width={120} height={44} radius="rounded" />;
  if (!session?.user) return null;

  const { image, email } = session.user;
  // Prefer the fresh name from Postgres (kept in sync with profile edits),
  // falling back to the session-cached name, then email.
  const name = profileName || session.user.name || email || "Account";

  return (
    <DropdownMenu
      alignment="end"
      menuWidth={280}
      // Every row fits without an inner scroll (the default cap is 300px).
      menuMaxHeight={560}
      renderTrigger={(trigger) => (
        <button
          {...trigger}
          type="button"
          aria-label={`Account menu for ${name}`}
          className="flex h-11 items-center gap-2 rounded-full pe-3 font-semibold hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Avatar name={name} src={image ?? undefined} size="md" tooltip={false} />
          <span aria-hidden="true">Account</span>
        </button>
      )}
    >
      <DropdownMenuGroup title={email && email !== name ? `${name} · ${email}` : name}>
        <DropdownMenuItem label="My profile" icon={<Icon icon={UserRound} />} href="/profile" />
        <DropdownMenuItem label="Help" icon={<Icon icon={CircleHelp} />} href="/help" />
      </DropdownMenuGroup>
      <DropdownMenuDivider />
      <DropdownMenuGroup title="Appearance">
        <DropdownMenuRadioGroup
          label="Appearance"
          value={theme ?? "system"}
          onChange={(next) => setTheme(next)}
          hasCloseOnSelect={false}
        >
          <DropdownMenuRadioItem
            value="system"
            label="Match my device"
            icon={<Icon icon={Monitor} />}
          />
          <DropdownMenuRadioItem value="light" label="Light" icon={<Icon icon={Sun} />} />
          <DropdownMenuRadioItem value="dark" label="Dark" icon={<Icon icon={Moon} />} />
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      <DropdownMenuDivider />
      <DropdownMenuItem
        label="Sign out"
        icon={<Icon icon={LogOut} />}
        onClick={() => void signOut({ callbackUrl: "/login" })}
      />
    </DropdownMenu>
  );
}
