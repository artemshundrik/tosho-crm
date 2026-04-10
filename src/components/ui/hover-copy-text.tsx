import { useEffect, useState, type MouseEventHandler, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { copyText } from "@/components/ui/rich-text-links";
import { cn } from "@/lib/utils";

type HoverCopyTextProps = {
  value?: string | null;
  children?: ReactNode;
  className?: string;
  textClassName?: string;
  buttonClassName?: string;
  buttonStyle?: "inline" | "overlay";
  successMessage?: string;
  copyLabel?: string;
  title?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
};

export function HoverCopyText({
  value,
  children,
  className,
  textClassName,
  buttonClassName,
  buttonStyle = "overlay",
  successMessage = "Скопійовано",
  copyLabel = "Скопіювати",
  title,
  onClick,
  disabled = false,
}: HoverCopyTextProps) {
  const [copied, setCopied] = useState(false);
  const copyValue = typeof value === "string" ? value.trim() : "";
  const canCopy = !disabled && copyValue.length > 0;

  useEffect(() => {
    if (!copied) return;
    const timeoutId = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  const isOverlayButton = buttonStyle === "overlay";
  const sharedTextClassName = cn("min-w-0 truncate", !isOverlayButton && "pr-0", textClassName);
  const content = children ?? value ?? "";

  return (
    <span
      className={cn(
        "group/hover-copy inline-flex max-w-full items-center align-baseline",
        isOverlayButton ? "relative" : "gap-1.5",
        className
      )}
    >
      {onClick ? (
        <button type="button" className={cn(sharedTextClassName, "text-left")} title={title ?? copyValue} onClick={onClick}>
          {content}
        </button>
      ) : (
        <span className={sharedTextClassName} title={title ?? copyValue}>
          {content}
        </span>
      )}
      {canCopy ? (
        <button
          type="button"
          title={copyLabel}
          aria-label={copyLabel}
          className={cn(
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/hover-copy:opacity-100",
            isOverlayButton && "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background/90 shadow-sm backdrop-blur-sm",
            buttonClassName
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void copyText(copyValue, successMessage)
              .then(() => setCopied(true))
              .catch(() => toast.error("Не вдалося скопіювати"));
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </span>
  );
}
