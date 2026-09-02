import * as React from "react";
import { AlertTriangle, ArrowRight, Check, FileSpreadsheet, Info, Loader2, Plus, Upload } from "lucide-react";
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
import { Input } from "@/components/ui/input";
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

import { QUOTE_KINDS, QUOTE_SOURCES, type QuoteKindValue, type QuoteSourceValue } from "./quoteWizardKinds";

/**
 * Вікно «Новий прорахунок» на один екран (REQ-237, обраний концепт із трьох).
 *
 * ЩО ТУТ ОДНЕ. Замовник, тип виробу і джерело позицій — три відповіді, які
 * менеджер знає ще до відкриття вікна, тож вони стоять поруч без кроків
 * «далі». Джерело — не другий екран, а перемикач, який змінює лише нижню
 * панель: файл, посилання або порожній рядок під позицію.
 *
 * ЩО СПІЛЬНЕ. Усі три джерела зводяться до одного: список чернеток позицій
 * (`QuoteImportDraftItem`), той самий, що в імпорті. Ексель наповнює його
 * моделлю, посилання — розвідкою сторінки, «руками» — порожнім рядком. Далі
 * все однакове: той самий рядок прев'ю, той самий запис у базу
 * (`writeDraftsToQuote`), той самий момент створення.
 *
 * КОЛИ З'ЯВЛЯЄТЬСЯ ПРОРАХУНОК. Рівно на натиску «Створити» — `onPrepareQuote`
 * кличеться після того, як людина побачила чернетки. Передумати на будь-якому
 * етапі до того нічого не коштує: закрите вікно не лишає в базі нічого.
 */

type Stage = "compose" | "parsing" | "saving";

