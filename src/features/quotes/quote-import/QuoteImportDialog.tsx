import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, ImageOff, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { insertQuoteItemRow, persistQuoteRuns } from "@/features/quotes/quote-details/queries";
import { supabase } from "@/lib/supabaseClient";
import type { QuoteRun } from "@/lib/toshoApi";
import { cn } from "@/lib/utils";
import { pluralWordUk } from "@/lib/lastSeen";

import {
  buildImportItemPayload,
  buildImportRunPayloads,
  toDraftItems,
  type QuoteImportRunDefaults,
} from "./mapping";
import { buildSheetDump } from "./sheetDump";
import { countSettledPreviews, useLinkPreviews } from "./useLinkPreviews";
import {
  QUOTE_IMPORT_ACCEPT,
  QUOTE_IMPORT_MAX_FILE_BYTES,
  isSupportedImportFile,
  readWorkbookSheets,
} from "./readWorkbook";
import type {
  QuoteImportDraftItem,
  QuoteImportFlag,
  QuoteImportLinkPreview,
  QuoteImportParseResponse,
} from "./types";

/**
 * Імпорт позицій прорахунку з ексельки (REQ-233, docs/QUOTE_IMPORT_DESIGN.md).
 *
 * ПРЕВ'Ю — ОБОВ'ЯЗКОВИЙ КРОК, і це не ввічливість. Вхідні дані брудні
 * (діапазони тиражу, альтернативи в сусідніх рядках, назва на три рядки), а
 * тиражі в CRM автозберігаються: мовчазний запис зіпсував би прорахунок
 * швидше, ніж його встигли б відкрити. Тому людина бачить усе, що піде в базу,
 * і знімає зайве галочкою.
 *
 * СОБІВАРТОСТІ ТУТ НЕМАЄ ЖОДНОЇ (REQ-235). Імпорт приносить назву, тираж,
 * коментар і посилання; вартість товару, нанесення й логістику вписує в
 * прорахунку той, чия це справа. Тому в прев'ю немає ні полів ціни, ні питання
 * про ПДВ — питати про суму, якої не буде, означало б тримати кнопку
 * «Створити» заради нічого.
 *
 * Файл читається В БРАУЗЕРІ, на сервер їде текстовий дамп. Запис роблять
 * НАЯВНІ мутації картки під RLS користувача — привілейованих записів тут немає.
 *
 * ДВА РЕЖИМИ. З `quoteId` — імпорт у наявний прорахунок (кнопка в картці).
 * Без нього — вхід тестового візарда (REQ-134): прорахунку ще немає, і його
 * створює `onPrepareQuote` РІВНО в мить натиску «Створити», тобто вже після
 * прев'ю. Порядок тут не деталь: створення до прев'ю лишало б у базі порожній
 * прорахунок щоразу, коли менеджер передумав, — саме та хвороба, від якої
 * візард і йде.
 */

const FLAG_LABELS: Record<QuoteImportFlag, string> = {
  quantity_range: "діапазон → два тиражі",
};

/**
 * Фото товару в рядку прев'ю.
 *
 * ТРИ СТАНИ, І ЖОДЕН ІЗ НИХ НЕ МОВЧИТЬ. Поки їде — пульсує, тобто видно, що
 * воно ще буде. Доїхало — фото. Не вийшло — перекреслена картинка з причиною
 * поруч, бо «сайт не пускає роботів» і «на сторінці немає фото» це різні
 * новини: у першому випадку менеджер відкриє посилання сам, у другому й
 * відкривати нема сенсу.
 */
function ImportItemPhoto({ preview, name }: { preview: QuoteImportLinkPreview | undefined; name: string }) {
  const base = "h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-border/60";

  if (!preview) {
    return (
      <div className={cn(base, "flex items-center justify-center bg-muted/40")} aria-hidden>
        <ImageOff className="h-4 w-4 text-muted-foreground/40" />
      </div>
    );
  }

  if (preview.status === "pending") {
    return <div className={cn(base, "animate-pulse bg-muted/60")} aria-label={`Фото «${name}» ще їде`} />;
  }

  if (preview.status === "done") {
    return (
      <img
        src={preview.imageUrl}
        alt={name}
        loading="lazy"
        className={cn(base, "bg-background object-contain")}
        // Сайт міг віддати адресу, за якою вже нічого немає: тоді замість
        // порваної картинки лишається та сама сіра плитка, що й до доїзду.
        onError={(event) => {
          event.currentTarget.style.visibility = "hidden";
        }}
      />
    );
  }

  return (
    <div
      className={cn(base, "flex items-center justify-center bg-muted/40")}
      title={preview.reason}
      aria-label={`Фото «${name}» не доїхало: ${preview.reason}`}
    >
      <ImageOff className="h-4 w-4 text-muted-foreground/50" />
    </div>
  );
}

