export function cx(...arr: Array<string | undefined | false | null>) {
  return arr.filter(Boolean).join(" ");
}

/**
 * Єдина база стилів для Input / SelectTrigger / ін.
 * Всі кольори — тільки через design tokens.
 */
export const CONTROL_BASE = cx(
  "h-10 rounded-xl bg-muted/40",
  "border border-border/50 shadow-inner",
  "text-foreground placeholder:text-muted-foreground",
  "transition-all duration-200 ease-out",
  "hover:bg-muted/60",
  "focus-visible:outline-none focus-visible:bg-background focus-visible:shadow-[var(--shadow-elevated-sm)] focus-visible:ring-1 focus-visible:ring-[hsl(var(--soft-ring))]",
  "focus:bg-background focus:shadow-[var(--shadow-elevated-sm)] focus:ring-1 focus:ring-[hsl(var(--soft-ring))]",
  "disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-muted/20 disabled:shadow-none",
  "[&>svg]:text-muted-foreground [&>svg]:opacity-100 [&>svg]:transition-colors",
  "hover:[&>svg]:text-foreground"
);

export const TOOLBAR_CONTROL = cx(
  CONTROL_BASE,
  "px-3.5"
);

export const TOOLBAR_ACTION_BUTTON = cx("h-10 rounded-xl px-4 transition-all duration-200 ease-out");

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
  "inline-flex p-1 h-11 items-center rounded-xl border border-border/50 bg-muted/40 shadow-inner"
);

export const SEGMENTED_GROUP_SM = cx(
  "inline-flex p-0.5 h-9 items-center rounded-lg border border-border/50 bg-muted/40 shadow-inner"
);

export const SEGMENTED_TRIGGER = cx(
  "flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-lg px-4 text-sm font-medium transition-all duration-200 ease-out text-muted-foreground hover:text-foreground hover:bg-background/50",
  "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-[var(--shadow-elevated-sm)] data-[state=active]:ring-1 data-[state=active]:ring-[hsl(var(--soft-ring))]",
  "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-[var(--shadow-elevated-sm)] data-[state=on]:ring-1 data-[state=on]:ring-[hsl(var(--soft-ring))]"
);

export const SEGMENTED_TRIGGER_SM = cx(
  "flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded-md px-3 text-xs font-medium transition-all duration-200 ease-out text-muted-foreground hover:text-foreground hover:bg-background/50",
  "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-[var(--shadow-elevated-sm)] data-[state=active]:ring-1 data-[state=active]:ring-[hsl(var(--soft-ring))]",
  "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-[var(--shadow-elevated-sm)] data-[state=on]:ring-1 data-[state=on]:ring-[hsl(var(--soft-ring))]"
);
