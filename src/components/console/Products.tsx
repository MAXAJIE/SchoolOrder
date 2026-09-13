import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { callRpc } from "@/lib/rpc";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, SHOP_BUCKET, fileExtension } from "@/lib/storage";
import { ImageCropper } from "@/components/ImageCropper";

/**
 * Option groups are edited entirely in local state and written once, together
 * with the product. That is what lets a brand new product be customised before
 * it has ever been saved.
 */
type ValueForm = { key: string; label: string; price_delta: string };
type OptionForm = {
  key: string;
  name: string;
  is_required: boolean;
  max_select: string;
  values: ValueForm[];
};
type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price: number;
  cost_price: number;
  stock: number;
  is_active: boolean;
  product_options: {
    id: string;
    name: string;
    is_required: boolean;
    max_select: number;
    sort_order: number;
    product_option_values: {
      id: string;
      label: string;
      price_delta: number;
      sort_order: number;
    }[];
  }[];
};

const uid = () => Math.random().toString(36).slice(2, 10);
const emptyValue = (): ValueForm => ({ key: uid(), label: "", price_delta: "0" });
const emptyOption = (): OptionForm => ({
  key: uid(),
  name: "",
  is_required: false,
  max_select: "1",
  values: [emptyValue()],
});

export function Products({ orgId, currency }: { orgId: string; currency: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["products", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, description, image_url, base_price, cost_price, stock, is_active, product_options(id, name, is_required, max_select, sort_order, product_option_values(id, label, price_delta, sort_order))",
        )
        .eq("organization_id", orgId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const adjust = useMutation({
    mutationFn: async ({ productId, delta }: { productId: string; delta: number }) =>
      callRpc("adjust_stock", {
        p_product: productId,
        p_delta: delta,
        p_reason: delta > 0 ? "purchase" : "manual_adjustment",
        p_note: null,
      }),
    onSuccess: () => {
      toast.success(t("common.save"));
      void qc.invalidateQueries({ queryKey: ["products", orgId] });
    },
    onError: (err: Error) => toast.error(translateError(t, err.message)),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="h-11" onClick={() => setEditing(null)}>
              <Plus className="mr-1 h-4 w-4" />
              {t("prod.new")}
            </Button>
          </DialogTrigger>
          <ProductDialog
            key={editing?.id ?? "new"}
            orgId={orgId}
            product={editing}
            onClose={() => {
              setOpen(false);
              setEditing(null);
              void qc.invalidateQueries({ queryKey: ["products", orgId] });
            }}
          />
        </Dialog>
      </div>

      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : null}
      {query.data?.length === 0 ? <EmptyState label={t("prod.empty")} /> : null}

      <div className="grid gap-3">
        {(query.data ?? []).map((p) => (
          <Card key={p.id}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold">
                    <span className="truncate">{p.name}</span>
                    {!p.is_active ? (
                      <Badge variant="secondary">{t("common.inactive")}</Badge>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">{money(p.base_price, currency)}</p>
                  {p.description ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => {
                    setEditing(p);
                    setOpen(true);
                  }}
                >
                  <Pencil className="mr-1 h-4 w-4" />
                  {t("common.edit")}
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="font-medium">
                  {t("common.stock")}: {p.stock}
                </span>
                <span className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => adjust.mutate({ productId: p.id, delta: -1 })}
                    disabled={adjust.isPending || p.stock <= 0}
                  >
                    -1
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => adjust.mutate({ productId: p.id, delta: 1 })}
                    disabled={adjust.isPending}
                  >
                    +1
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => adjust.mutate({ productId: p.id, delta: 10 })}
                    disabled={adjust.isPending}
                  >
                    +10
                  </Button>
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {p.product_options.map((o) => (
                  <li key={o.id} className="rounded-lg border px-3 py-2 text-sm">
                    <span className="font-medium">{o.name}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {o.product_option_values.map((v) => v.label).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProductDialog({
  orgId,
  product,
  onClose,
}: {
  orgId: string;
  product: ProductRow | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [imagePath, setImagePath] = useState<string | null>(product?.image_url ?? null);
  const [basePrice, setBasePrice] = useState(String(product?.base_price ?? ""));
  const [costPrice, setCostPrice] = useState(String(product?.cost_price ?? "0"));
  const [productStock, setProductStock] = useState(String(product?.stock ?? 0));
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [options, setOptions] = useState<OptionForm[]>(
    (product?.product_options ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => ({
        key: o.id,
        name: o.name,
        is_required: o.is_required,
        max_select: String(o.max_select),
        values: o.product_option_values
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((v) => ({ key: v.id, label: v.label, price_delta: String(v.price_delta) })),
      })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchOption(index: number, patch: Partial<OptionForm>) {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }
  function patchValue(oi: number, vi: number, patch: Partial<ValueForm>) {
    setOptions((prev) =>
      prev.map((o, i) =>
        i === oi
          ? { ...o, values: o.values.map((v, j) => (j === vi ? { ...v, ...patch } : v)) }
          : o,
      ),
    );
  }

  async function uploadImage(file: File) {
    if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      setError(t("order.imageOnly"));
      return;
    }
    const path = `${orgId}/product-${Date.now()}.${fileExtension(file)}`;
    const { error: upErr } = await supabase.storage
      .from(SHOP_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      setError(translateError(t, upErr.message));
      return;
    }
    setImagePath(path);
    toast.success(t("common.save"));
  }

  async function save() {
    setError(null);
    if (name.trim().length < 2) return setError(t("common.required"));
    const priceNum = Number(basePrice);
    const costNum = Number(costPrice || 0);
    if (basePrice.trim() === "" || !Number.isFinite(priceNum) || priceNum < 0) {
      return setError(t("prod.needPrice"));
    }
    if (!Number.isFinite(costNum) || costNum < 0) return setError(t("prod.needPrice"));
    const stockNum = Math.trunc(Number(productStock));
    if (!Number.isFinite(stockNum) || stockNum < 0 || productStock.trim() === "") {
      return setError(t("common.required"));
    }

    const groups = options
      .map((o) => ({
        ...o,
        maxNum: Math.max(1, Math.trunc(Number(o.max_select) || 1)),
        values: o.values.filter((v) => v.label.trim()),
      }))
      .filter((o) => o.name.trim() && o.values.length > 0);
    if (groups.some((g) => g.values.some((v) => !Number.isFinite(Number(v.price_delta || 0))))) {
      return setError(t("prod.needPrice"));
    }

    setBusy(true);
    try {
      let productId = product?.id;
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        image_url: imagePath,
        base_price: priceNum,
        cost_price: costNum,
        stock: stockNum,
        is_active: isActive,
      };
      if (productId) {
        const { error: err } = await supabase.from("products").update(payload).eq("id", productId);
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase
          .from("products")
          .insert({ organization_id: orgId, ...payload })
          .select("id")
          .single();
        if (err) throw err;
        productId = data.id;
      }

      // Rewrite the groups wholesale: simpler than diffing, and past orders keep
      // their own frozen copy of what was chosen, so nothing historical moves.
      const { error: delErr } = await supabase
        .from("product_options")
        .delete()
        .eq("product_id", productId!);
      if (delErr) throw delErr;

      for (const [index, group] of groups.entries()) {
        const { data: optionRow, error: optErr } = await supabase
          .from("product_options")
          .insert({
            organization_id: orgId,
            product_id: productId!,
            name: group.name.trim(),
            is_required: group.is_required,
            max_select: group.maxNum,
            sort_order: index,
          })
          .select("id")
          .single();
        if (optErr) throw optErr;

        const { error: valErr } = await supabase.from("product_option_values").insert(
          group.values.map((v, vi) => ({
            organization_id: orgId,
            option_id: optionRow.id,
            label: v.label.trim(),
            price_delta: Number(v.price_delta || 0),
            sort_order: vi,
          })),
        );
        if (valErr) throw valErr;
      }

      toast.success(t("common.save"));
      onClose();
    } catch (err) {
      setError(translateError(t, err instanceof Error ? err.message : null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{product ? t("common.edit") : t("prod.new")}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="p-name">{t("common.name")}</Label>
          <Input
            id="p-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="p-desc">{t("prod.description")}</Label>
          <Textarea
            id="p-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2">
            <Label htmlFor="p-price">{t("prod.basePrice")}</Label>
            <Input
              id="p-price"
              inputMode="decimal"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-cost">{t("prod.cost")}</Label>
            <Input
              id="p-cost"
              inputMode="decimal"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              className="h-11"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="p-stock">{t("common.stock")}</Label>
          <Input
            id="p-stock"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={productStock}
            onChange={(e) => setProductStock(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <Label htmlFor="p-active">{t("common.active")}</Label>
          <Switch id="p-active" checked={isActive} onCheckedChange={setIsActive} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="p-image">{t("prod.image")}</Label>
          <Input
            id="p-image"
            type="file"
            accept="image/*"
            className="h-11"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_BYTES)
                setCropFile(file);
              else if (file) setError(t("order.imageOnly"));
            }}
          />
          {imagePath ? <p className="text-xs text-muted-foreground">{imagePath}</p> : null}
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold">{t("prod.options")}</p>
            <p className="text-xs text-muted-foreground">{t("prod.optionsHint")}</p>
          </div>

          {options.map((option, oi) => (
            <div key={option.key} className="grid gap-3 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label={t("prod.optionName")}
                  placeholder={t("prod.optionName")}
                  value={option.name}
                  className="h-11"
                  onChange={(e) => patchOption(oi, { name: e.target.value })}
                />
                <Button
                  size="icon"
                  variant="outline"
                  className="h-11 w-11 shrink-0"
                  aria-label={t("common.delete")}
                  onClick={() => setOptions((prev) => prev.filter((_, i) => i !== oi))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={option.is_required}
                    onCheckedChange={(v) => patchOption(oi, { is_required: v })}
                  />
                  {t("prod.required")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  {t("prod.maxSelect")}
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={option.max_select}
                    className="h-10 w-20"
                    onChange={(e) => patchOption(oi, { max_select: e.target.value })}
                  />
                </label>
              </div>

              <div className="grid gap-2">
                {option.values.map((value, vi) => (
                  <div key={value.key} className="flex items-center gap-2">
                    <Input
                      aria-label={t("prod.choice")}
                      placeholder={t("prod.choice")}
                      value={value.label}
                      className="h-11"
                      onChange={(e) => patchValue(oi, vi, { label: e.target.value })}
                    />
                    <Input
                      aria-label={t("prod.priceDelta")}
                      placeholder={t("prod.priceDelta")}
                      inputMode="decimal"
                      value={value.price_delta}
                      className="h-11 w-28"
                      onChange={(e) => patchValue(oi, vi, { price_delta: e.target.value })}
                    />
                    {option.values.length > 1 ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11 shrink-0"
                        aria-label={t("common.delete")}
                        onClick={() =>
                          patchOption(oi, { values: option.values.filter((_, j) => j !== vi) })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  className="h-10 justify-start"
                  onClick={() => patchOption(oi, { values: [...option.values, emptyValue()] })}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t("prod.addChoice")}
                </Button>
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            className="h-11"
            onClick={() => setOptions((p) => [...p, emptyOption()])}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("prod.addOption")}
          </Button>
        </div>

        {error ? (
          <p
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button className="h-11" disabled={busy} onClick={() => void save()}>
          {t("common.save")}
        </Button>
      </DialogFooter>
      <ImageCropper
        file={cropFile}
        aspect={1}
        onCancel={() => setCropFile(null)}
        onComplete={(cropped) => {
          setCropFile(null);
          void uploadImage(cropped);
        }}
      />
    </DialogContent>
  );
}
