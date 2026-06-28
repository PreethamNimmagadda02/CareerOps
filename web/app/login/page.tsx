import { enabledProviders } from "@/auth.config";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/brand";

export const metadata = {
  title: "Sign in · CareerOps",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Ambient brand wash */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-[hsl(var(--brand-to))] opacity-[0.10] blur-3xl" />

      <div className="relative w-full max-w-sm animate-fade-in-up space-y-7 rounded-2xl border border-border bg-card/70 p-8 brand-glow backdrop-blur">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo className="h-12 w-12" />
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome to Career<span className="brand-text">Ops</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to pick up your job search right where you left off.
            </p>
          </div>
        </div>

        <LoginForm providers={enabledProviders} callbackUrl={callbackUrl || "/"} />

        <p className="text-center text-xs text-muted-foreground">
          We only use your sign-in to keep your data private to you. No spam, ever.
        </p>
      </div>
    </main>
  );
}
