import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, Minus, Plus, Search, ShoppingBag, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { LoadingState, EmptyState } from "@/components/States";
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
import { safeShopTheme, shopThemeStyle } from "@/lib/shop-theme";
import { isValidShopCode, normalizeShopCode } from "@/lib/shop-code";
import { dayNumber, formatCutoff, fullDate, weekdayShort, type IsoDate } from "@/lib/schedule";

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
/** One product as it is sold on ONE service date: that day's own quota. */
type Product = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price: number;
  remaining: number;
  cutoff_time: string | null;
  cutoff_passed: boolean;
  options: OptionGroup[];
};
/**
 * One cart line = one product with one exact set of choices, for the chosen
 * service date. Two coffees with different sugar levels are two lines, so the
 * key has to carry the choices.
 */
type CartLine = {
  key: string;
  productId: string;
  productName: string;
  optionLabel: string;
  optionValueIds: string[];
  price: number;
  remaining: number;
  qty: number;
};

function lineKey(productId: string, valueIds: string[]) {
  return `${productId}::${[...valueIds].sort().join(",")}`;
}

type Shop = {
  id: string;
  name: string;
  shop_code: string;
  currency: string;
  is_open: boolean;
  public_theme: string | null;
  button_color: string | null;
  today: IsoDate;
  first_service_date: IsoDate;
  last_service_date: IsoDate;
  preorder_max_days: number;
};
type CalendarDay = {
  service_date: IsoDate;
  open_items: number;
  available_items: number;
};
type ShopCalendar = {
  today: IsoDate;
  first_service_date: IsoDate;
  last_service_date: IsoDate;
  days: CalendarDay[];
};
type Menu = {
  service_date: IsoDate;
  first_service_date: IsoDate;
  last_service_date: IsoDate;
  items: Product[];
};

function normaliseMenu(menu: Menu): Product[] {
  return (menu.items ?? []).map((item) => ({
    ...item,
    base_price: Number(item.base_price),
    remaining: Number(item.remaining),
    options: (item.options ?? [])
      .map((group) => ({
        ...group,
        values: (group.values ?? [])
          .map((value) => ({ ...value, price_delta: Number(value.price_delta) }))
          .sort((a, b) => a.sort_order - b.sort_order),
      }))
      .filter((group) => group.values.length > 0)
      .sort((a, b) => a.sort_order - b.sort_order),
  }));
}

/**
 * A buyer always reaches one specific shop through that shop's own code.
 * Resolving the shop server-side means a shop whose owner account is gone
 * simply cannot be found, so no one can keep ordering from a dead shop.
 * The bookable days come with it, because nothing can be ordered for today.
 */
function useShopData(code: string) {
  return useQuery({
    queryKey: ["shop", code],
    enabled: isValidShopCode(code),
    retry: false,
    queryFn: async () => {
      const org = await callRpc<Shop>("get_shop_by_code", { p_code: code });
      let calendar: ShopCalendar | null = null;
      try {
        calendar = await callRpc<ShopCalendar>("get_shop_calendar", { p_org: org.id });
      } catch {
        // A closed shop has no bookable days; the storefront still renders.
        calendar = null;
      }
      return { org, calendar };
    },
  });
}

/** The menu for one service date, with that day's remaining portions. */
function useMenu(orgId: string | undefined, serviceDate: IsoDate | null) {
  return useQuery({
    queryKey: ["menu", orgId, serviceDate],
    enabled: Boolean(orgId && serviceDate),
    retry: false,
    queryFn: async () => {
      const menu = await callRpc<Menu>("get_shop_menu", {
        p_org: orgId,
        p_service_date: serviceDate,
      });
      return normaliseMenu(menu);
    },
  });
}

