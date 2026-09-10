import type { ReactNode } from "react";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

/** Shared loading / empty / error states so no page ships only the happy path. */

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div
      className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {label ?? t("common.loading")}
    </div>
  );
}

export function EmptyState({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-8 text-center"
      role="alert"
    >
      <AlertCircle className="h-6 w-6 text-destructive" />
      <p className="text-sm text-foreground">{message ?? t("common.error")}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
}
