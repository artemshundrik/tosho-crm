import * as React from "react";
import { AlertTriangle, Check, Info, Minus, Plus } from "@/components/icons/appIcons";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { HoverTip } from "@/components/ui/hover-tip";
import { pluralUk } from "@/lib/lastSeen";
import {
  CUSTOM_OPTION_VALUE,
  confirmPrintSpecDefault,
  customValueKey,
  diffPrintSpec,
  editPrintSpecDraft,
  getPrintSpecColumnMissing,
  getPrintSpecColumns,
  getPrintSpecWarnings,
  isPrintSpecOptionDisabled,
  listPrintSpecOptions,
  printSpecParentFieldId,
  type PrintSpecDraftMeta,
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
  /** Це був вибір у версії, яку рахували: пунктир тону warning і дрібне «було». */
  was?: boolean;
  /** Варіант неможливий за поточних значень: сірий, не натискається, причина — на наведенні. */
  locked?: string;
  children: React.ReactNode;
}> = ({ active, onClick, disabled, dashed, was, locked, children }) => {
  // Уже вибраний неможливий варіант лишається натискним: його можна зняти.
  const inert = Boolean(locked) && !active;
  const chip = (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled || inert}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2.5 text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        "disabled:cursor-not-allowed disabled:opacity-60",
        inert && "border-border/40 bg-muted/50 text-muted-foreground/60 disabled:opacity-100",
        active
          ? "border-foreground bg-foreground font-semibold text-background"
          : inert
            ? "font-medium"
            : was
              ? "border-dashed border-warning-soft-border bg-background font-medium text-warning-foreground hover:bg-warning-soft"
              : cn(
                  "bg-background font-medium hover:bg-muted",
                  dashed ? "border-dashed border-border text-muted-foreground" : "border-border/70 text-foreground/80"
                )
      )}
    >
      {children}
      {was && !active ? <span className="text-2xs font-semibold uppercase">було</span> : null}
    </button>
  );
  // Вимкнена кнопка подій наведення не віддає — підказка вішається на обгортку.
  return locked ? <HoverTip label={locked}>{chip}</HoverTip> : chip;
};

/** Значок «і» з підказкою: наведення, фокус із клавіатури й дотик відкривають текст. */
export const InfoHint: React.FC<{ label: string; text: string; className?: string }> = ({ label, text, className }) => (
  <HoverTip asChild label={text}>
    <button
      type="button"
      aria-label={`Підказка: ${label}`}
      className={cn(
        "inline-grid h-4 w-4 shrink-0 place-items-center self-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        className
      )}
    >
      <Info className="h-3.5 w-3.5" />
    </button>
  </HoverTip>
);

const FieldShell: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
  /** Поле змінене відносно версії, яку рахували: «було» і кнопка повернення. */
  change?: { was: string; onRevert: () => void };
  /** Значення поставлене за замовчуванням і ще не підтверджене: приглушена позначка, клік підтверджує. */
  onConfirmDefault?: () => void;
  /** Поле з `preset.summary`: від нього залежить ціна. */
  forPrice?: boolean;
  /** Попередження кратності й пояснення зняття неможливого вибору — під полем. */
  notes?: { text: string; tone: "warning" | "muted" }[];
}> = ({ label, hint, children, change, onConfirmDefault, forPrice, notes }) => (
  <div className={cn("min-w-0 space-y-1.5", change && "-mx-2 rounded-lg bg-warning-soft/50 px-2 py-1.5")}>
    <div className="flex items-baseline gap-2 text-xs font-medium leading-4 text-muted-foreground">
      <span>{label}</span>
      {forPrice ? <span className="text-2xs font-normal text-muted-foreground/70">для ціни</span> : null}
      {hint ? <InfoHint label={label} text={hint} /> : null}
      {onConfirmDefault ? (
        <button
          type="button"
          title="Підтвердити значення"
          onClick={onConfirmDefault}
          className="text-2xs font-normal text-muted-foreground/70 underline-offset-2 hover:text-foreground hover:underline"
        >
          за замовчуванням
        </button>
      ) : null}
      {change ? (
        <>
          <span className="min-w-0 truncate font-normal text-warning-foreground">було: {change.was || "—"}</span>
          <button
            type="button"
            onClick={change.onRevert}
            className="ml-auto shrink-0 font-semibold text-warning-foreground underline-offset-2 hover:underline"
          >
            повернути
          </button>
        </>
      ) : null}
    </div>
    {children}
    {notes?.map((note) => (
      <div
        key={note.text}
        role={note.tone === "warning" ? "status" : undefined}
        className={cn(
          "flex items-start gap-1 text-xs leading-4",
          note.tone === "warning" ? "text-warning-foreground" : "text-muted-foreground"
        )}
      >
        {note.tone === "warning" ? <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> : null}
        {note.text}
      </div>
    ))}
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
  /** Версія, яку рахували: змінене відносно неї підсвічується з «повернути». */
  baseline?: PrintSpecValues | null;
  /** Поля, у яких на початку стоїть значення за замовчуванням, ще не підтверджене людиною. */
  initialAuto?: string[];
  /** Поля, до яких значення за замовчуванням уже не торкаються (після відновлення чернетки чи «як минулого разу»). */
  initialTouched?: string[];
  /** Які поля зараз тримають значення за замовчуванням: це не «зміна після ціни». */
  onAutoChange?: (auto: string[]) => void;
  /** «Лише незаповнені»: знімок полів, заповнених на момент увімкнення, — їх не показуємо. */
  hiddenIds?: ReadonlySet<string> | null;
  ref?: React.Ref<PrintSpecFieldsHandle>;
};

