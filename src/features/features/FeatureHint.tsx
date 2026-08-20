import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { singleFlight } from "@/lib/singleFlight";
import { cn } from "@/lib/utils";
import { shouldShowHint, type HintState } from "@/lib/featureHintRules";
import { useMyFeatureAdoption } from "@/features/features/queries";
import type { FeatureKey } from "@/lib/featureCatalog";

/**
 * Тиха підказка біля наявної кнопки: «ось цим ти ще не користувався».
 *
 * ЧОМУ САМЕ ТУТ, А НЕ МОДАЛКОЮ ПРИ ВХОДІ: заміри показали, що модалка про
 * невикористану фічу дала 53 покази й 2 кліки. Підказка з'являється в момент,
 * коли інструмент справді доречний — біля поля, яке людина зараз заповнює.
 *
 * ВАЖЛИВО ПРО ДИКТУВАННЯ: кнопка мікрофона вже стоїть у 16 місцях, і фіча не
 * використовується не тому, що її немає, а тому що її не помічають. Тож
 * підказка вказує на НАЯВНУ кнопку, а не додає нову.
 */

/**
 * Один показ на застосунок за раз. Без цього на сторінці прорахунку спливло б
 * пʼять підказок одночасно — по одній біля кожного мікрофона.
 */
let claimedBy: string | null = null;
const claimListeners = new Set<() => void>();

function notifyClaim() {
  claimListeners.forEach((listener) => listener());
}

type Props = {
  featureKey: FeatureKey;
  /** Текст підказки — коротко, одним рядком. */
  text: string;
  /**
   * `floating` — плаваюча біля кнопки (потрібен relative-предок);
   * `inline` — звичайний рядок у потоці, для списків і меню.
   */
  variant?: "floating" | "inline";
  /** З якого боку від кнопки малювати. Лише для floating. */
  side?: "top" | "bottom";
  /** Вирівнювання по горизонталі відносно кнопки. Лише для floating. */
  align?: "start" | "end";
  /** Дія за кліком по підказці — напр. відкрити налаштування. */
  onAct?: () => void;
  /** Підпис дії; без нього підказка просто інформує. */
  actLabel?: string;
  className?: string;
};

export function FeatureHint({
  featureKey,
  text,
  variant = "floating",
  side = "top",
  align = "end",
  onAct,
  actLabel,
  className,
}: Props) {
  const { viewUserId } = useAuth();
  const { data: adoption } = useMyFeatureAdoption(viewUserId);
  const [state, setState] = useState<HintState | null | undefined>(undefined);
  const [visible, setVisible] = useState(false);
  // Токен «хто зайняв підказку» для реєстру нижче. Раніше це був
  // Math.random() у рендері; useId дає стабільний унікальний рядок на
  // екземпляр компонента й не робить рендер випадковим.
  const instanceId = useId();
  const markedRef = useRef(false);

  const uses = useMemo(() => {
    if (!adoption) return undefined;
    return adoption[featureKey]?.uses ?? 0;
  }, [adoption, featureKey]);

  // Стан показів по цій фічі.
  useEffect(() => {
    if (!viewUserId) return;
    let active = true;
    void (async () => {
      /**
       * Кілька підказок з ОДНИМ ключем на сторінці — звичайна річ: слот показу
       * один (claimedBy нижче), а екземплярів компонента кілька, і кожен читав
       * свій стан сам. Заміряно 20.08.2026 на дизайн-задачі: два байт-у-байт
       * однакові запити до feature_hints. Склеюємо одночасні — не кешуємо:
       * після «більше не показувати» наступне читання має піти в базу.
       */
      const { data } = await singleFlight(`hint:${viewUserId}:${featureKey}`, async () =>
        // await обов'язковий: запит Supabase — thenable, а не справжня обіцянка.
        await supabase
          .schema("tosho")
          .from("feature_hints")
          .select("shown_count, last_shown_at, dismissed_at")
          .eq("user_id", viewUserId)
          .eq("feature_key", featureKey)
          .maybeSingle()
      );
      if (!active) return;
      const row = data as
        | { shown_count: number; last_shown_at: string | null; dismissed_at: string | null }
        | null;
      setState(
        row
          ? {
              shownCount: row.shown_count,
              lastShownAt: row.last_shown_at,
              dismissedAt: row.dismissed_at,
            }
          : null
      );
    })();
    return () => {
      active = false;
    };
  }, [viewUserId, featureKey]);

  // Вирішуємо і «займаємо» єдиний слот показу.
  useEffect(() => {
    if (state === undefined) return;
    if (!shouldShowHint({ state, uses, now: new Date() })) return;
    if (claimedBy && claimedBy !== instanceId) return;

    claimedBy = instanceId;
    setVisible(true);
    notifyClaim();

    return () => {
      if (claimedBy === instanceId) {
        claimedBy = null;
        notifyClaim();
      }
    };
  }, [state, uses, instanceId]);

  // Інші екземпляри ховаються, щойно слот зайнято.
  useEffect(() => {
    const listener = () => {
      if (claimedBy && claimedBy !== instanceId) setVisible(false);
    };
    claimListeners.add(listener);
    return () => {
      claimListeners.delete(listener);
    };
  }, [instanceId]);

  const write = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!viewUserId) return;
      await supabase
        .schema("tosho")
        .from("feature_hints")
        .upsert(
          {
            user_id: viewUserId,
            feature_key: featureKey,
            updated_at: new Date().toISOString(),
            ...patch,
          },
          { onConflict: "user_id,feature_key" }
        );
    },
    [viewUserId, featureKey]
  );

  // Показ зараховуємо один раз за монтування.
  useEffect(() => {
    if (!visible || markedRef.current) return;
    markedRef.current = true;
    void write({
      shown_count: (state?.shownCount ?? 0) + 1,
      last_shown_at: new Date().toISOString(),
    });
  }, [visible, state, write]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    void write({ dismissed_at: new Date().toISOString() });
  };

  const dismissButton = (
    <button
      type="button"
      aria-label="Більше не показувати"
      title="Більше не показувати"
      onClick={(event) => {
        event.stopPropagation();
        dismiss();
      }}
      className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <X className="h-3 w-3" />
    </button>
  );

  if (variant === "inline") {
    return (
      <div
        role="note"
        className={cn(
          "flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/[0.05] px-2.5 py-2",
          className
        )}
      >
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-2xs leading-4 text-foreground">{text}</p>
          {onAct && actLabel ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAct();
              }}
              className="mt-1 cursor-pointer text-2xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              {actLabel}
            </button>
          ) : null}
        </div>
        {dismissButton}
      </div>
    );
  }

  return (
    <span
      role="note"
      className={cn(
        "absolute z-30 flex w-max max-w-[240px] items-start gap-1.5 rounded-lg border border-primary/30 bg-popover px-2.5 py-1.5 shadow-[var(--shadow-menu)]",
        side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        align === "end" ? "right-0" : "left-0",
        className
      )}
    >
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span className="text-2xs leading-4 text-foreground">{text}</span>
      {dismissButton}
    </span>
  );
}
