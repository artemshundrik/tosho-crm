import * as React from "react";

import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import type { DesignTaskType } from "@/lib/designTaskType";

import { Package } from "lucide-react";

import { cn } from "@/lib/utils";

import { buildComposerImprint } from "./designComposerImprint";
import { QuoteDesignTaskComposer } from "./QuoteDesignTaskComposer";
import { QuoteDesignTasksPanel, type QuoteDesignTaskCard } from "./QuoteDesignTasksPanel";
import type { QuoteAttachment } from "./queries";

/**
 * Вміст вкладки «Дизайн» у картці прорахунку.
 *
 * ЧОМУ ОКРЕМИЙ ФАЙЛ. Вкладка перестала бути вітриною: тепер тут і створення
 * задачі (REQ-246), і список задач, і матеріали. Тримати це в
 * `QuoteDetailsPage.tsx` означало б дописати сотню рядків у файл на сім із
 * половиною тисяч — рівно те, проти чого поставлений ратчет розміру, і рівно
 * те, через що ця сторінка стала такою.
 *
 * Порядок на екрані — той, у якому людина працює: спершу заводимо задачу
 * (товар → ТЗ → файли → «Створити»), нижче видно вже заведені.
 */

export type QuoteDesignTabItem = {
  id: string;
  title: string;
  methods?: Array<{
    methodId: string;
    printPositionId?: string;
    /** Місце, вписане руками у вікні прорахунку (REQ-182#p24). */
    printPositionLabel?: string | null;
    printWidthMm?: number | null;
    printHeightMm?: number | null;
  }> | null;
  resolvedMethodNames?: Record<string, string>;
  resolvedTypeId?: string;
  resolvedKindId?: string;
};

