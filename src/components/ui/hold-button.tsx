import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Кнопка, яку треба ЗАТИСНУТИ, щоб дія сталася.
 *
 * ЗВІДКИ. Перемальовано з KokonutUI (`hold-button`, MIT, kokonutui.com) —
 * другий елемент, узятий звідти після ілюстрації завантаження.
 *
 * ЩО ЗМІНЕНО ПРОТИ ОРИГІНАЛУ, І ЧОМУ ЦЕ НЕ ПРИДИРКИ.
 *
 * 1. ОРИГІНАЛ ПРАЦЮЄ ЛИШЕ МИШЕЮ (`onMouseDown`/`onMouseUp`). На телефоні він
 *    просто не спрацьовує — а саме з телефона найчастіше й тиснуть «скасувати».
 *    Тут вказівникові події: одна гілка на мишу, дотик і стилус.
 * 2. ОРИГІНАЛ НЕ ЗНАЄ КЛАВІАТУРИ. У діалозі підтвердження це означало б, що
 *    підтвердити з клавіатури неможливо взагалі. Тут Enter або Пробіл теж
 *    тримають: натиснув і не відпускаєш — заповнюється, відпустив — скасувалось.
 * 3. ЗАПОВНЕННЯ НЕ НА MOTION. В оригіналі це `motion.div` з `useAnimation`;
 *    те саме робить CSS-перехід `scaleX`, а бібліотека коштувала б 40 кБ
 *    (замір у [REQ-253]) заради однієї смужки.
 *
 * ПІДПИС МІНЯЄТЬСЯ НА ЗАТИСКУ, А НЕ НА НАВЕДЕННІ. Наведення не існує ні на
 * дотику, ні з клавіатури, тож підказка, прив'язана до нього, доходить лише до
 * частини людей. У спокої кнопка каже, ЩО станеться, під час затиску — що треба
 * тримати.
 *
 * РУХ ТУТ НЕ ПРИКРАСА, тож `prefers-reduced-motion` смужку не гасить: вона
 * показує, скільки лишилось, і без неї затиск перетворюється на здогадування.
 */
export function HoldButton({
  onConfirm,
  children,
  holdingLabel = "Тримайте…",
  holdMs = 900,
  tone = "danger",
  disabled = false,
  className,
}: {
  onConfirm: () => void;
  children: React.ReactNode;
  /** Підпис під час затиску. */
  holdingLabel?: string;
  /** Скільки тримати. Менше за 600 мс перестає бути захистом від випадкового натиску. */
  holdMs?: number;
  tone?: "danger" | "neutral";
  disabled?: boolean;
  className?: string;
}) {
  const [holding, setHolding] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  const stop = React.useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
  }, []);

  const start = React.useCallback(() => {
    if (disabled || timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, holdMs);
  }, [disabled, holdMs, onConfirm]);

  React.useEffect(() => stop, [stop]);

  const danger = tone === "danger";

  return (
    <button
      type="button"
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        // `repeat` відсікає автоповтор: інакше кожен повторний keydown
        // перезапускав би відлік, і затиснути було б неможливо.
        if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        start();
      }}
      onKeyUp={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        stop();
      }}
      className={cn(
        "relative isolate inline-flex h-9 select-none items-center justify-center overflow-hidden rounded-[var(--radius-md)] px-4 text-sm font-medium",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        "disabled:pointer-events-none disabled:opacity-50",
        danger
          ? "border border-destructive/40 text-destructive"
          : "border border-border text-foreground",
        className
      )}
    >
      {/* Смужка заповнення. Трансформ, а не ширина: браузер малює її на
          композиторі й не перераховує розкладку.

          ЧОМУ ТРАНСФОРМ ІНЛАЙНОМ, А НЕ `scale-x-0`/`scale-x-100`. У Tailwind v4
          ці класи пишуть у ВЛАСТИВІСТЬ `scale`, а не в `transform` — і перехід
          по `transform` їх не бачить узагалі. Смужка стояла нерухомо, хоча в
          розмітці все виглядало правильно. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-0 -z-10 origin-left ease-linear",
          danger ? "bg-destructive/15" : "bg-foreground/10"
        )}
        style={{
          transform: holding ? "scaleX(1)" : "scaleX(0)",
          transitionProperty: "transform",
          transitionDuration: `${holding ? holdMs : 140}ms`,
        }}
      />
      <span className="relative">{holding ? holdingLabel : children}</span>
    </button>
  );
}
