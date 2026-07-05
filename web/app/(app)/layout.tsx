import { SiteHeader } from "@/components/site-header";

/**
 * Authenticated app shell — persistent header chrome above every signed-in
 * page. The login route lives outside this group and stays chromeless.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