/** Shown until a buyer has a usable shop code, and when a code is unknown. */
function ShopCodeGate({ initial, invalid }: { initial: string; invalid: boolean }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const code = normalizeShopCode(value);
    if (!isValidShopCode(code)) return;
    void navigate({ to: "/guest", search: { code } });
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
        <h1 className="font-display text-2xl font-bold">{t("shop.codeTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("shop.codeBody")}</p>
        <form className="grid gap-3" onSubmit={submit}>
          <Label htmlFor="shop-code">{t("shop.codeLabel")}</Label>
          <Input
            id="shop-code"
            value={value}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            maxLength={16}
            className="h-12 font-mono text-lg uppercase tracking-[0.2em]"
            onChange={(e) => setValue(e.target.value.toUpperCase())}
          />
          {invalid ? (
            <p
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {t("shop.codeInvalid")}
            </p>
          ) : null}
          <Button type="submit" className="h-12" disabled={!isValidShopCode(value)}>
            {t("shop.codeContinue")}
          </Button>
        </form>
      </main>
    </div>
  );
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
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { code } = useSearch({ from: "/guest" });
  const { data, isLoading, isError } = useShopData(code);
  const [serviceDate, setServiceDate] = useState<IsoDate | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<Product | null>(null);

  const calendar = data?.calendar ?? null;

  // The first day that still has something to sell is the friendliest default.
  useEffect(() => {
    if (!calendar || serviceDate) return;
    const firstOpen =
      calendar.days.find((d) => d.available_items > 0) ??
      calendar.days.find((d) => d.open_items > 0) ??
      calendar.days[0];
    if (firstOpen) setServiceDate(firstOpen.service_date);
  }, [calendar, serviceDate]);

  const menuQuery = useMenu(data?.org?.id, serviceDate);
  const products = menuQuery.data ?? [];

  const currency = data?.org?.currency ?? "RM";
  const publicTheme = safeShopTheme(data?.org?.public_theme);
  const lines = useMemo(() => Object.values(cart).filter((l) => l.qty > 0), [cart]);
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const count = lines.reduce((sum, l) => sum + l.qty, 0);

  /** A cart belongs to one day only, so switching days starts a fresh cart. */
  function pickDate(date: IsoDate) {
    if (date === serviceDate) return;
    setServiceDate(date);
    setCart({});
    setPicking(null);
    setOpen(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

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
      const room = Math.max(0, product.remaining - used);
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
          remaining: product.remaining,
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
      const next = Math.max(0, Math.min(qty, line.remaining - used));
      if (next === 0) {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: { ...line, qty: next } };
    });
  }

  // An unusable or unknown code never shows a shop: the buyer is asked for a
  // code instead, so a removed shop cannot be ordered from by an old link.
  if (!isValidShopCode(code) || isError) {
    return <ShopCodeGate initial={code} invalid={isValidShopCode(code) && isError} />;
  }

  const shopOpen = Boolean(data?.org?.is_open);
  const canOrder = shopOpen && Boolean(serviceDate);

  return (
    <div
      className={`shop-theme shop-theme-${publicTheme} min-h-screen bg-background pb-24`}
      style={shopThemeStyle(data?.org?.button_color)}
    >
      <SiteHeader subtitle={data?.org?.name} />

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">🧋 {t("shop.preorderTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("shop.preorderNote")}</p>
          {data?.org && !data.org.is_open ? (
            <p
              className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="status"
            >
              {t("shop.closed")}
            </p>
          ) : null}
        </div>

        {/* Step one is always the pickup day: the menu belongs to a date. */}
        {calendar && calendar.days.length > 0 ? (
          <section className="mb-5">
            <p className="mb-2 text-sm font-semibold">{t("shop.pickDate")}</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {calendar.days.map((day) => {
                const active = day.service_date === serviceDate;
                const full = day.open_items > 0 && day.available_items === 0;
                const closed = day.open_items === 0;
                return (
                  <button
                    key={day.service_date}
                    type="button"
                    onClick={() => pickDate(day.service_date)}
                    aria-pressed={active}
                    className={`flex min-w-[4.5rem] shrink-0 flex-col items-center gap-0.5 rounded-lg border px-3 py-2 transition-colors ${
                      active ? "border-primary bg-primary/10" : "hover:bg-accent"
                    }`}
                  >
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {weekdayShort(day.service_date, lang)}
                    </span>
                    <span className="font-display text-xl font-bold leading-none">
                      {dayNumber(day.service_date)}
                    </span>
                    <span className="text-[0.65rem] text-muted-foreground">
                      {closed ? t("shop.dayClosed") : full ? t("shop.soldOut") : t("shop.dayOpen")}
                    </span>
                  </button>
                );
              })}
            </div>
            {serviceDate ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("shop.orderingFor")} {fullDate(serviceDate, lang)}
              </p>
            ) : null}
          </section>
        ) : null}

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

        {isLoading || menuQuery.isLoading ? <LoadingState /> : null}
        {!isLoading && !menuQuery.isLoading && filtered.length === 0 ? (
          <EmptyState label={serviceDate ? t("shop.dayEmpty") : t("shop.empty")} />
        ) : null}

        {/* POS-style tiles: picture and name only. Everything else is in the dialog. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((product) => {
            const inCart = qtyOfProduct(product.id);
            const soldOut = product.remaining <= 0 || inCart >= product.remaining;
            const shut = product.cutoff_passed;
            return (
              <Card key={product.id} className="overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left transition-colors hover:bg-accent disabled:opacity-60"
                  disabled={soldOut || shut || !canOrder}
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
                    {shut ? (
                      <Badge variant="secondary" className="w-fit">
                        {t("shop.cutoffClosed")}
                      </Badge>
                    ) : product.remaining <= 0 ? (
                      <Badge variant="secondary" className="w-fit">
                        {t("shop.soldOut")}
                      </Badge>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {money(product.base_price, currency)}
                        </p>
                        <p className="text-[0.65rem] text-muted-foreground">
                          {product.remaining} {t("shop.left")}
                          {product.cutoff_time
                            ? ` · ${t("shop.cutoffAt")} ${formatCutoff(product.cutoff_time)}`
                            : ""}
                        </p>
                      </>
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
        maxQty={picking ? Math.max(0, picking.remaining - qtyOfProduct(picking.id)) : 0}
        onClose={() => setPicking(null)}
        onAdd={(valueIds, label, price, qty) => {
          if (picking) addToCart(picking, valueIds, label, price, qty);
          setPicking(null);
        }}
      />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur no-print">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {t("shop.cart")}
              {serviceDate ? ` · ${fullDate(serviceDate, lang)}` : ""}
            </p>
            <p className="truncate text-sm font-semibold">
              {count} · {money(subtotal, currency)}
            </p>
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="shop" className="h-11" disabled={count === 0 || !canOrder}>
                {t("shop.checkout")}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>{t("shop.checkout")}</SheetTitle>
              </SheetHeader>
              {data?.org && serviceDate ? (
                <CheckoutForm
                  orgId={data.org.id}
                  currency={currency}
                  serviceDate={serviceDate}
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
  serviceDate,
  lines,
  subtotal,
  onQty,
  onDone,
}: {
  orgId: string;
  currency: string;
  serviceDate: IsoDate;
  lines: CartLine[];
  subtotal: number;
  onQty: (key: string, qty: number) => void;
  onDone: (token: string) => void;
}) {
  const { t, lang } = useI18n();
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
   * The cart holds that day's remaining count from when the menu was loaded, so
   * another buyer can empty a day while this form is open. Re-read the day right
   * before ordering, trim the cart to what is really left and say so, instead of
   * letting the order fail at the very last step.
   */
  async function dayConflict(): Promise<string | null> {
    if (lines.length === 0) return null;
    let menu: Product[];
    try {
      const fresh = await callRpc<Menu>("get_shop_menu", {
        p_org: orgId,
        p_service_date: serviceDate,
      });
      menu = normaliseMenu(fresh);
    } catch {
      return null; // Let the server stay the source of truth.
    }

    const byId = new Map(menu.map((item) => [item.id, item]));
    const productIds = Array.from(new Set(lines.map((l) => l.productId)));
    for (const id of productIds) {
      const item = byId.get(id);
      const productLines = lines.filter((l) => l.productId === id);
      const label = item?.name ?? productLines[0]?.productName ?? "";
      const available = item && !item.cutoff_passed ? Math.max(0, item.remaining) : 0;
      const wanted = productLines.reduce((sum, l) => sum + l.qty, 0);
      if (wanted <= available) continue;

      let left = available;
      for (const line of productLines) {
        const next = Math.min(line.qty, left);
        left -= next;
        if (next !== line.qty) onQty(line.key, next);
      }
      if (item?.cutoff_passed) return `${t("err.CUTOFF_PASSED")} ${label}`;
      return available === 0
        ? `${t("err.OUT_OF_STOCK")} ${label}`
        : `${t("shop.stockChanged")} ${label} (${available})`;
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
      const conflict = await dayConflict();
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
        p_service_date: serviceDate,
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
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        <span className="text-muted-foreground">{t("shop.pickupDay")}: </span>
        <span className="font-semibold">{fullDate(serviceDate, lang)}</span>
      </p>

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
                disabled={l.qty >= l.remaining}
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
