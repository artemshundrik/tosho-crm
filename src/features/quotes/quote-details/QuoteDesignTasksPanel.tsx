import type { ReactNode } from "react";
import {
  ChevronDown,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Package,
  Paperclip,
  Pencil,
  Upload,
} from "@/components/icons/appIcons";

import { AvatarBase } from "@/components/app/avatar-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StorageObjectImage } from "@/components/app/StorageObjectImage";
import { getAttachmentDisplayFileName } from "@/lib/attachmentPreview";
import { DESIGN_STATUS_LABELS, type DesignStatus } from "@/lib/designTaskStatus";
import { designStatusTone, toneBadgeClass, toneDotClass } from "@/lib/statusTones";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { cn } from "@/lib/utils";

import { canPreviewDocumentThumb, canPreviewImage, formatFileSize, getFileExtension } from "./config";
import type { DesignComposerImprint } from "./designComposerImprint";
import { parseDesignOutputMetaFiles } from "./designOutputFiles";
import { QuoteImprintBadges } from "./QuoteImprintBadges";
import type { QuoteAttachment } from "./queries";

/**
 * Вкладка «Дизайн» будується ВІД ЗАДАЧІ (REQ-155 p4), а показується мовою
 * «Товарів» (REQ-226#p1).
 *
 * Одиниця показу — задача: у кожної ЇЇ ТЗ і ЇЇ візуали. Доти ТЗ бралось зі
 * спільного поля прорахунку, а візуали — зі спільних файлів, і на прорахунку з
 * двома товарами ТЗ першої задачі стояло поруч із візуалом другої.
 *
 * БУЛО ДАЛІ: пігулки товарів угорі й одна відкрита задача під ними. На
 * прорахунку з тринадцяти товарів, щоб дізнатись стан дизайну, треба було
 * клікнути тринадцять разів. СТАЛО: усі задачі одразу, картками як на
 * «Товарах», над ними смуга стану, під ними товари без задачі списком.
 */

export type QuoteDesignTaskCard = {
  id: string;
  /** Позиція прорахунку, на яку заведено задачу (REQ-246). */
  quoteItemId: string | null;
  /** DT-0826-021 — номер дизайн-задачі з metadata. */
  number: string | null;
  /** Назва товару: модель із задачі, назва позиції або назва самої задачі. */
  title: string;
  imageUrl: string | null;
  /** Статус задачі як він лежить у metadata: new, in_progress, approved… */
  status: string | null;
  /** «Одяг / Куртки · тираж 100 шт» — про що саме задача. */
  itemMeta: string | null;
  assignee: { name: string; avatarUrl: string | null } | null;
  /** Дедлайн макета, ISO. Форматується тут-таки, поруч із показом. */
  deadline: string | null;
  brief: string | null;
  visuals: QuoteAttachment[];
  /** `id` візуала, який обрали як фінальний, — саме він піде в КП і замовлення. */
  selectedVisualId: string | null;
};

const statusOf = (status: string | null) => {
  if (!status) return null;
  const label = DESIGN_STATUS_LABELS[status as DesignStatus];
  if (!label) return null;
  return { label, tone: designStatusTone(status) };
};

/**
 * Коротка дата: «2 вер» або «2 вер, 17:00». Одна на дедлайн у шапці й на дату
 * файлу в матеріалах — вони стоять за десяток пікселів одна від одної, і два
 * різні написання дати на одному екрані читались би як різні речі.
 */
const formatWhen = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  if (!/T\d{2}:\d{2}/.test(value)) return day;
  const time = date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  return time === "00:00" ? day : `${day}, ${time}`;
};

const MetaDot = () => <span className="h-1 w-1 shrink-0 rounded-full bg-border" aria-hidden />;


