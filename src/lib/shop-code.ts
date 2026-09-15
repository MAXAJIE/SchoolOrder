/**
 * A shop is reached by its own code, never by "whatever shop exists first".
 * The code is short, uppercase and safe to print on a poster or a QR sticker.
 */
export const SHOP_CODE_PATTERN = /^[A-Z0-9-]{4,16}$/;

export function normalizeShopCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function isValidShopCode(value: string | null | undefined): boolean {
  return SHOP_CODE_PATTERN.test(normalizeShopCode(value));
}

/** Absolute buyer link for a shop code. Empty during SSR, by design. */
export function shopLinkFor(code: string | null | undefined): string {
  const clean = normalizeShopCode(code);
  if (!clean || typeof window === "undefined") return "";
  return `${window.location.origin}/guest?code=${encodeURIComponent(clean)}`;
}
