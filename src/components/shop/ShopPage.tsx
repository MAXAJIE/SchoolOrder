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


type Variant = {
  id: string;
  name: string;
  price: number;
  sort_order: number;
};
type Product = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  stock: number;
  sort_order: number;
  product_variants: Variant[];
};
type CartLine = {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  price: number;
  stock: number;
  qty: number;
};

function useShopData() {
  return useQuery({
    queryKey: ["shop"],
    queryFn: async () => {
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .select("id, name, currency, is_open")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (orgErr) throw orgErr;
      if (!org) return { org: null, products: [] as Product[] };

      const { data: products, error: prodErr } = await supabase
        .from("products")
        .select(
          "id, name, description, image_url, stock, sort_order, product_variants(id, name, price, sort_order, is_active)",
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
        stock: Number(p.stock),
        sort_order: p.sort_order,
        product_variants: (p.product_variants ?? [])
          .filter((v: { is_active: boolean }) => v.is_active)
          .map((v: Variant) => ({ ...v, price: Number(v.price) }))
          .sort((a: Variant, b: Variant) => a.sort_order - b.sort_order),
      }));
      return { org, products: cleaned.filter((p) => p.product_variants.length > 0) };
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

function ProductImage({ path, alt }: { path: string | null; alt: string }) {
  const { data: url } = useSignedUrl(SHOP_BUCKET, path);
  if (!url) {
    return (
      <div className="flex h-32 w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <ShoppingBag className="h-6 w-6" aria-hidden />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="h-32 w-full rounded-lg object-cover"
    />
  );
}

export function ShopPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useShopData();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [open, setOpen] = useState(false);

  const currency = data?.org?.currency ?? "RM";
  const lines = useMemo(() => Object.values(cart).filter((l) => l.qty > 0), [cart]);
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const count = lines.reduce((sum, l) => sum + l.qty, 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data?.products ?? [];
    return (data?.products ?? []).filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        p.product_variants.some((v) => v.name.toLowerCase().includes(q)),
    );
  }, [data, search]);

  function addToCart(product: Product, variant: Variant) {
    setCart((prev) => {
      const current = prev[variant.id];
      const usedByOtherVariants = Object.values(prev)
        .filter((line) => line.productId === product.id && line.variantId !== variant.id)
        .reduce((sum, line) => sum + line.qty, 0);
      const qty = Math.min((current?.qty ?? 0) + 1, Math.max(0, product.stock - usedByOtherVariants));
      if (qty === 0) return prev;
      return {
        ...prev,
        [variant.id]: {
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
          price: variant.price,
          stock: product.stock,
          qty,
        },
      };
    });
  }

  function setQty(variantId: string, qty: number) {
    setCart((prev) => {
      const line = prev[variantId];
      if (!line) return prev;
      const usedByOtherVariants = Object.values(prev)
        .filter((candidate) => candidate.productId === line.productId && candidate.variantId !== variantId)
        .reduce((sum, candidate) => sum + candidate.qty, 0);
      const next = Math.max(0, Math.min(qty, line.stock - usedByOtherVariants));
      if (next === 0) {
        const { [variantId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [variantId]: { ...line, qty: next } };
    });
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <SiteHeader subtitle={data?.org?.name} />

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("app.tagline")}</h1>
          {data?.org && !data.org.is_open ? (
            <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="status">
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <Card key={product.id} className="overflow-hidden">
              <CardContent className="flex flex-col gap-3 p-4">
                <ProductImage path={product.image_url} alt={product.name} />
                <div>
                  <h2 className="text-base font-semibold leading-tight">{product.name}</h2>
                  {product.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {product.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {product.stock > 0 ? `${product.stock} ${t("shop.left")}` : t("shop.soldOut")}
                  </p>
                </div>
                <ul className="flex flex-col gap-2">
                  {product.product_variants.map((variant) => {
                    const inCart = cart[variant.id]?.qty ?? 0;
                    const productQtyInCart = Object.values(cart)
                      .filter((line) => line.productId === product.id)
                      .reduce((sum, line) => sum + line.qty, 0);
                    const soldOut = product.stock <= 0;
                    return (
                      <li
                        key={variant.id}
                        className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{variant.name}</p>
                          <p className="text-xs text-muted-foreground">{money(variant.price, currency)}</p>
                        </div>
                        {soldOut ? (
                          <Badge variant="secondary">{t("shop.soldOut")}</Badge>
                        ) : inCart > 0 ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-9 w-9"
                              aria-label="-"
                              onClick={() => setQty(variant.id, inCart - 1)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-6 text-center text-sm font-semibold">{inCart}</span>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-9 w-9"
                              aria-label="+"
                              disabled={productQtyInCart >= product.stock}
                              onClick={() => setQty(variant.id, inCart + 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="h-9"
                            disabled={productQtyInCart >= product.stock}
                            onClick={() => addToCart(product, variant)}
                          >
                            {t("shop.add")}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

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
              <Button className="h-11" disabled={count === 0 || !data?.org?.is_open}>
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
  onQty: (variantId: string, qty: number) => void;
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
        if (next !== line.qty) onQty(line.variantId, next);
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
        p_items: lines.map((l) => ({ variant_id: l.variantId, quantity: l.qty })),
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
          <li key={l.variantId} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              {l.productName} · {l.variantName}
            </span>
            <span className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                aria-label="-"
                onClick={() => onQty(l.variantId, l.qty - 1)}
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
                onClick={() => onQty(l.variantId, l.qty + 1)}
              >
                <Plus className="h-3 w-3" />
              </Button>
              <span className="w-16 text-right font-medium">{money(l.price * l.qty, currency)}</span>
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
          <Input id="buyer-name" required value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
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
            <Input id="buyer-class" value={klass} onChange={(e) => setKlass(e.target.value)} className="h-11" />
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

      <Button type="submit" className="h-12" disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {busy ? t("shop.placing") : t("shop.placeOrder")}
      </Button>
    </form>
  );
}