/** Рядок дизайн-задачі як його віддає activity_log. */
export type QuoteDesignTaskSource = {
  id: string;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Секція товару зі сторінки: мініатюра, підпис і ТИРАЖ — усе, що треба картці.
 *
 * Тираж приходить уже вибраним, а не масивом тиражів. Це не дрібниця: «який із
 * тиражів рахується» — правило погодженого тиражу, і живе воно в `quoteRuns`
 * разом із єдиним читачем на сторінці. Другий читач тут розійшовся б із
 * вкладкою «Товари» на першій же зміні правила.
 */
export type QuoteDesignSectionSource = {
  key: string;
  title: string;
  meta: string;
  imageUrl: string | null;
  unitLabel: string;
  quantity: number | null;
};

/**
 * Складання карток вкладки «Дизайн» із сирих даних сторінки.
 *
 * ВІЗУАЛИ БЕРУТЬСЯ З МЕТАДАНИХ САМОЇ ЗАДАЧІ (design_output_files), а не зі
 * спільного списку файлів прорахунку. Спільний для цього не годиться: у нього
 * фоновий ефект докладає лише ОБРАНИЙ вихід, і на двох задачах він однаково не
 * сказав би, чий це файл.
 *
 * Виняток — прорахунок з ОДНІЄЮ СТАРОЮ задачею, у якої ключа
 * `design_output_files` немає зовсім: там візуали лежать тільки у файлах
 * прорахунку, і без доливання вони б зникли з екрана. Щойно список у задачі
 * зʼявився, він і є відповідь — див. REQ-304 нижче. З тієї ж причини й ТЗ прорахунку
 * підставляється запасним варіантом лише при одній задачі: на двох спільний
 * текст приписав би одній із них чуже ТЗ.
 */
export function buildQuoteDesignTaskCards({
  tasks: designTasks,
  sections: runSections,
  visualizations: designVisualizations,
  quoteBrief: rawQuoteBrief,
  memberById,
  memberAvatarById,
}: {
  tasks: QuoteDesignTaskSource[];
  sections: QuoteDesignSectionSource[];
  visualizations: QuoteAttachment[];
  quoteBrief: string | null;
  memberById: Map<string, string>;
  memberAvatarById: Map<string, string | null>;
}): QuoteDesignTaskCard[] {
    const sectionByItemId = new Map(runSections.map((section) => [section.key, section]));
    const single = designTasks.length === 1;
    const quoteBrief = (rawQuoteBrief ?? "").trim();

    return designTasks.map((task) => {
      const metadata = task.metadata ?? {};
      const readString = (key: string) => {
        const value = metadata[key];
        return typeof value === "string" && value.trim() ? value.trim() : null;
      };
      const itemId = readString("quote_item_id");
      const section = itemId ? sectionByItemId.get(itemId) ?? null : null;

      /*
        СПИСОК ЗАДАЧІ — ДЖЕРЕЛО ПРАВДИ, ЯКЩО ВІН УЗАГАЛІ Є (REQ-304).

        Доливання з файлів прорахунку воскрешало видалені візуали: рядок у
        `quote_attachments` при видаленні виходу з задачі НЕ прибирається, тож
        файл, якого в задачі вже немає, повертався на вкладку «Дизайн» — і
        далі в КП. Заміряно на TS-0926-0026: у задачі один вихід (`_v2`), а в
        прорахунку три рядки, з них два — дублі старого файлу.

        Доливаємо тепер лише тоді, коли ключа `design_output_files` немає
        ЗОВСІМ. Це і є ознака старої задачі, заради якої доливання заводили:
        у неї візуали лежать тільки в файлах прорахунку. Порожній список —
        це вже відповідь «виходів немає», а не «ще не знаємо».
      */
      const hasOwnOutputList = Array.isArray(metadata.design_output_files);
      const visuals: QuoteAttachment[] = parseDesignOutputMetaFiles(metadata.design_output_files).map(
        (file) => ({
          id: file.id,
          name: file.file_name,
          size: formatFileSize(file.file_size),
          created_at: file.created_at,
          mimeType: file.mime_type,
          uploadedBy: file.uploaded_by,
          uploadedByLabel: file.uploaded_by ? memberById.get(file.uploaded_by) : undefined,
          storageBucket: file.storage_bucket,
          storagePath: file.storage_path,
        })
      );
      if (single && !hasOwnOutputList) {
        designVisualizations.forEach((file) => {
          if (visuals.some((known) => known.storagePath && known.storagePath === file.storagePath)) return;
          visuals.push(file);
        });
      }

      const selectedId = readString("selected_design_output_file_id");
      const selectedPath = readString("selected_design_output_storage_path");
      const selectedName = readString("selected_design_output_file_name");
      const selected =
        visuals.find((file) => selectedId && file.id === selectedId) ??
        visuals.find((file) => selectedPath && file.storagePath === selectedPath) ??
        visuals.find((file) => selectedName && file.name === selectedName) ??
        null;
      // Обраний іде першим: саме він потрапляє в КП і в замовлення.
      const ordered = selected
        ? [selected, ...visuals.filter((file) => file.id !== selected.id)]
        : visuals;

      const assigneeId = readString("assignee_user_id");
      const quantity = section?.quantity ?? 0;

      return {
        id: task.id,
        quoteItemId: itemId,
        number: readString("design_task_number"),
        title:
          readString("model") ??
          readString("quote_item_title") ??
          section?.title ??
          task.title?.trim() ??
          "Дизайн-задача",
        imageUrl: section?.imageUrl ?? null,
        status: readString("status"),
        itemMeta:
          [section?.meta || null, quantity > 0 ? `тираж ${quantity} ${section?.unitLabel ?? "шт."}` : null]
            .filter(Boolean)
            .join(" · ") || null,
        assignee: assigneeId
          ? {
              name: memberById.get(assigneeId) ?? "Виконавець",
              avatarUrl: memberAvatarById.get(assigneeId) ?? null,
            }
          : null,
        deadline: readString("design_deadline") ?? readString("deadline"),
        // ТЗ прорахунку — запасний варіант, і тільки коли задача одна: на двох
        // задачах спільний текст приписав би одній із них чуже ТЗ.
        brief: readString("design_brief") ?? (single && quoteBrief ? quoteBrief : null),
        visuals: ordered,
        selectedVisualId: selected?.id ?? null,
      } satisfies QuoteDesignTaskCard;
    });
}

function VisualCard({
  file,
  selected,
  onPreview,
  onDownload,
}: {
  file: QuoteAttachment;
  selected: boolean;
  onPreview: (file: QuoteAttachment) => void;
  onDownload: (file: QuoteAttachment) => void;
}) {
  const displayName = getAttachmentDisplayFileName(file.name, file.storagePath, file.mimeType);
  const extension = getFileExtension(displayName);
  const previewImage =
    (canPreviewImage(extension) || canPreviewDocumentThumb(extension)) &&
    Boolean(file.storageBucket && file.storagePath);

  return (
    <div
      className={cn(
        "group rounded-xl border p-3 transition-colors hover:bg-muted/10",
        selected ? "border-success-soft-border" : "border-border/40"
      )}
    >
      <button
        type="button"
        className="flex h-32 w-full items-center justify-center overflow-hidden rounded-lg bg-muted/20 text-left transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:cursor-default disabled:hover:scale-100"
        onClick={() => onPreview(file)}
        disabled={!previewImage}
        aria-label={previewImage ? `Переглянути ${displayName}` : displayName}
      >
        {previewImage ? (
          <StorageObjectImage
            bucket={file.storageBucket}
            path={file.storagePath}
            alt={displayName}
            variant="thumb"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground/70">
            <FileText className="h-8 w-8" />
            <span className="text-2xs font-semibold uppercase tracking-wide">{extension ?? "Файл"}</span>
          </div>
        )}
      </button>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={displayName}>
          {displayName}
        </span>
        {selected ? (
          <Badge variant="outline" className="tone-success h-5 shrink-0 px-2 text-3xs">
            Обрано
          </Badge>
        ) : file.storageBucket && file.storagePath ? (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 px-2 text-2xs text-muted-foreground"
            onClick={() => onDownload(file)}
          >
            Завантажити
          </Button>
        ) : null}
      </div>
    </div>
  );
}


/** ТЗ одним абзацом — для двох рядків у згорнутій картці; розмітку видно в розгорнутій. */
const plainBrief = (text: string) =>
  text
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const isPreviewable = (file: QuoteAttachment) => {
  const extension = getFileExtension(getAttachmentDisplayFileName(file.name, file.storagePath, file.mimeType));
  return (canPreviewImage(extension) || canPreviewDocumentThumb(extension)) && Boolean(file.storageBucket && file.storagePath);
};

/** Скільки візуалів видно в згорнутій картці; решта — за «+N». */
const MINI_VISUALS = 4;

/** Порядок статусів у смузі й легенді: від погодженого до щойно заведеного. */
const STATUS_ORDER: DesignStatus[] = ["approved", "client_review", "pm_review", "changes", "in_progress", "new", "cancelled"];

/**
 * Смуга стану дизайну над списком (REQ-226#p1): велике число й смуга, як
 * домовлено про мову інтерфейсу. Відповідає на питання, з яким відкривають
 * вкладку, — «скільки товарів уже в дизайні й що з ними», — не прокручуючи
 * тринадцять карток.
 */
export function QuoteDesignStatusStrip({
  tasks,
  itemCount,
  untaskedCount,
}: {
  tasks: QuoteDesignTaskCard[];
  itemCount: number;
  untaskedCount: number;
}) {
  const rank = (status: string | null) => {
    const index = STATUS_ORDER.indexOf(status as DesignStatus);
    return index === -1 ? STATUS_ORDER.length : index;
  };
  const sorted = [...tasks].sort((a, b) => rank(a.status) - rank(b.status));
  const legend = STATUS_ORDER.map((status) => ({
    status,
    count: tasks.filter((task) => task.status === status).length,
  })).filter((entry) => entry.count > 0);

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-border/50 bg-card p-4 sm:flex-row sm:items-center sm:gap-6"
      aria-label="Стан дизайну"
    >
      <div className="shrink-0">
        <div className="text-3xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
          {itemCount - untaskedCount}
          <span className="text-lg font-medium text-muted-foreground"> з {itemCount}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">товарів у дизайні</div>
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex h-2.5 gap-[3px]" aria-hidden>
          {sorted.map((task) => (
            <span key={task.id} className={cn("flex-1 rounded-[3px]", toneDotClass[designStatusTone(task.status)])} />
          ))}
          {untaskedCount > 0 ? (
            <span className="rounded-[3px] bg-muted" style={{ flexGrow: untaskedCount }} />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {legend.map((entry) => (
            <span key={entry.status} className="inline-flex items-center gap-1.5 text-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", toneDotClass[designStatusTone(entry.status)])} aria-hidden />
              {DESIGN_STATUS_LABELS[entry.status]} <span className="tabular-nums text-muted-foreground">{entry.count}</span>
            </span>
          ))}
          {untaskedCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" aria-hidden />
              Без задачі <span className="tabular-nums">{untaskedCount}</span>
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MiniVisual({
  file,
  selected,
  onPreview,
  onDownload,
}: {
  file: QuoteAttachment;
  selected: boolean;
  onPreview: (file: QuoteAttachment) => void;
  onDownload: (file: QuoteAttachment) => void;
}) {
  const displayName = getAttachmentDisplayFileName(file.name, file.storagePath, file.mimeType);
  const previewable = isPreviewable(file);
  return (
    <button
      type="button"
      onClick={() => (previewable ? onPreview(file) : onDownload(file))}
      aria-label={previewable ? `Переглянути ${displayName}` : `Завантажити ${displayName}`}
      className={cn(
        "relative flex h-[54px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/20 transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        selected ? "border-success-soft-border ring-2 ring-success-soft-border/60" : "border-border/50"
      )}
    >
      {previewable ? (
        <StorageObjectImage
          bucket={file.storageBucket}
          path={file.storagePath}
          alt={displayName}
          variant="thumb"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-3xs font-bold uppercase text-muted-foreground">
          {getFileExtension(displayName) ?? "файл"}
        </span>
      )}
      {selected ? (
        <span className="tone-success absolute bottom-1 left-1 rounded border px-1 text-3xs font-semibold leading-4">
          обрано
        </span>
      ) : null}
    </button>
  );
}

/**
 * Картка задачі на вкладці «Дизайн» (REQ-226#p1) — мовою «Товарів»: фото
 * ліворуч, паспорт товару, стан задачі праворуч, нижче коротко ТЗ і мініатюри
 * візуалів. Обраний візуал іде першим і обведений: саме він потрапляє в КП.
 *
 * ТЗ ПОВНІСТЮ Й УСІ ВІЗУАЛИ — ЗА РОЗГОРТАННЯМ. Тринадцять товарів на
 * прорахунку — звичайна справа, і повні картки на кожен давали б кілька
 * екранів прокрутки. Згорнута картка відповідає «що з цим товаром»,
 * розгорнута — «що саме намалювали».
 */
export function QuoteDesignTaskCardView({
  task,
  imprint,
  expanded,
  onToggle,
  renderBrief,
  onOpenTask,
  onPreviewVisual,
  onDownloadVisual,
}: {
  task: QuoteDesignTaskCard;
  imprint: DesignComposerImprint[];
  expanded: boolean;
  onToggle: () => void;
  /** Розмітка ТЗ — та сама, що в редакторі: заголовки, списки, жирний. */
  renderBrief: (text: string) => ReactNode;
  onOpenTask: (taskId: string) => void;
  onPreviewVisual: (file: QuoteAttachment) => void;
  onDownloadVisual: (file: QuoteAttachment) => void;
}) {
  const status = statusOf(task.status);
  const deadline = formatWhen(task.deadline);
  const minis = task.visuals.slice(0, MINI_VISUALS);
  const extra = task.visuals.length - minis.length;

  return (
    <article className="overflow-hidden rounded-xl border border-border/50 bg-card">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:gap-4 sm:p-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-muted/20">
          {task.imageUrl ? (
            <img src={task.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Package className="h-6 w-6 text-muted-foreground/50" />
          )}
        </span>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{task.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {task.number ? <span className="tabular-nums">{task.number}</span> : null}
                {task.number && task.itemMeta ? <MetaDot /> : null}
                {task.itemMeta ? <span>{task.itemMeta}</span> : null}
                <QuoteImprintBadges imprint={imprint} />
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {status ? (
                <span
                  className={cn(
                    "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium",
                    toneBadgeClass[status.tone]
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", toneDotClass[status.tone])} aria-hidden />
                  {status.label}
                </span>
              ) : null}
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-muted px-2 pl-0.5 text-xs text-muted-foreground">
                {task.assignee ? (
                  <>
                    <AvatarBase
                      src={task.assignee.avatarUrl}
                      name={task.assignee.name}
                      size={20}
                      className="text-3xs font-semibold"
                    />
                    {task.assignee.name}
                  </>
                ) : (
                  <span className="pl-1.5">без виконавця</span>
                )}
              </span>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenTask(task.id)}>
                Відкрити задачу
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
            <div className="min-w-0 flex-1 space-y-1">
              {deadline ? (
                <div className="text-xs text-muted-foreground">
                  дедлайн <span className="font-semibold tabular-nums text-foreground">{deadline}</span>
                </div>
              ) : null}
              {task.brief ? (
                <p className="line-clamp-2 text-sm leading-relaxed text-foreground/85">{plainBrief(task.brief)}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  ТЗ ще не написане — поки його немає, дизайнер не візьме задачу в роботу
                </p>
              )}
            </div>
            {minis.length > 0 ? (
              <div className="flex shrink-0 gap-2">
                {minis.map((file) => (
                  <MiniVisual
                    key={file.id}
                    file={file}
                    selected={file.id === task.selectedVisualId}
                    onPreview={onPreviewVisual}
                    onDownload={onDownloadVisual}
                  />
                ))}
                {extra > 0 ? (
                  <button
                    type="button"
                    onClick={onToggle}
                    className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-xs font-semibold tabular-nums text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                    aria-label={`Показати ще ${extra} візуалів`}
                  >
                    +{extra}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="flex h-[54px] shrink-0 items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 text-xs text-muted-foreground">
                <ImageIcon className="h-3.5 w-3.5" />
                Візуалів ще немає
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-center gap-1.5 border-t border-border/40 py-1.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/20"
      >
        {expanded ? "Згорнути" : "ТЗ повністю й усі візуали"}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded ? (
        <div className="space-y-5 border-t border-border/40 p-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-foreground">ТЗ задачі</span>
              {/*
                РЕДАГУВАННЯ ЖИВЕ В ЗАДАЧІ, А НЕ ТУТ. Поруч із текстом ТЗ у
                метаданих лежать його версії й прив'язка до раунду правок;
                другий редактор, що пише саме поле повз версії, зробив би
                історію ТЗ брехливою.
              */}
              <Button variant="outline" size="sm" className="gap-1.5 text-2xs" onClick={() => onOpenTask(task.id)}>
                <Pencil className="h-3 w-3" />
                {task.brief ? "Редагувати" : "Написати ТЗ"}
              </Button>
            </div>
            {task.brief ? (
              <div className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {renderBrief(task.brief)}
              </div>
            ) : null}
          </div>
          {task.visuals.length > 0 ? (
            <div>
              <span className="text-sm font-semibold text-foreground">
                Візуалізації
                <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">{task.visuals.length}</span>
              </span>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
                {task.visuals.map((file) => (
                  <VisualCard
                    key={file.id}
                    file={file}
                    selected={file.id === task.selectedVisualId}
                    onPreview={onPreviewVisual}
                    onDownload={onDownloadVisual}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/**
 * ВИХІДНІ МАТЕРІАЛИ (REQ-155 p7) — те, з чого дизайнер починає: логотипи,
 * макети, фото минулого тиражу. За заміром на проді 98,6 % вкладень прорахунку
 * позначені `audience=design`, тож їхнє місце тут, а не в розмові.
 *
 * ФАЙЛ ПРИВʼЯЗАНИЙ ДО ПРОРАХУНКУ, А НЕ ДО ЗАДАЧІ: у `quote_attachments` задачі
 * немає. Тому блок один на вкладку, під усіма картками, і названий спільним —
 * вигадувати належність, якої немає в даних, гірше, ніж чесно назвати список
 * спільним.
 */
export function QuoteDesignMaterials({
  materials,
  uploading,
  canAdd,
  onAdd,
  onDownload,
}: {
  materials: QuoteAttachment[];
  uploading?: boolean;
  canAdd?: boolean;
  onAdd: (files: FileList | File[] | null) => void;
  onDownload: (file: QuoteAttachment) => void;
}) {
  if (materials.length === 0 && !canAdd) return null;
  return (
    <section className="rounded-xl border border-border/50 bg-card p-4" aria-label="Вихідні матеріали">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            Вихідні матеріали
            {materials.length ? (
              <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">{materials.length}</span>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">Спільні для всіх задач прорахунку: логотипи, брендбук, фото</div>
        </div>
        {canAdd && materials.length > 0 ? (
          <label
            className={cn(
              "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-2xs font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground",
              uploading && "pointer-events-none opacity-60"
            )}
          >
            <Upload className="h-3 w-3" />
            {uploading ? "Завантаження..." : "Додати"}
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => {
                onAdd(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        ) : null}
      </div>

      {materials.length > 0 ? (
        <div className="mt-2">
          {materials.map((file) => {
            const displayName = getAttachmentDisplayFileName(file.name, file.storagePath, file.mimeType);
            const extension = getFileExtension(displayName);
            return (
              <div key={file.id} className="flex items-center gap-3 border-b border-border/40 py-2.5 last:border-b-0">
                {isPreviewable(file) ? (
                  <StorageObjectImage
                    bucket={file.storageBucket}
                    path={file.storagePath}
                    alt={displayName}
                    variant="thumb"
                    hoverPreview
                    className="h-9 w-9 shrink-0 rounded-lg border border-border/60 bg-muted/30"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/30 text-3xs font-bold uppercase text-muted-foreground">
                    {extension ?? <Paperclip className="h-4 w-4" />}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground" title={displayName}>
                    {displayName}
                  </div>
                  <div className="truncate text-2xs text-muted-foreground">
                    {[file.size, formatWhen(file.created_at), file.uploadedByLabel].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {file.storageBucket && file.storagePath ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 px-2 text-2xs text-muted-foreground"
                    onClick={() => onDownload(file)}
                  >
                    Завантажити
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <FileDropZone
          busy={uploading}
          className="mt-2.5"
          hint="Логотипи, макети й фото — з них дизайнер починає"
          label="Додати вихідні матеріали"
          multiple
          onFiles={onAdd}
          size="row"
          title="Перетягніть або клікніть"
        />
      )}
    </section>
  );
}
