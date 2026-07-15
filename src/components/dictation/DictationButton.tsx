import * as React from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useDictation,
  type DictationContext,
} from "@/lib/useDictation";

type DictationButtonProps = {
  /** Ref to the textarea the transcript is inserted into (at the caret). */
  textareaRef: React.RefObject<HTMLTextAreaElement>;
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

// Insert `text` at the textarea caret (replacing any selection), padding with
// spaces so dictated fragments don't fuse onto adjacent words.
function insertAtCaret(
  textarea: HTMLTextAreaElement | null,
  value: string,
  text: string
): { nextValue: string; caret: number } {
  const start = textarea?.selectionStart ?? value.length;
  const end = textarea?.selectionEnd ?? value.length;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
  const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
  const insertion = `${needsLeadingSpace ? " " : ""}${text}${needsTrailingSpace ? " " : ""}`;
  const nextValue = `${before}${insertion}${after}`;
  return { nextValue, caret: before.length + insertion.length };
}

export function DictationButton({
  textareaRef,
  value,
  onChange,
  context,
  disabled,
  className,
  maxDurationMs,
  onAfterInsert,
}: DictationButtonProps) {
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

  if (!isSupported) return null;

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

  return (
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
          <span className="text-xs">{formatElapsed(elapsedMs)}</span>
        </>
      ) : (
        <Mic />
      )}
    </Button>
  );
}
