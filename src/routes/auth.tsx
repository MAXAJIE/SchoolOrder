import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/lib/auth";
import { useI18n, translateError } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — SchoolOrder" },
      { name: "description", content: "Sign in to manage your school drinks shop, stock and orders." },
      { property: "og:title", content: "Sign in — SchoolOrder" },
      { property: "og:description", content: "Owner and dealer sign in for the SchoolOrder workflow." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { timeout?: "1" } =>
    search["timeout"] === "1" ? { timeout: "1" } : {},
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, timedOut } = useAuth();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) void navigate({ to: "/console" });
  }, [user, navigate]);

  useEffect(() => {
    if (timedOut || search.timeout === "1") toast.info(t("auth.timeout"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError(mode === "signup" ? "Password must be at least 6 characters." : t("common.required"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/console`,
            data: { display_name: displayName.trim() || email.split("@")[0] },
          },
        });
        if (err) throw err;
        toast.success(t("auth.checkEmail"));
        setMode("signin");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        await navigate({ to: "/console" });
      }
    } catch (err) {
      setError(translateError(t, err instanceof Error ? err.message : null));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError(translateError(t, result.error.message));
      return;
    }
    if (result.redirected) return;
    await navigate({ to: "/console" });
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("auth.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
              {mode === "signup" ? (
                <div className="grid gap-2">
                  <Label htmlFor="name">{t("common.name")}</Label>
                  <Input
                    id="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    className="h-11"
                  />
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={t("auth.showPassword")}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="h-11" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {mode === "signup" ? t("auth.signup") : t("auth.signin")}
              </Button>
            </form>

            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>or</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button variant="outline" className="h-11 w-full" onClick={() => void onGoogle()}>
              {t("auth.google")}
            </Button>

            <button
              type="button"
              className="mt-4 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
            >
              {mode === "signin" ? t("auth.toggleSignup") : t("auth.toggleSignin")}
            </button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
