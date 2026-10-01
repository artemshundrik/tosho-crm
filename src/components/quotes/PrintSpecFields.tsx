import * as React from "react";
import { Check } from "@/components/icons/appIcons";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  CUSTOM_OPTION_VALUE,
  customValueKey,
  formatPrintSpecEntries,
  getPrintSpecColumns,
  type PrintSpecColumnInfo,
  type PrintSpecField,
  type PrintSpecPreset,
  type PrintSpecSize,
  type PrintSpecValue,
  type PrintSpecValues,
} from "@/lib/printSpec";

/**
 * Форма описового виду поліграфії: малює поля з `PrintSpecPreset`.
 *
 * Один рендерер на всі нові види — саме заради цього набір полів і став даними.
 * Додати вид означає дописати опис у `printSpec.ts`, а не ще один блок JSX.
 *
 * Вигляд — стовпчики-картки (варіант Б, REQ-323): стовпчик — частина виробу
 * («Обкладинка», «Блок»), і кожен варіант «одного зі списку» видно чипом одразу.
 * Випадні списки ховали варіанти, а ціну рахує той, хто мусить їх порівнювати.
 */

/**
 * Легкий локальний чип. `ui/chip.tsx` — круглий піл під тулбар і без `aria-pressed`;
 * тут потрібен щільний прямокутник з радіусом поля й станом для читачів з екрана.
 */
const OptionChip: React.FC<{
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  dashed?: boolean;
  children: React.ReactNode;
}> = ({ active, onClick, disabled, dashed, children }) => (
  <button
    type="button"
    aria-pressed={active}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2.5 text-xs transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
      "disabled:cursor-not-allowed disabled:opacity-60",
      active
        ? "border-foreground bg-foreground font-semibold text-background"
        : cn(
            "bg-background font-medium hover:bg-muted",
            dashed ? "border-dashed border-border text-muted-foreground" : "border-border/70 text-foreground/80"
          )
    )}
  >
    {children}
  </button>
);

const FieldShell: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <div className="min-w-0 space-y-1.5">
    <div className="text-xs font-medium leading-4 text-muted-foreground">{label}</div>
    {children}
    {hint ? <div className="text-xs text-muted-foreground/80">{hint}</div> : null}
  </div>
);

const asString = (value: PrintSpecValue): string => (typeof value === "string" ? value : "");

const asList = (value: PrintSpecValue): string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string") ? (value as string[]) : [];

const asSizes = (value: PrintSpecValue): PrintSpecSize[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "object" && entry !== null)
    ? (value as PrintSpecSize[])
    : [];

/** Тільки цифри: розміри й кількості вводяться числом, а не «прибл. 300». */
const sanitizeNumeric = (raw: string): string => raw.replace(/[^\d]/g, "");

export type PrintSpecFieldsProps = {
  preset: PrintSpecPreset;
  values: PrintSpecValues;
  onChange: (next: PrintSpecValues) => void;
  disabled?: boolean;
};

/** Скільки стовпчиків у ряд: клас мусить бути літералом, Tailwind не читає число з пропса. */
const LANE_GRID: Record<number, string> = {
  1: "",
  2: "@xl:grid-cols-2",
  3: "@xl:grid-cols-2 @4xl:grid-cols-3",
};

