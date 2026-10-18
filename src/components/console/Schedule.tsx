import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarDays, CopyPlus, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState, ErrorState } from "@/components/States";
import { useI18n, translateError } from "@/lib/i18n";
import { callRpc } from "@/lib/rpc";
import {
  addDays,
  dayNumber,
  formatCutoff,
  fullDate,
  monthShort,
  weekdayShort,
  type IsoDate,
} from "@/lib/schedule";

type Entry = {
  id: string;
  product_id: string;
  product_name: string;
  is_active: boolean;
  base_price: number;
  capacity: number;
  reserved: number;
  cutoff_time: string | null;
  is_available: boolean;
};
type Day = { service_date: IsoDate; orders: number; entries: Entry[] };
type ProductRef = { id: string; name: string; base_price: number; is_active: boolean };
type ScheduleView = {
  today: IsoDate;
  first_service_date: IsoDate;
  last_service_date: IsoDate;
  products: ProductRef[];
  days: Day[];
};

/**
 * The owner's week at a glance: one card per day, each card showing what is on
 * that day's menu, how much of it is already taken and when ordering for that
 * day closes. Everything is edited one day at a time, so a change can never
 * leak into another day's quota.
 */
export function Schedule({ orgId, currency }: { orgId: string; currency: string }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [from, setFrom] = useState<IsoDate | null>(null);
  const [editing, setEditing] = useState<IsoDate | null>(null);

  const query = useQuery({
    queryKey: ["schedule", orgId, from],
    queryFn: () =>
      callRpc<ScheduleView>("owner_list_schedule", {
        p_org: orgId,
        p_from: from,
        p_days: 7,
      }),
  });

  const view = query.data;

  const release = useMutation({
    mutationFn: () =>
      callRpc<{ released: number }>("owner_release_stale_holds", {
        p_org: orgId,
        p_minutes: 120,
      }),
    onSuccess: (result) => {
      toast.success(`${t("sched.released")} ${result?.released ?? 0}`);
      void qc.invalidateQueries({ queryKey: ["schedule", orgId] });
      void qc.invalidateQueries({ queryKey: ["orders", orgId] });
    },
    onError: (err: Error) => toast.error(translateError(t, err.message)),
  });

  const canGoBack = Boolean(view && from && from > view.today);

  function shift(days: number) {
    const base = from ?? view?.today ?? null;
    if (!base) return;
    const next = addDays(base, days);
    setFrom(view && next <= view.today ? null : next);
  }

  const editingDay = useMemo(
    () => view?.days.find((d) => d.service_date === editing) ?? null,
    [view, editing],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" aria-hidden />
          <div>
            <p className="font-semibold">{t("sched.title")}</p>
            <p className="text-xs text-muted-foreground">{t("sched.windowHint")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-11"
            disabled={release.isPending}
            onClick={() => release.mutate()}
          >
            <Timer className="mr-1 h-4 w-4" />
            {t("sched.releaseHolds")}
          </Button>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-11 w-11"
              aria-label={t("common.back")}
              disabled={!canGoBack}
              onClick={() => shift(-7)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-11 w-11"
              aria-label={t("sched.nextWeek")}
              onClick={() => shift(7)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : null}

      {view ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {view.days.map((day) => {
            const bookable =
              day.service_date >= view.first_service_date &&
              day.service_date <= view.last_service_date;
            const isToday = day.service_date === view.today;
            const live = day.entries.filter((e) => e.is_available && e.is_active);
            const capacity = live.reduce((sum, e) => sum + e.capacity, 0);
            const reserved = live.reduce((sum, e) => sum + e.reserved, 0);

            return (
              <Card key={day.service_date} className={isToday ? "border-primary" : undefined}>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {weekdayShort(day.service_date, lang)}
                      </p>
                      <p className="font-display text-2xl font-bold leading-none">
                        {dayNumber(day.service_date)}
                        <span className="ml-1 text-sm font-medium text-muted-foreground">
                          {monthShort(day.service_date, lang)}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {isToday ? <Badge variant="secondary">{t("sched.today")}</Badge> : null}
                      {!bookable && !isToday ? (
                        <Badge variant="outline">{t("sched.notBookable")}</Badge>
                      ) : null}
                      {day.orders > 0 ? (
                        <Badge variant="outline">
                          {t("nav.orders")} {day.orders}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {live.length === 0 ? (
                      t("sched.noItems")
                    ) : (
                      <span>
                        {t("sched.capacity")} {capacity} · {t("sched.reserved")} {reserved}
                      </span>
                    )}
                  </div>

                  <ul className="flex flex-col gap-1 text-sm">
                    {day.entries.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {entry.product_name}
                          {!entry.is_available || !entry.is_active ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({t("common.inactive")})
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {entry.reserved}/{entry.capacity}
                          {entry.cutoff_time ? ` · ${formatCutoff(entry.cutoff_time)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10"
                    disabled={day.service_date < view.today}
                    onClick={() => setEditing(day.service_date)}
                  >
                    {t("sched.editDay")}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      <Dialog open={Boolean(editingDay)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingDay ? fullDate(editingDay.service_date, lang) : t("sched.editDay")}
            </DialogTitle>
          </DialogHeader>
          {editingDay && view ? (
            <DayEditor
              key={editingDay.service_date}
              orgId={orgId}
              currency={currency}
              day={editingDay}
              products={view.products}
              onSaved={() => {
                void qc.invalidateQueries({ queryKey: ["schedule", orgId] });
                setEditing(null);
              }}
              onClose={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Row = {
  productId: string;
  name: string;
  scheduled: boolean;
  capacity: string;
  cutoff: string;
  available: boolean;
  reserved: number;
};

function buildRows(day: Day, products: ProductRef[]): Row[] {
  return products.map((product) => {
    const entry = day.entries.find((e) => e.product_id === product.id);
    return {
      productId: product.id,
      name: product.name,
      scheduled: Boolean(entry),
      capacity: entry ? String(entry.capacity) : "",
      cutoff: formatCutoff(entry?.cutoff_time ?? null),
      available: entry ? entry.is_available : true,
      reserved: entry?.reserved ?? 0,
    };
  });
}

/**
 * One day, one form. Saving walks the rows and writes each product separately,
 * so a rejected row (a quota below what is already reserved) never silently
 * changes the rest of the day.
 */
function DayEditor({
  orgId,
  currency,
  day,
  products,
  onSaved,
  onClose,
}: {
  orgId: string;
  currency: string;
  day: Day;
  products: ProductRef[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>(() => buildRows(day, products));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(buildRows(day, products));
  }, [day, products]);

  function patch(productId: string, change: Partial<Row>) {
    setRows((prev) =>
      prev.map((row) => (row.productId === productId ? { ...row, ...change } : row)),
    );
  }

  async function copyPrevious() {
    setError(null);
    setBusy(true);
    try {
      await callRpc("owner_copy_schedule", {
        p_org: orgId,
        p_from: addDays(day.service_date, -1),
        p_to: day.service_date,
      });
      toast.success(t("sched.copied"));
      onSaved();
    } catch (err) {
      setError(translateError(t, err instanceof Error ? err.message : null));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      for (const row of rows) {
        const raw = row.capacity.trim();
        const wanted = raw === "" ? null : Number(raw);

        if (wanted === null || Number.isNaN(wanted)) {
          // Cleared: the product leaves that day, unless buyers already hold it.
          if (row.scheduled) {
            await callRpc("owner_delete_schedule", {
              p_org: orgId,
              p_product: row.productId,
              p_date: day.service_date,
            });
          }
          continue;
        }

        await callRpc("owner_upsert_schedule", {
          p_org: orgId,
          p_product: row.productId,
          p_date: day.service_date,
          p_capacity: Math.max(0, Math.round(wanted)),
          p_cutoff_time: row.cutoff.trim() || null,
          p_is_available: row.available,
        });
      }
      toast.success(t("common.save"));
      onSaved();
    } catch (err) {
      setError(translateError(t, err instanceof Error ? err.message : null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{t("sched.dayHint")}</p>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-10 w-fit"
        disabled={busy}
        onClick={() => void copyPrevious()}
      >
        <CopyPlus className="mr-1 h-4 w-4" />
        {t("sched.copyPrev")}
      </Button>

      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("prod.empty")}</p>
      ) : null}

      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.productId} className="grid gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold">{row.name}</p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {t("sched.reserved")} {row.reserved}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label htmlFor={`cap-${row.productId}`} className="text-xs">
                  {t("sched.capacity")}
                </Label>
                <Input
                  id={`cap-${row.productId}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={row.capacity}
                  placeholder={t("common.none")}
                  className="h-11"
                  onChange={(e) => patch(row.productId, { capacity: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`cut-${row.productId}`} className="text-xs">
                  {t("sched.cutoff")}
                </Label>
                <Input
                  id={`cut-${row.productId}`}
                  type="time"
                  value={row.cutoff}
                  className="h-11"
                  onChange={(e) => patch(row.productId, { cutoff: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`av-${row.productId}`} className="text-xs">
                {t("sched.available")}
              </Label>
              <Switch
                id={`av-${row.productId}`}
                checked={row.available}
                onCheckedChange={(checked) => patch(row.productId, { available: checked })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("prod.basePrice")}: {currency}
              {Number(products.find((p) => p.id === row.productId)?.base_price ?? 0).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{t("sched.cutoffHint")}</p>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={onClose}>
          {t("common.close")}
        </Button>
        <Button type="button" className="h-11" disabled={busy} onClick={() => void save()}>
          {t("common.save")}
        </Button>
      </DialogFooter>
    </div>
  );
}
