import type { CSSProperties } from "react";

export const SHOP_THEMES = ["ocean", "mint", "coral"] as const;
export type ShopTheme = (typeof SHOP_THEMES)[number];

export const DEFAULT_SHOP_THEME: ShopTheme = "ocean";
export const DEFAULT_BUTTON_COLOR = "#2D8A9E";

export function isShopTheme(value: string): value is ShopTheme {
  return SHOP_THEMES.includes(value as ShopTheme);
}

export function safeShopTheme(value?: string | null): ShopTheme {
  return value && isShopTheme(value) ? value : DEFAULT_SHOP_THEME;
}

export function safeButtonColor(value?: string | null) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_BUTTON_COLOR;
}

/**
 * The shop colour drives every control inside the storefront, not only the
 * ones using `variant="shop"`. Overriding `--primary` (plus its foreground and
 * the focus ring) on the container means default buttons, selected option
 * chips, badges and links follow the owner's colour automatically, with no
 * per-button opt-in and no hardcoded colour classes in components.
 */
export function shopThemeStyle(buttonColor?: string | null): CSSProperties {
  const color = safeButtonColor(buttonColor);
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  const foreground = luminance > 0.56 ? "#102A32" : "#FFFFFF";
  return {
    "--shop-button": color,
    "--shop-button-foreground": foreground,
    "--primary": color,
    "--primary-foreground": foreground,
    "--ring": color,
  } as CSSProperties;
}

/** Wrapper class + inline variables for any public, shop-branded surface. */
export function shopSurface(theme?: string | null, buttonColor?: string | null) {
  return {
    className: `shop-theme shop-theme-${safeShopTheme(theme)}`,
    style: shopThemeStyle(buttonColor),
  };
}
