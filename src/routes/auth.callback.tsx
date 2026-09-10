import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

/**
 * Public landing page for social sign-in returns.
 * Google (and any other provider) sends the browser back here; we wait until
 * the Supabase session is hydrated, then forward to the seller console.
 */
export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — SchoolOrder" },
      { name: "description", content: "Completing your SchoolOrder sign in." },
      { property: "og:title", content: "Signing you in — SchoolOrder" },
      { property: "og:description", content: "Completing your SchoolOrder sign in." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = (path: "/console" | "/signup") => {
      if (done) return;
      done = true;
      void navigate({ to: path, replace: true });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish("/console");
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish("/console");
    });

    // Give the provider redirect a few seconds to settle before giving up.
    const timer = window.setTimeout(() => {
      if (!done) setFailed(true);
    }, 6000);

    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {failed ? (
        <div className="text-center">
          <p className="text-sm text-muted-foreground">{t("auth.callbackFailed")}</p>
          <button
            type="button"
            className="mt-3 text-sm underline underline-offset-4"
            onClick={() => void navigate({ to: "/signup", replace: true })}
          >
            {t("auth.signin")}
          </button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("auth.callbackWait")}
        </p>
      )}
    </div>
  );
}
