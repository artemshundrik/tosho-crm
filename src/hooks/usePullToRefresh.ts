import { useCallback, useEffect, useRef, useState } from "react";

import { useOverlayOpen } from "@/components/ui/overlayPresence";

/**
 * Жест «потягнути вниз, щоб оновити».
 *
 * ЧОМУ ОКРЕМИЙ ХУК, А НЕ КОД У СТОРІНЦІ. Тут майже все — це не сама тяга, а
 * умови, за яких її НЕ МОЖНА починати: сторінка вже прокручена, палець їде
 * вгору, пальців два, зверху відкритий аркуш. Помилка в кожній із них ламає
 * звичайну прокрутку — найдорожчу взаємодію на телефоні. Тримати це в одному
 * місці дешевше, ніж повторювати на кожному розділі.
 *
 * ЩО ЦЕЙ ХУК НЕ РОБИТЬ: він не малює. Індикатор отримує `pull`/`progress` і
 * вирішує сам, як це показати.
 */

export type PullState = "idle" | "pulling" | "armed" | "refreshing";

type Options = {
  /** Що зробити на спрацювання. Жест чекає на цю обіцянку. */
  onRefresh: () => Promise<unknown>;
  /** Вимкнути повністю — наприклад, на широкому екрані. */
  enabled?: boolean;
};

/** Скільки треба протягнути, щоб спрацювало. */
const THRESHOLD = 64;
/** На скільки лишається відтягнутим, поки дані їдуть. */
const HOLD = 56;
/** Далі не тягнеться взагалі: жест — це натяк, а не спосіб зсунути сторінку. */
const MAX = 110;
/**
 * Мінімальний час «оновлюємо».
 *
 * З кешу відповідь буває за 50 мс, і без цієї витримки індикатор блимає — рух,
 * якого око не встигає прочитати, читається як збій, а не як робота. Та сама
 * причина, що й у `useMinimumLoading` для каркасів.
 */
const MIN_SPIN = 450;

/**
 * Опір навмисно нелінійний: перші пікселі йдуть майже один в один, далі палець
 * «важчає» й до стелі підходить асимптотично. Без цього екран відлітає донизу
 * від найменшого руху, і жест читається як поломка, а не як натяг.
 */
const resist = (raw: number) => MAX * (1 - Math.exp(-raw / 90));

/**
 * Поки жест увімкнений, документу забороняється ланцюжити прокрутку.
 *
 * Це не косметика: на Android Chrome власний «потягнути вниз» ПЕРЕЗАВАНТАЖУЄ
 * сторінку, і без цієї заборони два жести б'ються за один рух пальця — виграє
 * браузер, і застосунок стартує з нуля. Клас вішається лише поки хук живий,
 * тож на решті розділів рідний жест браузера лишається як був.
 */
const LOCK_CLASS = "pull-refresh-lock";

export function usePullToRefresh({ onRefresh, enabled = true }: Options) {
  const [pull, setPull] = useState(0);
  const [state, setState] = useState<PullState>("idle");

  // Аркуш зверху забирає жест собі: тягнути сторінку з-під відкритої панелі
  // означає рухати те, чого зараз не видно.
  const overlayOpen = useOverlayOpen();
  const active = enabled && !overlayOpen;

  const startYRef = useRef<number | null>(null);
  const decidedRef = useRef<"none" | "pull" | "scroll">("none");
  const pullRef = useRef(0);
  const busyRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const settle = useCallback(() => {
    pullRef.current = 0;
    setPull(0);
    setState("idle");
  }, []);

  const run = useCallback(async () => {
    busyRef.current = true;
    setState("refreshing");
    pullRef.current = HOLD;
    setPull(HOLD);

    const started = Date.now();
    try {
      await onRefreshRef.current();
    } catch {
      // Помилку показує сама сторінка — жест лише не має зависнути відтягнутим.
    }
    const rest = Math.max(0, MIN_SPIN - (Date.now() - started));
    window.setTimeout(() => {
      busyRef.current = false;
      settle();
    }, rest);
  }, [settle]);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    document.documentElement.classList.add(LOCK_CLASS);

    const onTouchStart = (event: TouchEvent) => {
      if (busyRef.current) return;
      // Два пальці — це масштабування або щось інше, але точно не оновлення.
      if (event.touches.length !== 1) {
        startYRef.current = null;
        decidedRef.current = "scroll";
        return;
      }
      startYRef.current = event.touches[0].clientY;
      decidedRef.current = "none";
    };

    const onTouchMove = (event: TouchEvent) => {
      if (busyRef.current || startYRef.current === null) return;
      if (decidedRef.current === "scroll") return;

      const delta = event.touches[0].clientY - startYRef.current;

      if (decidedRef.current === "none") {
        // Рішення ухвалюється ОДИН раз на дотик і більше не переглядається:
        // інакше сторінка, прокручена вниз і повернута до верху одним рухом,
        // посеред жесту раптом починала б тягнутись.
        if (delta <= 0 || window.scrollY > 0) {
          decidedRef.current = "scroll";
          return;
        }
        decidedRef.current = "pull";
      }

      // Тягнемо самі — рідну прокрутку та гумовий відскок глушимо.
      if (event.cancelable) event.preventDefault();

      const next = resist(delta);
      pullRef.current = next;
      setPull(next);
      setState(next >= THRESHOLD ? "armed" : "pulling");
    };

    const onTouchEnd = () => {
      if (busyRef.current) return;
      const wasPulling = decidedRef.current === "pull";
      startYRef.current = null;
      decidedRef.current = "none";
      if (!wasPulling) return;

      if (pullRef.current >= THRESHOLD) void run();
      else settle();
    };

    // `passive: false` лише на move — саме там потрібен preventDefault.
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.documentElement.classList.remove(LOCK_CLASS);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [active, run, settle]);

  // Вимкнення посеред жесту (відкрився аркуш, поїхали на десктоп) не має
  // лишити сторінку відтягнутою.
  useEffect(() => {
    if (!active && pullRef.current !== 0 && !busyRef.current) settle();
  }, [active, settle]);

  return {
    pull,
    state,
    /** 0…1 — скільки пройдено до спрацювання. Індикатор малює саме це. */
    progress: Math.min(1, pull / THRESHOLD),
    /** Чи зараз іде оновлення — щоб сторінка могла нічого не міняти під рукою. */
    refreshing: state === "refreshing",
  };
}

export const PULL_TO_REFRESH_THRESHOLD = THRESHOLD;
