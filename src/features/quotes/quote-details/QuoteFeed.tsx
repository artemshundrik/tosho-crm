import { useState } from "react";
import { ArrowRight, ChevronDown, Clock, Loader2, Paperclip, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatActivityClock, formatActivityDayLabel } from "@/lib/activity";
import { getAttachmentDisplayFileName } from "@/lib/attachmentPreview";
import { cn } from "@/lib/utils";

import { getFileExtension } from "./config";
import type { QuoteAttachment } from "./queries";
import type { QuoteFeedEvent, QuoteFeedKind } from "./quoteFeedEvents";

/**
 * СТРІЧКА СПРАВИ (REQ-155 p9, p12).
 *
 * ЧОМУ ОДИН ПОТІК. Три підвкладки — «Коментарі», «Вкладення», «Активність» —
 * ділили одну й ту саму історію на три списки з різним порядком. Питання
 * «що сталося з прорахунком у вівторок» вимагало прочитати три рази й зшити час
 * у голові.
 *
 * ЧОМУ ТУТ НЕМАЄ ПОЛЯ ВВОДУ КОМЕНТАРЯ. Розмова справи живе в панелі праворуч
 * (`TaskThreadRail`, нитка `quote:<id>`) — і жила там ще до цієї переробки.
 * Замір на проді 30.08.2026: усі 147 коментарів прорахунків мають `thread_key`,
 * тобто панель показує їх ПОВНІСТЮ. Список у центрі був другим показом тих
 * самих рядків на тому ж екрані, з другим полем вводу в ту саму нитку. У стрічці
 * коментар лишається — але як подія в хронології, а не як окремий чат.
 *
 * ФАЙЛИ ЗГОРТКОЮ ЗГОРИ, а не окремою вкладкою: у стрічці кожен файл видно в
 * момент, коли його додали, а реєстр відповідає на інше питання — «які файли є
 * взагалі». Два різні питання, тому два різні місця на одному екрані.
 */

/**
 * ФІЛЬТРИ СТРІЧКИ (REQ-155 p11).
 *
 * П'ять зрізів замість трьох підвкладок, які були раніше, — і різниця не в
 * кількості. Підвкладка ділила ІСТОРІЮ на три історії; зріз лишає одну й лише
 * ховає зайве, тож час не рветься: перемкнув на «Гроші» — бачиш ті самі дні, ті
 * самі години, тільки без файлів і статусів.
 *
 * Лічильники стоять від УСІХ подій, а не від показаних: інакше «Файли 0» у зрізі
 * «Розмова» читалось би як «файлів немає», хоч вони є.
 */
const FEED_FILTERS: Array<{ key: QuoteFeedKind | "all"; label: string }> = [
  { key: "all", label: "Усе" },
  { key: "talk", label: "Розмова" },
  { key: "money", label: "Гроші" },
  { key: "file", label: "Файли" },
  { key: "event", label: "Події" },
];

