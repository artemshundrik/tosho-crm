import * as React from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DictationStrip } from "@/components/ui/dictation-capsule";
import { FeatureHint } from "@/features/features/FeatureHint";
import {
  useDictation,
  type DictationContext,
} from "@/lib/useDictation";

type DictationButtonProps = {
  /** Ref to the textarea the transcript is inserted into (at the caret). */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Current textarea value (controlled). */
  value: string;
  /** Called with the new full value after inserting the transcript. */
  onChange: (nextValue: string) => void;
  context: DictationContext;
  disabled?: boolean;
  className?: string;
  /** Override the auto-stop ceiling (ms). */
  maxDurationMs?: number;
  /** Runs after the transcript is inserted and the value has committed (e.g. to auto-resize). */
  onAfterInsert?: () => void;
};

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Insert `text` into the field. If the textarea is genuinely focused with a
// caret, insert at that caret (replacing any selection); otherwise append at the
// end. Clicking the mic button blurs the textarea, so the common case is
// append-at-end — which is what users expect when dictating into existing text.
function insertAtCaret(
  textarea: HTMLTextAreaElement | null,
  value: string,
  text: string
): { nextValue: string; caret: number } {
  const isFocused =
    !!textarea && typeof document !== "undefined" && document.activeElement === textarea;
  const start = isFocused ? textarea.selectionStart ?? value.length : value.length;
  const end = isFocused ? textarea.selectionEnd ?? value.length : value.length;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
  const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
  const insertion = `${needsLeadingSpace ? " " : ""}${text}${needsTrailingSpace ? " " : ""}`;
  const nextValue = `${before}${insertion}${after}`;
  return { nextValue, caret: before.length + insertion.length };
}

/**
 * Диктування для поля з текстом: кнопка + (за потреби) смуга під полем.
 *
 * ЧОМУ ХУК, А НЕ САМА КНОПКА (REQ-255#p3). Розкладка «смуга» вимагає малювати
 * дві речі в РІЗНИХ місцях розмітки — кнопку в кутку поля й смугу під ним, —
 * а стан запису в них спільний. Компонент таке віддати не може: він малює одне
 * піддерево. Тому хук тримає стан і повертає обидва вузли, а місце ставить їх
 * туди, куди треба.
 *
 * `withStrip` — вибір розкладки за формою поля: велика текстова область
 * лишається видимою (людина договорює написане), тож час і хвиля йдуть у смугу
 * під нею; у решті місць час лишається на самій кнопці.
 */
export function useDictationField({
  textareaRef,
  value,
  onChange,
  context,
  disabled,
  className,
  maxDurationMs,
  onAfterInsert,
  withStrip = false,
}: DictationButtonProps & { withStrip?: boolean }): {
  button: React.ReactNode;
  strip: React.ReactNode;
} {
  // useDictation keeps the latest onResult in a ref, so this closure (recreated
  // each render with the current value/onChange) always splices into fresh text.
  const { state, elapsedMs, error, isSupported, start, stop } = useDictation({
    context,
    maxDurationMs,
    onResult: (text) => {
      const { nextValue, caret } = insertAtCaret(textareaRef.current, value, text);
      onChange(nextValue);
      // Restore focus + caret after React re-renders the controlled value.
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(caret, caret);
        }
        onAfterInsert?.();
      });
    },
  });

  React.useEffect(() => {
    if (state === "error" && error) {
      toast.error(error);
    }
  }, [state, error]);

  if (!isSupported) return { button: null, strip: null };

  const isRecording = state === "recording";
  const isTranscribing = state === "transcribing";

  const handleClick = () => {
    if (isRecording) {
      stop();
    } else if (state !== "transcribing") {
      void start();
    }
  };

  const label = isRecording
    ? "Зупинити запис"
    : isTranscribing
      ? "Розпізнавання…"
      : "Диктувати голосом";

  const button = (
    /* Обгортка потрібна лише як точка відліку для підказки. inline-flex, щоб
       у флекс-рядках поводитись так само, як сама кнопка. */
    <span className="relative inline-flex">
      <Button
        type="button"
        variant={isRecording ? "controlDestructive" : "control"}
        size={isRecording ? "sm" : "iconSm"}
        onClick={handleClick}
        disabled={disabled || isTranscribing}
        aria-label={label}
        aria-pressed={isRecording}
        title={label}
        className={cn(isRecording && "gap-1.5 tabular-nums", className)}
      >
        {isTranscribing ? (
          <Loader2 className="animate-spin" />
        ) : isRecording ? (
          <>
            <Square className="fill-current" />
            {/* Зі смугою час живе в ній: два таймери на екрані — це два місця,
                де людина шукає одну відповідь. */}
            {withStrip ? null : <span className="text-xs">{formatElapsed(elapsedMs)}</span>}
          </>
        ) : (
          <Mic />
        )}
      </Button>

      {/* Фіча стоїть у 16 місцях, а користувалась нею одна людина тричі —
          отже її просто не помічають. Підказка вказує на цю саму кнопку. */}
      {isSupported && !isRecording && !isTranscribing ? (
        <FeatureHint
          featureKey="voice_dictation"
          text="Замість друкувати — надиктуй. Натисни мікрофон і говори."
        />
      ) : null}
    </span>
  );

  return {
    button,
    strip: withStrip ? <DictationStrip dictation={{ state, elapsedMs }} /> : null,
  };
}

/** Кнопка без смуги — там, де поле однорядкове або смуга не потрібна. */
export function DictationButton(props: DictationButtonProps) {
  return <>{useDictationField(props).button}</>;
}
