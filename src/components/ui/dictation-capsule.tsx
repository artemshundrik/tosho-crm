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

export const isDictationActive = (dictation: Dictation): boolean =>
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
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
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
