import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n, translateError } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  SHOP_BUCKET,
  fileExtension,
  useSignedUrl,
} from "@/lib/storage";

export function Settings({
  orgId,
  name,
  currency,
  isOpen,
}: {
  orgId: string;
  name: string;
  currency: string;
  isOpen: boolean;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [shopName, setShopName] = useState(name);
  const [curr, setCurr] = useState(currency);
  const [uploading, setUploading] = useState(false);

  const qr = useQuery({
    queryKey: ["qr-admin", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_qr")
        .select("id, image_url, label, is_active")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: qrUrl } = useSignedUrl(SHOP_BUCKET, qr.data?.image_url ?? null);

  const saveOrg = useMutation({
    mutationFn: async (patch: { name?: string; currency?: string; is_open?: boolean }) => {
      const { error } = await supabase.from("organizations").update(patch).eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("common.save"));
      void qc.invalidateQueries({ queryKey: ["membership"] });
      void qc.invalidateQueries({ queryKey: ["shop"] });
    },
    onError: (err: Error) => toast.error(translateError(t, err.message)),
  });

  async function uploadQr(file: File) {
    if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      toast.error(t("order.imageOnly"));
      return;
    }
    setUploading(true);
    try {
      const path = `${orgId}/qr-${Date.now()}.${fileExtension(file)}`;
      const { error: upErr } = await supabase.storage
        .from(SHOP_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      if (qr.data?.id) {
        const { error } = await supabase
          .from("payment_qr")
          .update({ image_url: path })
          .eq("id", qr.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("payment_qr")
          .insert({ organization_id: orgId, image_url: path, is_active: true });
        if (error) throw error;
      }
      toast.success(t("common.save"));
      await qr.refetch();
    } catch (err) {
      toast.error(translateError(t, err instanceof Error ? err.message : null));
    } finally {
      setUploading(false);
    }
  }

  const shopLink = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("set.shop")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="shop-name">{t("console.orgName")}</Label>
            <Input id="shop-name" value={shopName} onChange={(e) => setShopName(e.target.value)} className="h-11" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="shop-currency">{t("set.currency")}</Label>
            <Input
              id="shop-currency"
              value={curr}
              maxLength={4}
              onChange={(e) => setCurr(e.target.value)}
              className="h-11"
            />
          </div>
          <Button
            className="h-11"
            disabled={saveOrg.isPending}
            onClick={() => saveOrg.mutate({ name: shopName.trim() || name, currency: curr.trim() || "RM" })}
          >
            {t("common.save")}
          </Button>
          <div className="flex items-center justify-between rounded-lg border px-3 py-3">
            <Label htmlFor="shop-open">{t("set.open")}</Label>
            <Switch
              id="shop-open"
              checked={isOpen}
              onCheckedChange={(v) => saveOrg.mutate({ is_open: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("set.qr")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {qrUrl ? <img src={qrUrl} alt="DuitNow QR" className="max-h-52 rounded-lg border object-contain" /> : null}
          <div className="grid gap-2">
            <Label htmlFor="qr-file">{t("set.uploadQr")}</Label>
            <Input
              id="qr-file"
              type="file"
              accept="image/*"
              disabled={uploading}
              className="h-11"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadQr(file);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardContent className="grid gap-4 p-4">
          <div className="grid gap-2">
            <Label>{t("set.shopLink")}</Label>
            <div className="flex gap-2">
              <Input readOnly value={shopLink} className="h-11" />
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  void navigator.clipboard.writeText(shopLink);
                  toast.success(t("common.copied"));
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{t("set.myUserId")}</Label>
            <div className="flex gap-2">
              <Input readOnly value={user?.id ?? ""} className="h-11 font-mono text-xs" />
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  void navigator.clipboard.writeText(user?.id ?? "");
                  toast.success(t("common.copied"));
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
