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

type VariantForm = {
  id?: string;
  name: string;
  price: string;
  cost_price: string;
  is_active: boolean;
};
type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  stock: number;
  is_active: boolean;
  product_variants: {
    id: string;
    name: string;
    price: number;
    cost_price: number;
    is_active: boolean;
  }[];
};

const emptyVariant = (): VariantForm => ({
  name: "Standard",
  price: "",
  cost_price: "0",
  is_active: true,
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
          "id, name, description, image_url, stock, is_active, product_variants(id, name, price, cost_price, is_active, sort_order)",
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
                    {!p.is_active ? <Badge variant="secondary">{t("common.inactive")}</Badge> : null}
                  </p>
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
                <span className="font-medium">{t("common.stock")}: {p.stock}</span>
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
                {p.product_variants.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{v.name}</span>
                    <span>{money(v.price, currency)}</span>
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
  const [productStock, setProductStock] = useState(String(product?.stock ?? 0));
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [variants, setVariants] = useState<VariantForm[]>(
    product?.product_variants.length
      ? product.product_variants.map((v) => ({
          id: v.id,
          name: v.name,
          price: String(v.price),
          cost_price: String(v.cost_price),
          is_active: v.is_active,
        }))
      : [emptyVariant()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const parsed = variants
      .map((v) => ({
        ...v,
        priceNum: Number(v.price),
        costNum: Number(v.cost_price || 0),
      }))
      .filter((v) => v.name.trim() && Number.isFinite(v.priceNum) && v.priceNum >= 0 && v.price !== "");
    const stockNum = Math.trunc(Number(productStock));
    if (!Number.isFinite(stockNum) || stockNum < 0 || productStock.trim() === "") return setError(t("common.required"));
    if (parsed.length === 0) return setError(t("prod.needVariant"));

    setBusy(true);
    try {
      let productId = product?.id;
      if (productId) {
        const { error: err } = await supabase
          .from("products")
          .update({
            name: name.trim(),
            description: description.trim() || null,
            image_url: imagePath,
            stock: stockNum,
            is_active: isActive,
          })
          .eq("id", productId);
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase
          .from("products")
          .insert({
            organization_id: orgId,
            name: name.trim(),
            description: description.trim() || null,
            image_url: imagePath,
            stock: stockNum,
            is_active: isActive,
          })
          .select("id")
          .single();
        if (err) throw err;
        productId = data.id;
      }

      for (const [index, v] of parsed.entries()) {
        const payload = {
          organization_id: orgId,
          product_id: productId!,
          name: v.name.trim(),
          price: v.priceNum,
          cost_price: v.costNum,
          is_active: v.is_active,
          sort_order: index,
        };
        if (v.id) {
          const { error: err } = await supabase.from("product_variants").update(payload).eq("id", v.id);
          if (err) throw err;
        } else {
          const { error: err } = await supabase.from("product_variants").insert(payload);
          if (err) throw err;
        }
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
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="p-desc">{t("prod.description")}</Label>
          <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
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
          <Label htmlFor="p-image">{t("set.uploadQr").replace("QR", "image")}</Label>
          <Input
            id="p-image"
            type="file"
            accept="image/*"
            className="h-11"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_BYTES) setCropFile(file);
              else if (file) setError(t("order.imageOnly"));
            }}
          />
          {imagePath ? <p className="text-xs text-muted-foreground">{imagePath}</p> : null}
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold">{t("prod.variants")}</p>
          {variants.map((v, i) => (
            <div key={v.id ?? `new-${i}`} className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label={t("prod.variantName")}
                  value={v.name}
                  placeholder={t("prod.variantName")}
                  className="h-11"
                  onChange={(e) =>
                    setVariants((prev) => prev.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))
                  }
                />
                {variants.length > 1 ? (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-11 w-11 shrink-0"
                    aria-label={t("common.delete")}
                    onClick={() => setVariants((prev) => prev.filter((_, xi) => xi !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  aria-label={t("common.price")}
                  placeholder={t("common.price")}
                  inputMode="decimal"
                  value={v.price}
                  className="h-11"
                  onChange={(e) =>
                    setVariants((prev) => prev.map((x, xi) => (xi === i ? { ...x, price: e.target.value } : x)))
                  }
                />
                <Input
                  aria-label={t("prod.cost")}
                  placeholder={t("prod.cost")}
                  inputMode="decimal"
                  value={v.cost_price}
                  className="h-11"
                  onChange={(e) =>
                    setVariants((prev) => prev.map((x, xi) => (xi === i ? { ...x, cost_price: e.target.value } : x)))
                  }
                />
              </div>
            </div>
          ))}
          <Button variant="outline" className="h-11" onClick={() => setVariants((p) => [...p, emptyVariant()])}>
            <Plus className="mr-1 h-4 w-4" />
            {t("prod.addVariant")}
          </Button>
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
      <ImageCropper
        file={cropFile}
        onCancel={() => setCropFile(null)}
        onComplete={(cropped) => {
          setCropFile(null);
          void uploadImage(cropped);
        }}
      />
    </DialogContent>
  );
}
