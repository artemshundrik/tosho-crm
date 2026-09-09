import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { EntityAvatar } from "@/components/app/avatar-kit";
import { useIsClamped } from "@/components/app/useIsClamped";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/layout/routes";
import { faviconUrl } from "@/lib/brandFavicon";
import { toneSubtleClass, toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

import { SUPPLIER_INTAKE_LABEL, SUPPLIER_SCHEDULE_LABEL, type SupplierDefinition } from "./suppliersCatalog";
import {
  formatDateShort,
  SUPPLIER_PLATE_TONE,
  SUPPLIER_STATE_ICON,
  SUPPLIER_STATE_LABEL,
  SUPPLIER_STATE_TONE,
  type SupplierMetric,
  type SupplierStatus,
} from "./suppliersStatus";

/**
 * Картка постачальника у списку — та сама сітка, що в картці інтеграції:
 * ряди ФІКСОВАНОЇ висоти, щоб лого, числа й плашки сусідніх карток стояли на
 * одних лініях. Довгий текст стану обрізається, повний — у підказці, і лише
 * коли обрізання справді сталось.
 */
const CARD_ROWS = "grid-rows-[36px_18px_46px_65px_32px]";

const hasDigits = (value: string | null): boolean => value != null && /\d/.test(value);

/** Комірка показника. Немає значення — порожньо, без прочерку: прочерк у великому кеглі читається як зламане число. */
function Metric({ metric }: { metric: SupplierMetric }) {
  if (!metric.value) return <div aria-hidden="true" />;
  return (
    <div className="min-w-0">
      <div className="flex h-6 items-end">
        <span
          className={cn(
            "truncate leading-tight text-foreground",
            hasDigits(metric.value) ? "text-lg font-semibold tabular-nums" : "text-sm font-medium"
          )}
        >
          {metric.value}
        </span>
      </div>
      <div className="truncate text-3xs uppercase tracking-caps-tight text-muted-foreground">{metric.label}</div>
    </div>
  );
}

export function SupplierCard({ definition, status }: { definition: SupplierDefinition; status: SupplierStatus }) {
  const tone = SUPPLIER_STATE_TONE[status.state];
  const plateTone = SUPPLIER_PLATE_TONE[status.state];
  const StateIcon = SUPPLIER_STATE_ICON[status.state];
  const muted = status.state === "planned";
  const { ref: messageRef, clamped } = useIsClamped(status.message);

  return (
    <Link
      to={`${ROUTES.suppliers}/${definition.id}`}
      className={cn(
        "grid w-full gap-3 rounded-section border border-border/60 bg-card p-4 text-left",
        CARD_ROWS,
        "transition-[background-color,border-color,box-shadow] duration-base ease-out motion-reduce:transition-none",
        "hover:border-border hover:bg-muted/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      )}
    >
      {/* Ряд 1 — хто це і в якому стані. Незапланований — кольоровий фавікон;
          запланований сірий: колір тут працює як обіцянка «воно живе». */}
      <div className="flex min-w-0 items-center gap-2.5">
        <EntityAvatar
          src={faviconUrl(definition.slug)}
          name={definition.name}
          size={36}
          className={cn("shrink-0 rounded-xl", muted && "grayscale opacity-60")}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{definition.name}</span>
        <Badge tone={tone} size="sm" className="shrink-0 gap-1">
          <StateIcon className="h-3 w-3" aria-hidden="true" />
          {SUPPLIER_STATE_LABEL[status.state]}
        </Badge>
      </div>

      {/* Ряд 2 — чим торгує і як під'єднаний. Рівно один рядок. */}
      <p className="truncate text-xs text-muted-foreground">
        {definition.sells} · {SUPPLIER_INTAKE_LABEL[definition.intake.kind]}, {definition.platform}
      </p>

      {/* Ряд 3 — три числа. */}
      <div className="grid grid-cols-3 gap-3">
        {status.metrics.map((metric) => (
          <Metric key={metric.label} metric={metric} />
        ))}
      </div>

      {/* Ряд 4 — плашка стану: правило ціни, попередження про застарілість або що заважає. */}
      <div className="-mx-4 border-b border-border/60 px-4 pb-3">
        <div className={cn("flex items-start gap-2 rounded-inner border px-2.5 py-2", toneSubtleClass[plateTone])}>
          <StateIcon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", toneTextClass[plateTone])} aria-hidden="true" />
          <p
            ref={messageRef}
            className="line-clamp-2 text-2xs leading-snug text-foreground"
            title={clamped ? status.message : undefined}
          >
            {status.message}
          </p>
        </div>
      </div>

      {/* Ряд 5 — розклад і куди веде картка. */}
      <div className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {definition.planned
            ? `У черзі з ${formatDateShort(definition.planned.since)}`
            : `Оновлюється ${SUPPLIER_SCHEDULE_LABEL[definition.intake.schedule]}`}
        </span>
        <span className="flex shrink-0 items-center gap-0.5 font-medium text-foreground">
          Відкрити
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
