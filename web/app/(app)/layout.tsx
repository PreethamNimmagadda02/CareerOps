import { AppShell } from "@astryxdesign/core/AppShell";

import { MobileTabBar, SiteHeader } from "@/components/site-header";

/**
 * Signed-in app frame. Astryx AppShell owns the <main> landmark and the
 * skip-to-content link; pages render their own h1. On phones the two
 * destinations live in a bottom tab bar instead of a hidden ≡ drawer, so the
 * shell's own mobile drawer is turned off. The login route lives outside this
 * group and stays chromeless.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell
        topNav={<SiteHeader />}
        mobileNav={{ breakpoint: "none" }}
        height="auto"
        variant="section"
      >
        {/* Room for the phone tab bar so it never covers content. */}
        <div className="pb-24 sm:pb-0">{children}</div>
      </AppShell>
      <MobileTabBar />
    </>
  );
}
