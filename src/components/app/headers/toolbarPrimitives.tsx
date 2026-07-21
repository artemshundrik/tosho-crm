import * as React from "react";
import { FilterX, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOOLBAR_CONTROL } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";

// Примітиви тулбара списків. Кожна сторінка збирала пошук/бейдж/мету руками —
// однаковий markup жив у 6+ копіях і повільно розповзався (різні позиції лоадера,
// різні розміри бейджів). Тут — канонічна версія; сторінки лише передають дані.
// Конвенція: список = UnifiedPageToolbar (через usePageHeaderActions) + ці примітиви.

type ToolbarSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Показує спінер у полі (пошук/оновлення даних у процесі). */
  loading?: boolean;
  className?: string;
  inputClassName?: string;
};

/** Пошук тулбара: іконка зліва, очистка справа, опційний спінер. */
export function ToolbarSearch({
  value,
  onChange,
  placeholder = "Пошук...",
  loading = false,
  className,
  inputClassName,
}: ToolbarSearchProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(TOOLBAR_CONTROL, "pl-9 pr-9", inputClassName)}
      />
      {value ? (
        <Button
          type="button"
          variant="control"
          size="iconSm"
          aria-label="Очистити пошук"
          className="absolute right-2 top-1/2 -translate-y-1/2"
          onClick={() => onChange("")}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
      {loading ? (
        <Loader2
          className={cn(
            "absolute top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground",
            value ? "right-10" : "right-3"
          )}
        />
      ) : null}
    </div>
  );
}

/** Бейдж кількості в segmented-табі: «Замовники [128]». Один стиль на всі сторінки. */
export function CountBadge({ value, className }: { value: number | string; className?: string }) {
  return (
    <span className={cn("rounded-md bg-card px-1.5 py-0.5 text-[11px] tabular-nums", className)}>
      {value}
    </span>
  );
}

type ToolbarMetaProps = {
  count: number | string;
  /** Підпис після числа, напр. «знайдено». Без нього — просто число. */
  countLabel?: string;
  /** Коли передано і showReset не false — зʼявляється кнопка скидання фільтрів. */
  onReset?: () => void;
  showReset?: boolean;
  loading?: boolean;
  className?: string;
};

/** Права мета тулбара: [скинути фільтри] N [знайдено] [спінер]. */
export function ToolbarMeta({
  count,
  countLabel,
  onReset,
  showReset,
  loading = false,
  className,
}: ToolbarMetaProps) {
  const resetVisible = Boolean(onReset) && showReset !== false;
  return (
    <div className={cn("flex items-center gap-2 text-sm font-semibold text-foreground", className)}>
      {resetVisible ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onReset}
          className="h-8 w-8 shrink-0 text-muted-foreground"
          title="Скинути фільтри"
          aria-label="Скинути фільтри"
        >
          <FilterX className="h-4 w-4" />
        </Button>
      ) : null}
      <span className="tabular-nums">{count}</span>
      {countLabel ? <span className="text-muted-foreground">{countLabel}</span> : null}
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}