type Stage = "pick" | "parsing" | "preview" | "saving";

export function QuoteImportDialog({
  open,
  onOpenChange,
  quoteId,
  teamId,
  nextPosition,
  runDefaults,
  title = "Імпорт позицій з файлу",
  description = "Excel від клієнта → позиції з тиражами. Ціни вписуються вже в прорахунку. Нічого не записується, поки ви не подивитесь прев'ю.",
  header,
  canPick = true,
  pickBlockedHint,
  onPrepareQuote,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Прорахунок, у який імпортуємо. `null` — його ще немає, див. `onPrepareQuote`. */
  quoteId?: string | null;
  teamId: string;
  /** Наступна вільна позиція в прорахунку — щоб імпорт не сів на чужі номери. */
  nextPosition: number;
  runDefaults: QuoteImportRunDefaults;
  /** У візарді це не «імпорт позицій», а створення прорахунку — назва інша. */
  title?: string;
  description?: string;
  /** Шапка майбутнього прорахунку у візарді: замовник, менеджер, дедлайн, валюта. */
  header?: React.ReactNode;
  /** Поки шапка не заповнена, файл брати нема куди. */
  canPick?: boolean;
  pickBlockedHint?: string;
  /** Створити прорахунок і віддати його id. Викликається ПІСЛЯ прев'ю. */
  onPrepareQuote?: () => Promise<string | null>;
  /** `ok` — чи дійшло до кінця. Виклик є і на невдачі: створене вже створене. */
  onImported: (itemIds: string[], quoteId: string, ok: boolean) => void | Promise<void>;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<QuoteImportDraftItem[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { previews, start: startLinkPreviews, reset: resetLinkPreviews } = useLinkPreviews();

  const reset = useCallback(() => {
    setStage("pick");
    setFileName("");
    setError(null);
    setWarnings([]);
    setDrafts([]);
    setSavedCount(0);
    resetLinkPreviews();
  }, [resetLinkPreviews]);

  const selected = useMemo(() => drafts.filter((draft) => draft.selected), [drafts]);
  const photoProgress = useMemo(() => countSettledPreviews(previews), [previews]);

  const patchDraft = (key: string, patch: Partial<QuoteImportDraftItem>) => {
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  };

  const patchRun = (
    itemKey: string,
    runKey: string,
    patch: Partial<QuoteImportDraftItem["runs"][number]>
  ) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.key === itemKey
          ? { ...draft, runs: draft.runs.map((run) => (run.key === runKey ? { ...run, ...patch } : run)) }
          : draft
      )
    );
  };

  const handleFile = async (file: File) => {
    setError(null);
    setWarnings([]);
    if (!isSupportedImportFile(file.name)) {
      setError("Підтримуються лише xlsx, xls, xlsm і csv.");
      return;
    }
    if (file.size > QUOTE_IMPORT_MAX_FILE_BYTES) {
      setError("Файл більший за 12 МБ — це вже не запит клієнта. Заберіть зайві аркуші.");
      return;
    }

    setFileName(file.name);
    setStage("parsing");
    try {
      const sheets = await readWorkbookSheets(file);
      const dump = buildSheetDump(sheets);
      if (dump.rowCount === 0) {
        setError("У файлі немає жодного заповненого рядка.");
        setStage("pick");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Сесія застаріла — перезайдіть у CRM.");

      const response = await fetch("/.netlify/functions/quote-import-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quoteId: quoteId ?? undefined, fileName: file.name, sheetDump: dump.text }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (QuoteImportParseResponse & { error?: string })
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || `Розшифровка не вдалася (${response.status}).`);
      }

      const parsedDrafts = toDraftItems(payload?.items ?? []);
      const parsedWarnings = [...(payload?.warnings ?? [])];
      if (dump.truncated) {
        parsedWarnings.unshift("Файл завеликий — розібрано лише його початок.");
      }
      if (parsedDrafts.length === 0) {
        setError("Модель не знайшла в файлі жодної позиції. Перевірте, чи це справді таблиця запиту.");
        setStage("pick");
        setWarnings(parsedWarnings);
        return;
      }

      setDrafts(parsedDrafts);
      setWarnings(parsedWarnings);
      setStage("preview");
      // Список уже на екрані — фото сідають на свої місця слідом. Await тут
      // немає навмисно: чекати на тридцять магазинів означало б тримати
      // менеджера перед крутилкою заради картинок, які він, може, й не гляне.
      void startLinkPreviews(parsedDrafts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не вдалося прочитати файл.");
      setStage("pick");
    }
  };

  const handleCreate = async () => {
    if (selected.length === 0) return;

    setStage("saving");
    setError(null);

    // Прорахунок з'являється ТУТ — не раніше. До цього рядка людина могла
    // закрити вікно, і в базі не лишилось би нічого.
    let targetQuoteId = quoteId ?? null;
    if (!targetQuoteId) {
      try {
        targetQuoteId = (await onPrepareQuote?.()) ?? null;
      } catch (cause) {
        targetQuoteId = null;
        setError(cause instanceof Error ? cause.message : "Не вдалося створити прорахунок.");
      }
      if (!targetQuoteId) {
        setStage("preview");
        return;
      }
    }

    const importedAt = new Date().toISOString();
    const createdIds: string[] = [];
    const runPayloads: QuoteRun[] = [];

    /**
     * Записати тиражі.
     *
     * Запасного шляху «те саме, але без собівартості» тут більше немає, і це
     * не спрощення заради краси. Тригер прав на поля ціни лається лише на
     * НЕНУЛЬОВЕ значення в чужому полі, а імпорт відтепер шле самі нулі
     * (REQ-235) — тобто відмовити за посадою базі вже нема на що. Раніше цей
     * шлях рятував власника й СЕО, яким собівартість писати не можна; тепер її
     * не пише ніхто, і рятувати нема від чого.
     */
    const saveRuns = (runs: QuoteRun[]) => persistQuoteRuns(targetQuoteId, runs, []);

    /** Позиції створені, тиражі — ні. Кажемо це прямо, а не самою помилкою бази. */
    const failRuns = async (message: string) => {
      setError(
        `Позиції створено (${createdIds.length}), а тиражі до них — ні. ${message.replace(/[.\s]*$/, "")}. Впишіть тиражі руками або приберіть позиції.`
      );
      setStage("preview");
      if (targetQuoteId) await onImported(createdIds, targetQuoteId, false);
    };

    for (const [index, draft] of selected.entries()) {
      const itemId = crypto.randomUUID();
      const payload = buildImportItemPayload({
        draft,
        itemId,
        teamId,
        quoteId: targetQuoteId,
        position: nextPosition + index,
        trace: { fileName, importedAt },
      });
      const inserted = await insertQuoteItemRow(payload);
      if (!inserted.ok) {
        setError(inserted.message);
        setStage("preview");
        if (createdIds.length > 0) await onImported(createdIds, targetQuoteId, false);
        return;
      }
      const rowId = ((inserted.data as { id?: string } | null)?.id ?? itemId) as string;
      createdIds.push(rowId);
      setSavedCount(createdIds.length);
      const runs = buildImportRunPayloads({ draft, quoteId: targetQuoteId, quoteItemId: rowId, defaults: runDefaults });

      // ПЕРША ПОЗИЦІЯ ПИШЕ ТИРАЖІ ОДРАЗУ, решта — гуртом наприкінці.
      //
      // Будь-яка відмова на тиражах (RLS, зникла сесія, блокування картки)
      // прилітала б інакше ПІСЛЯ створення всіх позицій — і в прорахунку
      // лишалось двадцять п'ять товарів без жодного тиражу (побачено живим
      // прогоном 01.09.2026). Тепер найгірше, що буває, — одна зайва позиція.
      if (index === 0) {
        const probe = await saveRuns(runs);
        if (!probe.ok) {
          await failRuns(probe.message);
          return;
        }
        continue;
      }
      runPayloads.push(...runs);
    }

    // Решта — одним записом: двадцять п'ять окремих запитів на кожен клік
    // «Створити» це чверть хвилини очікування без жодної користі.
    if (runPayloads.length > 0) {
      const savedRuns = await saveRuns(runPayloads);
      if (!savedRuns.ok) {
        await failRuns(savedRuns.message);
        return;
      }
    }

    setSavedCount(createdIds.length);
    await startResearch(targetQuoteId, createdIds);
    await onImported(createdIds, targetQuoteId, true);
    const created = `Створено ${createdIds.length} ${pluralWordUk(createdIds.length, "позицію", "позиції", "позицій")}`;
    toast.success(`${created}. Ціни впишіть у прорахунку; картинки й назви доїжджають фоном.`);
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && stage === "saving") return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      {/* Скролиться САМЕ СПИСОК, а не вікно цілком: інакше на двадцяти семи
          позиціях шапка з лічильником і кнопка «Створити» їдуть за край, і щоб
          натиснути її, треба прокрутити весь файл назад (REQ-236). */}
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-4xl" isDirty={stage === "preview"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {stage === "pick" && header ? header : null}

        {stage === "pick" ? (
          <div
            className={cn(
              "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 px-6 py-10 text-center",
              !canPick && "pointer-events-none opacity-50"
            )}
            aria-disabled={!canPick}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!canPick) return;
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
          >
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Перетягніть файл сюди</p>
              <p className="text-sm text-muted-foreground">xlsx, xls, xlsm або csv — до 12 МБ</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={QUOTE_IMPORT_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleFile(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={!canPick}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Обрати файл
            </Button>
          </div>
        ) : null}

        {stage === "pick" && !canPick && pickBlockedHint ? (
          <p className="text-center text-sm text-muted-foreground">{pickBlockedHint}</p>
        ) : null}

        {stage === "parsing" ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
            <div>
              <p className="font-medium">Розшифровую…</p>
              <p className="text-sm text-muted-foreground">{fileName}</p>
            </div>
          </div>
        ) : null}

        {stage === "preview" || stage === "saving" ? (
          <>
            <div className="shrink-0 space-y-2 border-b border-border/60 pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="text-muted-foreground">
                  {fileName} · знайдено {drafts.length}{" "}
                  {pluralWordUk(drafts.length, "позицію", "позиції", "позицій")}, обрано {selected.length}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={stage === "saving"}
                  onClick={() =>
                    setDrafts((prev) => {
                      const allOn = prev.every((draft) => draft.selected);
                      return prev.map((draft) => ({ ...draft, selected: !allOn }));
                    })
                  }
                >
                  {drafts.every((draft) => draft.selected) ? "Зняти всі" : "Обрати всі"}
                </Button>
              </div>

              {/* Смуга доїзду фото. Стоїть у шапці, а не біля позицій, бо
                  відповідає на питання «чи це вже все» — а його ставлять,
                  дивлячись на весь список, а не на окремий рядок. */}
              {photoProgress.total > 0 ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-2xs text-muted-foreground">
                    <span>
                      {photoProgress.settled < photoProgress.total
                        ? `Фото товарів: ${photoProgress.settled} з ${photoProgress.total}`
                        : `Фото знайшлись у ${photoProgress.withPhoto} ${pluralWordUk(photoProgress.withPhoto, "позиції", "позиціях", "позиціях")} з ${photoProgress.total}`}
                    </span>
                    {photoProgress.settled < photoProgress.total ? (
                      <span>можна не чекати — усе інше вже редагується</span>
                    ) : null}
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground/30 transition-[width] duration-500"
                      style={{ width: `${Math.round((photoProgress.settled / photoProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {/* Помилки й попередження їдуть разом зі списком: вони про конкретні
                рядки файлу, і тримати їх перед очима весь скрол не треба. */}
            <div className="-mx-4 flex-1 space-y-3 overflow-y-auto px-4 py-1 sm:-mx-5 sm:px-5">
            {warnings.length > 0 ? (
              <div className="rounded-xl border border-warning-soft-border bg-warning-soft px-3 py-2.5 text-sm text-warning-copy">
                <div className="font-medium">Що не вдалося розібрати</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-2">
              {drafts.map((draft) => (
                <div
                  key={draft.key}
                  className={cn(
                    "rounded-xl border border-border/60 p-3 transition-colors",
                    !draft.selected && "opacity-50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={draft.selected}
                      disabled={stage === "saving"}
                      aria-label={`Імпортувати «${draft.name}»`}
                      onCheckedChange={(checked) => patchDraft(draft.key, { selected: checked === true })}
                      className="mt-1.5"
                    />
                    <ImportItemPhoto preview={previews[draft.key]} name={draft.name} />
                    <div className="min-w-0 flex-1 space-y-2">
                      {/* Назва й тираж — в одному рядку: тираж це коротке число,
                          а власний рядок під нього коштував би на двадцяти семи
                          позиціях цілого екрана прокрутки. */}
                      <div className="flex flex-wrap items-start gap-2">
                        <Input
                          value={draft.name}
                          disabled={stage === "saving"}
                          aria-label="Назва позиції"
                          className="min-w-[12rem] flex-1"
                          onChange={(event) => patchDraft(draft.key, { name: event.target.value })}
                        />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Тираж</span>
                          {draft.runs.map((run) => (
                            <NumberInput
                              key={run.key}
                              value={run.quantity}
                              min={1}
                              emptyValue={1}
                              className="w-24"
                              disabled={stage === "saving"}
                              aria-label="Кількість тиражу"
                              onValueChange={(next) => patchRun(draft.key, run.key, { quantity: Math.max(1, next ?? 1) })}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-2xs">
                        {draft.sourceRows.length > 0 ? (
                          <span className="rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground">
                            рядок {draft.sourceRows.join(", ")}
                          </span>
                        ) : null}
                        {/* Зв'язок варіантів — словами. Бедж «альтернатива» казав,
                            що щось не так, але не казав що саме: під номером 30 у
                            файлі лежать два різних дзен-сади, і це вибір із двох,
                            а не два товари в замовлення. */}
                        {draft.variant ? (
                          <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 font-medium text-muted-foreground">
                            варіант {draft.variant.index} з {draft.variant.total} того самого товару
                          </span>
                        ) : null}
                        {draft.flags.map((flag) => (
                          <span
                            key={flag}
                            className="rounded-full border border-warning-soft-border bg-warning-soft px-2 py-0.5 font-medium text-warning-copy"
                          >
                            {FLAG_LABELS[flag] ?? flag}
                          </span>
                        ))}
                        {draft.links.map((link) => (
                          <a
                            key={link}
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="max-w-[220px] truncate rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground underline underline-offset-2"
                          >
                            {link.replace(/^https?:\/\//, "")}
                          </a>
                        ))}
                        {/* Причина відсутнього фото стоїть саме тут, поруч із
                            посиланням: «сайт не пускає роботів» — це підказка
                            відкрити його руками, а не повідомлення про поломку. */}
                        {(() => {
                          const preview = previews[draft.key];
                          if (!preview || preview.status === "pending" || preview.status === "done") return null;
                          return <span className="text-muted-foreground/70">{preview.reason}</span>;
                        })()}
                      </div>

                      {draft.comment || draft.notes ? (
                        <Input
                          value={draft.comment}
                          disabled={stage === "saving"}
                          aria-label="Коментар замовника"
                          placeholder={draft.notes ?? "Коментар замовника"}
                          onChange={(event) => patchDraft(draft.key, { comment: event.target.value })}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </div>
          </>
        ) : null}

        {stage === "preview" || stage === "saving" ? (
          <DialogFooter className="shrink-0 gap-2 border-t border-border/60 pt-3">
            <Button type="button" variant="ghost" disabled={stage === "saving"} onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button
              type="button"
              disabled={stage === "saving" || selected.length === 0}
              onClick={() => void handleCreate()}
              className="gap-2"
            >
              {stage === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {stage === "saving"
                ? `Створюю… ${savedCount}/${selected.length}`
                : `Створити ${selected.length} ${pluralWordUk(selected.length, "позицію", "позиції", "позицій")}`}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Фонове дослідження лінків. Помилка тут нічого не скасовує: позиції вже
 * створені, а картинка з назвою — приємний додаток, без якого прорахунок
 * робиться так само.
 */
async function startResearch(quoteId: string, itemIds: string[]) {
  if (itemIds.length === 0) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    await fetch("/.netlify/functions/quote-import-research-background", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quoteId, itemIds }),
    });
  } catch {
    // Мовчки: користувач про цей запит не просив, і сказати йому нічого.
  }
}
