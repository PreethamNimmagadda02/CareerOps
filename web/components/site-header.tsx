"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, UserRound } from "lucide-react";
import { TopNav, TopNavHeading, TopNavItem } from "@astryxdesign/core/TopNav";
import { Icon } from "@astryxdesign/core/Icon";

import { BRAND, Logo } from "@/components/brand";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";

const DESTINATIONS = [
  { href: "/", label: "My jobs", icon: BriefcaseBusiness },
  { href: "/profile", label: "My profile", icon: UserRound },
] as const;

/**
 * App header: brand, the two destinations (on tablets and up), and the
 * account menu. During onboarding the destinations are hidden — the setup
 * flow is the only thing to do, so there are no links that would bounce back.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const onboarding = pathname === "/onboarding";

  return (
    <TopNav
      label="Main"
      heading={
        <TopNavHeading
          // The brand link is a tap target too: at least 44px tall.
          className="min-h-11"
          logo={<Logo decorative />}
          heading={BRAND.name}
          headingHref={onboarding ? "/onboarding" : "/"}
        />
      }
      startContent={
        onboarding ? undefined : (
          // Phones get the bottom bar below instead — thumb-reachable, always labelled.
          <div className="hidden items-center gap-1 sm:flex">
            {DESTINATIONS.map((d) => (
              <TopNavItem
                key={d.href}
                label={d.label}
                href={d.href}
                isSelected={pathname === d.href}
                icon={<Icon icon={d.icon} />}
              />
            ))}
          </div>
        )
      }
      endContent={<UserMenu />}
    />
  );
}

/**
 * Phone navigation: two large, always-labelled tabs fixed to the bottom of
 * the screen, where thumbs reach — instead of a hidden ≡ menu.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  if (pathname === "/onboarding") return null;

  return (
    <nav
      aria-label="Pages"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {DESTINATIONS.map((d) => {
        const active = pathname === d.href;
        return (
          <Link
            key={d.href}
            href={d.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // Keyboard focus: a solid accent ring inside the tab (a faint
              // background change alone is invisible, especially in dark mode).
              "flex min-h-16 flex-col items-center justify-center gap-1 font-semibold outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-primary",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-14 items-center justify-center rounded-full",
                active && "bg-primary/15",
              )}
            >
              <Icon icon={d.icon} size="md" />
            </span>
            {d.label}
          </Link>
        );
      })}
    </nav>
  );
}
