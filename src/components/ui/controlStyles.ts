export function cx(...arr: Array<string | undefined | false | null>) {
  return arr.filter(Boolean).join(" ");
}

/**
 * Єдина база стилів для Input / SelectTrigger / ін.
 * Всі кольори — тільки через design tokens.
 */
export const CONTROL_BASE = cx(
  "h-10 rounded-[var(--radius-md)] bg-background",
  "border border-input",
  "text-foreground placeholder:text-muted-foreground",
  "transition-colors duration-150",
  "hover:bg-muted/25 hover:border-foreground/30",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 focus-visible:border-primary/60",
  "disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-muted/20",
  "[&>svg]:text-muted-foreground [&>svg]:opacity-100 [&>svg]:transition-colors",
  "hover:[&>svg]:text-foreground"
);

export const TOOLBAR_CONTROL = cx(
  CONTROL_BASE,
  "px-3.5 shadow-sm"
);

export const TOOLBAR_ACTION_BUTTON = cx("h-10 rounded-[var(--btn-radius)] px-4");

export const CONTROL_ICON_BTN = cx(
  "inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)]",
  "text-muted-foreground hover:text-foreground",
  "hover:bg-muted",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
);

export const SEARCH_WRAP = cx("relative flex-1 max-w-[520px] min-w-[240px]");
export const SEARCH_LEFT_ICON = cx(
  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
);
export const SEARCH_INPUT = cx(TOOLBAR_CONTROL, "pl-9 pr-9");
export const SEARCH_CLEAR_BTN_POS = cx("absolute right-2 top-1/2 -translate-y-1/2");

export const SEGMENTED_GROUP = cx(
  "inline-flex h-10 items-center rounded-[var(--radius-lg)] border border-border/80 bg-muted/60 p-0.5"
);

export const SEGMENTED_GROUP_SM = cx(
  "inline-flex h-10 items-center rounded-[var(--radius-lg)] border border-border/80 bg-muted/60 p-0.5"
);

export const SEGMENTED_TRIGGER = cx("h-9 rounded-[var(--radius-md)] px-4");
export const SEGMENTED_TRIGGER_SM = cx("h-9 rounded-[var(--radius-md)] px-3.5");
