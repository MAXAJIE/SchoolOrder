import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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

        {!isOwner && tab === "dashboard" ? <Requests orgId={organizationId} currency={organization.currency} /> : null}
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

function CreateShop({ onCreated }: { onCreated: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    if (name.trim().length < 2) return setError(t("common.required"));
    setBusy(true);
    try {
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .insert({ name: name.trim(), owner_id: user!.id })
        .select("id")
        .single();
      if (orgErr) throw orgErr;
      const { error: memberErr } = await supabase.from("organization_members").insert({
        organization_id: org.id,
        user_id: user!.id,
        role: "owner",
        status: "active",
      });
      if (memberErr) throw memberErr;
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
        <CardTitle className="text-base">{t("console.createOrg")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">{t("console.noOrg")}</p>
        <div className="grid gap-2">
          <Label htmlFor="org-name">{t("console.orgName")}</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11"
          />
        </div>
        {error ? (
          <p
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <Button className="h-11" disabled={busy} onClick={() => void create()}>
          {t("console.createOrg")}
        </Button>
      </CardContent>
    </Card>
  );
}
