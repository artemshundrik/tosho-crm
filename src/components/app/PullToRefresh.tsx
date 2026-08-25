import * as React from "react";

import { usePullToRefresh, type PullState } from "@/hooks/usePullToRefresh";
import { cn } from "@/lib/utils";

/**
 * «Потягнути вниз, щоб оновити» — жест плюс індикатор.
 *
 * ЧОМУ ДУГА, І ЧОМУ САМЕ ТАКА. Дуга — впізнаваний знак «іде оновлення», його не
 * треба пояснювати. Але фарбується вона не сірим і не синім, а тим самим
 * брендовим рожевим градієнтом, що й смуга прогресу переходів у шапці
 * (`routeProgress.tsx`). Тобто це буквально та сама смуга, зігнута в коло: у
 * застосунку лишається ОДИН знак «щось вантажиться», просто в двох позах.
 *
 * ЧОМУ ІНДИКАТОР ВИЇЖДЖАЄ З-ПІД ШАПКИ. Він лежить ВИЩЕ верхнього краю вмісту й
 * рухається разом із ним. Ніякої окремої анімації появи немає — його видно
 * рівно настільки, наскільки відтягнуто сторінку, і рух пальця напряму керує
 * тим, що на екрані. Саме це відрізняє живий жест від кнопки, яка «блимнула».
 */

const ARC_RADIUS = 10;
const ARC_LENGTH = 2 * Math.PI * ARC_RADIUS;

/** Ті самі стопи, що в смузі прогресу переходів. Один знак — один колір. */
const GRADIENT_STOPS = [
  { offset: "0%", color: "#ff77be" },
  { offset: "28%", color: "#f22397" },
  { offset: "62%", color: "#e6007e" },
  { offset: "100%", color: "#ffafd8" },
];

function PullArc({ progress, state }: { progress: number; state: PullState }) {
  const spinning = state === "refreshing";
  // Поки тягнуть — дуга росте за пальцем. Поки вантажиться — коротка дуга, що
  // біжить по колу: довжина перестає щось означати, лишається сам рух.
  const dash = spinning ? ARC_LENGTH * 0.25 : ARC_LENGTH * progress;
  const gradientId = React.useId();

  return (
    <svg
      viewBox="0 0 26 26"
      className={cn("h-[26px] w-[26px]", spinning && "motion-safe:animate-spin motion-reduce:animate-none")}
      style={spinning ? { animationDuration: "720ms" } : undefined}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          {GRADIENT_STOPS.map((stop) => (
            <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </linearGradient>
      </defs>
      <circle cx="13" cy="13" r={ARC_RADIUS} fill="none" strokeWidth="2.5" className="stroke-border" />
      <circle
        cx="13"
        cy="13"
        r={ARC_RADIUS}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        stroke={`url(#${gradientId})`}
        strokeDasharray={`${dash} ${ARC_LENGTH}`}
        // Старт згори, а не праворуч: дуга росте від того краю, з якого тягнуть.
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
      />
    </svg>
  );
}

export function PullToRefresh({
  onRefresh,
  enabled = true,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const { pull, state, progress } = usePullToRefresh({ onRefresh, enabled });
  const idle = state === "idle";

  return (
    <div
      className="relative"
      style={{
        transform: pull > 0 ? `translate3d(0, ${pull}px, 0)` : undefined,
        // Пружина лише на ПОВЕРНЕННІ. Поки палець на екрані, будь-який перехід
        // означав би, що сторінка відстає від руки, — і жест одразу відчувається
        // «гумовим» у поганому сенсі.
        transition: idle || state === "refreshing" ? "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
        willChange: pull > 0 ? "transform" : undefined,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 -top-[34px] flex justify-center"
        style={{ opacity: Math.min(1, progress * 1.4) }}
        aria-hidden="true"
      >
        <PullArc progress={progress} state={state} />
      </div>
      {/* Живий підпис для тих, хто не бачить дугу. Кажемо стан, а не інструкцію:
          «оновлюємо» — факт, а «потягніть» людина вже й так робить. */}
      <span className="sr-only" role="status" aria-live="polite">
        {state === "refreshing" ? "Оновлюємо" : state === "armed" ? "Відпустіть, щоб оновити" : ""}
      </span>
      {children}
    </div>
  );
}
