import type { ReactNode } from "react";
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Package,
  Paperclip,
  Pencil,
  Upload,
} from "lucide-react";

import { AvatarBase } from "@/components/app/avatar-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StorageObjectImage } from "@/components/app/StorageObjectImage";
import { getAttachmentDisplayFileName } from "@/lib/attachmentPreview";
import { DESIGN_STATUS_LABELS, type DesignStatus } from "@/lib/designTaskStatus";
import { DESIGN_TASK_TYPE_LABELS, parseDesignTaskType } from "@/lib/designTaskType";
import { designStatusTone, toneDotClass, toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

import { canPreviewDocumentThumb, canPreviewImage, formatFileSize, getFileExtension } from "./config";
import { parseDesignOutputMetaFiles } from "./designOutputFiles";
import type { QuoteAttachment } from "./queries";

/**
 * Вкладка «Дизайн» будується ВІД ЗАДАЧІ (REQ-155 p4).
 *
 * БУЛО: три підвкладки — «ТЗ», «Візуалізації», «Задача», — і кожна показувала
 * ЩОСЬ ОДНЕ з усіх задач прорахунку. ТЗ бралось із самого прорахунку (спільне),
 * візуалізації — з файлів прорахунку (теж спільні), а задача була найновіша з
 * усіх. На прорахунку з двома товарами це означало, що ТЗ до першої задачі
 * стоїть поруч із візуалом другої, і ніде на екрані не сказано, що це різні
 * справи.
 *
 * СТАЛО: одиниця показу — задача. Згори пігулки (коли задач більше однієї),
 * усередині обраної — ЇЇ ТЗ і ЇЇ візуали. Задача на прорахунку створюється по
 * одній на товар із нанесенням, тож пігулки збігаються з товарами.
 *
 * ЧОМУ ПІГУЛКИ, А НЕ СПИСОК ЛІВОРУЧ І НЕ СТОС. Обидва варіанти були в
 * прототипі (Д2, Д3) і відхилені: список ліворуч з'їдає 246 px ширини заради
 * двох-трьох рядків, а стос показує все одразу й тим ховає, що задачі різні.
 * Від чотирьох задач пігулки тіснішають і переносяться в другий ряд — ховати їх
 * за прокруткою не можна: непомічена задача = незроблений дизайн.
 */

export type QuoteDesignTaskCard = {
  id: string;
  /** Позиція прорахунку, на яку заведено задачу (REQ-246). */
  quoteItemId: string | null;
  /** DT-0826-021 — номер дизайн-задачі з metadata. */
  number: string | null;
  /** Назва товару: модель із задачі, назва позиції або назва самої задачі. */
  title: string;
  typeLabel: string | null;
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
 * Виняток — прорахунок з ОДНІЄЮ задачею: там до її списку доливаються файли
 * прорахунку, яких немає в метаданих. На старих задачах візуали лежать тільки
 * там, і без цього вони б зникли з екрана. З тієї ж причини й ТЗ прорахунку
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
      const taskType = parseDesignTaskType(metadata.design_task_type);

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
      if (single) {
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
        typeLabel: taskType ? DESIGN_TASK_TYPE_LABELS[taskType] : null,
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
            className="h-7 shrink-0 px-2 text-2xs text-muted-foreground"
            onClick={() => onDownload(file)}
          >
            Завантажити
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function QuoteDesignTasksPanel({
  tasks,
  activeTaskId,
  renderBrief,
  materials,
  materialsUploading,
  canAddMaterials,
  onOpenTask,
  onPreviewVisual,
  onDownloadVisual,
  onAddMaterials,
}: {
  tasks: QuoteDesignTaskCard[];
  activeTaskId: string | null;
  /** Розмітка ТЗ — та сама, що в редакторі: заголовки, списки, жирний. */
  renderBrief: (text: string) => ReactNode;
  /** Вкладення прорахунку з `audience=design` — вхідні матеріали для дизайнера. */
  materials: QuoteAttachment[];
  materialsUploading?: boolean;
  canAddMaterials?: boolean;
  onOpenTask: (taskId: string) => void;
  onPreviewVisual: (file: QuoteAttachment) => void;
  onDownloadVisual: (file: QuoteAttachment) => void;
  onAddMaterials: (files: FileList | null) => void;
}) {
  const active = tasks.find((task) => task.id === activeTaskId) ?? tasks[0] ?? null;
  if (!active) return null;
  const activeStatus = statusOf(active.status);

  return (
    <div>
      {/*
        ШАПКА Ш1 (REQ-155 p6). Три яруси, і кожен відповідає на своє питання:
        ЩО ЦЕ (номер і статус) → ПРО ЩО (товар і тип) → ХТО Й КОЛИ (позиція,
        тираж, виконавець, дедлайн).

        Статус — крапкою біля НОМЕРА, тобто там, де ідентичність задачі, а не
        окремим бейджем праворуч: праворуч живе дія, і бейдж поруч із кнопкою
        читався як друга кнопка. Виконавець — ФАКТОМ у мета-рядку, а не
        випадайкою: раніше тут стояв повноцінний вибір дизайнера, через який
        призначення мінялось повз сторінку задачі, де в нього своя історія й
        сповіщення. Праворуч лишилась одна дія — «Відкрити».

        Прототип пропонував ще дві шапки: Ш2 зі смужкою статусу на краю картки
        й Ш3 зі службовим у підвалі. Обидві відхилені: смужка не має підпису й
        читається як прикраса, а підвал відсуває стан задачі за екран, коли
        візуалів багато.
      */}
      <div className="overflow-hidden rounded-4xl border border-border/60 bg-background">
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/30">
            {active.imageUrl ? (
              <img src={active.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Package className="h-5 w-5 text-muted-foreground/60" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {active.number ? (
                <span className="tabular-nums text-2xs text-muted-foreground">{active.number}</span>
              ) : null}
              {activeStatus ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full", toneDotClass[activeStatus.tone])} aria-hidden />
                  <span className={cn("text-2xs font-semibold", toneTextClass[activeStatus.tone])}>
                    {activeStatus.label}
                  </span>
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-base font-semibold tracking-tight text-foreground">{active.title}</span>
              {active.typeLabel ? (
                <span className="rounded-md border border-border/60 px-1.5 py-0.5 text-2xs text-muted-foreground">
                  {active.typeLabel}
                </span>
              ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {active.itemMeta ? (
                <>
                  <span>{active.itemMeta}</span>
                  <MetaDot />
                </>
              ) : null}
              {active.assignee ? (
                <span className="inline-flex items-center gap-1.5">
                  <AvatarBase
                    src={active.assignee.avatarUrl}
                    name={active.assignee.name}
                    size={18}
                    className="text-3xs font-semibold"
                  />
                  {active.assignee.name}
                </span>
              ) : (
                <span>без виконавця</span>
              )}
              <MetaDot />
              <span>
                дедлайн{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatWhen(active.deadline) ?? "не заданий"}
                </span>
              </span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => onOpenTask(active.id)}>
            Відкрити
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="border-t border-border/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">ТЗ задачі</span>
            {/*
              РЕДАГУВАННЯ ЖИВЕ В ЗАДАЧІ, А НЕ ТУТ, і це не лінь.
              ТЗ задачі — це не просто текст: у метаданих поруч лежать його
              версії (`design_brief_versions`), активна версія й прив'язка до
              раунду правок. Другий редактор, який пише саме поле повз версії,
              зробив би історію ТЗ брехливою — активна версія перестала б
              збігатися з текстом.

              Той редактор, що стояв тут раніше, писав узагалі не сюди: він
              зберігав `quotes.design_brief`, спільний на весь прорахунок, а
              задача читає його лише як ЗАПАСНИЙ варіант. Щойно дизайнер
              торкався ТЗ у задачі, правки з картки прорахунку переставали бути
              видимими — тихо, без жодного попередження.
            */}
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-2xs" onClick={() => onOpenTask(active.id)}>
              <Pencil className="h-3 w-3" />
              {active.brief ? "Редагувати" : "Написати ТЗ"}
            </Button>
          </div>
          {active.brief ? (
            <div className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {renderBrief(active.brief)}
            </div>
          ) : (
            <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-dashed border-border/60 px-3.5 py-3 text-sm text-muted-foreground">
              <Pencil className="h-4 w-4 shrink-0" />
              <span>ТЗ ще не написане — поки його немає, дизайнер не візьме задачу в роботу</span>
            </div>
          )}
        </div>

        <div className="border-t border-border/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
              Візуалізації
              {active.visuals.length ? (
                <span className="ml-1.5 tabular-nums text-foreground">{active.visuals.length}</span>
              ) : null}
            </span>
          </div>
          {active.visuals.length > 0 ? (
            /* Щільність як у прототипі: скільки влізе по 170 px, а не жорсткі
               дві колонки. На задачі з чотирнадцятьма файлами (а такі є) дві
               колонки давали сім екранів прокрутки. */
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
              {active.visuals.map((file) => (
                <VisualCard
                  key={file.id}
                  file={file}
                  selected={file.id === active.selectedVisualId}
                  onPreview={onPreviewVisual}
                  onDownload={onDownloadVisual}
                />
              ))}
            </div>
          ) : (
            <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-dashed border-border/60 px-3.5 py-3 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4 shrink-0" />
              <span>Візуалів ще немає — дизайнер вивантажить їх у задачі</span>
            </div>
          )}
        </div>

        {/*
          ВИХІДНІ МАТЕРІАЛИ (REQ-155 p7) — те, з чого дизайнер починає: логотипи,
          макети, фото минулого тиражу. Лежали вони за другою підвкладкою
          «Обговорення», хоч за заміром на проді 477 із 484 вкладень (98,6 %)
          позначені `audience=design`. Тобто вкладення прорахунку — це майже
          завжди матеріали дизайну, і їхнє місце поруч із ТЗ, а не в розмові.

          ФАЙЛ ПРИВʼЯЗАНИЙ ДО ПРОРАХУНКУ, А НЕ ДО ЗАДАЧІ, і поки що інакше не
          буває: у `quote_attachments` є `quote_id` і `audience`, задачі немає.
          Тому на прорахунку з кількома задачами той самий перелік стоїть у
          кожній, і про це сказано словами — вигадувати належність, якої немає в
          даних, гірше, ніж чесно назвати список спільним.
        */}
        {materials.length > 0 || canAddMaterials ? (
          <div className="border-t border-border/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
                Вихідні матеріали
                {materials.length ? (
                  <span className="ml-1.5 tabular-nums text-foreground">{materials.length}</span>
                ) : null}
                {tasks.length > 1 ? (
                  <span className="ml-2 font-normal normal-case tracking-normal">
                    спільні для прорахунку
                  </span>
                ) : null}
              </span>
              {canAddMaterials ? (
                <label
                  className={cn(
                    "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-2xs font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground",
                    materialsUploading && "pointer-events-none opacity-60"
                  )}
                >
                  <Upload className="h-3 w-3" />
                  {materialsUploading ? "Завантаження..." : "Додати"}
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      onAddMaterials(event.target.files);
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
                    <div
                      key={file.id}
                      className="flex items-center gap-3 border-b border-border/40 py-2.5 last:border-b-0"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/30 text-3xs font-bold uppercase text-muted-foreground">
                        {extension ?? <Paperclip className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground" title={displayName}>
                          {displayName}
                        </div>
                        <div className="truncate text-2xs text-muted-foreground">
                          {[file.size, formatWhen(file.created_at), file.uploadedByLabel]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      {file.storageBucket && file.storagePath ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 px-2 text-2xs text-muted-foreground"
                          onClick={() => onDownloadVisual(file)}
                        >
                          Завантажити
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-dashed border-border/60 px-3.5 py-3 text-sm text-muted-foreground">
                <Paperclip className="h-4 w-4 shrink-0" />
                <span>Матеріалів для дизайнера ще немає — логотипи, макети й фото додають сюди</span>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
