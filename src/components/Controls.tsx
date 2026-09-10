import { Globe, Moon, Sun, Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LANGS, useI18n } from "@/lib/i18n";
import { useTheme, type ThemeMode } from "@/lib/theme";

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-10 gap-2" aria-label={t("common.language")}>
          <Globe className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase">{lang}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
        {LANGS.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => setLang(l.code)}>
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeSwitch() {
  const { mode, setMode } = useTheme();
  const { t } = useI18n();
  const options: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: "light", label: t("common.light"), icon: Sun },
    { value: "dark", label: t("common.dark"), icon: Moon },
    { value: "system", label: t("common.system"), icon: Laptop },
  ];
  const Current = options.find((o) => o.value === mode)?.icon ?? Laptop;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={t("common.theme")}>
          <Current className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("common.theme")}</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => setMode(o.value)}>
            <o.icon className="mr-2 h-4 w-4" />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
