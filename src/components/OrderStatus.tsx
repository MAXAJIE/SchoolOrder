import { Badge } from "@/components/ui/badge";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type OrderStatus = "pending" | "confirmed" | "completed" | "cancelled";
type PaymentStatus = "pending_payment" | "proof_uploaded" | "paid" | "rejected";

const STATUS_META: Record<OrderStatus, { emoji: string; className: string; hint: TKey }> = {
  pending: { emoji: "⏳", className: "status-pending", hint: "order.statusHint.pending" },
  confirmed: { emoji: "👍", className: "status-confirmed", hint: "order.statusHint.confirmed" },
  completed: { emoji: "🎉", className: "status-completed", hint: "order.statusHint.completed" },
  cancelled: { emoji: "✕", className: "status-cancelled", hint: "order.statusHint.cancelled" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  const meta = STATUS_META[status];
  return (
    <Badge className={cn("gap-1 border px-2.5 py-1", meta.className)}>
      <span aria-hidden>{meta.emoji}</span>
      {t(`status.${status}` as TKey)}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { t } = useI18n();
  return <Badge className={cn("border px-2.5 py-1", `payment-${status}`)}>{t(`pay.${status}` as TKey)}</Badge>;
}

export function OrderStatusBanner({
  status,
  paymentStatus,
}: {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
}) {
  const { t } = useI18n();
  const meta = STATUS_META[status];
  return (
    <section className={cn("status-banner", meta.className)} aria-live="polite">
      <div className="status-banner-icon" aria-hidden>{meta.emoji}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-current/70">{t("common.status")}</p>
        <h1 className="font-display text-2xl font-bold">{t(`status.${status}` as TKey)}</h1>
        <p className="mt-1 text-sm text-current/75">{t(meta.hint)}</p>
      </div>
      {status !== "cancelled" ? <PaymentStatusBadge status={paymentStatus} /> : null}
    </section>
  );
}