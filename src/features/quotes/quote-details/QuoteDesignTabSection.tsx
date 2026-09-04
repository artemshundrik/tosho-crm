import * as React from "react";
import { Package, Palette } from "lucide-react";

import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { Button } from "@/components/ui/button";
import type { DesignTaskType } from "@/lib/designTaskType";

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
  methods?: unknown[] | null;
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
  composerFiles,
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
  onOpenProducts,
}: {
  items: QuoteDesignTabItem[];
  designTaskItemIds: Set<string>;
  itemsWithoutDesignTask: QuoteDesignTabItem[];
  designTaskItemId: string | null;
  onSelectDesignTaskItem: (itemId: string) => void;
  composerBrief: string;
  onComposerBriefChange: (value: string) => void;
  briefPlaceholder?: string;
  composerFiles: QuoteAttachment[];
  attachmentsUploading?: boolean;
  onAddComposerFiles: (files: FileList | null) => void;
  onRemoveComposerFile: (file: QuoteAttachment) => void;
  designTaskType: DesignTaskType | null;
  onDesignTaskTypeChange: (value: DesignTaskType) => void;
  designTaskSaving?: boolean;
  designTaskError?: string | null;
  designTaskLoading?: boolean;
  canEditQuoteContent?: boolean;
  onCreateDesignTask: () => void;
  designTaskCards: QuoteDesignTaskCard[];
  activeDesignTaskId: string | null;
  renderBrief: (text: string) => React.ReactNode;
  designMaterials: QuoteAttachment[];
  onSelectTask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onPreviewVisual: (file: QuoteAttachment) => void;
  onDownloadVisual: (file: QuoteAttachment) => void;
  onAddMaterials: (files: FileList | null) => void;
  onOpenProducts: () => void;
}) {
  const fallbackItemId = designTaskItemId ?? itemsWithoutDesignTask[0]?.id ?? items[0]?.id ?? null;

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
              methodsCount: item.methods?.length ?? 0,
              hasTask: designTaskItemIds.has(item.id),
            }))}
            selectedItemId={fallbackItemId}
            onSelectItem={onSelectDesignTaskItem}
            brief={composerBrief}
            onBriefChange={onComposerBriefChange}
            briefPlaceholder={briefPlaceholder}
            files={composerFiles}
            uploading={attachmentsUploading}
            onAddFiles={onAddComposerFiles}
            onRemoveFile={onRemoveComposerFile}
            taskType={designTaskType}
            onTaskTypeChange={onDesignTaskTypeChange}
            saving={designTaskSaving}
            error={designTaskError}
            onCreate={onCreateDesignTask}
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
      ) : (
        /*
          ЗАДАЧА НАРОДЖУЄТЬСЯ РАЗОМ ІЗ ПРОРАХУНКОМ (REQ-155 p5), і тут її
          не створюють. Аварійний шлях лишився в меню «⋮» шапки: виняток
          має жити в меню, а не займати екран замість типового стану.
        */
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 px-6 py-10 text-center">
          <Palette className="h-9 w-9 text-muted-foreground/30" />
          <div>
            <p className="font-medium text-foreground">Дизайн-задач у цьому прорахунку немає</p>
            <p className="mx-auto mt-1.5 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
              Задача створюється разом із прорахунком — по одній на кожен товар із нанесенням.
              Щоб вона тут зʼявилась, додайте нанесення в товарі.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-1 gap-2"
            onClick={onOpenProducts}
          >
            <Package className="h-4 w-4" />
            Відкрити «Товари»
          </Button>
        </div>
      )}
    </>
  );
}
