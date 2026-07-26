import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppDropdown } from "@/components/app/AppDropdown";
import { resolveWorkspaceId } from "@/lib/workspace";
import {
  loadDesignerEarnings,
  type DesignerEarnings,
  type OutputEarnings,
  type WorkdayCell,
} from "@/lib/designerPayroll";
import {
  normalizeTeamAbsenceKind,
  TEAM_ABSENCE_KIND_LABELS,
  type TeamAbsenceKind,
} from "@/lib/teamAbsences";

/**
 * Віджет «мій заробіток» у хедері — тільки для дизайнера, тільки про нього.
 *
 * Модель і рішення: docs/DESIGNER_PAYROLL_DESIGN.md
 *
 * Два принципи, які легко зламати при редагуванні:
 *  1. **Суми приховані за замовчуванням** (рішення CEO) — це зарплата у
 *     відкритому офісі. Стан ока запам'ятовується в localStorage.
 *  2. **Маскування не змінює ширину.** Реальна сума завжди в DOM і резервує
 *     місце (`invisible`), крапки малюються поверх абсолютом. Якщо замінити це
 *     на умовний рендер тексту — хедер почне «стрибати» при кожному кліку.
 *
 * Віджет не показується, якщо в людини немає чинної ставки: `loadDesignerEarnings`
 * повертає null, і ми рендеримо null — не порожню пігулку.
 */

const MASK_STORAGE_KEY = "designer-earnings-masked";

const uah = (value: number) => `${Math.round(value).toLocaleString("uk-UA")} ₴`;
const uahShort = (value: number) => `${Math.round(value).toLocaleString("uk-UA")}`;

