import * as React from "react";
import { Check, Loader2, Package, Paperclip, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { DESIGN_TASK_TYPE_ICONS, DESIGN_TASK_TYPE_OPTIONS, type DesignTaskType } from "@/lib/designTaskType";
import { cn } from "@/lib/utils";

import type { QuoteAttachment } from "./queries";

/**
 * Створення дизайн-задачі просто на вкладці «Дизайн» (REQ-246).
 *
 * ЩО БУЛО НЕ ТАК. Задача заводилась із меню «⋮» у шапці картки — тобто там,
 * куди не дивляться, — і питала рівно дві речі: тип задачі й виконавця. ТЗ
 * підставлялось мовчки з прорахунку, а прикріпити файл саме до цієї задачі
 * було нікуди: вкладення належали прорахунку цілком, тож дві задачі одного
 * прорахунку бачили один спільний список.
 *
 * ЯК ТЕПЕР. Порядок такий, як його описав Артем: угорі вибір товару, під ним
 * ТЗ і файли САМЕ ДЛЯ ЦЬОГО товару, і кнопка «Створити дизайн-задачу». Товар,
 * у якого задача вже є, лишається в списку позначеним — щоб було видно, що
 * зроблено, і щоб можна було завести другу задачу на той самий товар
 * (візуалізація й макет — це різні задачі).
 *
 * ФАЙЛИ КРІПЛЯТЬСЯ ДО ПОЗИЦІЇ, А НЕ ДО ЗАДАЧІ, і це навмисно: задача — рядок
 * журналу активності, зовнішнього ключа на неї не побудувати, а позиція живе
 * й до створення задачі, і після її закриття.
 */

export type DesignComposerItem = {
  id: string;
  title: string;
  methodsCount: number;
  hasTask: boolean;
};

export function QuoteDesignTaskComposer({
  items,
  selectedItemId,
  onSelectItem,
  brief,
  onBriefChange,
  briefPlaceholder,
  files,
  uploading,
  onAddFiles,
  onRemoveFile,
  taskType,
  onTaskTypeChange,
  saving,
  error,
  disabled,
  onCreate,
}: {
  items: DesignComposerItem[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
  brief: string;
  onBriefChange: (value: string) => void;
  /** Текст ТЗ, який успадкується з прорахунку, якщо своє не написали. */
  briefPlaceholder?: string;
  files: QuoteAttachment[];
  uploading?: boolean;
  onAddFiles: (files: FileList | null) => void;
  onRemoveFile?: (file: QuoteAttachment) => void;
  taskType: DesignTaskType | null;
  onTaskTypeChange: (value: DesignTaskType) => void;
  saving?: boolean;
  error?: string | null;
  disabled?: boolean;
  onCreate: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const selected = items.find((item) => item.id === selectedItemId) ?? null;
  const busy = Boolean(saving || uploading);

  return (
    <section className="space-y-4 rounded-2xl border border-border/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">Нова дизайн-задача</h3>
        <p className="text-xs text-muted-foreground">Оберіть товар, напишіть ТЗ і прикріпіть файли замовника.</p>
      </div>

      {/*
        ТОВАР — ПЕРШИЙ КРОК. Задача заводиться НА ПОЗИЦІЮ: від неї беруться
        нанесення, тираж і фото, і саме її бачить дизайнер. Тому вибір стоїть
        угорі, а не ховається в діалозі.
      */}
      <div className="space-y-1.5">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Товар</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Товар для дизайн-задачі">
          {items.map((item) => {
            const active = item.id === selectedItemId;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled || busy}
                onClick={() => onSelectItem(item.id)}
                className={cn(
                  "inline-flex max-w-[22rem] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                  "transition-[background-color,border-color,color] duration-base ease-out motion-reduce:transition-none",
                  "disabled:pointer-events-none disabled:opacity-50",
                  active
                    ? "border-foreground/35 bg-muted text-foreground"
                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                <Package className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{item.title || "Позиція"}</span>
                {/* Позначка «задача вже є» — не заборона, а факт: другу задачу
                    на той самий товар заводять свідомо (візуал і макет різні). */}
                {item.hasTask ? <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
              </button>
            );
          })}
        </div>
        {selected ? (
          <p className="text-2xs text-muted-foreground">
            {selected.methodsCount > 0
              ? `Нанесення з позиції поїде в задачу: ${selected.methodsCount}`
              : "У цій позиції нанесення не вказано — дизайнер побачить задачу без нього."}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Тип задачі</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Тип дизайн-задачі">
          {DESIGN_TASK_TYPE_OPTIONS.map((option) => {
            const active = taskType === option.value;
            const Icon = DESIGN_TASK_TYPE_ICONS[option.value];
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled || busy}
                onClick={() => onTaskTypeChange(option.value)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                  "transition-[background-color,border-color,color] duration-base ease-out motion-reduce:transition-none",
                  "disabled:pointer-events-none disabled:opacity-50",
                  active
                    ? "border-foreground/35 bg-muted text-foreground"
                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">ТЗ для дизайнера</span>
        <AutoTextarea
          value={brief}
          disabled={disabled || busy}
          minRows={3}
          maxRows={10}
          aria-label="ТЗ для дизайнера"
          placeholder={briefPlaceholder || "Що саме малюємо: ідея, побажання замовника, обовʼязкові елементи."}
          onChange={(event) => onBriefChange(event.target.value)}
        />
        {briefPlaceholder ? (
          <p className="text-2xs text-muted-foreground">
            Порожнє поле означає, що в задачу поїде ТЗ із прорахунку.
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Файли замовника для цього товару
        </span>
        {files.length > 0 ? (
          <ul className="space-y-1">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border/50 px-2.5 py-1.5 text-xs"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-2xs text-muted-foreground">{file.size}</span>
                {onRemoveFile ? (
                  <button
                    type="button"
                    disabled={disabled || busy}
                    aria-label={`Прибрати «${file.name}»`}
                    onClick={() => onRemoveFile(file)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || busy || !selectedItemId}
          className="gap-2"
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Додати файли
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const list = event.target.files;
            event.target.value = "";
            onAddFiles(list);
          }}
        />
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <span className="text-2xs text-muted-foreground">
          {taskType ? "Задача зʼявиться в розділі «Дизайн»." : "Оберіть тип задачі, щоб створити."}
        </span>
        <Button
          type="button"
          size="sm"
          disabled={disabled || busy || !selectedItemId || !taskType}
          className="gap-2"
          onClick={onCreate}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Створити дизайн-задачу
        </Button>
      </div>
    </section>
  );
}