export function PrintSpecFields({ preset, values, onChange, disabled }: PrintSpecFieldsProps) {
  const setValue = React.useCallback(
    (fieldId: string, value: PrintSpecValue) => {
      onChange({ ...values, [fieldId]: value });
    },
    [onChange, values]
  );

  const renderControl = (field: PrintSpecField) => {
    const raw = values[field.id] ?? null;

    if (field.type === "multi") {
      const selected = asList(raw);
      return (
        <div role="group" aria-label={field.label} className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((option) => {
            const checked = selected.includes(option.value);
            return (
              <OptionChip
                key={option.value}
                active={checked}
                disabled={disabled}
                onClick={() => {
                  const list = checked
                    ? selected.filter((entry) => entry !== option.value)
                    : [...selected, option.value];
                  // Порядок опцій, а не порядок кліків: інакше «лак + ламінація»
                  // і «ламінація + лак» читались би як різні специфікації.
                  const ordered = (field.options ?? [])
                    .map((entry) => entry.value)
                    .filter((entry) => list.includes(entry));
                  setValue(field.id, ordered);
                }}
              >
                {checked ? <Check className="h-3 w-3" /> : null}
                {option.label}
              </OptionChip>
            );
          })}
        </div>
      );
    }

    if (field.type === "sizeRows") {
      const rows = field.rows ?? [];
      const sizes = asSizes(raw);
      const single = rows.length === 1;
      return (
        <div className="space-y-2">
          {rows.map((rowLabel, index) => {
            const size = sizes[index] ?? { width: "", height: "" };
            const update = (patch: Partial<PrintSpecSize>) => {
              const next = rows.map((_, rowIndex) => ({
                width: sizes[rowIndex]?.width ?? "",
                height: sizes[rowIndex]?.height ?? "",
              }));
              next[index] = { ...next[index], ...patch };
              setValue(field.id, next);
            };
            return (
              <div key={rowLabel} className="flex items-center gap-2">
                {single ? null : <span className="w-20 shrink-0 text-xs text-muted-foreground">{rowLabel}</span>}
                <Input
                  value={size.width}
                  disabled={disabled}
                  inputMode="numeric"
                  placeholder="Ш"
                  className="w-16"
                  onChange={(event) => update({ width: sanitizeNumeric(event.target.value) })}
                />
                <span className="text-sm text-muted-foreground">×</span>
                <Input
                  value={size.height}
                  disabled={disabled}
                  inputMode="numeric"
                  placeholder="В"
                  className="w-16"
                  onChange={(event) => update({ height: sanitizeNumeric(event.target.value) })}
                />
                {field.unit ? <span className="text-sm text-muted-foreground">{field.unit}</span> : null}
              </div>
            );
          })}
        </div>
      );
    }

    if (field.type === "number") {
      return (
        <div className="flex items-center gap-2">
          <Input
            value={asString(raw)}
            disabled={disabled}
            inputMode="numeric"
            onChange={(event) => setValue(field.id, sanitizeNumeric(event.target.value))}
          />
          {field.unit ? <span className="text-sm text-muted-foreground">{field.unit}</span> : null}
        </div>
      );
    }

    if (field.type === "text") {
      return (
        <Input
          value={asString(raw)}
          disabled={disabled}
          onChange={(event) => setValue(field.id, event.target.value)}
        />
      );
    }

    const value = asString(raw);
    return (
      <>
        <div role="group" aria-label={field.label} className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((option) => (
            <OptionChip
              key={option.value}
              active={value === option.value}
              disabled={disabled}
              // Повторний клік по вибраному знімає вибір: порожнє поле — робочий стан.
              onClick={() => setValue(field.id, value === option.value ? "" : option.value)}
            >
              {option.label}
            </OptionChip>
          ))}
          {field.allowCustom ? (
            <OptionChip
              dashed
              active={value === CUSTOM_OPTION_VALUE}
              disabled={disabled}
              onClick={() => setValue(field.id, value === CUSTOM_OPTION_VALUE ? "" : CUSTOM_OPTION_VALUE)}
            >
              Інше…
            </OptionChip>
          ) : null}
        </div>
        {field.allowCustom && value === CUSTOM_OPTION_VALUE ? (
          <Input
            value={asString(values[customValueKey(field.id)] ?? null)}
            disabled={disabled}
            placeholder="Вкажіть своє"
            className="mt-2"
            onChange={(event) => setValue(customValueKey(field.id), event.target.value)}
          />
        ) : null}
      </>
    );
  };

  /*
    Умовне поле вкладається під батьківське з лінією ліворуч — якщо батько
    стоїть у тому ж розділі. Інакше (батько в іншому розділі) воно лишається
    звичайним рядком: вкладати нема під що.
  */
  const renderTree = (fields: PrintSpecField[], parentId: string | null): React.ReactNode =>
    fields
      .filter((field) =>
        parentId === null
          ? !field.showIf || !fields.some((entry) => entry.id === field.showIf?.field)
          : field.showIf?.field === parentId
      )
      .map((field) => {
        const children = fields.some((entry) => entry.showIf?.field === field.id)
          ? renderTree(fields, field.id)
          : null;
        return (
          <div key={field.id} className="min-w-0">
            <FieldShell label={field.label} hint={field.hint}>
              {renderControl(field)}
            </FieldShell>
            {children ? (
              <div className="ml-0.5 mt-3 space-y-3 border-l-2 border-border/60 pl-3">{children}</div>
            ) : null}
          </div>
        );
      });

  const columns = getPrintSpecColumns(preset, values);
  const entries = formatPrintSpecEntries(preset, values);

  const renderLane = (column: PrintSpecColumnInfo) => {
    const ids = new Set(column.sections.flatMap((section) => section.fields.map((field) => field.id)));
    const summary = entries
      .filter((entry) => ids.has(entry.id))
      .map((entry) => entry.value)
      .join(" · ");
    return (
      <section
        key={column.title}
        aria-label={column.title}
        className="min-w-0 space-y-4 rounded-xl border border-border/50 bg-background p-4"
      >
        <div className="space-y-1.5 border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{column.title}</h3>
            <span className="text-xs font-medium tabular-nums text-foreground">
              {column.filled}/{column.total}
            </span>
          </div>
          {summary ? <div className="line-clamp-2 text-xs leading-[18px] text-muted-foreground">{summary}</div> : null}
        </div>
        {column.sections.map((section) => (
          <div key={section.title} className="space-y-3">
            {/* Підзаголовок — лише коли розділ не збігається зі стовпчиком: інакше це дубль заголовка. */}
            {section.title !== column.title ? (
              <div className="text-2xs font-semibold uppercase tracking-caps text-muted-foreground">
                {section.title}
              </div>
            ) : null}
            {renderTree(section.fields, null)}
          </div>
        ))}
      </section>
    );
  };

  return (
    <div className="@container">
      <div className={cn("grid items-start gap-3.5", LANE_GRID[Math.min(columns.length, 3)])}>
        {columns.map(renderLane)}
      </div>
    </div>
  );
}
