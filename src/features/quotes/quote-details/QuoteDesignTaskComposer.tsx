import * as React from "react";
import { Loader2, Package, Paperclip, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { DictationButton, DictationCapsule, isDictationActive } from "@/components/ui/dictation-capsule";
import { Label } from "@/components/ui/label";
import { useDictation } from "@/lib/useDictation";
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
  imageUrl: string | null;
  hasTask: boolean;
};

/** Нанесення позиції, вже перекладене на людські назви сторінкою. */
export type DesignComposerImprint = {
  method: string;
  place: string;
  size: string | null;
};

export function QuoteDesignTaskComposer({
  items,
  selectedItemId,
  onSelectItem,
  brief,
  onBriefChange,
  briefPlaceholder,
  imprint,
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
  /** Нанесення обраної позиції: тип і місце ставлять при створенні прорахунку. */
  imprint: DesignComposerImprint[];
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
  const [dragOver, setDragOver] = React.useState(false);
  const busy = Boolean(saving || uploading);
  const briefRef = React.useRef<HTMLTextAreaElement | null>(null);

  /*
    ТЗ МОЖНА НАДИКТУВАТИ. Менеджер переказує побажання замовника з розмови, і
    набирати це двома пальцями довше, ніж сказати. Той самий гачок і та сама
    капсула, що в обговоренні справи, — окремого рішення тут не вигадуємо.
  */
  const dictation = useDictation({
    context: "comment",
    onResult: (text) => {
      const clean = text.trim();
      if (!clean) return;
      onBriefChange(brief ? `${brief.trimEnd()} ${clean}` : clean);
      requestAnimationFrame(() => briefRef.current?.focus());
    },
  });

  return (
    <section className="space-y-4 rounded-2xl border border-border/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">Нова дизайн-задача</h3>
        <p className="text-xs text-muted-foreground">Оберіть товар, напишіть ТЗ і прикріпіть файли замовника.</p>
      </div>

      {/*
        ТОВАР — ПЕРШИЙ КРОК, і вибирається він тим самим селектом, що й раніше
        в діалозі: перевинаходити для цього власні чипи не було потреби.
        Задача заводиться НА ПОЗИЦІЮ: від неї беруться нанесення, тираж і фото.
      */}
      <div className="space-y-2">
        <Label>Товар</Label>
        {/*
          Пігулки — ТІ САМІ, що в смузі дизайн-задач нижче: фото, назва, мітка.
          Це вже звичний спосіб перемикати товар у цій вкладці, тож вибирати
          товар для НОВОЇ задачі логічно так само. Селект тут показував лише
          назву, і фото товару, за яким людина його впізнає, зникало.
        */}
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Товар для дизайн-задачі">
          {items.map((item) => {
            const on = item.id === selectedItemId;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled || busy}
                title={item.title}
                onClick={() => onSelectItem(item.id)}
                className={cn(
                  "inline-flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                  "disabled:pointer-events-none disabled:opacity-50",
                  on ? "border-foreground/70 bg-background" : "border-border/60 bg-background hover:bg-muted/40"
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/30">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Package className="h-3.5 w-3.5 text-muted-foreground/60" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[168px] truncate text-xs font-semibold text-foreground">
                    {item.title || "Позиція"}
                  </span>
                  {item.hasTask ? (
                    <span className="block text-3xs text-muted-foreground">задача вже є</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        {/*
          НАНЕСЕННЯ ПОКАЗУЄМО, АЛЕ НЕ РЕДАГУЄМО. Тип і місце ставлять при
          створенні прорахунку, а розмір дизайнер бере з ТЗ. Тут це довідка:
          видно, з чим людина заводить задачу, і не треба відкривати «Товари».
        */}
        {imprint.length > 0 ? (
          <ul className="space-y-1 pt-0.5">
            {imprint.map((line, index) => (
              <li key={`${line.method}-${index}`} className="flex flex-wrap items-center gap-x-2 text-2xs">
                <span className="font-medium text-foreground">{line.method}</span>
                <span className="text-muted-foreground">{line.place}</span>
                {line.size ? <span className="text-muted-foreground">{line.size}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-2xs text-muted-foreground">
            У цій позиції нанесення не вказано — його ставлять у товарі, при створенні прорахунку.
          </p>
        )}
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

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>ТЗ для дизайнера</Label>
          {isDictationActive(dictation) ? null : <DictationButton dictation={dictation} />}
        </div>
        {isDictationActive(dictation) ? (
          <DictationCapsule dictation={dictation} />
        ) : (
          <AutoTextarea
            ref={briefRef}
            value={brief}
            disabled={disabled || busy}
            minRows={3}
            maxRows={10}
            aria-label="ТЗ для дизайнера"
            placeholder={briefPlaceholder || "Що саме малюємо: ідея, побажання замовника, обовʼязкові елементи."}
            onChange={(event) => onBriefChange(event.target.value)}
          />
        )}
        {briefPlaceholder ? (
          <p className="text-2xs text-muted-foreground">
            Порожнє поле означає, що в задачу поїде ТЗ із прорахунку.
          </p>
        ) : null}
      </div>

      {/*
        ФАЙЛИ — ПЕРЕТЯГУВАННЯМ І КЛІКОМ, тією самою зоною, що в конструкторі
        наборів: пунктирна рамка, підсвітка під час перетягування, прозорий
        <input> поверх усієї площі. Своя кнопка «Додати файли» тут була
        зайвою — у застосунку вже є звичний спосіб.
      */}
      <div className="space-y-2">
        <Label>Файли замовника для цього товару</Label>
        <div
          className={cn(
            "relative flex min-h-[92px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors",
            dragOver ? "border-primary/70 bg-primary/10" : "border-border/50 hover:border-border/80",
            (disabled || busy || !selectedItemId) && "pointer-events-none opacity-50"
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            onAddFiles(event.dataTransfer.files);
          }}
        >
          <input
            type="file"
            multiple
            aria-label="Додати файли замовника"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={(event) => {
              const list = event.target.files;
              event.target.value = "";
              onAddFiles(list);
            }}
          />
          <div className="flex flex-col items-center gap-1.5">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Upload className={cn("h-4 w-4", dragOver ? "text-primary" : "text-muted-foreground")} />
            )}
            <div className={cn("text-sm", dragOver ? "font-medium text-primary" : "text-foreground")}>
              {dragOver ? "Відпустіть файли тут" : "Перетягніть або клікніть для вибору"}
            </div>
            <div className="text-xs text-muted-foreground">Побачить дизайнер саме в цій задачі.</div>
          </div>
        </div>

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
