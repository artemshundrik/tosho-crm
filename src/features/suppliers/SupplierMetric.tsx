import { cn } from "@/lib/utils";

import type { SupplierMetric as SupplierMetricValue } from "./suppliersStatus";

/**
 * Комірка показника постачальника — одна на CRM.
 *
 * Жила в SupplierCard, поки числа були лише на картці списку. Коли паспорт
 * згорнувся (09.09.2026) і три числа переїхали ще й на сторінку постачальника,
 * копіювати десять рядків JSX означало б рано чи пізно розійтись у кеглі:
 * дві однакові на вигляд смуги, які з часом перестають бути однаковими.
 */

const hasDigits = (value: string | null): boolean =>
  value != null && /\d/.test(value);

/** Немає значення — порожньо, без прочерку: прочерк у великому кеглі читається як зламане число. */
export function SupplierMetric({ metric }: { metric: SupplierMetricValue }) {
  if (!metric.value) return <div aria-hidden="true" />;
  return (
    <div className="min-w-0">
      <div className="flex h-6 items-end">
        <span
          className={cn(
            "truncate leading-tight text-foreground",
            hasDigits(metric.value)
              ? "text-lg font-semibold tabular-nums"
              : "text-sm font-medium",
          )}
        >
          {metric.value}
        </span>
      </div>
      <div className="truncate text-3xs uppercase tracking-caps-tight text-muted-foreground">
        {metric.label}
      </div>
    </div>
  );
}