/** Ghost-sizer: значення тримає ширину, крапки лягають поверх. */
function Money({ value, masked, className }: { value: string; masked: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-block", className)}>
      <span className={cn(masked && "invisible")}>{value}</span>
      {masked ? (
        <span className="absolute inset-0 flex items-center justify-center tracking-widest text-muted-foreground" aria-hidden="true">
          {"•".repeat(Math.min(6, Math.max(3, Math.round(value.length / 2))))}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Кольори відсутностей у сітці — та сама мова, що в бейджах команди
 * (TEAM_ABSENCE_KIND_BADGE_CLASSES): лікарняний жовтий, відпустка синя.
 * Тут потрібні лише фон і рамка, без кольору тексту — квадратики порожні.
 */
const ABSENCE_CELL_CLASS: Record<TeamAbsenceKind, string> = {
  sick_leave: "bg-warning-soft border-warning-soft-border",
  vacation: "bg-info-soft border-info-soft-border",
  day_off: "bg-neutral-soft border-neutral-soft-border",
  other: "bg-muted border-border",
};

const formatDayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

/**
 * Робочі дні місяця квадратиками: зелені — відпрацьовані, кольорові —
 * відсутності, порожні — попереду.
 *
 * Два рішення, які легко зламати:
 *  1. **Квадратики гумові** (`flex-1`), а не фіксовані 11px. У липні 23 робочі
 *     дні, у лютому 20, а з переносом свята може стати 24 — фіксована ширина
 *     не влазить у 302px поповера й переноситься на другий рядок.
 *  2. **Поточний день не виділяємо** (рішення CEO): останній зелений квадратик
 *     і є сьогодні, окрема мітка лише шумить.
 *
 * Сітка aria-hidden: рядок «18 з 23 робочих днів» поруч дає рідеру те саме
 * без 23 порожніх спанів.
 */
function WorkdayGrid({ cells }: { cells: WorkdayCell[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (cells.length === 0) return null;

  const active = hovered != null ? cells[hovered] : null;
  // Обрізаємо позицію підказки, щоб для крайніх днів вона не вилазила за
  // межі поповера — дата в тексті все одно названа явно.
  const rawLeft = hovered != null ? ((hovered + 0.5) / cells.length) * 100 : 50;
  const left = Math.min(78, Math.max(22, rawLeft));

  return (
    <div className="relative mt-1.5">
      {active ? (
        <div
          className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-3xs leading-snug text-background shadow-md"
          style={{ left: `${left}%` }}
        >
          <span className="font-semibold">{formatDayLabel(active.day)}</span>
          {active.absence
            ? ` · ${TEAM_ABSENCE_KIND_LABELS[normalizeTeamAbsenceKind(active.absence.kind)]}`
            : active.passed
              ? " · відпрацьовано"
              : " · попереду"}
          {active.absence?.comment ? (
            <span className="block opacity-75">{active.absence.comment}</span>
          ) : null}
        </div>
      ) : null}
      <div className="flex gap-[2px]" aria-hidden="true">
        {cells.map((cell, index) => (
          <span
            key={cell.day}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered((prev) => (prev === index ? null : prev))}
            className={cn(
              "h-[11px] min-w-0 flex-1 rounded-[3px] border",
              cell.absence
                ? ABSENCE_CELL_CLASS[normalizeTeamAbsenceKind(cell.absence.kind)]
                : cell.passed
                  ? "border-transparent bg-success-solid"
                  : "border-border bg-muted"
            )}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Секція одного виду робіт: візуали або макети.
 *
 * Норма показується «на сьогодні» (7/день × відпрацьовані дні), а не місячна —
 * інакше 20 днів поспіль дизайнер бачив би «106 з 161» і не розумів, чи він
 * у графіку. Праворуч у шапці — денна норма, щоб правило гри було під рукою.
 */
function OutputSection({
  label,
  unitsLabel,
  data,
  masked,
}: {
  label: string;
  /** Родовий відмінок для прогнозу: «≈ 137 візуалів». */
  unitsLabel: string;
  data: OutputEarnings;
  masked: boolean;
}) {
  const over = data.over > 0;
  const remaining = Math.max(0, data.normToDate - data.works);

  return (
    <div className="border-t border-border/50 px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground/70">{label}</span>
        {over ? (
          <span className="ml-auto rounded-full border border-success-soft-border bg-success-soft px-2 py-0.5 text-3xs font-semibold text-success-foreground">
            +{data.over} понад норму
          </span>
        ) : (
          <span className="ml-auto text-3xs tabular-nums text-muted-foreground/70">
            норма {data.normPerDay}/день
          </span>
        )}
      </div>
      {/* «Зроблено», а не «До норми»: 106 — це вже зроблене, а стара
          назва читалась як «залишилось 106». */}
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Зроблено</span>
        <span className="ml-auto font-semibold tabular-nums text-foreground">
          {data.works} <span className="font-normal text-muted-foreground">з {data.normToDate}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full rounded-full bg-chart-1"
          style={{ width: `${Math.min(100, (data.works / Math.max(1, data.normToDate)) * 100)}%` }}
        />
      </div>
      {/* Рядок «Понад норму» показуємо лише коли норму справді перевищено:
          раніше він 11 місяців на рік висів як «0 × 100 = 0». */}
      {over ? (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Понад норму</span>
          <span className="ml-auto font-semibold tabular-nums text-foreground">
            {data.over} × {data.overRate} = <Money value={uahShort(data.pay)} masked={masked} />
          </span>
        </div>
      ) : remaining > 0 ? (
        <div className="mt-1.5 text-3xs tabular-nums text-muted-foreground">ще {remaining} до понаднормових</div>
      ) : null}
      {/* Прогноз показуємо лише коли темп реально виводить за норму —
          інакше рядок «+0» лише шумить. */}
      {!over && data.forecastOver > 0 ? (
        <div className="mt-1 text-3xs text-muted-foreground">
          за поточним темпом до кінця місяця ≈ {data.forecastWorks} {unitsLabel} з {data.normFull}
        </div>
      ) : null}
    </div>
  );
}

export function DesignerEarningsWidget({
  teamId,
  userId,
}: {
  /** team_id — для подій activity_log (візуали). */
  teamId: string | null;
  userId: string | null;
}) {
  const [earnings, setEarnings] = useState<DesignerEarnings | null>(null);
  const [open, setOpen] = useState(false);
  const [masked, setMasked] = useState(() => {
    if (typeof window === "undefined") return true;
    // Дефолт — приховано; показуємо тільки якщо людина свідомо це обрала.
    return window.localStorage.getItem(MASK_STORAGE_KEY) !== "false";
  });

  useEffect(() => {
    let cancelled = false;
    if (!teamId || !userId) {
      setEarnings(null);
      return () => {
        cancelled = true;
      };
    }
    // Ставки живуть у tosho-схемі й ключуються workspace_id, а не team_id
    // (це різні ідентифікатори — див. workspace.ts), тому резолвимо окремо.
    (async () => {
      const workspaceId = await resolveWorkspaceId(userId);
      if (cancelled || !workspaceId) return;
      const result = await loadDesignerEarnings({ workspaceId, teamId, userId });
      if (!cancelled) setEarnings(result);
    })().catch((error) => {
      // Тиха деградація: віджет просто не з'явиться, решта хедера жива.
      console.warn("Failed to load designer earnings", error);
      if (!cancelled) setEarnings(null);
    });
    return () => {
      cancelled = true;
    };
  }, [teamId, userId]);

  const toggleMask = useCallback((event: React.MouseEvent) => {
    // Клік по оку не має відкривати поповер.
    event.preventDefault();
    event.stopPropagation();
    setMasked((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MASK_STORAGE_KEY, String(next));
      } catch {
        // приватний режим — просто не запам'ятовуємо
      }
      return next;
    });
  }, []);

  const progress = useMemo(() => {
    if (!earnings || earnings.forecastTotal <= 0) return 0;
    return Math.min(1, earnings.earnedTotal / earnings.forecastTotal);
  }, [earnings]);

  if (!earnings) return null;

  const monthLabel = new Date(`${earnings.month}-01T00:00:00Z`).toLocaleDateString("uk-UA", {
    month: "long",
    timeZone: "UTC",
  });
  const radius = 9.5;
  const circumference = 2 * Math.PI * radius;

  return (
    /* Пігулка — контейнер із ДВОМА сусідніми кнопками, а не кнопка в кнопці.
       Раніше око було span[role=button] всередині тригера: невалідний HTML,
       скрінрідер оголошував це як одну кнопку, а Enter міг спрацювати двічі. */
    <div className="inline-flex h-10 items-center gap-1 rounded-xl border border-border/50 bg-muted/40 pl-3 pr-1 shadow-inner">
      <AppDropdown
        align="end"
        sideOffset={14}
        contentClassName="w-[330px] p-0"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 whitespace-nowrap text-xs transition-colors duration-200 hover:text-foreground cursor-pointer"
            aria-label={`Мій заробіток за ${monthLabel}`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r={radius} fill="none" strokeWidth="3" className="stroke-border" />
              <circle
                cx="12"
                cy="12"
                r={radius}
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                stroke="hsl(var(--success-solid))"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                transform="rotate(-90 12 12)"
              />
            </svg>
            {/* На вузьких екранах лишається саме кільце: суму видно в поповері.
                Раніше тут стояв hidden lg:inline-flex — і з телефона дизайнер
                не бачив свій заробіток узагалі. */}
            <Money
              value={uah(earnings.earnedTotal)}
              masked={masked}
              className="hidden font-semibold tabular-nums text-foreground/90 sm:inline-block"
            />
          </button>
        }
        content={
        <div>
          <div className="flex items-center gap-2 px-3.5 pt-3">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Мій заробіток · {monthLabel}</span>
            {/* Це виноска до суми, а не попередження — тому тихий підпис,
                а не warning-бейдж: нічого не зламалось і робити нічого не треба. */}
            <span className="ml-auto text-3xs text-muted-foreground">до податків</span>
          </div>

          <div className="px-3.5 pt-2.5">
            <Money value={uah(earnings.earnedTotal)} masked={masked} className="text-2xl font-bold tracking-tight tabular-nums text-foreground" />
            <div className="mt-0.5 text-xs text-muted-foreground">
              прогноз до кінця місяця ≈{" "}
              <Money value={uah(earnings.forecastTotal)} masked={masked} className="font-semibold tabular-nums text-foreground" />
            </div>
            {/* Зеленої смуги тут більше немає: кільце в пігулці й сітка днів
                нижче показували те саме просування місяця втретє. */}
          </div>

          <div className="mt-3 border-t border-border/50 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground/70">База</span>
              <span className="ml-auto text-3xs tabular-nums text-muted-foreground">
                {earnings.workdaysPassed} з {earnings.workdaysTotal} робочих днів
              </span>
            </div>
            <WorkdayGrid cells={earnings.workdays} />
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Накопичено зі ставки</span>
              <span className="ml-auto font-semibold tabular-nums text-foreground">
                <Money value={uahShort(earnings.baseAccrued)} masked={masked} />
                <span className="font-normal text-muted-foreground">
                  {" з "}
                  <Money value={uahShort(earnings.terms.baseMonthRate)} masked={masked} />
                </span>
              </span>
            </div>
          </div>

          <OutputSection label="Візуали" unitsLabel="візуалів" data={earnings.visuals} masked={masked} />
          <OutputSection label="Макети" unitsLabel="макетів" data={earnings.layouts} masked={masked} />

          {earnings.creatives.length > 0 ? (
            <div className="border-t border-border/50 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground/70">Креативи</span>
                {earnings.creativesPay > 0 ? (
                  <span className="ml-auto font-semibold tabular-nums text-foreground">
                    <Money value={`+${uahShort(earnings.creativesPay)}`} masked={masked} />
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {earnings.creatives.map((creative) => (
                  <div key={creative.taskId} className="flex items-start gap-2 text-xs">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">
                        {creative.taskNumber ? `${creative.taskNumber} · ` : ""}
                        {creative.title ?? "Креатив"}
                      </span>
                      {!creative.earned ? (
                        <span className="text-3xs text-muted-foreground">чекає затвердження</span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-semibold tabular-nums",
                        creative.earned ? "text-success-foreground" : "text-muted-foreground"
                      )}
                    >
                      <Money value={`+${uahShort(creative.payout)}`} masked={masked} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="border-t border-border/50 px-3.5 py-2 text-3xs leading-snug text-muted-foreground/80">
            Рахуються унікальні роботи — перезаливи одного файлу не додають. Норма денна: за дні відпустки
            й лікарняного вона не нараховується.
          </div>
        </div>
        }
      />
      {/* Іконка лишається 14px, але зона натискання розширена псевдоелементом
          до 44px — рекомендований мінімум для пальця. Візуально не змінює
          пігулку, бо ::after прозорий. */}
      <button
        type="button"
        onClick={toggleMask}
        className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground after:absolute after:-inset-2 after:content-['']"
        aria-label={masked ? "Показати суми" : "Приховати суми"}
        title={masked ? "Показати суми" : "Приховати суми"}
      >
        {masked ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
