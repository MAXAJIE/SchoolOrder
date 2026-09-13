import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, Minus, Plus, Search, ShoppingBag, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { LoadingState, EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n, translateError } from "@/lib/i18n";
import { callRpc } from "@/lib/rpc";
import { money } from "@/lib/format";
import {
  PROOF_BUCKET,
  validateImageFile,
  SHOP_BUCKET,
  fileExtension,
  useSignedUrl,
} from "@/lib/storage";
import { DEFAULT_SHOP_THEME, isShopTheme, shopThemeStyle } from "@/lib/shop-theme";

type OptionValue = {
  id: string;
  label: string;
  price_delta: number;
  sort_order: number;
};
type OptionGroup = {
  id: string;
  name: string;
  is_required: boolean;
  max_select: number;
  sort_order: number;
  values: OptionValue[];
};
type Product = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price: number;
  stock: number;
  sort_order: number;
  options: OptionGroup[];
};
/**
 * One cart line = one product with one exact set of choices. Two coffees with
 * different sugar levels are two lines, so the key has to carry the choices.
 */
type CartLine = {
  key: string;
  productId: string;
  productName: string;
  optionLabel: string;
  optionValueIds: string[];
  price: number;
  stock: number;
  qty: number;
};

function lineKey(productId: string, valueIds: string[]) {
  return `${productId}::${[...valueIds].sort().join(",")}`;
}

function useShopData() {
  return useQuery({
    queryKey: ["shop"],
    queryFn: async () => {
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .select("id, name, currency, is_open, public_theme, button_color")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (orgErr) throw orgErr;
      if (!org) return { org: null, products: [] as Product[] };

      const { data: products, error: prodErr } = await supabase
        .from("products")
        .select(
          "id, name, description, image_url, base_price, stock, sort_order, product_options(id, name, is_required, max_select, sort_order, product_option_values(id, label, price_delta, sort_order))",
        )
        .eq("organization_id", org.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (prodErr) throw prodErr;

      const cleaned: Product[] = (products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        image_url: p.image_url,
        base_price: Number(p.base_price),
        stock: Number(p.stock),
        sort_order: p.sort_order,
        options: (p.product_options ?? [])
          .map((o) => ({
            id: o.id,
            name: o.name,
            is_required: o.is_required,
            max_select: o.max_select,
            sort_order: o.sort_order,
            values: (o.product_option_values ?? [])
              .map((v) => ({ ...v, price_delta: Number(v.price_delta) }))
              .sort((a, b) => a.sort_order - b.sort_order),
          }))
          .filter((o) => o.values.length > 0)
          .sort((a, b) => a.sort_order - b.sort_order),
      }));
      return { org, products: cleaned };
    },
  });
}

