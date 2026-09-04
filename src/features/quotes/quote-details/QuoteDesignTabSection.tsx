import * as React from "react";

import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import type { DesignTaskType } from "@/lib/designTaskType";

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
    printWidthMm?: number | null;
    printHeightMm?: number | null;
  }> | null;
  resolvedMethodNames?: Record<string, string>;
  resolvedTypeId?: string;
  resolvedKindId?: string;
};

export function QuoteDesignTabSection({
  items,
  designTaskItemIds,
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
  activeDesignTaskId,
  renderBrief,
  designMaterials,
  onSelectTask,
  onOpenTask,
  onPreviewVisual,
  onDownloadVisual,
  onAddMaterials,
}: {
  items: QuoteDesignTabItem[];
  designTaskItemIds: Set<string>;
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
  activeDesignTaskId: string | null;
  renderBrief: (text: string) => React.ReactNode;
  designMaterials: QuoteAttachment[];
  onSelectTask: (taskId: string) => void;
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
  const composerImprint = React.useMemo(
    () => buildComposerImprint(items.find((item) => item.id === fallbackItemId), catalogTypes),
    [catalogTypes, fallbackItemId, items]
  );

  return (
    <>
      {/*
        СТВОРЕННЯ ЖИВЕ ТУТ (REQ-246), а не в меню «⋮» шапки. Порядок
        такий, як його описав Артем: угорі товар, під ним ТЗ і файли
        саме для нього, і кнопка. Блок стоїть НАД списком задач і
        показується завжди, поки в прорахунку є позиції: другу задачу
        на той самий товар (візуал і макет) заводять свідомо.
      */}
      {!designTaskLoading && items.length > 0 && canEditQuoteContent ? (
        <div className="mb-4">
          <QuoteDesignTaskComposer
            items={items.map((item) => ({
              id: item.id,
              title: item.title,
              imageUrl: imageByItemId.get(item.id) ?? null,
              hasTask: designTaskItemIds.has(item.id),
            }))}
            selectedItemId={fallbackItemId}
            onSelectItem={onSelectDesignTaskItem}
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
        </div>
      ) : null}

      {designTaskLoading ? (
        <AppSectionLoader label="Завантаження..." />
      ) : designTaskCards.length > 0 ? (
        <QuoteDesignTasksPanel
          tasks={designTaskCards}
          activeTaskId={activeDesignTaskId}
          renderBrief={renderBrief}
          materials={designMaterials}
          materialsUploading={attachmentsUploading}
          canAddMaterials={canEditQuoteContent}
          onSelectTask={onSelectTask}
          onOpenTask={onOpenTask}
            onPreviewVisual={onPreviewVisual}
            onDownloadVisual={onDownloadVisual}
          onAddMaterials={onAddMaterials}
        />
      ) : null}

    </>
  );
}
