import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppDropdown } from "@/components/app/AppDropdown";
import { resolveWorkspaceId } from "@/lib/workspace";
import { loadDesignerEarnings, type DesignerEarnings } from "@/lib/designerPayroll";

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
  const overNorm = earnings.visualsOverNorm > 0;

  return (
    <AppDropdown
      align="end"
      sideOffset={10}
      contentClassName="w-[330px] p-0"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          className="hidden lg:inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-border/50 bg-muted/40 px-3 text-xs shadow-inner transition-all duration-200 hover:bg-muted/60 cursor-pointer"
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
          <Money value={uah(earnings.earnedTotal)} masked={masked} className="font-semibold tabular-nums text-foreground/90" />
          <span className="text-muted-foreground">·</span>
          <Money value={`≈ ${uahShort(earnings.forecastTotal)}`} masked={masked} className="tabular-nums text-muted-foreground" />
          <span
            role="button"
            tabIndex={0}
            onClick={toggleMask}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") toggleMask(event as unknown as React.MouseEvent);
            }}
            className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label={masked ? "Показати суми" : "Приховати суми"}
            title={masked ? "Показати суми" : "Приховати суми"}
          >
            {masked ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </span>
        </button>
      }
      content={
        <div>
          <div className="flex items-center gap-2 px-3.5 pt-3">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Мій заробіток · {monthLabel}</span>
            <span className="ml-auto rounded-full border border-warning-soft-border bg-warning-soft px-2 py-0.5 text-3xs font-semibold uppercase tracking-caps text-warning-foreground">
              до податків
            </span>
          </div>

          <div className="px-3.5 pt-2.5">
            <Money value={uah(earnings.earnedTotal)} masked={masked} className="text-2xl font-bold tracking-tight tabular-nums text-foreground" />
            <div className="mt-0.5 text-xs text-muted-foreground">
              прогноз до кінця місяця ≈{" "}
              <Money value={uah(earnings.forecastTotal)} masked={masked} className="font-semibold tabular-nums text-foreground" />
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-success-solid transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>

          <div className="mt-3 border-t border-border/50 px-3.5 py-2.5">
            <div className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground/70">База</div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Накопичено зі ставки</span>
              <span className="ml-auto font-semibold tabular-nums text-foreground">
                <Money value={uahShort(earnings.baseAccrued)} masked={masked} />
                <span className="font-normal text-muted-foreground">
                  {" з "}
                  <Money value={uahShort(earnings.terms.baseMonthRate)} masked={masked} />
                </span>
              </span>
            </div>
            <div className="mt-1 text-3xs tabular-nums text-muted-foreground">
              {earnings.workdaysPassed} з {earnings.workdaysTotal} робочих днів
            </div>
          </div>

          <div className="border-t border-border/50 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground/70">Візуали</span>
              {overNorm ? (
                <span className="ml-auto rounded-full border border-success-soft-border bg-success-soft px-2 py-0.5 text-3xs font-semibold text-success-foreground">
                  +{earnings.visualsOverNorm} понад норму
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">До норми</span>
              <span className="ml-auto font-semibold tabular-nums text-foreground">
                {earnings.visuals} <span className="font-normal text-muted-foreground">з {earnings.terms.visualNorm}</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full bg-chart-1"
                style={{ width: `${Math.min(100, (earnings.visuals / Math.max(1, earnings.terms.visualNorm)) * 100)}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Понад норму</span>
              <span className="ml-auto font-semibold tabular-nums text-foreground">
                {earnings.visualsOverNorm} × {earnings.terms.overNormRate} ={" "}
                <Money value={uahShort(earnings.overNormPay)} masked={masked} />
              </span>
            </div>
            {/* Прогноз показуємо лише коли темп реально виводить за норму —
                інакше рядок «+0» лише шумить. */}
            {!overNorm && earnings.forecastVisuals > earnings.terms.visualNorm ? (
              <div className="mt-1 text-3xs text-muted-foreground">
                за поточним темпом до кінця місяця ≈ {earnings.forecastVisuals} візуалів
              </div>
            ) : null}
          </div>

          <div className="border-t border-border/50 px-3.5 py-2 text-3xs leading-snug text-muted-foreground/80">
            Рахуються унікальні візуали (перезаливи одного файлу не додають). Макети в норму не входять.
          </div>
        </div>
      }
    />
  );
}
