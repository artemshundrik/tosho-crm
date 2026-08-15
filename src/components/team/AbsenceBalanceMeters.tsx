import { cn } from "@/lib/utils";
import { HoverTip } from "@/components/ui/hover-tip";
import { toneDotClass, toneTextClass } from "@/lib/statusTones";
import {
  isQuotaAbsenceKind,
  QUOTA_ABSENCE_KINDS,
  TEAM_ABSENCE_KIND_LABELS,
  TEAM_ABSENCE_KIND_TONE,
  type TeamAbsence,
} from "@/lib/teamAbsences";
import type { AbsenceBalance, AbsenceQuotaBucket } from "@/lib/teamAbsenceQuotas";
import { ABSENCE_QUOTA_UNIT, ABSENCE_QUOTA_UNIT_LABEL, type QuotaAbsenceKind } from "@/lib/teamAbsenceCalendar";

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
 * там, де залишки видно (свої — всім, чужі — owner/SEO). Розшифровка при
 * наведенні успадковує цей же гейт: вона живе на метрі, а метра немає там,
 * де балансу не дали.
 */

/** Один рядок історії в розшифровці. */
export type BalanceEntry = {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  pending: boolean;
};

const shortDate = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}`;

function formatEntryRange(entry: BalanceEntry) {
  return entry.startDate === entry.endDate
    ? shortDate(entry.startDate)
    : `${shortDate(entry.startDate)} – ${shortDate(entry.endDate)}`;
}

/**
 * Розшифровка одного типу: з чого склалось число на метрі.
 *
 * Найцінніший рядок — останній: «після погодження лишиться N». Саме через
 * його відсутність людина планує ті самі дні двічі.
 */
function BalanceBreakdown({
  kind,
  bucket,
  entries,
  year,
}: {
  kind: QuotaAbsenceKind;
  bucket: AbsenceQuotaBucket;
  entries: BalanceEntry[];
  year: number;
}) {
  const tone = TEAM_ABSENCE_KIND_TONE[kind];
  const unit = ABSENCE_QUOTA_UNIT_LABEL[ABSENCE_QUOTA_UNIT[kind]];
  // Довгий список у бульбашці не читають — показуємо найсвіжіші.
  const visible = entries.slice(0, 6);
  const hidden = entries.length - visible.length;

  return (
    <div className="w-[248px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">
          {TEAM_ABSENCE_KIND_LABELS[kind]} · {year}
        </span>
        <span className="shrink-0 text-2xs">
          <b className="font-semibold tabular-nums text-foreground">{bucket.remaining}</b>
          <span className="text-muted-foreground"> із {bucket.quota} {unit}</span>
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="mt-2 border-t border-border/40 pt-2 text-2xs text-muted-foreground">
          Цього року ще не було.
        </div>
      ) : (
        <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
          {visible.map((entry) => (
            <div
              key={entry.id}
              className={cn("flex items-center gap-2 text-2xs", entry.pending && "opacity-75")}
            >
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  entry.pending ? toneDotClass.warning : toneDotClass[tone]
                )}
              />
              <span className="flex-1 tabular-nums text-foreground">{formatEntryRange(entry)}</span>
              <span className="shrink-0 text-muted-foreground">
                {entry.days} дн.{entry.pending ? " · на погодженні" : ""}
              </span>
            </div>
          ))}
          {hidden > 0 ? (
            <div className="text-3xs text-muted-foreground">…і ще {hidden}</div>
          ) : null}
        </div>
      )}

      {bucket.pending > 0 ? (
        <div className="mt-2 border-t border-border/40 pt-1.5 text-3xs text-muted-foreground">
          Після погодження лишиться{" "}
          <b className="font-semibold text-foreground">{Math.max(0, bucket.remaining - bucket.pending)}</b>{" "}
          із {bucket.quota}
        </div>
      ) : null}
    </div>
  );
}

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
  entries,
  year,
}: {
  kind: QuotaAbsenceKind;
  bucket: AbsenceQuotaBucket;
  dense: boolean;
  entries?: BalanceEntry[];
  year?: number;
}) {
  const usedPct = percent(bucket.used, bucket.quota);
  const pendingPct = percent(bucket.pending, bucket.quota);
  const tone = TEAM_ABSENCE_KIND_TONE[kind];
  const exhausted = bucket.remaining === 0 && bucket.quota > 0;

  const body = (
    <div className="min-w-0">
      {!dense ? (
        <div className="text-3xs uppercase tracking-wide text-muted-foreground/80">залишилось</div>
      ) : null}
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

  // Без записів розшифровувати нічого — не чіпляємо порожню бульбашку.
  if (!entries || !year) return body;

  return (
    <HoverTip
      label={<BalanceBreakdown kind={kind} bucket={bucket} entries={entries} year={year} />}
      side="top"
      className="block min-w-0"
      contentClassName="max-w-none rounded-xl p-3"
    >
      {body}
    </HoverTip>
  );
}

const SHORT_LABELS: Record<QuotaAbsenceKind, string> = {
  vacation: "відп.",
  day_off: "day-off",
  sick_leave: "лік.",
};

/** Записи людини за рік → рядки розшифровки, згруповані за типом. */
export function buildBalanceEntries(
  absences: TeamAbsence[],
  daysOf: (absence: TeamAbsence) => number
): Record<QuotaAbsenceKind, BalanceEntry[]> {
  const map: Record<QuotaAbsenceKind, BalanceEntry[]> = { vacation: [], day_off: [], sick_leave: [] };
  absences.forEach((absence) => {
    // Лише квотовані типи: «інше» без ліміту, «з дому» — не відсутність.
    if (!isQuotaAbsenceKind(absence.kind)) return;
    if (absence.status !== "approved" && absence.status !== "pending") return;
    map[absence.kind].push({
      id: absence.id,
      startDate: absence.startDate,
      endDate: absence.endDate,
      days: daysOf(absence),
      pending: absence.status === "pending",
    });
  });
  // Найсвіжіші зверху: питання зазвичай про останню відсутність, а не про січень.
  (Object.keys(map) as QuotaAbsenceKind[]).forEach((kind) => {
    map[kind].sort((a, b) => b.startDate.localeCompare(a.startDate));
  });
  return map;
}

export function AbsenceBalanceMeters({
  balance,
  dense = false,
  className,
  entries,
  year,
}: {
  balance: AbsenceBalance;
  /** Компактний вигляд для картки людини. */
  dense?: boolean;
  className?: string;
  /** Історія за типами — вмикає розшифровку при наведенні. */
  entries?: Record<QuotaAbsenceKind, BalanceEntry[]>;
  year?: number;
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-3", className)}>
      {QUOTA_ABSENCE_KINDS.map((kind) => (
        <Meter
          key={kind}
          kind={kind}
          bucket={balance[kind]}
          dense={dense}
          entries={entries?.[kind]}
          year={year}
        />
      ))}
    </div>
  );
}
