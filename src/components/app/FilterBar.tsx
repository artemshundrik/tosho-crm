// src/components/ui/FilterBar.tsx
import * as React from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type FilterBarTab<T extends string> = { value: T; label: string };

export type FilterBarSelectOption = { value: string; label: string };

export type FilterBarSelect = {
  key: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  widthClassName?: string;
  options: FilterBarSelectOption[];
};

export type FilterBarSearch = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  widthClassName?: string;
};

export type FilterBarSortOption<T extends string> = { value: T; label: string };

export type FilterBarSort<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  placeholder?: string;
  widthClassName?: string;
  options: Array<FilterBarSortOption<T>>;
};

export type FilterBarProps<TTab extends string, TSort extends string> = {
  tabs?: {
    value: TTab;
    onChange: (value: TTab) => void;
    items: Array<FilterBarTab<TTab>>;
  };
  selects?: FilterBarSelect[];
  sort?: FilterBarSort<TSort>;
  showSort?: boolean;
  compactSort?: boolean;
  search?: FilterBarSearch;
  rightSlot?: React.ReactNode;
  bottomLeft?: React.ReactNode;
  bottomRight?: React.ReactNode;
  className?: string;
};

function cx(...arr: Array<string | undefined | false | null>) {
  return arr.filter(Boolean).join(" ");
}

/**
 * Єдина база стилів для Input / SelectTrigger / ін.
 * Всі кольори — ТІЛЬКИ через design tokens
 *
 * Важливо:
 * - border = структура
 * - ring = тільки focus-visible
 * - іконки (svg) в контролах = muted-foreground, без opacity
 */
const CONTROL_BASE = cx(
  // size + shape
  "h-10 rounded-[var(--radius-lg)] bg-background",
  // structure
  "border border-input",
  // typography
  "text-foreground placeholder:text-muted-foreground",
  // interaction (same for Input + SelectTrigger)
  "transition-colors",
  "hover:border-foreground/20 hover:bg-muted/20",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40",
  // disabled
  "disabled:opacity-50 disabled:cursor-not-allowed",
  // icons inside controls (SelectTrigger chevron etc.)
  "[&>svg]:text-muted-foreground [&>svg]:opacity-100 [&>svg]:transition-colors",
  "hover:[&>svg]:text-foreground"
);

const CONTROL_ICON_BTN = cx(
  "inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-lg)]",
  "text-muted-foreground hover:text-foreground",
  "hover:bg-muted",
  "transition-colors",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
);



function SegmentedTabs<TTab extends string>({
  value,
  onChange,
  items,
}: {
  value: TTab;
  onChange: (v: TTab) => void;
  items: Array<FilterBarTab<TTab>>;
}) {
  return (
    <div className={cx("inline-flex h-10 items-center rounded-[var(--radius-lg)] p-1", "bg-muted border border-border")}>
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
  key={t.value}
  type="button"
  onClick={() => onChange(t.value)}
  className={cx(
    "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
    active
      ? "bg-card text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground"
  )}
>
  {t.label}
</button>

        );
      })}
    </div>
  );
}

function SortSelect<TSort extends string>({ sort }: { sort: FilterBarSort<TSort> }) {
  return (
    <Select value={sort.value} onValueChange={(v) => sort.onChange(v as TSort)}>
      <SelectTrigger className={cx(CONTROL_BASE, sort.widthClassName ?? "w-56")}>
        <SelectValue placeholder={sort.placeholder ?? "Сортування"} />
      </SelectTrigger>
      <SelectContent>
        {sort.options.map((o) => (
          <SelectItem key={`sort_${o.value}`} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CompactSort<TSort extends string>({ sort }: { sort: FilterBarSort<TSort> }) {
  return (
    <Select value={sort.value} onValueChange={(v) => sort.onChange(v as TSort)}>
      <SelectTrigger
        aria-label={sort.placeholder ?? "Сортування"}
        className={cx(CONTROL_BASE, "w-10 px-0 justify-center")}
      >
        <span className="text-muted-foreground text-base leading-none">↕︎</span>
      </SelectTrigger>
      <SelectContent>
        {sort.options.map((o) => (
          <SelectItem key={`sort_${o.value}`} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterBar<TTab extends string, TSort extends string>({
  tabs,
  selects,
  sort,
  showSort,
  compactSort,
  search,
  rightSlot,
  bottomLeft,
  bottomRight,
  className,
}: FilterBarProps<TTab, TSort>) {
  const hasBottom = Boolean(bottomLeft || bottomRight);
  const shouldShowSort = typeof showSort === "boolean" ? showSort : Boolean(sort);

  return (
  <Card
    className={cx(
      "rounded-[var(--radius-section)] bg-card",
      "border border-border",
      "px-5 py-5",
      "shadow-none",
      className
    )}
  >

      {/* TOP ROW */}
      <div className="flex items-center gap-3">
        {tabs ? (
          <div className="shrink-0">
            <SegmentedTabs value={tabs.value} onChange={tabs.onChange} items={tabs.items} />
          </div>
        ) : null}

        <div className="flex flex-1 flex-wrap items-center justify-end gap-3 min-h-10">

          {selects?.map((s) => (
            <Select key={s.key} value={s.value} onValueChange={(v) => s.onChange(v)}>
              <SelectTrigger className={cx(CONTROL_BASE, s.widthClassName ?? "w-52")}>
                <SelectValue placeholder={s.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {s.options.map((o) => (
                  <SelectItem key={`${s.key}_${o.value}`} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}

          {sort && shouldShowSort ? (compactSort ? <CompactSort sort={sort} /> : <SortSelect sort={sort} />) : null}

          {rightSlot}

          {search ? (
            <div
              className={cx(
                "relative flex-1 min-w-[200px]",
                search.widthClassName ?? "max-w-[520px]"
              )}
            >
              <SearchIcon
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />

              <Input
                className={cx(CONTROL_BASE, "pl-9 pr-9")}
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder ?? "Пошук у списку"}
              />

              {search.value.trim().length > 0 ? (
                <button
                  type="button"
                  aria-label="Очистити пошук"
                  className={cx("absolute right-2 top-1/2 -translate-y-1/2", CONTROL_ICON_BTN)}

                  onClick={() => search.onChange("")}
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* BOTTOM ROW */}
      {hasBottom ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div>{bottomLeft}</div>
          <div>{bottomRight}</div>
        </div>
      ) : null}
    </Card>
  );
}