const LINK_TRACE = "за посиланням";
const MANUAL_TRACE = "введено руками";

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
    ...partial,
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
  /** Шапка майбутнього прорахунку: замовник, менеджер, дедлайн, валюта. */
  header: React.ReactNode;
  /** Чого бракує в шапці, щоб створювати. Порожньо — можна. */
  headerIssue: string | null;
  runDefaultsFor: (kind: QuoteKindValue) => QuoteImportRunDefaults;
  /** Створити прорахунок і віддати його id. Кличеться ПІСЛЯ прев'ю. */
  onPrepareQuote: (kind: QuoteKindValue) => Promise<string | null>;
  onCreated: (quoteId: string) => void;
}) {
  const [kind, setKind] = React.useState<QuoteKindValue>("merch");
  const [source, setSource] = React.useState<QuoteSourceValue>("excel");
  const [stage, setStage] = React.useState<Stage>("compose");
  const [drafts, setDrafts] = React.useState<QuoteImportDraftItem[]>([]);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [parseStep, setParseStep] = React.useState<ImportParseStep>("read");
  const [savedCount, setSavedCount] = React.useState(0);
  const [linkUrl, setLinkUrl] = React.useState("");
  const [linkBusy, setLinkBusy] = React.useState(false);
  /** Фото й назви для позицій «за посиланням»: черга імпорту сюди не заходить. */
  const [linkPreviews, setLinkPreviews] = React.useState<Record<string, QuoteImportLinkPreview>>({});
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const { previews, start: startLinkPreviews, reset: resetLinkPreviews } = useLinkPreviews();

  const reset = React.useCallback(() => {
    setKind("merch");
    setSource("excel");
    setStage("compose");
    setDrafts([]);
    setWarnings([]);
    setError(null);
    setFileName("");
    setSavedCount(0);
    setLinkUrl("");
    setLinkBusy(false);
    setLinkPreviews({});
    resetLinkPreviews();
  }, [resetLinkPreviews]);

  const selected = React.useMemo(() => drafts.filter((draft) => draft.selected), [drafts]);
  const nameless = React.useMemo(() => selected.filter((draft) => !draft.name.trim()).length, [selected]);
  const runless = React.useMemo(
    () => selected.filter((draft) => !draft.runs.some((run) => run.quantity > 0)).length,
    [selected]
  );
  const photoProgress = React.useMemo(() => countSettledPreviews(previews), [previews]);
  const canCreate =
    stage === "compose" && !headerIssue && selected.length > 0 && nameless === 0 && runless === 0;

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
   * Зміна джерела скидає чернетки: позиції з файлу й позиції руками — різні
   * списки, і тримати їх упереміш означало б, що «Створити» пише те, чого
   * людина на екрані не бачить. «Руками» одразу дає порожній рядок — інакше
   * перший клік ішов би на кнопку «Ще позиція», а не в поле.
   */
  const switchSource = (next: QuoteSourceValue) => {
    if (next === source) return;
    setSource(next);
    setError(null);
    setWarnings([]);
    setFileName("");
    setLinkPreviews({});
    resetLinkPreviews();
    setDrafts(next === "manual" ? [makeDraft()] : []);
  };

  const clearFile = React.useCallback(() => {
    setDrafts([]);
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
    setDrafts(outcome.drafts);
    setWarnings(outcome.warnings);
    void startLinkPreviews(outcome.drafts);
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
  const handleLink = async () => {
    const raw = linkUrl.trim();
    if (!raw) return;

    const urls = raw.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean);
    const bad = urls.find((url) => !isHttpUrl(url));
    if (bad) {
      setError(
        urls.length === 1
          ? "Це не схоже на посилання: потрібна адреса, що починається з http:// або https://."
          : `«${bad.slice(0, 60)}» не схоже на посилання — приберіть його зі списку.`
      );
      return;
    }

    setError(null);
    setLinkUrl("");

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
    if (!canCreate) return;
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

    const trace = source === "excel" ? fileName : source === "link" ? LINK_TRACE : MANUAL_TRACE;
    const written = await writeDraftsToQuote({
      drafts: selected,
      quoteId,
      teamId,
      nextPosition: 1,
      runDefaults: runDefaultsFor(kind),
      trace: { fileName: trace, importedAt: new Date().toISOString() },
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
  const hasContent = drafts.some((draft) => draft.name.trim() || draft.links.length > 0);

  // Підвал каже, ЧОМУ кнопка вимкнена. Мовчазна сіра кнопка читається як
  // поломка, а не як «дозаповніть шапку».
  const footerIssue = headerIssue;
  const footerMeta = (() => {
    if (footerIssue) return footerIssue;
    if (runless > 0) return `Впишіть тираж: без нього позицію нема з чого рахувати (${runless} із ${selected.length}).`;
    if (nameless > 0) return "Впишіть назву позиції — сайт її не віддав.";
    if (source === "manual") return "Ціни й собівартість — уже в картці прорахунку.";
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

          {header}

          {/*
            ОБИДВА ВИБОРИ — ОДНИМ РЯДКОМ (REQ-237#p8).

            Було дві смуги плиток із великими підписами секцій: разом ~200 px
            хрому перед вмістом, заради двох відповідей на три варіанти кожна.
            Артем: «мені не подобається ця комбінація». Тепер це два
            сегментовані перемикачі в один рядок — канонічні, ті самі, що в
            тулбарі сторінок, — а підписи стали дрібними мітками поруч.

            Секцій більше немає навмисно: підпис секції потрібен, коли з вигляду
            контрола не видно, про що він. «Поліграфія · Мерч · Інше» і
            «Руками · Excel · Посилання» кажуть це самі.
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

            <span className="ml-1 text-xs text-muted-foreground">Позиції</span>
            <SegmentedGroup className={SEGMENTED_GROUP_SM} role="tablist" aria-label="Джерело позицій">
              {QUOTE_SOURCES.map((option) => {
                const Icon = option.icon;
                return (
                  <Button
                    key={option.value}
                    variant="segmented"
                    size="xs"
                    role="tab"
                    aria-pressed={source === option.value}
                    aria-selected={source === option.value}
                    disabled={busy}
                    title={option.hint}
                    onClick={() => switchSource(option.value)}
                    className={SEGMENTED_TRIGGER_SM}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {option.label}
                  </Button>
                );
              })}
            </SegmentedGroup>
          </div>

          {source === "excel" ? (
            <ExcelPanel
              stage={stage}
              parseStep={parseStep}
              fileName={fileName}
              hasDrafts={drafts.length > 0}
              inputRef={fileInputRef}
              onFile={(file) => void handleFile(file)}
            />
          ) : null}

          {source === "link" ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={linkUrl}
                  disabled={busy}
                  aria-label="Посилання на товар"
                  placeholder={
                    drafts.length > 0
                      ? "Ще одне посилання — позиція стане в список нижче"
                      : "Вставте посилання на товар — prom, rozetka, сайт постачальника"
                  }
                  onChange={(event) => setLinkUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleLink();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !linkUrl.trim()}
                  onClick={() => void handleLink()}
                  className="shrink-0 gap-2"
                >
                  {linkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Додати товар
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {drafts.length === 0
                  ? "Система прочитає сторінку постачальника — фото, назву й опис — і підготує позицію. Можна вставити одразу кілька посилань, кожне з нового рядка."
                  : `Товарів у прорахунку: ${drafts.length}. Додавайте ще посилання — позиції накопичуються нижче.`}
              </p>
            </div>
          ) : null}

          {drafts.length > 0 ? (
            <section className="space-y-3">
              {/*
                КАРТКА ФАЙЛУ. Була пігулка з повною назвою файлу в ряду інших
                пігулок, а кнопка «Інший файл» висіла окремим рядком над
                числом — саме вона й давала той дивний відступ. Тепер це одна
                картка: піктограма, назва в один рядок, під нею факти розбору,
                і дія при самому файлі.
              */}
              {source === "excel" && fileName ? (
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
                        `знайдено ${drafts.length} ${pluralWordUk(drafts.length, "позицію", "позиції", "позицій")}`,
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

              {source === "excel" ? (
                <div className="flex items-end gap-2.5 pt-1">
                  <span className="font-mono text-2xl font-semibold leading-none tabular-nums">{selected.length}</span>
                  <span className="pb-0.5 text-xs text-muted-foreground">
                    {pluralWordUk(selected.length, "позиція", "позиції", "позицій")} до прорахунку
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="ml-auto"
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
              ) : null}

              <div className="space-y-2">
                {drafts.map((draft, index) => (
                  <ImportDraftRow
                    key={draft.key}
                    draft={draft}
                    preview={previews[draft.key] ?? linkPreviews[draft.key]}
                    disabled={busy}
                    namePlaceholder={source === "manual" ? "Худі оверсайз, чорний, лого на грудях" : undefined}
                    autoFocusName={source === "manual" && index === drafts.length - 1}
                    onPatch={(patch) => patchDraft(draft.key, patch)}
                    onPatchRun={(runKey, patch) => patchRun(draft.key, runKey, patch)}
                    onRemove={source === "excel" ? undefined : () => removeDraft(draft.key)}
                    onAddRun={() => addRun(draft.key)}
                    onRemoveRun={(runKey) => removeRun(draft.key, runKey)}
                  />
                ))}
              </div>

              {source === "manual" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  className="gap-2"
                  onClick={() => setDrafts((prev) => [...prev, makeDraft()])}
                >
                  <Plus className="h-4 w-4" />
                  Ще позиція
                </Button>
              ) : null}
            </section>
          ) : null}
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
            <Button type="button" disabled={!canCreate} onClick={() => void handleCreate()} className="gap-2">
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
  hasDrafts,
  inputRef,
  onFile,
}: {
  stage: Stage;
  parseStep: ImportParseStep;
  fileName: string;
  hasDrafts: boolean;
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
  if (hasDrafts) return null;

  return (
    <div className="space-y-2">
      {/*
        ФАЙЛ БЕРЕТЬСЯ ДО ЗАМОВНИКА. Спершу дропзона була закрита, поки шапка
        порожня («позиції з файлу лягають у ЙОГО прорахунок»), — і клік по ній
        не робив нічого. Але прорахунок з'являється лише на «Створити», тож
        розібрати файл раніше нічим не шкодить: менеджер бачить, що приїхало,
        і дозаповнює шапку, дивлячись на позиції. Замовника вимагає САМЕ
        створення, і підвал каже про це словами.
      */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Обрати файл Excel"
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-8 text-center transition-colors",
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
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Upload className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium">Перетягніть ексельку або клацніть, щоб обрати</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Файл від клієнта як є — з об’єднаними клітинками, кількома аркушами й посиланнями на товари. Модель{" "}
          <span className="text-foreground/80">сама знайде позиції, тиражі й варіанти</span>; ціни не бере.
        </p>
        <div className="mt-1 flex gap-1.5 font-mono text-2xs text-muted-foreground">
          {[".xlsx", ".xls", ".csv", "до 12 МБ"].map((tag) => (
            <span key={tag} className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5">
              {tag}
            </span>
          ))}
        </div>
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