function FeedRow({
  event,
  onDownload,
}: {
  event: QuoteFeedEvent;
  onDownload: (file: QuoteAttachment) => void;
}) {
  const Icon = event.icon;
  const isTalk = event.kind === "talk";

  return (
    <div className="flex items-start gap-3 py-3">
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-full border",
          event.accentClass ?? "border-border bg-muted/20 text-muted-foreground"
        )}
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-foreground">{event.actorLabel}</span>
          {/* У репліці підпис «Написав у справі» зайвий: текст нижче і так
              видно. У решті подій підпис — це і є подія. */}
          {isTalk ? null : <span className="text-sm text-muted-foreground">{event.title}</span>}
          <span className="ml-auto shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
            {formatActivityClock(event.createdAt)}
          </span>
        </div>
        {isTalk && event.body ? (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{event.body}</p>
        ) : null}
        {event.to ? (
          /* «Було → стало». Старе значення закреслене й приглушене, нове —
             моношрифтом на підкладці: у стрічці з двадцяти рядків саме нове
             число шукають очима, і воно має чіплятись першим. */
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {event.from ? (
              <span className="text-muted-foreground line-through decoration-border">{event.from}</span>
            ) : null}
            {event.from ? <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden /> : null}
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono font-semibold text-foreground">
              {event.to}
            </span>
          </div>
        ) : null}
        {event.meta ? <p className="mt-0.5 text-xs text-muted-foreground">{event.meta}</p> : null}
        {event.attachment && event.attachment.storageBucket && event.attachment.storagePath ? (
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 h-7 px-2 text-2xs text-muted-foreground"
            onClick={() => onDownload(event.attachment as QuoteAttachment)}
          >
            Завантажити
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FilesRegister({
  files,
  open,
  uploading,
  deletingId,
  canDelete,
  onToggle,
  onAdd,
  onDownload,
  onDelete,
}: {
  files: QuoteAttachment[];
  open: boolean;
  uploading?: boolean;
  deletingId?: string | null;
  canDelete: (file: QuoteAttachment) => boolean;
  onToggle: () => void;
  onAdd: (files: FileList | null) => void;
  onDownload: (file: QuoteAttachment) => void;
  onDelete: (file: QuoteAttachment) => void;
}) {
  const designCount = files.filter((file) => file.audience === "design").length;

  return (
    <div className="rounded-2xl border border-border/50">
      <div className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
        >
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          <span className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
            Файли справи <span className="font-mono tabular-nums text-foreground">{files.length}</span>
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {designCount} для дизайнера · {files.length - designCount} по справі
          </span>
        </button>
        <label
          className={cn(
            "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-2xs font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground",
            uploading && "pointer-events-none opacity-60"
          )}
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
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
      </div>

      {open ? (
        <div className="border-t border-border/40 px-3.5 py-1">
          {files.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Файлів у справі ще немає</p>
          ) : (
            files.map((file) => {
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground" title={displayName}>
                        {displayName}
                      </span>
                      <Badge variant="outline" className="h-5 shrink-0 px-2 text-3xs">
                        {file.audience === "design" ? "для дизайнера" : "по справі"}
                      </Badge>
                    </div>
                    <div className="truncate text-2xs text-muted-foreground">
                      {[file.size, formatActivityDayLabel(file.created_at), file.uploadedByLabel]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  {file.storageBucket && file.storagePath ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 px-2 text-2xs text-muted-foreground"
                      onClick={() => onDownload(file)}
                    >
                      Завантажити
                    </Button>
                  ) : null}
                  {canDelete(file) ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => onDelete(file)}
                      disabled={deletingId === file.id}
                      aria-label={`Видалити ${displayName}`}
                    >
                      {deletingId === file.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

export function QuoteFeed({
  events,
  files,
  loading,
  error,
  filesOpen,
  filesUploading,
  filesDeletingId,
  canDeleteFile,
  onToggleFiles,
  onAddFiles,
  onDownloadFile,
  onDeleteFile,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: {
  events: QuoteFeedEvent[];
  files: QuoteAttachment[];
  loading?: boolean;
  error?: string | null;
  filesOpen: boolean;
  filesUploading?: boolean;
  filesDeletingId?: string | null;
  canDeleteFile: (file: QuoteAttachment) => boolean;
  onToggleFiles: () => void;
  onAddFiles: (files: FileList | null) => void;
  onDownloadFile: (file: QuoteAttachment) => void;
  onDeleteFile: (file: QuoteAttachment) => void;
  /** Журнал вантажиться сторінками; поки не всі — показуємо кнопку. */
  canLoadMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const [filter, setFilter] = useState<QuoteFeedKind | "all">("all");
  const [onlyImportant, setOnlyImportant] = useState(false);

  const counts = new Map<QuoteFeedKind | "all", number>([["all", events.length]]);
  events.forEach((event) => counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1));

  const shown = events.filter(
    (event) => (filter === "all" || event.kind === filter) && (!onlyImportant || event.important)
  );

  const groups: Array<{ label: string; items: QuoteFeedEvent[] }> = [];
  shown.forEach((event) => {
    const label = formatActivityDayLabel(event.createdAt);
    const last = groups[groups.length - 1];
    if (!last || last.label !== label) groups.push({ label, items: [event] });
    else last.items.push(event);
  });

  return (
    <div className="space-y-4">
      <FilesRegister
        files={files}
        open={filesOpen}
        uploading={filesUploading}
        deletingId={filesDeletingId}
        canDelete={canDeleteFile}
        onToggle={onToggleFiles}
        onAdd={onAddFiles}
        onDownload={onDownloadFile}
        onDelete={onDeleteFile}
      />

      <div className="flex flex-wrap items-center gap-2">
        {FEED_FILTERS.map((entry) => {
          const count = counts.get(entry.key) ?? 0;
          const on = filter === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setFilter(entry.key)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/60 text-muted-foreground hover:bg-muted/40"
              )}
            >
              {entry.label}
              {count > 0 ? (
                <span className={cn("font-mono tabular-nums", on ? "opacity-70" : "opacity-60")}>{count}</span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOnlyImportant((value) => !value)}
          className={cn(
            "ml-auto inline-flex h-7 items-center rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
            onlyImportant
              ? "border-foreground bg-foreground text-background"
              : "border-border/60 text-muted-foreground hover:bg-muted/40"
          )}
        >
          лише головне
        </button>
      </div>

      {error ? <div className="text-xs text-destructive">{error}</div> : null}

      {loading ? (
        <div className="py-6 text-center">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Завантаження...</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 py-8 text-center">
          <Clock className="mx-auto mb-2 h-9 w-9 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {events.length === 0
              ? "У справі ще нічого не сталося"
              : onlyImportant
                ? "Серед головного тут порожньо — зніміть фільтр"
                : "У цьому зрізі подій немає"}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-caps text-muted-foreground">
                {group.label}
              </div>
              <div className="divide-y divide-border/40">
                {group.items.map((event) => (
                  <FeedRow key={event.id} event={event} onDownload={onDownloadFile} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {canLoadMore && onLoadMore ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" className="gap-2" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Показати всю історію
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border/40 pt-3 text-2xs text-muted-foreground">
        <span>Писати — у панелі праворуч: тут розмова показана як частина історії</span>
        <span className="ml-auto tabular-nums">
          {shown.length === events.length
            ? `${events.length} подій${canLoadMore ? " показано" : " від створення"}`
            : `${shown.length} з ${events.length} подій`}
        </span>
      </div>
    </div>
  );
}
