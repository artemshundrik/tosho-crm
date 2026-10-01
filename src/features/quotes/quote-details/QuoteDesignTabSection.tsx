import * as React from "react";

import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import type { DesignTaskType } from "@/lib/designTaskType";

import { Package, Plus } from "@/components/icons/appIcons";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { buildComposerImprint } from "./designComposerImprint";
import { QuoteDesignTaskComposer, type ComposerDesigner } from "./QuoteDesignTaskComposer";
import {
  QuoteDesignMaterials,
  QuoteDesignStatusStrip,
  QuoteDesignTaskCardView,
  type QuoteDesignTaskCard,
} from "./QuoteDesignTasksPanel";
import { QuoteImprintBadges } from "./QuoteImprintBadges";
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
 * Порядок на екрані (REQ-226#p1): угорі смуга стану, далі задачі картками
 * мовою «Товарів», під ними товари без задачі списком — форма нової задачі
 * розгортається просто в рядку товару, — і в самому низу спільні матеріали.
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
  designAssigneeId,
  onDesignAssigneeChange,
  designers,
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
  onAddComposerFiles: (files: FileList | File[] | null, itemId: string | null) => void;
  onRemoveComposerFile: (file: QuoteAttachment) => void;
  designTaskType: DesignTaskType | null;
  onDesignTaskTypeChange: (value: DesignTaskType) => void;
  /** Виконавець зі стану сторінки: після завантаження — той, хто веде найновішу задачу. */
  designAssigneeId: string | null;
  onDesignAssigneeChange: (value: string | null) => void;
  /** Діючі дизайнери команди — з них і лише з них обирають виконавця. */
  designers: ComposerDesigner[];
  designTaskSaving?: boolean;
  designTaskError?: string | null;
  designTaskLoading?: boolean;
  canEditQuoteContent?: boolean;
  onCreateDesignTask: (itemId: string | null, hasFiles: boolean, assigneeId: string | null) => void;
  designTaskCards: QuoteDesignTaskCard[];
  renderBrief: (text: string) => React.ReactNode;
  designMaterials: QuoteAttachment[];
  onOpenTask: (taskId: string) => void;
  onPreviewVisual: (file: QuoteAttachment) => void;
  onDownloadVisual: (file: QuoteAttachment) => void;
  onAddMaterials: (files: FileList | File[] | null) => void;
}) {
  /** Позиції з задачею ПРОРАХОВУЄ СТОРІНКА (`itemsWithoutDesignTask`) — тут той самий список. */
  const untaskedIds = React.useMemo(() => new Set(itemsWithoutDesignTask.map((item) => item.id)), [itemsWithoutDesignTask]);
  /*
    Ще одну задачу пропонуємо, лише коли товарів більше, ніж задач, — те саме
    правило, що й у меню «⋮» сторінки. Інакше на старому прорахунку з однією
    задачею без прив'язки до товару товар виглядав би «без задачі», і другий
    клік заводив би дубль.
  */
  const canCreateMore = Boolean(canEditQuoteContent) && items.length > designTaskCards.length;

  /*
    ЯКИЙ РЯДОК РОЗГОРНУТИЙ ПІД ФОРМУ. Ціль тримає сторінка (`designTaskItemId`):
    її ставить і кнопка «Задача» в рядку, і пункт меню «Створити дизайн-задачу».
    Поки задач немає зовсім, форма відкрита на першому товарі — інакше вкладка
    порожнього прорахунку була б списком без жодної дії. «Згорнути» пам'ятає
    лише поточну ціль: нова ціль від сторінки розгортає форму знову.
  */
  const target =
    designTaskItemId && untaskedIds.has(designTaskItemId)
      ? designTaskItemId
      : designTaskCards.length === 0
        ? itemsWithoutDesignTask[0]?.id ?? null
        : null;
  const [collapsedTarget, setCollapsedTarget] = React.useState<string | null>(null);
  const [seenTaskItemId, setSeenTaskItemId] = React.useState(designTaskItemId);
  if (seenTaskItemId !== designTaskItemId) {
    setSeenTaskItemId(designTaskItemId);
    setCollapsedTarget(null);
  }
  const composerItemId = canCreateMore && target && target !== collapsedTarget ? target : null;

  const [expandedTaskIds, setExpandedTaskIds] = React.useState<Set<string>>(() => new Set());
  const toggleTask = (taskId: string) =>
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });

  const composerFiles = React.useMemo(
    () =>
      composerItemId
        ? attachments.filter((file) => file.audience === "design" && file.quoteItemId === composerItemId)
        : [],
    [attachments, composerItemId]
  );
  const imageByItemId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const section of itemImages) {
      if (section.item?.id && section.imageUrl) map.set(section.item.id, section.imageUrl);
    }
    return map;
  }, [itemImages]);
  const imprintOf = (itemId: string | null) =>
    buildComposerImprint(itemId ? items.find((item) => item.id === itemId) : undefined, catalogTypes);
  /*
    ВИКОНАВЕЦЬ ЗА ЗАМОВЧУВАННЯМ — той, хто веде найновішу задачу прорахунку:
    сторінка тримає його в стані з моменту завантаження. Звільнений або
    не-дизайнер у виборі не стоїть, тож замість нього «Без виконавця»: що на
    кнопці, те й поїде в задачу.
  */
  const composerAssigneeId =
    designAssigneeId && designers.some((designer) => designer.id === designAssigneeId) ? designAssigneeId : null;

  if (designTaskLoading) return <AppSectionLoader label="Завантаження..." />;

  const untaskedVisible = canCreateMore ? itemsWithoutDesignTask : [];

  return (
    <div className="space-y-4">
      {items.length > 1 ? (
        <QuoteDesignStatusStrip
          tasks={designTaskCards}
          itemCount={items.length}
          untaskedCount={itemsWithoutDesignTask.length}
        />
      ) : null}

      {designTaskCards.length > 0 ? (
        <section className="space-y-2.5" aria-label="Товари із задачею">
          {untaskedVisible.length > 0 ? (
            <div className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
              Із задачею · {designTaskCards.length}
            </div>
          ) : null}
          {designTaskCards.map((task) => (
            <QuoteDesignTaskCardView
              key={task.id}
              task={task}
              imprint={imprintOf(task.quoteItemId)}
              expanded={expandedTaskIds.has(task.id)}
              onToggle={() => toggleTask(task.id)}
              renderBrief={renderBrief}
              onOpenTask={onOpenTask}
              onPreviewVisual={onPreviewVisual}
              onDownloadVisual={onDownloadVisual}
            />
          ))}
        </section>
      ) : null}

      {untaskedVisible.length > 0 ? (
        <section className="space-y-2.5" aria-label="Товари без задачі">
          <div className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
            Без задачі · {untaskedVisible.length}
          </div>
          <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
            {untaskedVisible.map((item) => {
              const open = item.id === composerItemId;
              const imprint = imprintOf(item.id);
              const image = imageByItemId.get(item.id);
              return (
                <div key={item.id} className={cn("border-b border-border/40 last:border-b-0", open && "bg-muted/[0.03]")}>
                  <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-muted/20">
                      {image ? (
                        <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <Package className="h-4 w-4 text-muted-foreground/60" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{item.title || "Позиція"}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {imprint.length > 0 ? (
                          <QuoteImprintBadges imprint={imprint} />
                        ) : (
                          <span className="tone-text-warning text-xs">Нанесення не вказано — його ставлять у «Товарах»</span>
                        )}
                      </div>
                    </div>
                    {open ? (
                      <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setCollapsedTarget(item.id)}>
                        Згорнути
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5"
                        onClick={() => {
                          setCollapsedTarget(null);
                          if (item.id !== designTaskItemId) onSelectDesignTaskItem(item.id);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Задача
                      </Button>
                    )}
                  </div>
                  {open ? (
                    <div className="px-3 pb-4 sm:pl-[68px] sm:pr-4">
                      <QuoteDesignTaskComposer
                        embedded
                        brief={composerBrief}
                        onBriefChange={onComposerBriefChange}
                        briefPlaceholder={briefPlaceholder}
                        imprint={imprint}
                        files={composerFiles}
                        uploading={attachmentsUploading}
                        onAddFiles={(files) => onAddComposerFiles(files, item.id)}
                        onRemoveFile={onRemoveComposerFile}
                        taskType={designTaskType}
                        onTaskTypeChange={onDesignTaskTypeChange}
                        assigneeId={composerAssigneeId}
                        onAssigneeChange={onDesignAssigneeChange}
                        designers={designers}
                        saving={designTaskSaving}
                        error={designTaskError}
                        onCreate={() => onCreateDesignTask(item.id, composerFiles.length > 0, composerAssigneeId)}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <QuoteDesignMaterials
        materials={designMaterials}
        uploading={attachmentsUploading}
        canAdd={canEditQuoteContent}
        onAdd={onAddMaterials}
        onDownload={onDownloadVisual}
      />
    </div>
  );
}