/** Що панель може попросити в форми: прокрутити до поля й сфокусувати його. */
export type PrintSpecFieldsHandle = { focusField: (fieldId: string) => void };

/** Скільки стовпчиків у ряд: клас мусить бути літералом, Tailwind не читає число з пропса. */
const LANE_GRID: Record<number, string> = {
  1: "",
  2: "@xl:h-full @xl:grid-cols-2 @xl:grid-rows-[minmax(0,1fr)]",
  3: "@xl:grid-cols-2 @4xl:h-full @4xl:grid-cols-3 @4xl:grid-rows-[minmax(0,1fr)]",
};

/** Стовпчик гортається сам лише тоді, коли всі стоять в один ряд; інакше гортається тіло вікна. */
const LANE_SCROLL: Record<number, string> = {
  1: "",
  2: "@xl:min-h-0 @xl:overflow-y-auto @xl:overscroll-contain",
  3: "@4xl:min-h-0 @4xl:overflow-y-auto @4xl:overscroll-contain",
};

/** Скільки чипів «не заповнено» у шапці стовпчика, решта — «ще N»: шапка липка й не має їсти пів екрана. */
const MISSING_CHIPS = 4;

/** Нижче цієї ширини форми (~@xl) стовпчики не стають у ряд. */
const NARROW_WIDTH = 576;

const MissingChip: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex h-5 items-center rounded-md border border-border/70 bg-background px-1.5 text-2xs font-medium text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
  >
    {label}
  </button>
);