/** Active DuitNow QR for this shop only. Never fall back to another shop's QR. */
function usePaymentQr(orgId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["payment-qr", orgId],
    enabled: enabled && Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_qr")
        .select("image_url, label")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Product photos are cropped to a square on upload, so a square box with
 * object-cover shows the whole intended crop, at any screen width.
 */
function ProductImage({ path, alt }: { path: string | null; alt: string }) {
  const { data: url } = useSignedUrl(SHOP_BUCKET, path);
  return (
    <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
      {url ? (
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ShoppingBag className="h-7 w-7" aria-hidden />
        </div>
      )}
    </div>
  );
}

export function ShopPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useShopData();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<Product | null>(null);

  const currency = data?.org?.currency ?? "RM";
  const publicTheme = data?.org?.public_theme && isShopTheme(data.org.public_theme)
    ? data.org.public_theme
    : DEFAULT_SHOP_THEME;
  const lines = useMemo(() => Object.values(cart).filter((l) => l.qty > 0), [cart]);
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const count = lines.reduce((sum, l) => sum + l.qty, 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data?.products ?? [];
    return (data?.products ?? []).filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  function qtyOfProduct(productId: string) {
    return Object.values(cart)
      .filter((l) => l.productId === productId)
      .reduce((sum, l) => sum + l.qty, 0);
  }

  function addToCart(
    product: Product,
    valueIds: string[],
    label: string,
    price: number,
    qty: number,
  ) {
    setCart((prev) => {
      const key = lineKey(product.id, valueIds);
      const used = Object.values(prev)
        .filter((l) => l.productId === product.id && l.key !== key)
        .reduce((sum, l) => sum + l.qty, 0);
      const room = Math.max(0, product.stock - used);
      const next = Math.min((prev[key]?.qty ?? 0) + qty, room);
      if (next <= 0) return prev;
      return {
        ...prev,
        [key]: {
          key,
          productId: product.id,
          productName: product.name,
          optionLabel: label,
          optionValueIds: valueIds,
          price,
          stock: product.stock,
          qty: next,
        },
      };
    });
  }

  function setQty(key: string, qty: number) {
    setCart((prev) => {
      const line = prev[key];
      if (!line) return prev;
      const used = Object.values(prev)
        .filter((candidate) => candidate.productId === line.productId && candidate.key !== key)
        .reduce((sum, candidate) => sum + candidate.qty, 0);
      const next = Math.max(0, Math.min(qty, line.stock - used));
      if (next === 0) {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: { ...line, qty: next } };
    });
  }

  return (
    <div
      className={`shop-theme shop-theme-${publicTheme} min-h-screen bg-background pb-24`}
      style={shopThemeStyle(data?.org?.button_color)}
    >
      <SiteHeader subtitle={data?.org?.name} />

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">🧋 {t("app.tagline")}</h1>
          {data?.org && !data.org.is_open ? (
            <p
              className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="status"
            >
              {t("shop.closed")}
            </p>
          ) : null}
        </div>

        <div className="relative mb-5 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("shop.searchPlaceholder")}
            aria-label={t("common.search")}
            className="h-11 pl-9"
          />
        </div>

        {isLoading ? <LoadingState /> : null}
        {isError ? <ErrorState onRetry={() => void refetch()} /> : null}
        {!isLoading && !isError && filtered.length === 0 ? (
          <EmptyState label={t("shop.empty")} />
        ) : null}

        {/* POS-style tiles: picture and name only. Everything else is in the dialog. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((product) => {
            const soldOut = product.stock <= 0 || qtyOfProduct(product.id) >= product.stock;
            const inCart = qtyOfProduct(product.id);
            return (
              <Card key={product.id} className="overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left transition-colors hover:bg-accent disabled:opacity-60"
                  disabled={soldOut || !data?.org?.is_open}
                  onClick={() => setPicking(product)}
                >
                  <CardContent className="flex flex-col gap-2 p-3">
                    <div className="relative">
                      <ProductImage path={product.image_url} alt={product.name} />
                      {inCart > 0 ? (
                        <Badge className="absolute right-1 top-1">{inCart}</Badge>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight">
                      {product.name}
                    </p>
                    {product.stock <= 0 ? (
                      <Badge variant="secondary" className="w-fit">
                        {t("shop.soldOut")}
                      </Badge>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {money(product.base_price, currency)}
                      </p>
                    )}
                  </CardContent>
                </button>
              </Card>
            );
          })}
        </div>
      </main>

      <ProductDialog
        product={picking}
        currency={currency}
        maxQty={picking ? Math.max(0, picking.stock - qtyOfProduct(picking.id)) : 0}
        onClose={() => setPicking(null)}
        onAdd={(valueIds, label, price, qty) => {
          if (picking) addToCart(picking, valueIds, label, price, qty);
          setPicking(null);
        }}
      />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur no-print">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t("shop.cart")}</p>
            <p className="truncate text-sm font-semibold">
              {count} · {money(subtotal, currency)}
            </p>
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="shop" className="h-11" disabled={count === 0 || !data?.org?.is_open}>
                {t("shop.checkout")}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>{t("shop.checkout")}</SheetTitle>
              </SheetHeader>
              {data?.org ? (
                <CheckoutForm
                  orgId={data.org.id}
                  currency={currency}
                  lines={lines}
                  subtotal={subtotal}
                  onQty={setQty}
                  onDone={(token) => {
                    setCart({});
                    setOpen(false);
                    void navigate({ to: "/order/$token", params: { token } });
                  }}
                />
              ) : null}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}

/** Tap a product, build it, then add it. Nothing is customised in the grid. */
function ProductDialog({
  product,
  currency,
  maxQty,
  onClose,
  onAdd,
}: {
  product: Product | null;
  currency: string;
  maxQty: number;
  onClose: () => void;
  onAdd: (valueIds: string[], label: string, price: number, qty: number) => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={Boolean(product)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product?.name ?? t("guest.customise")}</DialogTitle>
        </DialogHeader>
        {product ? (
          <ProductForm
            key={product.id}
            product={product}
            currency={currency}
            maxQty={maxQty}
            onAdd={onAdd}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({
  product,
  currency,
  maxQty,
  onAdd,
}: {
  product: Product;
  currency: string;
  maxQty: number;
  onAdd: (valueIds: string[], label: string, price: number, qty: number) => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    // A required single-choice group starts on its first value, like a POS.
    const initial: Record<string, string[]> = {};
    for (const group of product.options) {
      if (group.is_required && group.max_select === 1 && group.values[0]) {
        initial[group.id] = [group.values[0].id];
      } else {
        initial[group.id] = [];
      }
    }
    return initial;
  });
  const [qty, setQty] = useState(1);

  const chosen = product.options.flatMap((g) =>
    (selected[g.id] ?? [])
      .map((id) => g.values.find((v) => v.id === id))
      .filter((v): v is OptionValue => Boolean(v)),
  );
  const unitPrice = product.base_price + chosen.reduce((sum, v) => sum + v.price_delta, 0);
  const missing = product.options.find((g) => g.is_required && (selected[g.id] ?? []).length === 0);

  function toggle(group: OptionGroup, valueId: string) {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.max_select === 1) {
        const next = current.includes(valueId) && !group.is_required ? [] : [valueId];
        return { ...prev, [group.id]: next };
      }
      if (current.includes(valueId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== valueId) };
      }
      if (current.length >= group.max_select) return prev;
      return { ...prev, [group.id]: [...current, valueId] };
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {product.description ? (
        <p className="text-sm text-muted-foreground">{product.description}</p>
      ) : null}

      {product.options.map((group) => (
        <fieldset key={group.id} className="grid gap-2">
          <legend className="mb-1 flex items-center gap-2 text-sm font-semibold">
            {group.name}
            {group.is_required ? (
              <Badge variant="secondary">{t("guest.required")}</Badge>
            ) : group.max_select > 1 ? (
              <span className="text-xs font-normal text-muted-foreground">
                {t("guest.upTo")} {group.max_select}
              </span>
            ) : null}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {group.values.map((value) => {
              const active = (selected[group.id] ?? []).includes(value.id);
              return (
                <Button
                  key={value.id}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className="h-auto min-h-11 justify-between gap-2 whitespace-normal px-3 py-2 text-left"
                  onClick={() => toggle(group, value.id)}
                >
                  <span className="min-w-0 text-sm">{value.label}</span>
                  {value.price_delta !== 0 ? (
                    <span className="shrink-0 text-xs">
                      {value.price_delta > 0 ? "+" : "-"}
                      {money(Math.abs(value.price_delta), currency)}
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
        <span className="text-sm font-medium">{t("common.quantity")}</span>
        <span className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-10 w-10"
            aria-label="-"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-6 text-center font-semibold">{qty}</span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-10 w-10"
            aria-label="+"
            disabled={qty >= maxQty}
            onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </span>
      </div>

      <Button
        type="button"
        className="h-12"
        disabled={Boolean(missing) || maxQty <= 0}
        onClick={() =>
          onAdd(
            chosen.map((v) => v.id),
            chosen.map((v) => v.label).join(", ") || "Standard",
            unitPrice,
            qty,
          )
        }
      >
        {t("shop.add")} · {money(unitPrice * qty, currency)}
      </Button>
    </div>
  );
}

function CheckoutForm({
  orgId,
  currency,
  lines,
  subtotal,
  onQty,
  onDone,
}: {
  orgId: string;
  currency: string;
  lines: CartLine[];
  subtotal: number;
  onQty: (key: string, qty: number) => void;
  onDone: (token: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [klass, setKlass] = useState("");
  const [promo, setPromo] = useState("");
  const [method, setMethod] = useState<"cash" | "duitnow" | null>(null);
  const [proof, setProof] = useState<File | null>(null);
  const proofRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qrQuery = usePaymentQr(orgId, method === "duitnow");
  const { data: qrUrl } = useSignedUrl(SHOP_BUCKET, qrQuery.data?.image_url ?? null);

  function pickProof(file: File | undefined) {
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      setError(problem === "size" ? t("shop.imageTooLarge") : t("order.imageOnly"));
      if (proofRef.current) proofRef.current.value = "";
      return;
    }
    setError(null);
    setProof(file);
  }

  /**
   * The cart holds a stock snapshot from page load, so another buyer can empty
   * a product while this form is open. Re-read stock right before ordering,
   * trim the cart to what is really available and tell the buyer, instead of
   * letting the order fail at the very last step.
   */
  async function stockConflict(): Promise<string | null> {
    const productIds = Array.from(new Set(lines.map((l) => l.productId)));
    if (productIds.length === 0) return null;
    const { data, error: stockErr } = await supabase
      .from("products")
      .select("id, name, stock, is_active")
      .in("id", productIds);
    if (stockErr) return null; // Let the server stay the source of truth.

    const fresh = new Map((data ?? []).map((p) => [p.id as string, p]));
    for (const id of productIds) {
      const row = fresh.get(id);
      const productLines = lines.filter((l) => l.productId === id);
      const name = row?.name ?? productLines[0]?.productName ?? "";
      const available = row && row.is_active !== false ? Math.max(0, Number(row.stock)) : 0;
      const wanted = productLines.reduce((sum, l) => sum + l.qty, 0);
      if (wanted <= available) continue;

      let left = available;
      for (const line of productLines) {
        const next = Math.min(line.qty, left);
        left -= next;
        if (next !== line.qty) onQty(line.key, next);
      }
      return available === 0
        ? `${t("err.OUT_OF_STOCK")} ${name}`
        : `${t("shop.stockChanged")} ${name} (${available})`;
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError(t("err.INVALID_NAME"));
    if (!method) return setError(t("shop.selectPayment"));
    if (lines.length === 0) return setError(t("err.EMPTY_CART"));
    if (method === "duitnow" && !proof) return setError(t("shop.proofRequired"));

    setBusy(true);
    try {
      const conflict = await stockConflict();
      if (conflict) {
        setError(conflict);
        return;
      }
      const data = await callRpc<{ access_token?: string }>("create_public_order", {
        p_org: orgId,
        p_buyer_name: name.trim(),
        p_buyer_age: age ? Number(age) : null,
        p_buyer_class: klass.trim() || null,
        p_items: lines.map((l) => ({
          product_id: l.productId,
          option_value_ids: l.optionValueIds,
          quantity: l.qty,
        })),
        p_payment_method: method,
        p_promo_code: promo.trim() || null,
      });
      const token = data?.access_token;
      if (!token) throw new Error("ORDER_NOT_FOUND");

      // The receipt photo is held in the browser until the order exists, so an
      // abandoned checkout never leaves an unattached file in storage.
      if (method === "duitnow" && proof) {
        const path = `${orgId}/${token.slice(0, 16)}-${Date.now()}.${fileExtension(proof)}`;
        const { error: upErr } = await supabase.storage
          .from(PROOF_BUCKET)
          .upload(path, proof, { upsert: false, contentType: proof.type });
        if (upErr) throw upErr;
        await callRpc("attach_payment_proof", { p_token: token, p_path: path });
      }

      onDone(token);
    } catch (err) {
      setError(translateError(t, err instanceof Error ? err.message : null));
    } finally {
      setBusy(false);
    }
  }

  if (lines.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">{t("shop.cartEmpty")}</p>;
  }

  return (
    <form className="flex flex-col gap-5 py-4" onSubmit={submit} noValidate>
      <ul className="flex flex-col gap-2">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              {l.productName}
              {l.optionLabel && l.optionLabel !== "Standard" ? ` · ${l.optionLabel}` : ""}
            </span>
            <span className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                aria-label="-"
                onClick={() => onQty(l.key, l.qty - 1)}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-5 text-center">{l.qty}</span>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                aria-label="+"
                disabled={l.qty >= l.stock}
                onClick={() => onQty(l.key, l.qty + 1)}
              >
                <Plus className="h-3 w-3" />
              </Button>
              <span className="w-16 text-right font-medium">
                {money(l.price * l.qty, currency)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex justify-between border-t pt-3 text-sm font-semibold">
        <span>{t("common.subtotal")}</span>
        <span>{money(subtotal, currency)}</span>
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold">{t("shop.yourDetails")}</legend>
        <div className="grid gap-2">
          <Label htmlFor="buyer-name">{t("shop.buyerName")}</Label>
          <Input
            id="buyer-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2">
            <Label htmlFor="buyer-age">{t("shop.buyerAge")}</Label>
            <Input
              id="buyer-age"
              type="number"
              min={5}
              max={100}
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="buyer-class">{t("shop.buyerClass")}</Label>
            <Input
              id="buyer-class"
              value={klass}
              onChange={(e) => setKlass(e.target.value)}
              className="h-11"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">{t("shop.payment")}</legend>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={method === "cash" ? "default" : "outline"}
            className="h-11"
            onClick={() => setMethod("cash")}
          >
            {t("shop.cash")}
          </Button>
          <Button
            type="button"
            variant={method === "duitnow" ? "default" : "outline"}
            className="h-11"
            onClick={() => setMethod("duitnow")}
          >
            {t("shop.duitnow")}
          </Button>
        </div>
        {method ? (
          <p className="text-xs text-muted-foreground">
            {method === "cash" ? t("shop.cashNote") : t("shop.duitnowNote")}
          </p>
        ) : null}

        {method === "duitnow" ? (
          <div className="mt-1 grid gap-3 rounded-lg border p-3">
            {qrUrl ? (
              <img
                src={qrUrl}
                alt={qrQuery.data?.label ?? "DuitNow QR"}
                className="mx-auto max-h-56 rounded-md border"
              />
            ) : null}
            <input
              ref={proofRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickProof(e.target.files?.[0])}
            />
            {proof ? (
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{proof.name}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={t("common.remove")}
                  onClick={() => {
                    setProof(null);
                    if (proofRef.current) proofRef.current.value = "";
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => proofRef.current?.click()}
                className="flex w-full flex-col items-center gap-1 rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground transition-colors hover:bg-accent"
              >
                <ImagePlus className="h-5 w-5" aria-hidden />
                <span className="font-medium text-foreground">{t("order.uploadProof")}</span>
                <span className="text-xs">{t("shop.proofHint")}</span>
              </button>
            )}
          </div>
        ) : null}
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="promo">{t("shop.promo")}</Label>
        <Input
          id="promo"
          value={promo}
          onChange={(e) => setPromo(e.target.value.toUpperCase())}
          placeholder={t("shop.promoPlaceholder")}
          className="h-11"
        />
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="shop" className="h-12" disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {busy ? t("shop.placing") : t("shop.placeOrder")}
      </Button>
    </form>
  );
}
