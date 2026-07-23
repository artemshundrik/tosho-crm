import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Контейнер поля з зафіксованим префіксом-чипом ліворуч (напр. «UA», «+380»,
 * «@»): чип візуально відокремлений роздільником, його не можна редагувати.
 * Стилі узгоджені з CONTROL_BASE (rounded-xl, muted, soft-ring на фокусі).
 */
export function PrefixField({
  prefix,
  className,
  children,
}: {
  prefix: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-9 w-full items-center overflow-hidden rounded-xl border border-border/50 bg-muted/40 text-sm shadow-inner transition-all duration-200 ease-out",
        "focus-within:bg-background focus-within:shadow-elevated-sm focus-within:ring-1 focus-within:ring-[hsl(var(--soft-ring))]",
        className
      )}
    >
      <span className="flex h-full select-none items-center border-r border-border/60 bg-black/[0.03] px-2.5 font-mono text-[13px] font-medium tracking-wide text-muted-foreground dark:bg-white/[0.04]">
        {prefix}
      </span>
      {children}
    </div>
  );
}

/** Спільний клас для input-а всередині PrefixField. */
export const PREFIX_FIELD_INPUT =
  "h-full w-full min-w-0 bg-transparent px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground";
