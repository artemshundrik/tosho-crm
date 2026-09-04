import * as React from "react";
import { Check, Loader2, Paperclip, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { DictationButton, DictationCapsule, isDictationActive } from "@/components/ui/dictation-capsule";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useDictation } from "@/lib/useDictation";
import {
  DEFAULT_DESIGN_TASK_TYPE,
  DESIGN_TASK_TYPE_ICONS,
  DESIGN_TASK_TYPE_LABELS,
  DESIGN_TASK_TYPE_OPTIONS,
  type DesignTaskType,
} from "@/lib/designTaskType";
import { cn } from "@/lib/utils";

import type { DesignComposerImprint } from "./designComposerImprint";
import { QuoteImprintBadges } from "./QuoteImprintBadges";
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
 * ЯК ТЕПЕР. Товар обирають смугою пігулок НАД цим блоком — тією самою, що
 * перемикає вже заведені задачі. Форма ж відповідає лише за те, чого ще
 * немає: ТЗ і файли для обраного товару. Свого вибору товару тут не було й
 * не має бути: два контроли на одну відповідь — це та сама помилка, що й
 * дві смуги пігулок поспіль.
 *
 * ФАЙЛИ КРІПЛЯТЬСЯ ДО ПОЗИЦІЇ, А НЕ ДО ЗАДАЧІ, і це навмисно: задача — рядок
 * журналу активності, зовнішнього ключа на неї не побудувати, а позиція живе
 * й до створення задачі, і після її закриття.
 *
 * ТИП ЗАДАЧІ БІЛЬШЕ НЕ ПИТАЄМО (REQ-157). П'ять плашок займали цілий ярус
 * форми, а в 6 випадках із 10 відповідь була та сама: заміри 04.09.2026 —
 * 392 «Візуалізації/адаптації» з 615 задач, за останні 30 днів 39 із 66.
 * Тепер значення стоїть саме (`DEFAULT_DESIGN_TASK_TYPE`) і живе тихим рядком
 * у підвалі, поруч із кнопкою: видно, з чим створюється задача, і міняється
 * одним рухом. Прибрати поле зовсім було не можна — решта 27 задач місяця
 * (креатив, верстка, адаптація макету, презентація) заводяться далі, а тип
 * годує норми часу в дашборді дизайнерів і у звіті для СЕО.
 */

export type { DesignComposerImprint };

export function QuoteDesignTaskComposer({
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
  /* Тип завжди має значення: сторінка ставить його за замовчуванням, а `null`
     лишається можливим лише в старих шляхах, які цю форму не відкривають. */
  const effectiveType = taskType ?? DEFAULT_DESIGN_TASK_TYPE;
  const TypeIcon = DESIGN_TASK_TYPE_ICONS[effectiveType];
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
        <p className="text-xs text-muted-foreground">Напишіть ТЗ і прикріпіть файли замовника.</p>
      </div>

      {/*
        НАНЕСЕННЯ ПОКАЗУЄМО, АЛЕ НЕ РЕДАГУЄМО, і тими самими пігулками, що
        в картці вже створеної задачі (REQ-157): одна річ — один вигляд, хай
        людина дивиться на неї до створення чи після. Ставлять нанесення при
        створенні прорахунку, розмір дизайнер бере з ТЗ.
      */}
      <div className="flex flex-wrap items-center gap-1.5">
        {imprint.length > 0 ? (
          <>
            <QuoteImprintBadges imprint={imprint} />
            <span className="text-2xs text-muted-foreground/70">— з товару, змінюється у вкладці «Товари»</span>
          </>
        ) : (
          <p className="text-2xs text-muted-foreground">
            У цій позиції нанесення не вказано — його ставлять у товарі, при створенні прорахунку.
          </p>
        )}
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
            (disabled || busy) && "pointer-events-none opacity-50"
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

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/60 pt-3">
        {/*
          ТИП — РЯДОК, А НЕ ПИТАННЯ. Значення стоїть, іконка та сама, що в
          решті застосунку, а «змінити» відкриває той самий перелік із п'яти —
          просто він більше не займає ярус форми заради шести випадків із десяти.
        */}
        <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
          <TypeIcon className="h-3.5 w-3.5 shrink-0" />
          Тип: <span className="font-semibold text-foreground">{DESIGN_TASK_TYPE_LABELS[effectiveType]}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={disabled || busy}>
              <button
                type="button"
                className="text-2xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
              >
                змінити
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {DESIGN_TASK_TYPE_OPTIONS.map((option) => {
                const Icon = DESIGN_TASK_TYPE_ICONS[option.value];
                return (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() => onTaskTypeChange(option.value)}
                    className="gap-2 text-sm"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{option.label}</span>
                    {option.value === effectiveType ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
        <Button type="button" size="sm" disabled={disabled || busy} className="gap-2" onClick={onCreate}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Створити дизайн-задачу
        </Button>
      </div>
    </section>
  );
}
