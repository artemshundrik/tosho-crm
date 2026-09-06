import { Check, Loader2, Mic, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { useDictation } from "@/lib/useDictation";

/**
 * Диктування: кнопка мікрофона й капсула, що заміняє поле вводу під час запису.
 *
 * Винесено зі ThreadComposer, коли те саме знадобилось у палеті ToSho AI. Дві
 * копії розійшлися б: у чаті лишився б еквалайзер, у палеті — ні, і однакова
 * дія почала б виглядати по-різному в сусідніх вікнах.
 *
 * Червоний тон — свідомо той самий, що й у чаті. Рожевий пасував би до бренду
 * AI, але запис голосу людина впізнає саме за червоним, і робити його різним
 * залежно від вікна означало б платити впізнаваністю за красу.
 *
 * РЕШТА ЧОРНО-БІЛА (REQ-255#p1). Кнопка підтвердження була `bg-primary` —
 * єдине таке місце в застосунку: усі інші головні дії («Створити задачу»,
 * «Новий прорахунок») намальовані як `bg-foreground text-background`. Через це
 * вона світилась синім там, де решта чорна, і в темній темі доводилось би
 * думати про неї окремо. Тепер правило одне, і темна тема виходить сама.
 */

type Dictation = ReturnType<typeof useDictation>;

/** Смужки еквалайзера: показують, що запис справді йде, а не завис. */
const WAVE_BARS = [
  { height: 8, delay: "0ms" },
  { height: 14, delay: "120ms" },
  { height: 10, delay: "240ms" },
  { height: 16, delay: "80ms" },
  { height: 9, delay: "300ms" },
  { height: 13, delay: "180ms" },
  { height: 7, delay: "60ms" },
];

export const isDictationActive = (dictation: Pick<Dictation, "state">): boolean =>
  dictation.state === "recording" || dictation.state === "transcribing";

/** «1:07» — хвилини й секунди від початку запису. */
function elapsedLabel(elapsedMs: number): string {
  const total = Math.floor(elapsedMs / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Кружечок мікрофона. Нічого не малює, якщо браузер запису не вміє. */
export function DictationButton({
  dictation,
  className,
}: {
  dictation: Dictation;
  className?: string;
}) {
  if (!dictation.isSupported) return null;
  return (
    <button
      type="button"
      aria-label="Продиктувати голосом"
      onClick={() => void dictation.start()}
      className={cn(
        "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-muted-foreground",
        "transition-colors hover:bg-muted/60 hover:text-foreground",
        className
      )}
    >
      <Mic className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Капсула запису. Ставиться ЗАМІСТЬ поля вводу, а не поруч: інакше під час
 * запису лишається спокуса щось друкувати, а надиктоване потім затре набране.
 */
export function DictationCapsule({ dictation, className }: { dictation: Dictation; className?: string }) {
  const isRecording = dictation.state === "recording";

  return (
    <div
      className={cn(
        // Рамка й тло — рівно як у звичайного поля вводу: сама капсула не має
        // «червоніти», червоними лишаються тільки крапка, час і пульсація.
        "flex min-h-[38px] items-center gap-1 rounded-3xl border border-border/60 bg-card p-1 pl-1.5",
        className
      )}
    >
      {isRecording ? (
        <>
          <button
            type="button"
            aria-label="Скасувати запис"
            onClick={() => dictation.cancel()}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>

          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive" />
          <span className="shrink-0 text-xs font-semibold tabular-nums text-destructive">
            {elapsedLabel(dictation.elapsedMs)}
          </span>

          <span className="flex flex-1 items-center gap-[3px] px-1" aria-hidden="true">
            {WAVE_BARS.map((bar, index) => (
              <span
                key={index}
                className="w-[3px] rounded-full bg-destructive/45 motion-safe:animate-[thread-wave_1.1s_ease-in-out_infinite]"
                style={{ height: bar.height, animationDelay: bar.delay }}
              />
            ))}
          </span>

          <button
            type="button"
            aria-label="Завершити запис"
            onClick={() => dictation.stop()}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"
          >
            <Check className="h-4 w-4" />
          </button>
        </>
      ) : (
        <>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          <span className="flex-1 text-xs text-muted-foreground">Розпізнаю голос…</span>
        </>
      )}
    </div>
  );
}

/**
 * Смуга під полем — друга розкладка того самого диктування (REQ-255#p2).
 *
 * НАВІЩО ДРУГА. Капсула стає НА МІСЦЕ поля, і для однорядкового композера це
 * правильно: сховати рядок на час запису нічого не коштує. Але у великому ТЗ
 * так робити не можна — людина саме договорює вже написане й мусить його
 * бачити. Тому там поле лишається, а смуга виїжджає під ним.
 *
 * Що спільне з капсулою: тони, слова, таймер, стан «розпізнаю». Міняється лише
 * те, куди це вкладено — тому обидві розкладки живуть в одному файлі й
 * правляться разом.
 *
 * ЗУПИНКУ СМУГА НЕ МАЛЮЄ. Її малює кнопка в самому полі: мікрофон стає
 * червоним квадратом. Два способи зупинити запис на одному екрані — це два
 * місця, де людина шукає той самий важіль.
 */

/** Щільна хвиля, як у смузі: висоти циклом, щоб не бути випадковими між рендерами. */
const STRIP_HEIGHTS = [6, 12, 9, 15, 7, 13, 10, 16, 8, 11, 14];
const STRIP_BARS = Array.from({ length: 24 }, (_, index) => ({
  height: STRIP_HEIGHTS[index % STRIP_HEIGHTS.length],
  delay: `${(index % 12) * 60}ms`,
}));

export function DictationStrip({
  dictation,
  className,
}: {
  /* Смузі досить стану й часу: зупинку малює кнопка в полі, тож важелі їй не
     потрібні — і вужчий тип не змушує місце вигадувати решту. */
  dictation: Pick<Dictation, "state" | "elapsedMs">;
  className?: string;
}) {
  if (!isDictationActive(dictation)) return null;

  const isRecording = dictation.state === "recording";

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 border-t border-border/70 bg-destructive/5 px-3 py-2.5",
        className
      )}
    >
      {isRecording ? (
        <>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-destructive">
            {elapsedLabel(dictation.elapsedMs)}
          </span>

          <span className="flex flex-1 items-center justify-center gap-[2px]" aria-hidden="true">
            {STRIP_BARS.map((bar, index) => (
              <span
                key={index}
                className="w-[2px] rounded-full bg-destructive/50 motion-safe:animate-[thread-wave_1.2s_ease-in-out_infinite]"
                style={{ height: bar.height, animationDelay: bar.delay }}
              />
            ))}
          </span>

          <span className="shrink-0 text-2xs text-destructive">Слухаю</span>
        </>
      ) : (
        <>
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          <span className="flex-1 text-xs text-muted-foreground">Розпізнаю голос…</span>
        </>
      )}
    </div>
  );
}
