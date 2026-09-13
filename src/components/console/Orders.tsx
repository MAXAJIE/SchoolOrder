import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, History, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { useI18n, translateError, type TKey } from "@/lib/i18n";
import { money, dateTime } from "@/lib/format";
import { callRpc } from "@/lib/rpc";
import { PROOF_BUCKET, signedUrl } from "@/lib/storage";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/OrderStatus";

type Order = {
  id: string;
  order_number: string;
  pickup_code: string;
  buyer_name: string;
  buyer_class: string | null;
  total: number;
  payment_method: string;
  payment_status: "pending_payment" | "proof_uploaded" | "paid" | "rejected";
  status: "pending" | "confirmed" | "completed" | "cancelled";
  payment_proof_path: string | null;
  created_at: string;
  order_items: { product_name: string; variant_name: string; quantity: number }[];
};

/** Orders that left the counter: nothing left to do, so they live in history. */
function isHistory(order: Order) {
  return order.status === "completed" || order.status === "cancelled";
}

export function Orders({ orgId, currency }: { orgId: string; currency: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "unpaid">("all");
  const [history, setHistory] = useState(false);

  const query = useQuery({
    queryKey: ["orders", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, pickup_code, buyer_name, buyer_class, total, payment_method, payment_status, status, payment_proof_path, created_at, order_items(product_name, variant_name, quantity)",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Order[];
    },
    refetchInterval: 60_000,
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { payment_status?: Order["payment_status"]; status?: Order["status"] };
    }) => {
      const { error } = await supabase.from("orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("common.save"));
      void qc.invalidateQueries({ queryKey: ["orders", orgId] });
    },
    onError: (err: Error) => toast.error(translateError(t, err.message)),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => callRpc("cancel_order", { p_order: id }),
    onSuccess: () => {
      toast.success(t("common.save"));
      void qc.invalidateQueries({ queryKey: ["orders", orgId] });
      void qc.invalidateQueries({ queryKey: ["products", orgId] });
      void qc.invalidateQueries({ queryKey: ["dashboard", orgId] });
    },
    onError: (err: Error) => toast.error(translateError(t, err.message)),
  });

  const historyCount = useMemo(() => (query.data ?? []).filter(isHistory).length, [query.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (query.data ?? []).filter((o) => {
      const matches =
        !q ||
        o.order_number.toLowerCase().includes(q) ||
        o.buyer_name.toLowerCase().includes(q) ||
        o.pickup_code.toLowerCase().includes(q);
      if (!matches) return false;
      // Finished and cancelled orders only ever show inside history.
      if (history) return isHistory(o);
      if (isHistory(o)) return false;
      if (filter === "pending") return o.status === "pending";
      if (filter === "unpaid") return o.payment_status !== "paid";
      return true;
    });
  }, [query.data, search, filter, history]);

  async function openProof(path: string) {
    const url = await signedUrl(PROOF_BUCKET, path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast.error(t("common.error"));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("ord.searchPlaceholder")}
            className="h-11 pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {!history
            ? (["all", "pending", "unpaid"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  className="h-11 shrink-0"
                  onClick={() => setFilter(f)}
                >
                  {f === "all"
                    ? t("ord.active")
                    : f === "unpaid"
                      ? t("dash.unpaid")
                      : t(`status.${f}` as TKey)}
                </Button>
              ))
            : null}
          <Button
            size="sm"
            variant={history ? "default" : "ghost"}
            className="h-11 shrink-0"
            onClick={() => setHistory((v) => !v)}
          >
            {history ? (
              <ArrowLeft className="mr-1 h-4 w-4" />
            ) : (
              <History className="mr-1 h-4 w-4" />
            )}
            {history ? t("ord.backToActive") : `${t("ord.history")} (${historyCount})`}
          </Button>
        </div>
      </div>

      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : null}
      {!query.isLoading && filtered.length === 0 ? (
        <EmptyState label={history ? t("ord.historyEmpty") : t("ord.empty")} />
      ) : null}

      <div className="grid gap-3">
        {filtered.map((o) => (
          <Card key={o.id}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{o.order_number}</p>
                  <p className="text-xs text-muted-foreground">{dateTime(o.created_at)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{o.pickup_code}</Badge>
                  <OrderStatusBadge status={o.status} />
                  {o.status !== "cancelled" ? <PaymentStatusBadge status={o.payment_status} /> : null}
                </div>
              </div>

              <p className="text-sm">
                <span className="text-muted-foreground">{t("ord.buyer")}: </span>
                {o.buyer_name}
                {o.buyer_class ? ` · ${o.buyer_class}` : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {o.order_items
                  .map((i) => `${i.product_name} · ${i.variant_name} ×${i.quantity}`)
                  .join(", ")}
              </p>
              <p
                className={
                  o.status === "cancelled"
                    ? "text-base font-bold text-muted-foreground line-through"
                    : "text-base font-bold"
                }
              >
                {money(o.total, currency)}
              </p>
              {o.status === "cancelled" ? (
                <p className="text-xs text-muted-foreground">{t("ord.cancelledNote")}</p>
              ) : null}

              {!isHistory(o) ? (
                <div className="flex flex-wrap gap-2">
                  {o.payment_proof_path ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10"
                      onClick={() => void openProof(o.payment_proof_path!)}
                    >
                      {t("ord.viewProof")}
                    </Button>
                  ) : null}
                  {o.payment_status !== "paid" ? (
                    <Button
                      size="sm"
                      className="h-10"
                      onClick={() =>
                        update.mutate({
                          id: o.id,
                          patch: { payment_status: "paid", status: "confirmed" },
                        })
                      }
                    >
                      {t("ord.markPaid")}
                    </Button>
                  ) : null}
                  {o.payment_status === "proof_uploaded" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10"
                      onClick={() =>
                        update.mutate({ id: o.id, patch: { payment_status: "rejected" } })
                      }
                    >
                      {t("ord.rejectProof")}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10"
                    onClick={() => update.mutate({ id: o.id, patch: { status: "completed" } })}
                  >
                    {t("ord.complete")}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-10 text-destructive">
                        {t("ord.cancel")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("ord.cancel")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("ord.cancelConfirm")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.close")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => cancel.mutate(o.id)}>
                          {t("ord.cancel")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : o.payment_proof_path ? (
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10"
                    onClick={() => void openProof(o.payment_proof_path!)}
                  >
                    {t("ord.viewProof")}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
