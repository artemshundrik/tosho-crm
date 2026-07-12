import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Текстове поле, що починається з одного рядка й авто-розтягується вниз під
 * вміст (без ручного «вушка» й без внутрішнього скролу). Візуально — той самий
 * стиль, що й <Textarea>, лише без фіксованої min-height.
 */
const AutoTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, value, rows = 1, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef)
          (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      },
      [forwardedRef]
    );

    const resize = React.useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      const borders = el.offsetHeight - el.clientHeight;
      el.style.height = `${el.scrollHeight + borders}px`;
    }, []);

    // Підганяємо висоту після кожної зміни значення (набір, підвантаження картки).
    React.useLayoutEffect(() => {
      resize();
    }, [resize, value]);

    return (
      <textarea
        ref={setRefs}
        rows={rows}
        value={value}
        className={cn(
          "flex w-full resize-none appearance-none overflow-hidden rounded-[var(--radius-lg)] border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground",
          "transition-colors duration-150",
          "hover:border-foreground/30 hover:bg-muted/20",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 focus-visible:border-primary/60",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        {...props}
      />
    );
  }
);
AutoTextarea.displayName = "AutoTextarea";

export { AutoTextarea };
