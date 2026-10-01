import React from "react";
import { cn } from "@/lib/utils";
import { readStoredWidth, writeStoredWidth } from "@/lib/storedWidth";

/** Найвужча колонка обговорення — трохи вужча за стандартні 21.25rem. */
const RAIL_MIN_REM = 18.75;
/**
 * Скільки лишаємо середині сторінки. Те саме число, з якого виріс поріг двох
 * колонок у index.css: 60rem = 620 px середини + 340 px рейки.
 */
const MIDDLE_MIN_REM = 38.75;
const KEYBOARD_STEP = 16;
/** Капсула не підходить до верху й низу ближче, ніж на півтора своєї висоти. */
const GRIP_EDGE = 28;

/**
 * Межі тримає CSS, а не JS: `cqw` міряє сторінку-запис (`@container/record`),
 * тож коли вікно вужчає чи розгортається сайдбар, колонка поступається середині
 * сама — без слухача resize. Збережене число — лише побажання.
 */
const railWidthValue = (px: number) =>
  `clamp(${RAIL_MIN_REM}rem, ${Math.round(px)}px, 100cqw - ${MIDDLE_MIN_REM}rem)`;

type Bounds = { now: number; min: number; max: number };

/**
 * Ручка на межі між серединою сторінки-запису й колонкою обговорення:
 * навів — проступила лінія, потягнув — колонка ширшає чи вужчає. Ширина
 * запам'ятовується в браузері, подвійний клік повертає стандартну.
 *
 * Ставиться ОСТАННЬОЮ дитиною сітки сторінки (та, що з `--record-rail-w`), і
 * сітці потрібен `record-split:relative`. Ширину ручка пише прямо в змінну
 * сітки, повз React: інакше кожен рух миші перемальовував би сторінку-гіганта.
 * У вузькому вигляді обговорення живе в шторці, і ручки немає.
 */
export function RecordRailResizer({ storageKey }: { storageKey: string }) {
  const handleRef = React.useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = React.useState<Bounds | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const apply = React.useCallback((px: number | null) => {
    const grid = handleRef.current?.parentElement;
    if (!grid) return;
    if (px === null) grid.style.removeProperty("--record-rail-w");
    else grid.style.setProperty("--record-rail-w", railWidthValue(px));
  }, []);

  React.useLayoutEffect(() => {
    apply(readStoredWidth(storageKey));
  }, [apply, storageKey]);

  /** Фактична ширина колонки й межі саме зараз: стеля залежить від ширини сторінки. */
  const measure = (): Bounds | null => {
    const grid = handleRef.current?.parentElement;
    if (!grid) return null;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const tracks = getComputedStyle(grid).gridTemplateColumns.split(" ");
    const min = RAIL_MIN_REM * rem;
    const max = Math.max(min, grid.clientWidth - MIDDLE_MIN_REM * rem);
    const now = parseFloat(tracks[tracks.length - 1] ?? "");
    return { now: Number.isFinite(now) ? now : min, min, max };
  };

  const commit = (px: number, current: Bounds) => {
    apply(px);
    writeStoredWidth(storageKey, px);
    setBounds({ ...current, now: Math.round(px) });
  };

  const reset = () => {
    apply(null);
    writeStoredWidth(storageKey, null);
    setBounds(measure());
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const start = measure();
    if (!start) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    let next = start.now;
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    // Колонка праворуч: тягнеш ліворуч — ширшає.
    const onMove = (move: PointerEvent) => {
      next = Math.min(start.max, Math.max(start.min, start.now + startX - move.clientX));
      apply(next);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDragging(false);
      // Клік без руху не фіксує ширину: інакше стандартна застигла б числом
      // і перестала б ширшати на широкій сторінці.
      if (Math.abs(next - start.now) >= 1) commit(next, start);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  /** Капсула стоїть там, де курсор: ручка довжиною в сторінку інакше губилась би. */
  const followPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    const rect = handle.getBoundingClientRect();
    const y = Math.min(rect.height - GRIP_EDGE, Math.max(GRIP_EDGE, event.clientY - rect.top));
    handle.style.setProperty("--grip-y", `${Math.round(y)}px`);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowLeft" ? KEYBOARD_STEP : event.key === "ArrowRight" ? -KEYBOARD_STEP : 0;
    if (!step) return;
    event.preventDefault();
    const current = measure();
    if (!current) return;
    commit(Math.min(current.max, Math.max(current.min, current.now + step)), current);
  };

  return (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="vertical"
      aria-label="Ширина колонки обговорення"
      aria-valuenow={bounds ? Math.round(bounds.now) : undefined}
      aria-valuemin={bounds ? Math.round(bounds.min) : undefined}
      aria-valuemax={bounds ? Math.round(bounds.max) : undefined}
      title="Потягніть, щоб змінити ширину · двічі клацніть — стандартна"
      tabIndex={0}
      data-dragging={dragging ? "" : undefined}
      onFocus={() => setBounds(measure())}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={reset}
      onPointerMove={followPointer}
      className="group absolute inset-y-0 right-(--record-rail-w) z-30 hidden w-3 translate-x-1/2 cursor-col-resize touch-none outline-none [--grip-y:50%] record-split:block"
    >
      {/*
        Межа світиться лише довкола курсора й згасає до країв: суцільна лінія
        на всю висоту сторінки кричала б голосніше за сам вміст. З клавіатури
        світло стоїть посередині.
      */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-hover:delay-75 group-focus-visible:opacity-100 group-data-dragging:opacity-100 motion-reduce:transition-none"
        style={{
          background:
            "linear-gradient(to bottom, transparent calc(var(--grip-y) - 180px), hsl(var(--foreground) / 0.32) var(--grip-y), transparent calc(var(--grip-y) + 180px))",
        }}
      />
      {/*
        Капсула-ручка їде за курсором. Кільце кольору тла відрізає її від
        лінії, тож вона читається окремим предметом, який можна взяти.
        Затримка на появі — щоб миша, яка просто перетинає межу, нічого не
        смикала.
      */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 top-(--grip-y) h-8 w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/55 opacity-0 ring-2 ring-background scale-y-50",
          "transition-[opacity,scale,height,background-color] duration-150 ease-out motion-reduce:transition-none",
          "group-hover:scale-y-100 group-hover:opacity-100 group-hover:delay-75 group-focus-visible:scale-y-100 group-focus-visible:opacity-100",
          "group-data-dragging:h-10 group-data-dragging:scale-y-100 group-data-dragging:bg-foreground group-data-dragging:opacity-100"
        )}
      />
    </div>
  );
}