export function QuoteDesignTabSection({
  items,
  itemsWithoutDesignTask,
  designTaskItemId,
  onSelectDesignTaskItem,
  composerBrief,
  onComposerBriefChange,
  briefPlaceholder,
  attachments,
  catalogTypes,
  itemImages,
  attachmentsUploading,
  onAddComposerFiles,
  onRemoveComposerFile,
  designTaskType,
  onDesignTaskTypeChange,
  designTaskSaving,
  designTaskError,
  designTaskLoading,
  canEditQuoteContent,
  onCreateDesignTask,
  designTaskCards,
  renderBrief,
  designMaterials,
  onOpenTask,
  onPreviewVisual,
  onDownloadVisual,
  onAddMaterials,
}: {
  items: QuoteDesignTabItem[];
  itemsWithoutDesignTask: QuoteDesignTabItem[];
  designTaskItemId: string | null;
  onSelectDesignTaskItem: (itemId: string) => void;
  composerBrief: string;
  onComposerBriefChange: (value: string) => void;
  briefPlaceholder?: string;
  /** Усі вкладення прорахунку — композер сам відбере файли своєї позиції. */
  attachments: QuoteAttachment[];
  catalogTypes: Parameters<typeof buildComposerImprint>[1];
  /** Секції тиражів — з них беремо мініатюру товару для пігулки вибору. */
  itemImages: Array<{ item: { id: string } | null; imageUrl: string | null }>;
  attachmentsUploading?: boolean;
  onAddComposerFiles: (files: FileList | null, itemId: string | null) => void;
  onRemoveComposerFile: (file: QuoteAttachment) => void;
  designTaskType: DesignTaskType | null;
  onDesignTaskTypeChange: (value: DesignTaskType) => void;
  designTaskSaving?: boolean;
  designTaskError?: string | null;
  designTaskLoading?: boolean;
  canEditQuoteContent?: boolean;
  onCreateDesignTask: (itemId: string | null, hasFiles: boolean) => void;
  designTaskCards: QuoteDesignTaskCard[];
  renderBrief: (text: string) => React.ReactNode;
  designMaterials: QuoteAttachment[];
  onOpenTask: (taskId: string) => void;
  onPreviewVisual: (file: QuoteAttachment) => void;
  onDownloadVisual: (file: QuoteAttachment) => void;
  onAddMaterials: (files: FileList | null) => void;
}) {
  /*
    Позиція, на яку націлений композер, і все, що з неї випливає, рахується
    ТУТ, а не в картці прорахунку: інакше кожна така дрібниця дописувала б
    рядки у файл на сім із половиною тисяч.
  */
  const fallbackItemId = designTaskItemId ?? itemsWithoutDesignTask[0]?.id ?? items[0]?.id ?? null;
  const composerFiles = React.useMemo(
    () =>
      fallbackItemId
        ? attachments.filter((file) => file.audience === "design" && file.quoteItemId === fallbackItemId)
        : [],
    [attachments, fallbackItemId]
  );
  const imageByItemId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const section of itemImages) {
      if (section.item?.id && section.imageUrl) map.set(section.item.id, section.imageUrl);
    }
    return map;
  }, [itemImages]);
  /** Задача обраного товару, якщо вона вже є. */
  const taskForItem = React.useMemo(
    () => designTaskCards.find((task) => task.quoteItemId === fallbackItemId) ?? null,
    [designTaskCards, fallbackItemId]
  );
  const composerImprint = React.useMemo(
    () => buildComposerImprint(items.find((item) => item.id === fallbackItemId), catalogTypes),
    [catalogTypes, fallbackItemId, items]
  );

  return (
    <>
      {/*
        ОДНА СМУГА, І ВОНА ПРО ТОВАРИ (REQ-246).

        Було дві: угорі мій вибір товару для нової задачі, нижче — власний
        перемикач задач у панелі. Тобто той самий товар доводилось обирати
        двічі, різними контролами. Тепер перемикач один і стоїть одразу під
        заголовком: у ньому ВСІ товари прорахунку, а нижче відкривається те,
        що для обраного товару є, — його задача або форма створення.
      */}
      {items.length > 0 && !designTaskLoading ? (
        <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Товар">
          {items.map((item) => {
            const on = item.id === fallbackItemId;
            const task = designTaskCards.find((card) => card.quoteItemId === item.id) ?? null;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={on}
                title={item.title}
                onClick={() => onSelectDesignTaskItem(item.id)}
                className={cn(
                  "inline-flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                  on ? "border-foreground/70 bg-background" : "border-border/60 bg-background hover:bg-muted/40"
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/30">
                  {imageByItemId.get(item.id) ? (
                    <img src={imageByItemId.get(item.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Package className="h-3.5 w-3.5 text-muted-foreground/60" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[168px] truncate text-xs font-semibold text-foreground">
                    {item.title || "Позиція"}
                  </span>
                  <span className="block tabular-nums text-3xs text-muted-foreground">
                    {task?.number ?? "задачі ще немає"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {designTaskLoading ? (
        <AppSectionLoader label="Завантаження..." />
      ) : taskForItem ? (
        /* У товару вже є задача — показуємо саме її, без списку й без форми. */
        <QuoteDesignTasksPanel
          tasks={[taskForItem]}
          activeTaskId={taskForItem.id}
          imprint={composerImprint}
          renderBrief={renderBrief}
          materials={designMaterials}
          materialsUploading={attachmentsUploading}
          canAddMaterials={canEditQuoteContent}
          onOpenTask={onOpenTask}
          onPreviewVisual={onPreviewVisual}
          onDownloadVisual={onDownloadVisual}
          onAddMaterials={onAddMaterials}
        />
      ) : items.length > 0 && canEditQuoteContent ? (
        /* Задачі немає — тут-таки її й заводимо, для ОБРАНОГО товару. */
        <QuoteDesignTaskComposer
          brief={composerBrief}
          onBriefChange={onComposerBriefChange}
          briefPlaceholder={briefPlaceholder}
          imprint={composerImprint}
          files={composerFiles}
          uploading={attachmentsUploading}
          onAddFiles={(files) => onAddComposerFiles(files, fallbackItemId)}
          onRemoveFile={onRemoveComposerFile}
          taskType={designTaskType}
          onTaskTypeChange={onDesignTaskTypeChange}
          saving={designTaskSaving}
          error={designTaskError}
          onCreate={() => onCreateDesignTask(fallbackItemId, composerFiles.length > 0)}
        />
      ) : null}
    </>
  );
}
