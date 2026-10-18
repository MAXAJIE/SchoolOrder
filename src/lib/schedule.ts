/**
 * Calendar helpers for the preorder system.
 *
 * A service date is always a plain calendar day ("2026-09-20"), never an
 * instant. It is never turned into a UTC timestamp, because `new Date("2026-09-20")`
 * is midnight UTC and a browser west of Greenwich would render it as the day
 * before. Every date here is built at local noon instead, which is safe in
 * every timezone.
 */

export type IsoDate = string;

const LOCALES: Record<string, string> = { en: "en-GB", zh: "zh-CN", ms: "ms-MY" };

function locale(lang: string) {
  return LOCALES[lang] ?? "en-GB";
}

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Local noon for the given calendar day, so no timezone can shift the day. */
export function parseIsoDate(iso: IsoDate): Date {
  const [y, m, d] = iso.split("-").map((part) => Number(part));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const ms = parseIsoDate(b).getTime() - parseIsoDate(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function weekdayShort(iso: IsoDate, lang: string): string {
  return parseIsoDate(iso).toLocaleDateString(locale(lang), { weekday: "short" });
}

export function dayNumber(iso: IsoDate): string {
  return `${parseIsoDate(iso).getDate()}`;
}

export function monthShort(iso: IsoDate, lang: string): string {
  return parseIsoDate(iso).toLocaleDateString(locale(lang), { month: "short" });
}

export function fullDate(iso: IsoDate, lang: string): string {
  return parseIsoDate(iso).toLocaleDateString(locale(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "18:00" from whatever the database sent ("18:00", "18:00:00", null). */
export function formatCutoff(cutoff: string | null | undefined): string {
  if (!cutoff) return "";
  const parts = cutoff.split(":");
  if (parts.length < 2) return cutoff;
  return `${(parts[0] ?? "").padStart(2, "0")}:${parts[1] ?? "00"}`;
}
