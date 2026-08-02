import { cn } from "@/lib/utils";
import { toneTextClass } from "@/lib/statusTones";
import { QUOTA_ABSENCE_KINDS, TEAM_ABSENCE_KIND_LABELS, TEAM_ABSENCE_KIND_TONE } from "@/lib/teamAbsences";
import type { AbsenceBalance, AbsenceQuotaBucket } from "@/lib/teamAbsenceQuotas";
import type { QuotaAbsenceKind } from "@/lib/teamAbsenceCalendar";

/**
 * Шкали залишків: скільки днів іще є.
 *
 * Показує ЗАЛИШОК, а не використане — людина питає «скільки в мене ще є»,
 * і саме це число має бути великим. Смуга ж заповнюється використаним, бо
 * «порожня смуга = все на місці» читається без підпису.
 *
 * Запити на погодженні йдуть окремим штрихованим сегментом: дні ще не
 * списані, але вже фактично зайняті — інакше людина двічі планує ті самі дні.
 *
 * ПРИВАТНІСТЬ: компонент нічого не вирішує сам. Викликач показує його лише
 * там, де залишки видно (свої — всім, чужі — owner/SEO).
 */

const FILL_CLASS: Record<QuotaAbsenceKind, string> = {
  vacation: "bg-[hsl(var(--chart-1))]",
  day_off: "bg-[hsl(var(--accent-tone-foreground))]",
  sick_leave: "bg-[hsl(var(--warning-solid))]",
};

const PENDING_CLASS: Record<QuotaAbsenceKind, string> = {
  vacation: "bg-[hsl(var(--chart-1)/0.28)]",
  day_off: "bg-[hsl(var(--accent-tone-foreground)/0.28)]",
  sick_leave: "bg-[hsl(var(--warning-solid)/0.28)]",
};

function percent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (part / total) * 100));
}

function Meter({
  kind,
  bucket,
  dense,
}: {
  kind: QuotaAbsenceKind;
  bucket: AbsenceQuotaBucket;
  dense: boolean;
}) {
  const usedPct = percent(bucket.used, bucket.quota);
  const pendingPct = percent(bucket.pending, bucket.quota);
  const tone = TEAM_ABSENCE_KIND_TONE[kind];
  const exhausted = bucket.remaining === 0 && bucket.quota > 0;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-semibold tabular-nums text-foreground",
            dense ? "text-xs" : "text-sm",
            exhausted && "text-muted-foreground"
          )}
        >
          {bucket.remaining}
        </span>
        <span className={cn("tabular-nums text-muted-foreground", dense ? "text-3xs" : "text-2xs")}>
          / {bucket.quota}
        </span>
        <span className={cn("truncate text-muted-foreground", dense ? "text-3xs" : "text-2xs")}>
          {dense ? SHORT_LABELS[kind] : TEAM_ABSENCE_KIND_LABELS[kind]}
        </span>
      </div>
      <div
        className="mt-1.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${TEAM_ABSENCE_KIND_LABELS[kind]}: залишилось ${bucket.remaining} з ${bucket.quota}${
          bucket.pending > 0 ? `, на погодженні ${bucket.pending}` : ""
        }`}
      >
        {usedPct > 0 ? <span className={cn("h-full", FILL_CLASS[kind])} style={{ width: `${usedPct}%` }} /> : null}
        {pendingPct > 0 ? (
          <span
            className={cn("h-full", PENDING_CLASS[kind])}
            style={{ width: `${pendingPct}%` }}
            title={`${bucket.pending} на погодженні`}
          />
        ) : null}
      </div>
      {!dense && bucket.pending > 0 ? (
        <div className={cn("mt-1 text-3xs", toneTextClass[tone])}>{bucket.pending} на погодженні</div>
      ) : null}
    </div>
  );
}

const SHORT_LABELS: Record<QuotaAbsenceKind, string> = {
  vacation: "відп.",
  day_off: "day-off",
  sick_leave: "лік.",
};

export function AbsenceBalanceMeters({
  balance,
  dense = false,
  className,
}: {
  balance: AbsenceBalance;
  /** Компактний вигляд для картки людини. */
  dense?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-3", className)}>
      {QUOTA_ABSENCE_KINDS.map((kind) => (
        <Meter key={kind} kind={kind} bucket={balance[kind]} dense={dense} />
      ))}
    </div>
  );
}
