/** Money is always stored as a number in the database; format only for display. */
export function money(amount: number | string | null | undefined, currency = "RM"): string {
  const n = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return `${currency} 0.00`;
  return `${currency} ${n.toFixed(2)}`;
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dayKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

export function isToday(value: string): boolean {
  const d = new Date(value);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
