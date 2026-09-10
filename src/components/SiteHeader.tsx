import { Link } from "@tanstack/react-router";
import { LogIn, LogOut, LayoutDashboard, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitch, ThemeSwitch } from "@/components/Controls";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export function SiteHeader({ subtitle }: { subtitle?: string | undefined }) {
  const { t } = useI18n();
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur no-print">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Store className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-bold leading-tight">
              {t("app.name")}
            </span>
            {subtitle ? (
              <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
            ) : null}
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitch />
          <ThemeSwitch />
          {user ? (
            <>
              <Button asChild variant="outline" size="sm" className="h-10">
                <Link to="/console">
                  <LayoutDashboard className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">{t("nav.console")}</span>
                </Link>
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => void signOut()} aria-label={t("nav.signout")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button asChild variant="outline" size="sm" className="h-10">
              <Link to="/auth">
                <LogIn className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">{t("nav.signin")}</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
