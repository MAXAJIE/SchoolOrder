import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Copy, Printer, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { LoadingState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useI18n, translateError, type TKey } from "@/lib/i18n";
import { money, dateTime } from "@/lib/format";
import {
  PROOF_BUCKET,
  validateImageFile,
  SHOP_BUCKET,
  fileExtension,
  useSignedUrl,
} from "@/lib/storage";

export const Route = createFileRoute("/order/$token")({
  head: () => ({
    meta: [
      { title: "Your order — SchoolOrder" },
      { name: "description", content: "Your pickup code, order details and payment status." },
      { property: "og:title", content: "Your order — SchoolOrder" },
      { property: "og:description", content: "Pickup code and payment status for your order." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderPage,
});

type OrderItem = {
  product_name: string;
  variant_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
};
type OrderView = {
  organization_id: string;
  organization_name: string;
  currency: string;
  order_number: string;
  pickup_code: string;
  buyer_name: string;
  buyer_class: string | null;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: "cash" | "duitnow";
  payment_status: "pending_payment" | "proof_uploaded" | "paid" | "rejected";
  status: "pending" | "confirmed" | "completed" | "cancelled";
  created_at: string;
  has_proof: boolean;
  items: OrderItem[];
};

function OrderPage() {
  const { token } = Route.useParams();
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const orderQuery = useQuery({
    queryKey: ["order", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_order_by_token", { p_token: token });
      if (error) throw error;
      return data as unknown as OrderView;
    },
    retry: false,
    refetchInterval: 30_000,
  });

  const order = orderQuery.data;

  const qrQuery = useQuery({
    queryKey: ["payment-qr", order?.organization_id],
    enabled: order?.payment_method === "duitnow" && Boolean(order?.organization_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_qr")
        .select("image_url, label")
        .eq("organization_id", order!.organization_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: qrUrl } = useSignedUrl(SHOP_BUCKET, qrQuery.data?.image_url ?? null);

  async function uploadProof(file: File) {
    const problem = validateImageFile(file);
    if (problem) {
      toast.error(problem === "size" ? t("shop.imageTooLarge") : t("order.imageOnly"));
      return;
    }
    setUploading(true);
    try {
      // Must be the order's own shop: the owner read policy keys off this folder.
      const orgId = order?.organization_id;
      if (!orgId) throw new Error("ORG_NOT_FOUND");
      const path = `${orgId}/${token.slice(0, 16)}-${Date.now()}.${fileExtension(file)}`;
      const { error: upErr } = await supabase.storage
        .from(PROOF_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { error: rpcErr } = await supabase.rpc("attach_payment_proof", {
        p_token: token,
        p_path: path,
      });
      if (rpcErr) throw rpcErr;
      toast.success(t("order.proofUploaded"));
      await orderQuery.refetch();
    } catch (err) {
      toast.error(translateError(t, err instanceof Error ? err.message : null));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader subtitle={order?.organization_name} />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {orderQuery.isLoading ? <LoadingState /> : null}
        {orderQuery.isError ? <ErrorState message={t("order.notFound")} /> : null}

        {order ? (
          <div className="flex flex-col gap-4">
            <Card>
              <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-primary" aria-hidden />
                <h1 className="text-lg font-semibold">{t("order.title")}</h1>
                <p className="text-sm text-muted-foreground">{t("order.pickupCode")}</p>
                <p className="text-4xl font-extrabold tracking-[0.2em]">{order.pickup_code}</p>
                <p className="text-xs text-muted-foreground">{t("order.showThis")}</p>
                <div className="mt-2 flex flex-wrap justify-center gap-2 no-print">
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer className="mr-1 h-4 w-4" />
                    {t("common.print")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(window.location.href);
                      toast.success(t("common.copied"));
                    }}
                  >
                    <Copy className="mr-1 h-4 w-4" />
                    {t("common.copy")}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("order.saveLink")}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{order.order_number}</CardTitle>
                <div className="flex gap-2">
                  <Badge variant="secondary">{t(`status.${order.status}` as TKey)}</Badge>
                  <Badge variant={order.payment_status === "paid" ? "default" : "outline"}>
                    {t(`pay.${order.payment_status}` as TKey)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <p className="text-muted-foreground">
                  {order.buyer_name}
                  {order.buyer_class ? ` · ${order.buyer_class}` : ""} · {dateTime(order.created_at)}
                </p>
                <Separator />
                <ul className="flex flex-col gap-2">
                  {order.items.map((item, i) => (
                    <li key={`${item.product_name}-${i}`} className="flex justify-between gap-2">
                      <span className="min-w-0">
                        {item.product_name} · {item.variant_name} × {item.quantity}
                      </span>
                      <span className="font-medium">{money(item.line_total, order.currency)}</span>
                    </li>
                  ))}
                </ul>
                <Separator />
                <div className="flex justify-between">
                  <span>{t("common.subtotal")}</span>
                  <span>{money(order.subtotal, order.currency)}</span>
                </div>
                {Number(order.discount) > 0 ? (
                  <div className="flex justify-between text-primary">
                    <span>{t("common.discount")}</span>
                    <span>-{money(order.discount, order.currency)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-base font-bold">
                  <span>{t("common.total")}</span>
                  <span>{money(order.total, order.currency)}</span>
                </div>
              </CardContent>
            </Card>

            {order.payment_method === "duitnow" && order.status !== "cancelled" ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("order.payNow")}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  {qrUrl ? (
                    <img src={qrUrl} alt={qrQuery.data?.label ?? "DuitNow QR"} className="max-h-64 rounded-lg border" />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("shop.duitnowNote")}</p>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadProof(file);
                    }}
                  />
                  <Button
                    className="h-11 w-full no-print"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    {t("order.uploadProof")}
                  </Button>
                  {order.has_proof ? (
                    <p className="text-sm text-muted-foreground">{t("order.proofUploaded")}</p>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {order.payment_method === "cash" ? (
              <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                {t("shop.cashNote")}
              </p>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
