import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { useI18n, translateError, type TKey } from "@/lib/i18n";
import { dateTime, money } from "@/lib/format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Member = { id: string; user_id: string; role: string; status: string; display_name: string | null };
type Request = {
  id: string;
  status: string;
  note: string | null;
  affects_inventory: boolean;
  created_at: string;
  dealer_id: string;
  dealer_request_items: { id: string; quantity: number; variant_id: string }[];
};

export function Dealers({ orgId, currency }: { orgId: string; currency: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("organization_members")
        .select("id, user_id, role, status, display_name")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true });
      if (err) throw err;
      return (data ?? []) as Member[];
    },
  });

  const requests = useQuery({
    queryKey: ["requests", orgId],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("dealer_requests")
        .select("id, status, note, affects_inventory, created_at, dealer_id, dealer_request_items(id, quantity, variant_id)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (err) throw err;
      return (data ?? []) as Request[];
    },
  });

  const variants = useQuery({
    queryKey: ["variant-map", orgId],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("product_variants")
        .select("id, name, price, products(name)")
        .eq("organization_id", orgId);
      if (err) throw err;
      return data ?? [];
    },
  });

  const addDealer = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase
        .from("organization_members")
        .insert({ organization_id: orgId, user_id: id, role: "dealer", status: "active" });
      if (err) throw err;
    },
    onSuccess: () => {
      setUserId("");
      toast.success(t("common.save"));
      void qc.invalidateQueries({ queryKey: ["members", orgId] });
    },
    onError: (err: Error) => setError(translateError(t, err.message)),
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error: err } = await supabase.from("dealer_requests").update({ status }).eq("id", id);
      if (err) throw err;
    },
    onSuccess: () => {
      toast.success(t("common.save"));
      void qc.invalidateQueries({ queryKey: ["requests", orgId] });
    },
    onError: (err: Error) => toast.error(translateError(t, err.message)),
  });

  const variantLabel = (id: string) => {
    const v = variants.data?.find((x) => x.id === id);
    if (!v) return id.slice(0, 8);
    const product = (v.products as { name: string } | null)?.name ?? "";
    return `${product} · ${v.name}`;
  };
  const variantPrice = (id: string) => Number(variants.data?.find((x) => x.id === id)?.price ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dealer.invite")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="dealer-id">{t("dealer.userId")}</Label>
            <Input
              id="dealer-id"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value.trim());
                setError(null);
              }}
              className="h-11 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">{t("dealer.userIdHint")}</p>
          </div>
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            className="h-11"
            disabled={!UUID.test(userId) || addDealer.isPending}
            onClick={() => addDealer.mutate(userId)}
          >
            <UserPlus className="mr-1 h-4 w-4" />
            {t("common.add")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("nav.dealers")}</CardTitle>
        </CardHeader>
        <CardContent>
          {members.isLoading ? <LoadingState /> : null}
          {members.isError ? <ErrorState onRetry={() => void members.refetch()} /> : null}
          {members.data && members.data.filter((m) => m.role === "dealer").length === 0 ? (
            <EmptyState label={t("dealer.empty")} />
          ) : null}
          <ul className="flex flex-col gap-2">
            {(members.data ?? [])
              .filter((m) => m.role === "dealer")
              .map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-mono text-xs">{m.display_name ?? m.user_id}</span>
                  <Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status}</Badge>
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dealer.requests")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {requests.isLoading ? <LoadingState /> : null}
          {requests.isError ? <ErrorState onRetry={() => void requests.refetch()} /> : null}
          {requests.data?.length === 0 ? <EmptyState label={t("dealer.noRequests")} /> : null}
          {(requests.data ?? []).map((r) => {
            const total = r.dealer_request_items.reduce(
              (sum, it) => sum + variantPrice(it.variant_id) * it.quantity,
              0,
            );
            return (
              <div key={r.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{dateTime(r.created_at)}</span>
                  <Badge variant="secondary">{t(`req.${r.status}` as TKey)}</Badge>
                </div>
                <ul className="text-sm">
                  {r.dealer_request_items.map((it) => (
                    <li key={it.id}>
                      {variantLabel(it.variant_id)} × {it.quantity}
                    </li>
                  ))}
                </ul>
                <p className="text-sm font-semibold">{money(total, currency)}</p>
                {r.note ? <p className="text-sm text-muted-foreground">{r.note}</p> : null}
                {r.status === "submitted" ? (
                  <div className="flex gap-2">
                    <Button size="sm" className="h-10" onClick={() => decide.mutate({ id: r.id, status: "approved" })}>
                      {t("dealer.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10"
                      onClick={() => decide.mutate({ id: r.id, status: "rejected" })}
                    >
                      {t("dealer.reject")}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
