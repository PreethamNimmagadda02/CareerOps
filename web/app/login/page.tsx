import { enabledProviders } from "@/auth.config";
import { LoginForm } from "@/components/login-form";

export const metadata = {
  title: "Sign in · CarrerOps",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8 rounded-2xl border border-border bg-card/60 p-8 shadow-xl">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Career<span className="text-primary">Ops</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to access your job-search pipeline dashboard.
          </p>
        </div>

        <LoginForm providers={enabledProviders} callbackUrl={callbackUrl || "/"} />

        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to authenticate with the provider you choose.
          Your data is private to your account.
        </p>
      </div>
    </main>
  );
}
