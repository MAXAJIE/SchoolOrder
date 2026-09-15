import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Palette } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useI18n, translateError, type TKey } from "@/lib/i18n";
import {
  DEFAULT_BUTTON_COLOR,
  DEFAULT_SHOP_THEME,
  SHOP_THEMES,
  isShopTheme,
  safeButtonColor,
  type ShopTheme,
} from "@/lib/shop-theme";
import { cn } from "@/lib/utils";

export function AppearanceSettings({
  orgId,
  initialTheme,
  initialButtonColor,
}: {
  orgId: string;
  initialTheme?: string | null | undefined;
  initialButtonColor?: string | null | undefined;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [theme, setTheme] = useState<ShopTheme>(
    initialTheme && isShopTheme(initialTheme) ? initialTheme : DEFAULT_SHOP_THEME,
  );
  const [buttonColor, setButtonColor] = useState(safeButtonColor(initialButtonColor));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("update_shop_appearance", {
        p_org: orgId,
        p_theme: theme,
        p_button_color: safeButtonColor(buttonColor),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("set.appearanceSaved"));
      void qc.invalidateQueries({ queryKey: ["membership"] });
      void qc.invalidateQueries({ queryKey: ["shop"] });
    },
    onError: (err: Error) => toast.error(translateError(t, err.message)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-4 w-4 text-primary" aria-hidden />
          {t("set.appearance")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t("set.publicTheme")}</legend>
          <div className="grid grid-cols-3 gap-2">
            {SHOP_THEMES.map((option) => (
              <Button
                key={option}
                type="button"
                variant="outline"
                aria-pressed={theme === option}
                onClick={() => setTheme(option)}
                className={cn("theme-choice", `theme-choice-${option}`, theme === option && "theme-choice-active")}
              >
                <span className="theme-choice-swatch" aria-hidden />
                <span>{t(`set.theme.${option}` as TKey)}</span>
              </Button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-2">
          <Label htmlFor="shop-button-color">{t("set.buttonColor")}</Label>
          <div className="flex items-center gap-3 rounded-md border p-2">
            <input
              id="shop-button-color"
              type="color"
              value={buttonColor}
              onChange={(event) => setButtonColor(event.target.value)}
              className="h-10 w-12 cursor-pointer rounded border-0 bg-transparent"
            />
            <span className="flex-1 font-mono text-sm">{buttonColor.toUpperCase()}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setButtonColor(DEFAULT_BUTTON_COLOR)}
            >
              {t("set.resetColor")}
            </Button>
          </div>
        </div>
        <Button className="h-11" disabled={save.isPending} onClick={() => save.mutate()}>
          {t("common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}