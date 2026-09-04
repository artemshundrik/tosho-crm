import * as React from "react";
import { AlertTriangle, ArrowRight, Check, FileSpreadsheet, Info, Loader2, Upload } from "lucide-react";
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
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { ImportDraftRow } from "@/features/quotes/quote-import/ImportDraftRow";
import {
  parseImportFile,
  startImportResearch,
  writeDraftsToQuote,
  type ImportParseStep,
} from "@/features/quotes/quote-import/importFlow";
import type { QuoteImportRunDefaults } from "@/features/quotes/quote-import/mapping";
import { QUOTE_IMPORT_ACCEPT } from "@/features/quotes/quote-import/readWorkbook";
import type { QuoteImportDraftItem, QuoteImportLinkPreview } from "@/features/quotes/quote-import/types";
import { countSettledPreviews, fetchLinkPreview, useLinkPreviews } from "@/features/quotes/quote-import/useLinkPreviews";
import { pluralWordUk } from "@/lib/lastSeen";
import { cn } from "@/lib/utils";

import type { CatalogSuggestion } from "./catalogSuggestions";
import { QuoteItemCommandField } from "./QuoteItemCommandField";
import { QUOTE_KINDS, type QuoteKindValue } from "./quoteWizardKinds";
import { useCatalogSuggestions } from "./useCatalogSuggestions";
import { useKindMethods } from "./useKindMethods";

/**
 * Вікно «Новий прорахунок» на один екран (REQ-237, обраний концепт із трьох).
 *
 * ЩО ТУТ ОДНЕ. Замовник, тип виробу і поле позиції — те, що менеджер знає ще
 * до відкриття вікна, тож воно стоїть поруч без кроків «далі». Джерела
 * позицій більше не перемикаються вкладками (REQ-182#p14): одне поле саме
 * розуміє, посилання це чи назва, — адресу читає розвідка сторінки, назву
 * шукає в каталозі з підказками, а «додати як нову позицію» лишається
 * останнім рядком підказок, коли в базі такого немає. Ексель — окрема вузька
 * плитка під списком: файл не набирають, його кидають.
 *
 * ЩО СПІЛЬНЕ. Усі джерела зводяться до одного списку чернеток
 * (`QuoteImportDraftItem`), того самого, що в імпорті, і живуть у ньому
 * ВПЕРЕМІШ: поруч із рядками файлу стоять товари за посиланням і з каталогу.
 * Далі все однакове: той самий рядок прев'ю, той самий запис у базу
 * (`writeDraftsToQuote`), той самий момент створення.
 *
 * КОЛИ З'ЯВЛЯЄТЬСЯ ПРОРАХУНОК. Рівно на натиску «Створити» — `onPrepareQuote`
 * кличеться після того, як людина побачила чернетки. Передумати на будь-якому
 * етапі до того нічого не коштує: закрите вікно не лишає в базі нічого.
 */

type Stage = "compose" | "parsing" | "saving";

function makeDraft(partial: Partial<QuoteImportDraftItem> = {}): QuoteImportDraftItem {
  const key = crypto.randomUUID();
  return {
    key,
    selected: true,
    name: "",
    comment: "",
    links: [],
    /*
      ТИРАЖ ПОРОЖНІЙ, А НЕ 100. Підставлене число виглядає як відповідь: воно
      стоїть у полі, і його легко лишити чужим. Тираж знає лише клієнт, тож
      поле питає, а «Створити» не вмикається, поки на нього не відповіли.
    */
    runs: [{ key: `${key}-0`, quantity: 0 }],
    flags: [],
    sourceRows: [],
    notes: null,
    variant: null,
    catalog: null,
    methodIds: [],
    ...partial,
  };
}

/** Рядок із файлу — у нього є номери рядків; решта прийшла полем. */
const isFileDraft = (draft: QuoteImportDraftItem) => draft.sourceRows.length > 0;

/**
 * Фото позиції з каталогу — тим самим станом, що й фото з сайту: рядок прев'ю
 * не розрізняє, звідки картинка, і не мусить.
 */
