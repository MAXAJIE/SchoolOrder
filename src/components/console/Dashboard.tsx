import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { useI18n } from "@/lib/i18n";
import { money, dayKey, isToday } from "@/lib/format";

type OrderRow = {
  id: string;
  total: number;
  cost_total: number;
  status: string;
  payment_status: string;
  created_at: string;
};

export function Dashboard({ orgId, currency }: { orgId: string; currency: string }) {
  const { t } = useI18n();

  const query = useQuery({
    queryKey: ["dashboard", orgId],
    queryFn: async () => {
      const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
      const [orders, items, products] = await Promise.all([
        supabase
          .from("orders")
          .select("id, total, cost_total, status, payment_status, created_at")
          .eq("organization_id", orgId)
          .gte("created_at", since),
        // Cancelled orders must never reach any report: filter them out at the
        // source with an inner join so no ghost sales or profit can appear.
        supabase
          .from("order_items")
          .select("product_name, variant_name, quantity, line_total, orders!inner(status)")
          .eq("organization_id", orgId)
          .neq("orders.status", "cancelled")
          .limit(1000),
        supabase.from("products").select("stock").eq("organization_id", orgId),
      ]);
      if (orders.error) throw orders.error;
      if (items.error) throw items.error;
      if (products.error) throw products.error;
      return {
        orders: (orders.data ?? []) as OrderRow[],
        items: items.data ?? [],
        stock: (products.data ?? []).reduce((sum, p) => sum + (p.stock ?? 0), 0),
      };
    },
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  const orders = (query.data?.orders ?? []).filter((o) => o.status !== "cancelled");
  const todays = orders.filter((o) => isToday(o.created_at));
  const revenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const cost = orders.reduce((s, o) => s + Number(o.cost_total), 0);
  const unpaid = orders.filter(
    (o) => o.payment_status === "pending_payment" || o.payment_status === "proof_uploaded",
  ).length;

  const byDay = new Map<string, number>();
  orders.forEach((o) =>
    byDay.set(dayKey(o.created_at), (byDay.get(dayKey(o.created_at)) ?? 0) + Number(o.total)),
  );
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    return { key: dayKey(d), value: byDay.get(dayKey(d)) ?? 0 };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.value));

  const top = new Map<string, number>();
  (query.data?.items ?? []).forEach((it) => {
    const label = it.variant_name ? `${it.product_name} · ${it.variant_name}` : it.product_name;
    top.set(label, (top.get(label) ?? 0) + (it.quantity ?? 0));
  });
  const topProducts = Array.from(top.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const stats = [
    {
      label: t("dash.todaySales"),
      value: money(
        todays.reduce((s, o) => s + Number(o.total), 0),
        currency,
      ),
    },
    { label: t("dash.todayOrders"), value: String(todays.length) },
    { label: t("dash.unpaid"), value: String(unpaid) },
    { label: t("dash.stock"), value: String(query.data?.stock ?? 0) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dash.last7")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-2">
              {days.map((d) => (
                <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/80"
                    style={{ height: `${Math.max(4, (d.value / maxDay) * 130)}px` }}
                    title={`${d.key}: ${money(d.value, currency)}`}
                  />
                  <span className="text-[10px] text-muted-foreground">{d.key.slice(5)}</span>
                </div>
              ))}
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t("dash.revenue")}</dt>
                <dd className="font-semibold">{money(revenue, currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("dash.cost")}</dt>
                <dd className="font-semibold">{money(cost, currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("dash.profit")}</dt>
                <dd className="font-semibold text-primary">{money(revenue - cost, currency)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dash.topProducts")}</CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <EmptyState label={t("dash.noData")} />
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {topProducts.map(([label, qty]) => (
                  <li key={label} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{label}</span>
                    <span className="font-semibold">{qty}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
