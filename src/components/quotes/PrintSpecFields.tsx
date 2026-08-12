import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CUSTOM_OPTION_VALUE,
  customValueKey,
  isPrintSpecFieldVisible,
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
 */

/**
 * Копія `ChipPicker` із `PrintPackageConfigurator.tsx`, свідомо не витягнута в
 * спільний файл: нові види мусять виглядати так само, як чотири наявні, а
 * правити файл на 1508 рядків заради переносу презентаційного компонента прямо
 * перед деплоєм — ризик без користі для того, хто чекає форму. Переїде туди,
 * коли старі пресети підуть на цей же механізм.
 */
const ChipPicker: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  disabled?: boolean;
}> = ({ value, onChange, options, placeholder, disabled }) => {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex h-9 w-full items-center rounded-full border px-3.5 text-sm transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:opacity-60",
            selected
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border/40 bg-background/55 text-muted-foreground hover:border-border/50 hover:bg-background/70"
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate text-left font-medium", !selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-2">
        <div className="space-y-1">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <Button
                key={option.value}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 w-full justify-between text-sm",
                  active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {active ? <Check className="h-4 w-4" /> : null}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const FieldShell: React.FC<{ label: string; hint?: string; children: React.ReactNode; wide?: boolean }> = ({
  label,
  hint,
  children,
  wide,
}) => (
  <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
    <div className="text-xs font-medium uppercase tracking-caps text-muted-foreground">{label}</div>
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

export function PrintSpecFields({ preset, values, onChange, disabled }: PrintSpecFieldsProps) {
  const setValue = React.useCallback(
    (fieldId: string, value: PrintSpecValue) => {
      onChange({ ...values, [fieldId]: value });
    },
    [onChange, values]
  );

  const renderField = (field: PrintSpecField) => {
    const raw = values[field.id] ?? null;

    if (field.type === "multi") {
      const selected = asList(raw);
      return (
        <FieldShell key={field.id} label={field.label} hint={field.hint}>
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {(field.options ?? []).map((option) => {
              const checked = selected.includes(option.value);
              return (
                <label key={option.value} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(next) => {
                      const list = next === true
                        ? [...selected, option.value]
                        : selected.filter((entry) => entry !== option.value);
                      // Порядок опцій, а не порядок кліків: інакше «лак + ламінація»
                      // і «ламінація + лак» читались би як різні специфікації.
                      const ordered = (field.options ?? [])
                        .map((entry) => entry.value)
                        .filter((entry) => list.includes(entry));
                      setValue(field.id, ordered);
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </FieldShell>
      );
    }

    if (field.type === "sizeRows") {
      const rows = field.rows ?? [];
      const sizes = asSizes(raw);
      const single = rows.length === 1;
      return (
        <FieldShell key={field.id} label={field.label} hint={field.hint} wide={!single}>
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
                  {single ? null : (
                    <span className="w-24 shrink-0 text-sm text-muted-foreground">{rowLabel}</span>
                  )}
                  <Input
                    value={size.width}
                    disabled={disabled}
                    inputMode="numeric"
                    placeholder="Ш"
                    className="h-9 w-20 bg-background/60"
                    onChange={(event) => update({ width: sanitizeNumeric(event.target.value) })}
                  />
                  <span className="text-sm text-muted-foreground">×</span>
                  <Input
                    value={size.height}
                    disabled={disabled}
                    inputMode="numeric"
                    placeholder="В"
                    className="h-9 w-20 bg-background/60"
                    onChange={(event) => update({ height: sanitizeNumeric(event.target.value) })}
                  />
                  {field.unit ? <span className="text-sm text-muted-foreground">{field.unit}</span> : null}
                </div>
              );
            })}
          </div>
        </FieldShell>
      );
    }

    if (field.type === "number") {
      return (
        <FieldShell key={field.id} label={field.label} hint={field.hint}>
          <div className="flex items-center gap-2">
            <Input
              value={asString(raw)}
              disabled={disabled}
              inputMode="numeric"
              className="h-9 bg-background/60"
              onChange={(event) => setValue(field.id, sanitizeNumeric(event.target.value))}
            />
            {field.unit ? <span className="text-sm text-muted-foreground">{field.unit}</span> : null}
          </div>
        </FieldShell>
      );
    }

    if (field.type === "text") {
      return (
        <FieldShell key={field.id} label={field.label} hint={field.hint}>
          <Input
            value={asString(raw)}
            disabled={disabled}
            className="h-9 bg-background/60"
            onChange={(event) => setValue(field.id, event.target.value)}
          />
        </FieldShell>
      );
    }

    const value = asString(raw);
    const options = [
      ...(field.options ?? []),
      ...(field.allowCustom ? [{ value: CUSTOM_OPTION_VALUE, label: "Інше" }] : []),
    ];
    return (
      <FieldShell key={field.id} label={field.label} hint={field.hint}>
        <ChipPicker
          value={value}
          onChange={(next) => setValue(field.id, next)}
          options={options}
          placeholder="Не вибрано"
          disabled={disabled}
        />
        {field.allowCustom && value === CUSTOM_OPTION_VALUE ? (
          <Input
            value={asString(values[customValueKey(field.id)] ?? null)}
            disabled={disabled}
            placeholder="Вкажіть своє"
            className="mt-2 h-9 bg-background/60"
            onChange={(event) => setValue(customValueKey(field.id), event.target.value)}
          />
        ) : null}
      </FieldShell>
    );
  };

  return (
    <div className="space-y-5">
      {preset.sections.map((section) => {
        const sectionFields = preset.fields.filter(
          (field) => field.section === section && isPrintSpecFieldVisible(field, values)
        );
        if (sectionFields.length === 0) return null;
        return (
          <div key={section} className="space-y-4 border-t border-border/40 pt-5 first:border-t-0 first:pt-0">
            <div className="text-sm font-semibold text-foreground">{section}</div>
            <div className="grid gap-4 sm:grid-cols-2">{sectionFields.map(renderField)}</div>
          </div>
        );
      })}
    </div>
  );
}