function catalogPreview(draft: QuoteImportDraftItem): QuoteImportLinkPreview | undefined {
  if (!draft.catalog?.imageUrl) return undefined;
  return { status: "done", imageUrl: draft.catalog.imageUrl, title: draft.name };
}

export function QuoteWizardDialog({
  open,
  onOpenChange,
  teamId,
  header,
  headerIssue,
  runDefaultsFor,
  onPrepareQuote,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  /**
   * Шапка майбутнього прорахунку: замовник, менеджер, дедлайн, валюта.
   * Функція, а не вузол, бо вікно має чим показати, ЯКОГО поля бракує:
   * лічильник зростає на натиску «Створити» без замовника.
   */
  header: (nudgeSignal: number) => React.ReactNode;
  /** Чого бракує в шапці, щоб створювати. Порожньо — можна. */
  headerIssue: string | null;
  runDefaultsFor: (kind: QuoteKindValue) => QuoteImportRunDefaults;
  /** Створити прорахунок і віддати його id. Кличеться ПІСЛЯ прев'ю. */
  onPrepareQuote: (kind: QuoteKindValue) => Promise<string | null>;
  onCreated: (quoteId: string) => void;
}) {
  const [kind, setKind] = React.useState<QuoteKindValue>("merch");
  const [stage, setStage] = React.useState<Stage>("compose");
  const [drafts, setDrafts] = React.useState<QuoteImportDraftItem[]>([]);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [parseStep, setParseStep] = React.useState<ImportParseStep>("read");
  const [savedCount, setSavedCount] = React.useState(0);
  const [fieldValue, setFieldValue] = React.useState("");
  const [linkBusy, setLinkBusy] = React.useState(false);
  /** Скільки разів людина натиснула «Створити», а шапка була неповна. */
  const [headerNudge, setHeaderNudge] = React.useState(0);
  /** Фото й назви для позицій «за посиланням»: черга імпорту сюди не заходить. */
  const [linkPreviews, setLinkPreviews] = React.useState<Record<string, QuoteImportLinkPreview>>({});
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const { previews, start: startLinkPreviews, reset: resetLinkPreviews } = useLinkPreviews();
  const catalog = useCatalogSuggestions(teamId, open);
  const draftKindIds = React.useMemo(
    () => drafts.map((draft) => draft.catalog?.kindId).filter((id): id is string => Boolean(id)),
    [drafts]
  );
  const kindMethods = useKindMethods(teamId, draftKindIds);

  const reset = React.useCallback(() => {
    setKind("merch");
    setStage("compose");
    setDrafts([]);
    setWarnings([]);
    setError(null);
    setFileName("");
    setSavedCount(0);
    setFieldValue("");
    setLinkBusy(false);
    setHeaderNudge(0);
    setLinkPreviews({});
    resetLinkPreviews();
    kindMethods.reset();
  }, [kindMethods.reset, resetLinkPreviews]);

  const selected = React.useMemo(() => drafts.filter((draft) => draft.selected), [drafts]);
  const fileDrafts = React.useMemo(() => drafts.filter(isFileDraft), [drafts]);
  const nameless = React.useMemo(() => selected.filter((draft) => !draft.name.trim()).length, [selected]);
  const runless = React.useMemo(
    () => selected.filter((draft) => !draft.runs.some((run) => run.quantity > 0)).length,
    [selected]
  );
  const photoProgress = React.useMemo(() => countSettledPreviews(previews), [previews]);
  /**
   * Кнопка активна, щойно є хоч одна позиція, — навіть коли шапка неповна.
   * Вимкнена кнопка мовчить: людина тисне, нічого не стається, і причину треба
   * шукати очима внизу. Натомість натиск показує, ЧОГО бракує: хитає поле
   * замовника або називає позицію без тиражу.
   */
  const canSubmit = stage === "compose" && selected.length > 0;

  const patchDraft = (key: string, patch: Partial<QuoteImportDraftItem>) => {
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  };
  const patchRun = (itemKey: string, runKey: string, patch: Partial<QuoteImportDraftItem["runs"][number]>) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.key === itemKey
          ? { ...draft, runs: draft.runs.map((run) => (run.key === runKey ? { ...run, ...patch } : run)) }
          : draft
      )
    );
  };
  const removeDraft = (key: string) => setDrafts((prev) => prev.filter((draft) => draft.key !== key));
  /** `null` — «Без нанесення»: стирає всі методи; id — вмикає або вимикає один. */
  const toggleMethod = (key: string, methodId: string | null) =>
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.key !== key) return draft;
        if (methodId === null) return { ...draft, methodIds: [] };
        return {
          ...draft,
          methodIds: draft.methodIds.includes(methodId)
            ? draft.methodIds.filter((id) => id !== methodId)
            : [...draft.methodIds, methodId],
        };
      })
    );
  /** Тиражі взаємовиключні: це не «ще стільки», а «а скільки буде, якщо стільки». */
  const addRun = (key: string) =>
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.key === key
          ? { ...draft, runs: [...draft.runs, { key: `${key}-${draft.runs.length}`, quantity: 0 }] }
          : draft
      )
    );
  const removeRun = (key: string, runKey: string) =>
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.key === key && draft.runs.length > 1
          ? { ...draft, runs: draft.runs.filter((run) => run.key !== runKey) }
          : draft
      )
    );

  /**
   * «Інший файл» прибирає ЛИШЕ рядки файлу: товари за посиланням і з
   * каталогу, що стоять поруч, людина додавала окремо, і файл до них не має
   * стосунку.
   */
  const clearFile = React.useCallback(() => {
    setDrafts((prev) => prev.filter((draft) => !isFileDraft(draft)));
    setWarnings([]);
    setFileName("");
    resetLinkPreviews();
  }, [resetLinkPreviews]);

  const handleFile = async (file: File) => {
    setError(null);
    setWarnings([]);
    setFileName(file.name);
    setParseStep("read");
    setStage("parsing");

    const outcome = await parseImportFile(file, { onStep: setParseStep });
    setStage("compose");
    if (!outcome.ok) {
      setError(outcome.error);
      setWarnings(outcome.warnings);
      return;
    }
    // Файл один: новий заміняє рядки попереднього, а позиції з поля лишаються.
    setDrafts((prev) => [...prev.filter((draft) => !isFileDraft(draft)), ...outcome.drafts]);
    setWarnings(outcome.warnings);
    void startLinkPreviews(outcome.drafts);
  };

  /**
   * Позиція з каталогу: назва, фото і `catalog_*_id` уже відомі — лишається
   * тираж. Перемикач «Рахуємо» іде за ПЕРШИМ товаром: тип каталогу знає, чи
   * це поліграфія, а людина ще ні на що не відповідала. Далі перемикач її —
   * змішаний прорахунок буває, і вгадувати за другим товаром було б свавіллям.
   */
  const handlePickCatalog = (suggestion: CatalogSuggestion) => {
    setError(null);
    if (drafts.length === 0 && suggestion.quoteType) {
      setKind(suggestion.quoteType === "print" ? "print" : "merch");
    }
    setDrafts((prev) => [
      ...prev,
      makeDraft({
        name: suggestion.name,
        catalog: {
          modelId: suggestion.modelId,
          kindId: suggestion.kindId,
          typeId: suggestion.typeId,
          kindName: suggestion.kindName,
          typeName: suggestion.typeName,
          imageUrl: suggestion.imageUrl,
        },
      }),
    ]);
  };

  /** Назви в базі немає — позиція без каталогу, як колишнє «руками». */
  const handleAddName = (name: string) => {
    setError(null);
    setDrafts((prev) => [...prev, makeDraft({ name })]);
  };

  /**
   * Розвідка посилань: назва, опис і фото зі сторінки товару.
   *
   * ПОЗИЦІЯ З'ЯВЛЯЄТЬСЯ ОДРАЗУ, ще до відповіді сайту, і доповнюється, коли
   * та прийде. Спершу було навпаки: поле блокувалось, і людина чекала кілька
   * секунд, перш ніж побачити бодай щось. Прорахунок на пʼять товарів давав
   * пʼять таких пауз підряд.
   *
   * КІЛЬКА ПОСИЛАНЬ ЗА РАЗ. Приймається і список — з переносами рядка або
   * пробілами: менеджери копіюють їх пачкою з листа чи чату. Ходимо по трьох
   * сайтах заразом, решта чекає в черзі; більше не дає виграшу, бо магазини
   * відповідають від пів секунди до восьми.
   *
   * ПОЗИЦІЯ ЛИШАЄТЬСЯ, НАВІТЬ КОЛИ САЙТ НЕ ПУСТИВ: посилання — уже цінність,
   * а назву менеджер допише сам. Причина стоїть поруч із фото, як в імпорті.
   */
  const handleLinks = async (urls: string[]) => {
    if (urls.length === 0) return;
    setError(null);

    const fresh = urls.map((url) => ({ url, draft: makeDraft({ links: [url] }) }));
    setDrafts((prev) => [...prev, ...fresh.map((entry) => entry.draft)]);
    setLinkPreviews((prev) => ({
      ...prev,
      ...Object.fromEntries(fresh.map((entry) => [entry.draft.key, { status: "pending" as const }])),
    }));

    setLinkBusy(true);
    let cursor = 0;
    const worker = async () => {
      while (cursor < fresh.length) {
        const entry = fresh[cursor];
        cursor += 1;
        const preview = await fetchLinkPreview(entry.url);
        const title = preview.status === "pending" ? null : preview.title ?? null;
        setLinkPreviews((prev) => ({ ...prev, [entry.draft.key]: preview }));
        // Беремо ЛИШЕ назву й фото. Опис зі сторінки не тягнемо: у магазинів
        // це рекламний абзац («замовляйте оптом для брендування»), який у
        // прорахунку не значить нічого, а місце в рядку займає.
        // Правки менеджера не затираємо: він міг почати вписувати назву, поки
        // сайт думав, тому назва лягає лише в порожнє поле.
        setDrafts((prev) =>
          prev.map((draft) =>
            draft.key === entry.draft.key ? { ...draft, name: draft.name || title || "" } : draft
          )
        );
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, fresh.length) }, worker));
    setLinkBusy(false);
  };

  const handleCreate = async () => {
    if (!canSubmit) return;
    if (headerIssue) {
      setHeaderNudge((count) => count + 1);
      return;
    }
    if (runless > 0 || nameless > 0) {
      setError(
        runless > 0
          ? "Впишіть тираж — без нього позицію нема з чого рахувати."
          : "Впишіть назву позиції: сайт її не віддав."
      );
      return;
    }
    setStage("saving");
    setError(null);

    let quoteId: string | null = null;
    try {
      quoteId = await onPrepareQuote(kind);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не вдалося створити прорахунок.");
    }
    if (!quoteId) {
      setStage("compose");
      return;
    }

    // Слід джерела — на кожній позиції окремо (`describeDraftOrigin`): у
    // списку впереміш файл, посилання й каталог, і один підпис на всіх брехав би.
    const written = await writeDraftsToQuote({
      drafts: selected,
      quoteId,
      teamId,
      nextPosition: 1,
      runDefaults: runDefaultsFor(kind),
      trace: { fileName, importedAt: new Date().toISOString() },
      onSaved: setSavedCount,
    });

    if (!written.ok) {
      // Прорахунок уже є, і частина позицій у ньому теж: людині треба туди,
      // а не в порожнє вікно, — але спершу побачити, ЩО не записалось.
      setError(written.error);
      setStage("compose");
      if (written.itemIds.length > 0) onCreated(quoteId);
      return;
    }

    await startImportResearch(quoteId, written.itemIds);
    const created = `Створено прорахунок з ${written.itemIds.length} ${pluralWordUk(written.itemIds.length, "позицією", "позиціями", "позиціями")}`;
    // Дизайн-задачі візард не заводить НАВМИСНО: тип задачі обовʼязковий у всіх
    // шляхах створення, а в мить «кинув посилання» менеджер ще не знає, що саме
    // малювати. Плюс тираж задача бачить лише через позицію прорахунку, тобто
    // позиції мають існувати раніше. Тому — вкладка «Дизайн» уже в картці.
    toast.success(`${created}. Ціни впишіть у картці, дизайн-задачі — у вкладці «Дизайн».`);
    onCreated(quoteId);
    onOpenChange(false);
    reset();
  };

  const busy = stage !== "compose";
  const hasContent = drafts.some((draft) => draft.name.trim() || draft.links.length > 0) || fieldValue.trim().length > 0;

  // Підвал каже, ЧОМУ кнопка вимкнена. Мовчазна сіра кнопка читається як
  // поломка, а не як «дозаповніть шапку».
  const footerIssue = headerIssue;
  const footerMeta = (() => {
    if (footerIssue) return footerIssue;
    // Поки помилка вгорі не піднята, підвал підказує наперед. Коли піднята —
    // мовчить: та сама фраза двічі на одному екрані читається як збій.
    if (!error && runless > 0)
      return `Впишіть тираж: без нього позицію нема з чого рахувати (${runless} із ${selected.length}).`;
    if (!error && nameless > 0) return "Впишіть назву позиції — сайт її не віддав.";
    if (drafts.length > 0)
      return `Прорахунок з’явиться в базі лише після «Створити» · ${selected.length} із ${drafts.length} ${pluralWordUk(drafts.length, "позиції", "позицій", "позицій")}`;
    return "Нічого не записується, поки ви не натиснете «Створити».";
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-3xl" isDirty={hasContent}>
        <DialogHeader>
          <DialogTitle>Новий прорахунок</DialogTitle>
          <DialogDescription>Один екран: що рахуємо, для кого і звідки беруться позиції.</DialogDescription>
        </DialogHeader>

        {/*
          Мінімальна висота — щоб вікно не стрибало. Порожній стан низький,
          розібраний файл високий, і без цієї стелі знизу перехід читався як
          ривок. Висоту НЕ анімуємо: анімація висоти вікна смикається, а
          прибиті шапка з підвалом і прокрутка всередині дають те саме
          відчуття сталості дешевше.
        */}
        <div className="-mx-4 min-h-[19rem] flex-1 space-y-4 overflow-y-auto px-4 py-1 sm:-mx-5 sm:px-5">
          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {header(headerNudge)}

          {/*
            «РАХУЄМО» — ОДНИМ РЯДКОМ, ПОЛЕ — ПІД НИМ (REQ-182#p14).

            Було два сегментовані перемикачі поруч: тип виробу і джерело
            позицій. Другого більше немає — його роботу робить саме поле, а
            перемикач типу лишився канонічним, тим самим, що в тулбарі
            сторінок. Підпис секції не потрібен: «Поліграфія · Товар» каже
            це сам.
          */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-xs text-muted-foreground">Рахуємо</span>
            <SegmentedGroup className={SEGMENTED_GROUP_SM} role="radiogroup" aria-label="Тип виробу">
              {QUOTE_KINDS.map((option) => {
                const Icon = option.icon;
                return (
                  <Button
                    key={option.value}
                    variant="segmented"
                    size="xs"
                    role="radio"
                    aria-pressed={kind === option.value}
                    aria-checked={kind === option.value}
                    disabled={busy}
                    title={option.hint}
                    onClick={() => setKind(option.value)}
                    className={SEGMENTED_TRIGGER_SM}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {option.label}
                  </Button>
                );
              })}
            </SegmentedGroup>
          </div>

          <QuoteItemCommandField
            value={fieldValue}
            onValueChange={setFieldValue}
            suggestions={catalog.suggestions}
            suggestionsLoading={catalog.loading}
            disabled={busy}
            busy={linkBusy}
            hasDrafts={drafts.length > 0}
            onPickCatalog={handlePickCatalog}
            onAddLinks={(urls) => void handleLinks(urls)}
            onAddName={handleAddName}
            onInvalid={setError}
          />

          {drafts.length > 0 ? (
            <section className="space-y-3">
              {/*
                КАРТКА ФАЙЛУ. Була пігулка з повною назвою файлу в ряду інших
                пігулок, а кнопка «Інший файл» висіла окремим рядком над
                числом — саме вона й давала той дивний відступ. Тепер це одна
                картка: піктограма, назва в один рядок, під нею факти розбору,
                і дія при самому файлі.
              */}
              {fileName && fileDrafts.length > 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/25 p-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground ring-1 ring-border/60">
                    <FileSpreadsheet className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" title={fileName}>
                      {fileName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[
                        `знайдено ${fileDrafts.length} ${pluralWordUk(fileDrafts.length, "позицію", "позиції", "позицій")}`,
                        photoProgress.total > 0
                          ? photoProgress.settled < photoProgress.total
                            ? `фото: ${photoProgress.settled} з ${photoProgress.total}`
                            : `фото у ${photoProgress.withPhoto} з ${photoProgress.total}`
                          : null,
                        drafts.some((draft) => draft.variant) ? "є варіанти одного товару" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={clearFile}>
                    Інший файл
                  </Button>
                </div>
              ) : null}

              {/*
                ПРОПУЩЕНІ РЯДКИ. Була бурштинова плита з маркованим списком —
                найважчий елемент вікна заради новини, яка нічого не вимагає.
                Тепер це тиха картка тієї ж родини, що й картка файлу, а
                заголовком стоїть ЧИСЛО: «4 рядки не стали позиціями» каже те
                саме, що «Що не вдалося розібрати», але одразу з масштабом.
                Жовтий лишається за тим, що потребує дії.
              */}
              {warnings.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border/60">
                  <div className="flex items-center gap-2.5 border-b border-border/60 bg-muted/25 px-3 py-2">
                    <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {warnings.length} {pluralWordUk(warnings.length, "рядок", "рядки", "рядків")} з файлу не{" "}
                      {warnings.length === 1 ? "став позицією" : "стали позиціями"}
                    </span>
                  </div>
                  <ul className="divide-y divide-border/60">
                    {warnings.map((warning) => (
                      <li key={warning} className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex items-end gap-2.5 pt-1">
                <span className="font-mono text-2xl font-semibold leading-none tabular-nums">{selected.length}</span>
                <span className="pb-0.5 text-xs text-muted-foreground">
                  {pluralWordUk(selected.length, "позиція", "позиції", "позицій")} до прорахунку
                </span>
                {/* Галочки є лише в рядків файлу, тож і «обрати всі» — про них. */}
                {fileDrafts.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="ml-auto"
                    onClick={() =>
                      setDrafts((prev) => {
                        const allOn = prev.filter(isFileDraft).every((draft) => draft.selected);
                        return prev.map((draft) => (isFileDraft(draft) ? { ...draft, selected: !allOn } : draft));
                      })
                    }
                  >
                    {fileDrafts.every((draft) => draft.selected) ? "Зняти всі" : "Обрати всі"}
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2">
                {drafts.map((draft) => (
                  <ImportDraftRow
                    key={draft.key}
                    draft={draft}
                    preview={previews[draft.key] ?? linkPreviews[draft.key] ?? catalogPreview(draft)}
                    disabled={busy}
                    onPatch={(patch) => patchDraft(draft.key, patch)}
                    onPatchRun={(runKey, patch) => patchRun(draft.key, runKey, patch)}
                    // Рядок файлу ЗНІМАЮТЬ галочкою (щоб було видно, що він там
                    // був), а доданий полем — просто прибирають.
                    onRemove={isFileDraft(draft) ? undefined : () => removeDraft(draft.key)}
                    methodOptions={draft.catalog ? kindMethods.byKind[draft.catalog.kindId] : undefined}
                    onToggleMethod={draft.catalog ? (methodId) => toggleMethod(draft.key, methodId) : undefined}
                    onAddRun={() => addRun(draft.key)}
                    onRemoveRun={(runKey) => removeRun(draft.key, runKey)}
                  />
                ))}
              </div>

            </section>
          ) : null}

          {/*
            ЕКСЕЛЬ — ПЛИТКОЮ ПІД СПИСКОМ, а не вкладкою. Файл не набирають у
            поле, його кидають, тож йому місце окремо; вузька плитка, бо це
            другий шлях, а не головний: за сім місяців із ексельки прийшло
            менше позицій, ніж за посиланнями за місяць.
          */}
          <ExcelPanel
            stage={stage}
            parseStep={parseStep}
            fileName={fileName}
            hasFileDrafts={fileDrafts.length > 0}
            inputRef={fileInputRef}
            onFile={(file) => void handleFile(file)}
          />
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 pt-3 sm:justify-between">
          {/*
            Причина — звичайним приглушеним кольором. Спершу тут стояв
            `text-warning-copy`: він заведений для тексту ПОВЕРХ бурштинової
            плашки, а на білій картці дає каламутно-коричневий у світлій темі
            й вицвілий бежевий у темній. Тінтовий колір працює лише на своєму
            тінті.
          */}
          <span className="text-xs text-muted-foreground">{footerMeta}</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={() => void handleCreate()} className="gap-2">
              {stage === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {stage === "saving" ? `Створюю… ${savedCount}/${selected.length}` : "Створити прорахунок"}
              {stage === "saving" ? null : <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Панель ексельки: дропзона → стадії розбору → (список чернеток малює батько).
 *
 * Стадії — словами, а не крутилкою: «читаю файл» триває частку секунди,
 * «розбираю моделлю» — до пів хвилини, і людині важливо бачити, що вікно не
 * зависло, а чекає на відповідь.
 */
function ExcelPanel({
  stage,
  parseStep,
  fileName,
  hasFileDrafts,
  inputRef,
  onFile,
}: {
  stage: Stage;
  parseStep: ImportParseStep;
  fileName: string;
  hasFileDrafts: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}) {
  const [over, setOver] = React.useState(false);

  if (stage === "parsing") {
    const steps: Array<{ key: ImportParseStep | "preview"; label: string }> = [
      { key: "read", label: "Читаю аркуші файлу" },
      { key: "model", label: "Знаходжу позиції, тиражі й варіанти" },
      { key: "preview", label: "Збираю прев'ю — нічого ще не збережено" },
    ];
    const order = ["read", "model", "preview"];
    const current = order.indexOf(parseStep);
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-muted-foreground">
            <FileSpreadsheet className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{fileName}</div>
            <div className="text-2xs text-muted-foreground">розбираю моделлю</div>
          </div>
        </div>
        <ol className="divide-y divide-border/60 rounded-xl border border-border/60">
          {steps.map((step, index) => {
            const done = index < current;
            const running = index === current;
            return (
              <li
                key={step.key}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-sm",
                  done ? "text-foreground/70" : running ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                    done && "border-foreground bg-foreground text-background",
                    running && "border-foreground border-t-transparent animate-spin",
                    !done && !running && "border-border"
                  )}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                {step.label}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // Файл розібрано — дропзони більше немає: її місце займає картка файлу в
  // підсумку, і кнопка «Інший файл» стоїть саме там, при самому файлі.
  if (hasFileDrafts) return null;

  return (
    <div className="space-y-2">
      {/*
        ФАЙЛ БЕРЕТЬСЯ ДО ЗАМОВНИКА. Спершу дропзона була закрита, поки шапка
        порожня («позиції з файлу лягають у ЙОГО прорахунок»), — і клік по ній
        не робив нічого. Але прорахунок з'являється лише на «Створити», тож
        розібрати файл раніше нічим не шкодить: менеджер бачить, що приїхало,
        і дозаповнює шапку, дивлячись на позиції. Замовника вимагає САМЕ
        створення, і підвал каже про це словами.

        ВУЗЬКА, В ОДИН РЯДОК (REQ-182#p14): велика плита з піктограмою по
        центру була доречна, поки файл був цілою вкладкою. Тепер він стоїть
        під полем і списком, і плита на 150 px читалась би як головний вхід.
      */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Обрати файл Excel"
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-left transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
          "hover:border-foreground/40 hover:bg-muted/50",
          over && "border-foreground/60 bg-muted"
        )}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          const file = event.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Upload className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Або ексельку від клієнта — перетягніть чи клацніть</span>
          <span className="block truncate text-xs text-muted-foreground">
            Як є, з об’єднаними клітинками й кількома аркушами: модель сама знайде позиції, тиражі й варіанти
          </span>
        </span>
        <span className="hidden shrink-0 gap-1.5 font-mono text-2xs text-muted-foreground sm:flex">
          {[".xlsx", ".csv", "до 12 МБ"].map((tag) => (
            <span key={tag} className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5">
              {tag}
            </span>
          ))}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={QUOTE_IMPORT_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onFile(file);
          }}
        />
      </div>
    </div>
  );
}