export function PrintSpecFields({
  preset,
  values,
  onChange,
  disabled,
  baseline,
  initialAuto,
  initialTouched,
  onAutoChange,
  hiddenIds,
  ref,
}: PrintSpecFieldsProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  /** Ширина форми: коли стовпчики не вміщаються в ряд, лишається один за раз із перемикачем частин. */
  const [width, setWidth] = React.useState<number | null>(null);
  const [activeLane, setActiveLane] = React.useState<string | null>(null);
  React.useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const columns = getPrintSpecColumns(preset, values);
  const narrow = columns.length > 1 && width !== null && width > 0 && width < NARROW_WIDTH;
  const shownLane = columns.find((column) => column.title === activeLane) ?? columns[0];

  const focusField = (fieldId: string) => {
    const reveal = () => {
      const target = rootRef.current?.querySelector<HTMLElement>(`[data-print-field="${fieldId}"]`);
      if (!target) return;
      target.scrollIntoView?.({ block: "center", behavior: "smooth" });
      target
        .querySelector<HTMLElement>("input:not([disabled]), button[aria-pressed]:not([disabled])")
        ?.focus({ preventScroll: true });
    };
    const owner = columns.find((column) =>
      column.sections.some((section) => section.fields.some((field) => field.id === fieldId))
    );
    if (narrow && owner && owner.title !== shownLane?.title) {
      setActiveLane(owner.title);
      requestAnimationFrame(reveal);
    } else reveal();
  };
  React.useImperativeHandle(ref, () => ({ focusField }));

  const [meta, setMeta] = React.useState<PrintSpecDraftMeta>({ auto: initialAuto ?? [], touched: initialTouched ?? [] });
  /** Пояснення, чому вибір знято: тримається біля поля, доки людина його знову не чіпає. */
  const [dropNotes, setDropNotes] = React.useState<Record<string, string>>({});

  /*
    Кожна зміна йде через звірку в одному записі: вибрали картон — щільність 120 г,
    якої в картону не буває, зникає тут же, а не наступним рендером; вибрали
    поролон — резинка «Вертикальна» знімається з поясненням; порожнім полям
    підставляються значення за замовчуванням.
  */
  const commit = React.useCallback(
    (patch: PrintSpecValues) => {
      const settled = editPrintSpecDraft(preset, values, meta, patch);
      const touchedIds = Object.keys(patch).map((key) => key.replace(/__custom$/, ""));
      setMeta(settled.meta);
      setDropNotes((prev) => {
        const next = { ...prev };
        for (const id of touchedIds) delete next[id];
        for (const drop of settled.dropped) next[drop.fieldId] = `«${drop.label}» знято: ${drop.reason}`;
        return next;
      });
      onChange(settled.values);
      onAutoChange?.(settled.meta.auto);
    },
    [preset, values, meta, onChange, onAutoChange]
  );
  const setValue = React.useCallback(
    (fieldId: string, value: PrintSpecValue) => commit({ [fieldId]: value }),
    [commit]
  );
  const confirmDefault = (fieldId: string) => {
    const next = confirmPrintSpecDefault(meta, fieldId);
    setMeta(next);
    onAutoChange?.(next.auto);
  };

  // Значення за замовчуванням — не правка після ціни, поки людина його не підтвердила.
  const changes = React.useMemo(
    () => (baseline ? diffPrintSpec(preset, baseline, values).filter((change) => !meta.auto.includes(change.fieldId)) : []),
    [preset, baseline, values, meta.auto]
  );
  const warningsById = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const hit of getPrintSpecWarnings(preset, values)) map.set(hit.fieldId, [...(map.get(hit.fieldId) ?? []), hit.message]);
    return map;
  }, [preset, values]);
  const changeById = React.useMemo(() => new Map(changes.map((change) => [change.fieldId, change])), [changes]);

  const revert = (field: PrintSpecField) => {
    if (!baseline) return;
    const patch: PrintSpecValues = { [field.id]: baseline[field.id] ?? null };
    if (field.allowCustom) patch[customValueKey(field.id)] = baseline[customValueKey(field.id)] ?? "";
    commit(patch);
  };

  const renderControl = (field: PrintSpecField) => {
    const raw = values[field.id] ?? null;
    const was = changeById.has(field.id) ? baseline?.[field.id] : undefined;

    if (field.type === "multi") {
      const selected = asList(raw);
      return (
        <div role="group" aria-label={field.label} className="flex flex-wrap gap-1.5">
          {listPrintSpecOptions(field, values).map((option) => {
            const checked = selected.includes(option.value);
            return (
              <OptionChip
                key={option.value}
                active={checked}
                was={Array.isArray(was) && (was as unknown[]).includes(option.value)}
                locked={isPrintSpecOptionDisabled(option, values) ? (option.reason ?? "Недоступно") : undefined}
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
      const blank: PrintSpecSize = field.withDepth ? { width: "", height: "", depth: "" } : { width: "", height: "" };
      return (
        <div className="space-y-2">
          {rows.map((rowLabel, index) => {
            const size = sizes[index] ?? blank;
            const update = (patch: Partial<PrintSpecSize>) => {
              const next = rows.map((_, rowIndex) => ({ ...blank, ...sizes[rowIndex] }));
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
                {field.withDepth ? (
                  <>
                    <span className="text-sm text-muted-foreground">×</span>
                    <Input
                      value={size.depth ?? ""}
                      disabled={disabled}
                      inputMode="numeric"
                      placeholder="Г"
                      className="w-16"
                      onChange={(event) => update({ depth: sanitizeNumeric(event.target.value) })}
                    />
                  </>
                ) : null}
                {field.unit ? <span className="text-sm text-muted-foreground">{field.unit}</span> : null}
              </div>
            );
          })}
        </div>
      );
    }

    if (field.type === "number") {
      const current = asString(raw);
      const step = field.step;
      const bump = (direction: 1 | -1) => {
        if (!step) return;
        const base = current === "" ? 0 : Number(current);
        setValue(field.id, String(Math.max(0, base + direction * step)));
      };
      const stepButton = "grid h-(--control-h) w-7 shrink-0 place-items-center rounded-md border border-border/70 bg-background text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:cursor-not-allowed disabled:opacity-50";
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-1.5">
            {step ? (
              <button
                type="button"
                aria-label={`${field.label}: менше на ${step}`}
                disabled={disabled || current === "" || Number(current) === 0}
                onClick={() => bump(-1)}
                className={stepButton}
              >
                <Minus className="h-3 w-3" />
              </button>
            ) : null}
            <Input
              value={current}
              disabled={disabled}
              inputMode="numeric"
              aria-label={field.label}
              className="w-16 px-2 text-center tabular-nums"
              onChange={(event) => setValue(field.id, sanitizeNumeric(event.target.value))}
            />
            {step ? (
              <button
                type="button"
                aria-label={`${field.label}: більше на ${step}`}
                disabled={disabled}
                onClick={() => bump(1)}
                className={stepButton}
              >
                <Plus className="h-3 w-3" />
              </button>
            ) : null}
            {field.unit ? <span className="text-sm text-muted-foreground">{field.unit}</span> : null}
          </div>
          {field.presets?.length ? (
            <div role="group" aria-label={`${field.label}: швидкі значення`} className="flex flex-wrap gap-1.5">
              {field.presets.map((preset) => (
                <OptionChip
                  key={preset}
                  active={current === preset}
                  disabled={disabled}
                  onClick={() => setValue(field.id, current === preset ? "" : preset)}
                >
                  {preset}
                </OptionChip>
              ))}
            </div>
          ) : null}
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
          {listPrintSpecOptions(field, values).map((option) => (
            <OptionChip
              key={option.value}
              active={value === option.value}
              was={was === option.value}
              locked={isPrintSpecOptionDisabled(option, values) ? (option.reason ?? "Недоступно") : undefined}
              disabled={disabled}
              // Повторний клік по вибраному знімає вибір: порожнє поле — робочий стан.
              // Виняток — значення за замовчуванням: перший клік його підтверджує.
              onClick={() =>
                meta.auto.includes(field.id) && value === option.value
                  ? confirmDefault(field.id)
                  : setValue(field.id, value === option.value ? "" : option.value)
              }
            >
              {option.label}
            </OptionChip>
          ))}
          {field.allowCustom ? (
            <OptionChip
              dashed
              active={value === CUSTOM_OPTION_VALUE}
              was={was === CUSTOM_OPTION_VALUE}
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
      .filter((field) => {
        const parent = printSpecParentFieldId(field);
        return parentId === null ? !parent || !fields.some((entry) => entry.id === parent) : parent === parentId;
      })
      .map((field) => {
        const children = fields.some((entry) => printSpecParentFieldId(entry) === field.id)
          ? renderTree(fields, field.id)
          : null;
        return (
          <div key={field.id} data-print-field={field.id} className="min-w-0 scroll-mt-28">
            <FieldShell
              label={field.label}
              hint={field.hint}
              forPrice={preset.summary?.includes(field.id)}
              change={
                changeById.has(field.id)
                  ? { was: changeById.get(field.id)?.from ?? "", onRevert: () => revert(field) }
                  : undefined
              }
              onConfirmDefault={meta.auto.includes(field.id) ? () => confirmDefault(field.id) : undefined}
              notes={[
                ...(warningsById.get(field.id) ?? []).map((text) => ({ text, tone: "warning" as const })),
                ...(dropNotes[field.id] ? [{ text: dropNotes[field.id], tone: "muted" as const }] : []),
              ]}
            >
              {renderControl(field)}
            </FieldShell>
            {children ? (
              <div className="ml-0.5 mt-3 space-y-3 border-l-2 border-border/60 pl-3">{children}</div>
            ) : null}
          </div>
        );
      });

  const laneChangeCount = (column: PrintSpecColumnInfo): number => {
    const sectionTitles = new Set(column.sections.map((section) => section.title));
    return changes.filter((change) => sectionTitles.has(change.section)).length;
  };

  const renderLane = (column: PrintSpecColumnInfo) => {
    const laneChanges = laneChangeCount(column);
    const missing = getPrintSpecColumnMissing(column, values);
    const shownMissing = missing.slice(0, MISSING_CHIPS);
    const restMissing = missing.slice(MISSING_CHIPS);
    const sections = column.sections
      .map((section) => ({ ...section, fields: section.fields.filter((field) => !hiddenIds?.has(field.id)) }))
      .filter((section) => section.fields.length > 0);
    return (
      <section
        key={column.title}
        aria-label={column.title}
        className={cn(
          "min-w-0 rounded-xl border border-border/50 bg-background",
          !narrow && LANE_SCROLL[Math.min(columns.length, 3)]
        )}
      >
        <div className={cn("space-y-1.5 border-b border-border/40 bg-background px-4 pb-3 pt-4", !narrow && "sticky top-0 z-10")}>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{column.title}</h3>
            <span className="text-xs font-medium tabular-nums text-foreground">
              {column.filled}/{column.total}
            </span>
            {laneChanges > 0 ? (
              <span className="ml-auto text-2xs font-semibold text-warning-foreground">
                {pluralUk(laneChanges, "зміна", "зміни", "змін")}
              </span>
            ) : null}
          </div>
          {missing.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span className="mr-0.5">Не заповнено:</span>
              {shownMissing.map((field) => (
                <MissingChip key={field.id} label={field.label} onClick={() => focusField(field.id)} />
              ))}
              {restMissing.length > 0 ? (
                <MissingChip label={`ще ${restMissing.length}`} onClick={() => focusField(restMissing[0].id)} />
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="h-3 w-3" />
              Усе заповнено
            </div>
          )}
        </div>
        <div className="space-y-4 p-4">
          {sections.length === 0 ? (
            <div className="flex items-center justify-center gap-1.5 py-6 text-sm text-muted-foreground">
              <Check className="h-4 w-4" />
              Усе заповнено
            </div>
          ) : null}
          {sections.map((section) => (
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
        </div>
      </section>
    );
  };

  return (
    <div ref={rootRef} className={cn("@container", !narrow && "h-full")}>
      {narrow && shownLane ? (
        <>
          {/* Липкий перемикач частин: на вузькому екрані стовпчики не вміщаються в ряд, і «одне під одним» — це прокрутка на п'ять екранів. */}
          <div className="sticky top-0 z-20 -mx-1 bg-muted px-1 pb-2">
            <SegmentedGroup role="group" aria-label="Частини виробу" className={cn(SEGMENTED_GROUP_SM, "flex h-auto w-full")}>
              {columns.map((column) => {
                const active = column.title === shownLane.title;
                return (
                  <button
                    key={column.title}
                    type="button"
                    aria-pressed={active}
                    data-state={active ? "active" : "inactive"}
                    onClick={() => setActiveLane(column.title)}
                    className={cn(SEGMENTED_TRIGGER_SM, "min-w-0 flex-1 flex-col gap-0 py-1")}
                  >
                    <span className="flex max-w-full items-center gap-1">
                      <span className="truncate">{column.title}</span>
                      {laneChangeCount(column) > 0 ? (
                        <span aria-label="Є зміни після ціни" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning-solid" />
                      ) : null}
                    </span>
                    <span className="text-2xs font-normal tabular-nums text-muted-foreground">
                      {column.filled}/{column.total}
                    </span>
                  </button>
                );
              })}
            </SegmentedGroup>
          </div>
          {renderLane(shownLane)}
        </>
      ) : (
        <div className={cn("grid gap-3.5", LANE_GRID[Math.min(columns.length, 3)])}>{columns.map(renderLane)}</div>
      )}
    </div>
  );
}
