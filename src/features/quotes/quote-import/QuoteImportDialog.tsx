import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { pluralWordUk } from "@/lib/lastSeen";

import { ImportDraftRow } from "./ImportDraftRow";
import { parseImportFile, startImportResearch, writeDraftsToQuote } from "./importFlow";
import type { QuoteImportRunDefaults } from "./mapping";
import { countSettledPreviews, useLinkPreviews } from "./useLinkPreviews";
import { QUOTE_IMPORT_ACCEPT } from "./readWorkbook";
import type { QuoteImportDraftItem } from "./types";

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
 * «з ПДВ чи без»: нема числа — нема й питання.
 *
 * ЗАПИС ІДЕ З БРАУЗЕРА, а не з функції: `insertQuoteItemRow` і `persistQuoteRuns` —
 * НАЯВНІ мутації картки під RLS користувача — привілейованих записів тут немає.
 * Сам розбір файлу й порядок запису живуть в `importFlow.ts` — спільно з
 * візардом (REQ-237), де ексель — одне з трьох джерел позицій.
 *
 * ДВА РЕЖИМИ. З `quoteId` — імпорт у наявний прорахунок (кнопка в картці).
 * Без нього — вхід тестового візарда (REQ-134): прорахунку ще немає, і його
 * створює `onPrepareQuote` РІВНО в мить натиску «Створити», тобто вже після
 * прев'ю. Порядок тут не деталь: створення до прев'ю лишало б у базі порожній
 * прорахунок щоразу, коли менеджер передумав, — саме та хвороба, від якої
 * візард і йде.
 */

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
    setFileName(file.name);
    setStage("parsing");

    const outcome = await parseImportFile(file, { quoteId });
    if (!outcome.ok) {
      setError(outcome.error);
      setWarnings(outcome.warnings);
      setStage("pick");
      return;
    }

    setDrafts(outcome.drafts);
    setWarnings(outcome.warnings);
    setStage("preview");
    // Список уже на екрані — фото сідають на свої місця слідом. Await тут
    // немає навмисно: чекати на тридцять магазинів означало б тримати
    // менеджера перед крутилкою заради картинок, які він, може, й не гляне.
    void startLinkPreviews(outcome.drafts);
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

    // Артикул зі сторінки постачальника (REQ-247). Тут він живе збоку від
    // чернетки — у відповіді розвідки, — тож зводимо їх саме перед записом:
    // інакше артикул чекав би фонової розвідки й з'являвся в картці з
    // запізненням, хоч у вікні його вже видно.
    const withSku = selected.map((draft) => {
      if (draft.sku) return draft;
      const preview = previews[draft.key];
      const sku = preview && preview.status !== "pending" ? preview.sku ?? null : null;
      return sku ? { ...draft, sku } : draft;
    });

    const written = await writeDraftsToQuote({
      drafts: withSku,
      quoteId: targetQuoteId,
      teamId,
      nextPosition,
      runDefaults,
      trace: { fileName, importedAt: new Date().toISOString() },
      onSaved: setSavedCount,
    });

    if (!written.ok) {
      setError(written.error);
      setStage("preview");
      if (written.itemIds.length > 0) await onImported(written.itemIds, targetQuoteId, false);
      return;
    }

    setSavedCount(written.itemIds.length);
    await startImportResearch(targetQuoteId, written.itemIds);
    await onImported(written.itemIds, targetQuoteId, true);
    const created = `Створено ${written.itemIds.length} ${pluralWordUk(written.itemIds.length, "позицію", "позиції", "позицій")}`;
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
                  <ImportDraftRow
                    key={draft.key}
                    draft={draft}
                    preview={previews[draft.key]}
                    disabled={stage === "saving"}
                    onPatch={(patch) => patchDraft(draft.key, patch)}
                    onPatchRun={(runKey, patch) => patchRun(draft.key, runKey, patch)}
                  />
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
