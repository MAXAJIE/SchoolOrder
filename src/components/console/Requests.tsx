import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { useI18n, translateError, type TKey } from "@/lib/i18n";
import { money, dateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth";

type Variant = { id: string; name: string; price: number; products: { name: string } | null };

/** Dealer view: build a request from the catalogue and follow its status. */
export function Requests({ orgId, currency }: { orgId: string; currency: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");

  const variants = useQuery({
    queryKey: ["dealer-variants", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, name, price, is_active, products(name)")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Variant[];
    },
  });

  const requests = useQuery({
    queryKey: ["my-requests", orgId, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dealer_requests")
        .select("id, status, note, created_at, dealer_request_items(id, quantity, variant_id)")
        .eq("organization_id", orgId)
        .eq("dealer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const lines = Object.entries(qty).filter(([, q]) => q > 0);
      if (lines.length === 0) throw new Error("EMPTY_CART");
      const { data: request, error } = await supabase
        .from("dealer_requests")
        .insert({
          organization_id: orgId,
          dealer_id: user!.id,
          status: "submitted",
          affects_inventory: false,
          note: note.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: itemsErr } = await supabase.from("dealer_request_items").insert(
        lines.map(([variantId, quantity]) => ({
          request_id: request.id,
          variant_id: variantId,
          quantity,
        })),
      );
      if (itemsErr) throw itemsErr;
    },
    onSuccess: () => {
      setQty({});
      setNote("");
      toast.success(t("common.save"));
      void qc.invalidateQueries({ queryKey: ["my-requests", orgId, user?.id] });
    },
    onError: (err: Error) => toast.error(translateError(t, err.message)),
  });

  const label = (id: string) => {
    const v = variants.data?.find((x) => x.id === id);
    return v ? `${v.products?.name ?? ""} · ${v.name}` : id.slice(0, 8);
  };
  const total = Object.entries(qty).reduce((sum, [id, q]) => {
    const v = variants.data?.find((x) => x.id === id);
    return sum + Number(v?.price ?? 0) * q;
  }, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dealer.newRequest")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {variants.isLoading ? <LoadingState /> : null}
          {variants.isError ? <ErrorState onRetry={() => void variants.refetch()} /> : null}
          {variants.data?.length === 0 ? <EmptyState label={t("prod.empty")} /> : null}
          <ul className="flex flex-col gap-2">
            {(variants.data ?? []).map((v) => {
              const current = qty[v.id] ?? 0;
              return (
                <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {v.products?.name} · {v.name}
                  </span>
                  <span className="text-muted-foreground">{money(v.price, currency)}</span>
                  <span className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      aria-label="-"
                      disabled={current <= 0}
                      onClick={() => setQty((p) => ({ ...p, [v.id]: Math.max(0, current - 1) }))}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center">{current}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      aria-label="+"
                      onClick={() => setQty((p) => ({ ...p, [v.id]: current + 1 }))}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
          <Textarea
            value={note}
            rows={2}
            placeholder={t("dealer.requestNote")}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="text-sm font-semibold">
            {t("common.total")}: {money(total, currency)}
          </p>
          <p className="text-xs text-muted-foreground">{t("dealer.affectsInventory")}</p>
          <Button className="h-11" disabled={submit.isPending || total <= 0} onClick={() => submit.mutate()}>
            {t("dealer.newRequest")}
          </Button>
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
          {(requests.data ?? []).map((r) => (
            <div key={r.id} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{dateTime(r.created_at)}</span>
                <Badge variant="secondary">{t(`req.${r.status}` as TKey)}</Badge>
              </div>
              <ul>
                {r.dealer_request_items.map((it) => (
                  <li key={it.id}>
                    {label(it.variant_id)} × {it.quantity}
                  </li>
                ))}
              </ul>
              {r.note ? <p className="text-muted-foreground">{r.note}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
