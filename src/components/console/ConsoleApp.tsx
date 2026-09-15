import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { LoadingState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dashboard } from "@/components/console/Dashboard";
import { Products } from "@/components/console/Products";
import { Orders } from "@/components/console/Orders";
import { Promos } from "@/components/console/Promos";
import { Dealers } from "@/components/console/Dealers";
import { Requests } from "@/components/console/Requests";
import { Settings } from "@/components/console/Settings";
import { AppearanceSettings } from "@/components/console/AppearanceSettings";
import { useAuth } from "@/lib/auth";
import { useMembership } from "@/lib/org";
import { useI18n, translateError, type TKey } from "@/lib/i18n";
import { callRpc } from "@/lib/rpc";

type OwnerTab = "dashboard" | "products" | "orders" | "promos" | "dealers" | "settings";

export function ConsoleApp() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const membership = useMembership();
  const [tab, setTab] = useState<OwnerTab>("dashboard");

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || (user && membership.isLoading)) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <LoadingState />
      </div>
    );
  }
  if (!user) return null;

  if (membership.isError) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-10">
          <ErrorState onRetry={() => void membership.refetch()} />
        </main>
      </div>
    );
  }

  if (!membership.data) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-10">
          <CreateShop onCreated={() => void membership.refetch()} />
        </main>
      </div>
    );
  }

  const { organizationId, role, organization } = membership.data;
  const isOwner = role === "owner";

  const tabs: { id: OwnerTab; label: string }[] = isOwner
    ? [
        { id: "dashboard", label: t("nav.dashboard") },
        { id: "products", label: t("nav.products") },
        { id: "orders", label: t("nav.orders") },
        { id: "promos", label: t("nav.promos") },
        { id: "dealers", label: t("nav.dealers") },
        { id: "settings", label: t("nav.settings") },
      ]
    : [
        { id: "dashboard", label: t("nav.requests") },
        { id: "settings", label: t("nav.appearance") },
      ];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader subtitle={organization.name} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center gap-2">
          <h1 className="text-xl font-bold">{t("nav.console")}</h1>
          <Badge variant="secondary">
            {t((isOwner ? "console.roleOwner" : "console.roleDealer") as TKey)}
          </Badge>
        </div>

        <nav className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label={t("nav.console")}>
          {tabs.map((tb) => (
            <Button
              key={tb.id}
              size="sm"
              variant={tab === tb.id ? "default" : "outline"}
              className="h-11 shrink-0"
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </Button>
          ))}
        </nav>

        {!isOwner && tab === "dashboard" ? (
          <Requests orgId={organizationId} currency={organization.currency} />
        ) : null}
        {isOwner && tab === "dashboard" ? (
          <Dashboard orgId={organizationId} currency={organization.currency} />
        ) : null}
        {isOwner && tab === "products" ? (
          <Products orgId={organizationId} currency={organization.currency} />
        ) : null}
        {isOwner && tab === "orders" ? (
          <Orders orgId={organizationId} currency={organization.currency} />
        ) : null}
        {isOwner && tab === "promos" ? (
          <Promos orgId={organizationId} currency={organization.currency} />
        ) : null}
        {isOwner && tab === "dealers" ? (
          <Dealers orgId={organizationId} currency={organization.currency} />
        ) : null}
        {isOwner && tab === "settings" ? (
          <Settings
            orgId={organizationId}
            name={organization.name}
            shopCode={organization.shop_code}
            currency={organization.currency}
            isOpen={organization.is_open}
            publicTheme={organization.public_theme}
            buttonColor={organization.button_color}
          />
        ) : null}
        {!isOwner && tab === "settings" ? (
          <AppearanceSettings
            orgId={organizationId}
            initialTheme={organization.public_theme}
            initialButtonColor={organization.button_color}
          />
        ) : null}
      </main>
    </div>
  );
}

/**
 * Opening a shop is a two-step gate: an activation code first, the shop name
 * only once the server has accepted that code. The code is never checked in
 * the browser, and the shop is created in one server-side transaction, so a
 * curious signed-in visitor cannot quietly create a shop of their own.
 */
function CreateShop({ onCreated }: { onCreated: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<"code" | "name">("code");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setError(null);
    if (code.trim().length < 4) {
      setError(t("common.required"));
      return;
    }
    setBusy(true);
    try {
      const ok = await callRpc<boolean>("verify_shop_activation_code", {
        p_code: code.trim().toUpperCase(),
      });
      if (!ok) {
        setError(t("err.INVALID_ACTIVATION_CODE"));
        return;
      }
      setStep("name");
    } catch (err) {
      setError(translateError(t, err instanceof Error ? err.message : null));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setError(null);
    if (name.trim().length < 2) {
      setError(t("common.required"));
      return;
    }
    setBusy(true);
    try {
      await callRpc<{ organization_id: string; shop_code: string }>("create_shop_with_code", {
        p_name: name.trim(),
        p_code: code.trim().toUpperCase(),
      });
      toast.success(t("common.save"));
      await qc.invalidateQueries({ queryKey: ["membership", user!.id] });
      onCreated();
    } catch (err) {
      setError(translateError(t, err instanceof Error ? err.message : null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {step === "code" ? t("console.activationTitle") : t("console.createOrg")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          {step === "code" ? t("console.activationBody") : t("console.noOrg")}
        </p>

        {step === "code" ? (
          <div className="grid gap-2">
            <Label htmlFor="activation-code">{t("console.activationCode")}</Label>
            <Input
              id="activation-code"
              value={code}
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
              className="h-11 font-mono uppercase tracking-[0.12em]"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) void verify();
              }}
            />
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="org-name">{t("console.orgName")}</Label>
            <Input
              id="org-name"
              value={name}
              className="h-11"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) void create();
              }}
            />
          </div>
        )}

        {error ? (
          <p
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {step === "code" ? (
          <Button className="h-11" disabled={busy} onClick={() => void verify()}>
            {t("console.activationContinue")}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-11"
              disabled={busy}
              onClick={() => {
                setError(null);
                setStep("code");
              }}
            >
              {t("common.back")}
            </Button>
            <Button className="h-11 flex-1" disabled={busy} onClick={() => void create()}>
              {t("console.createOrg")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
