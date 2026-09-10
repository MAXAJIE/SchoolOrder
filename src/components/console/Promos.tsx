import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { useI18n, translateError } from "@/lib/i18n";
import { money } from "@/lib/format";

type PromoType = "fixed_amount_off" | "percentage_off" | "second_item_percentage_off";
type Promo = {
  id: string;
  code: string;
  type: PromoType;
  value: number;
  minimum_order_amount: number;
  max_discount: number | null;
  usage_limit: number | null;
  used_count: number;
  product_id: string | null;
  is_active: boolean;
};

export function Promos({ orgId, currency }: { orgId: string; currency: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["promos", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promo_codes")
        .select("id, code, type, value, minimum_order_amount, max_discount, usage_limit, used_count, product_id, is_active")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Promo[];
    },
  });

  const products = useQuery({
    queryKey: ["product-options", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("promo_codes").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["promos", orgId] }),
    onError: (err: Error) => toast.error(translateError(t, err.message)),
  });

  const typeLabel: Record<PromoType, string> = {
    fixed_amount_off: t("promo.fixed"),
    percentage_off: t("promo.percent"),
    second_item_percentage_off: t("promo.second"),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-11">
              <Plus className="mr-1 h-4 w-4" />
              {t("promo.new")}
            </Button>
          </DialogTrigger>
          <PromoDialog
            orgId={orgId}
            products={products.data ?? []}
            onClose={() => {
              setOpen(false);
              void qc.invalidateQueries({ queryKey: ["promos", orgId] });
            }}
          />
        </Dialog>
      </div>

      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t("promo.secondRule")}</p>

      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : null}
      {query.data?.length === 0 ? <EmptyState label={t("promo.empty")} /> : null}

      <div className="grid gap-3">
        {(query.data ?? []).map((p) => (
          <Card key={p.id}>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.code}</p>
                <p className="text-sm text-muted-foreground">
                  {typeLabel[p.type]} ·{" "}
                  {p.type === "fixed_amount_off" ? money(p.value, currency) : `${p.value}%`}
                  {Number(p.minimum_order_amount) > 0
                    ? ` · ${t("promo.min")} ${money(p.minimum_order_amount, currency)}`
                    : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("promo.used")}: {p.used_count}
                  {p.usage_limit ? ` / ${p.usage_limit}` : ""}
                </p>
              </div>
              <Badge variant={p.is_active ? "default" : "secondary"}>
                {p.is_active ? t("common.active") : t("common.inactive")}
              </Badge>
              <Switch
                checked={p.is_active}
                aria-label={t("common.active")}
                onCheckedChange={(v) => toggle.mutate({ id: p.id, is_active: v })}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PromoDialog({
  orgId,
  products,
  onClose,
}: {
  orgId: string;
  products: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [type, setType] = useState<PromoType>("fixed_amount_off");
  const [value, setValue] = useState("");
  const [min, setMin] = useState("0");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [limit, setLimit] = useState("");
  const [productId, setProductId] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const valueNum = Number(value);
    if (code.trim().length < 3 || !Number.isFinite(valueNum) || valueNum <= 0) {
      setError(t("common.required"));
      return;
    }
    if (type !== "fixed_amount_off" && valueNum > 100) {
      setError(t("common.required"));
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.from("promo_codes").insert({
        organization_id: orgId,
        code: code.trim().toUpperCase(),
        type,
        value: valueNum,
        minimum_order_amount: Number(min || 0),
        max_discount: maxDiscount ? Number(maxDiscount) : null,
        usage_limit: limit ? Math.trunc(Number(limit)) : null,
        product_id: productId === "all" ? null : productId,
        is_active: true,
      });
      if (err) throw err;
      toast.success(t("common.save"));
      onClose();
    } catch (err) {
      setError(translateError(t, err instanceof Error ? err.message : null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t("promo.new")}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="promo-code">{t("promo.code")}</Label>
          <Input
            id="promo-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="h-11"
          />
        </div>
        <div className="grid gap-2">
          <Label>{t("promo.type")}</Label>
          <Select value={type} onValueChange={(v) => setType(v as PromoType)}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed_amount_off">{t("promo.fixed")}</SelectItem>
              <SelectItem value="percentage_off">{t("promo.percent")}</SelectItem>
              <SelectItem value="second_item_percentage_off">{t("promo.second")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2">
            <Label htmlFor="promo-value">{t("promo.value")}</Label>
            <Input
              id="promo-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="promo-min">{t("promo.min")}</Label>
            <Input
              id="promo-min"
              inputMode="decimal"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              className="h-11"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2">
            <Label htmlFor="promo-max">{t("promo.maxDiscount")}</Label>
            <Input
              id="promo-max"
              inputMode="decimal"
              value={maxDiscount}
              onChange={(e) => setMaxDiscount(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="promo-limit">{t("promo.limit")}</Label>
            <Input
              id="promo-limit"
              inputMode="numeric"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="h-11"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>{t("promo.scope")}</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("promo.allProducts")}</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button className="h-11" disabled={busy} onClick={() => void save()}>
          {t("common.save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
