import * as React from "react";
import { History, Pencil, Settings2 } from "@/components/icons/appIcons";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InfoHint, PrintSpecFields, type PrintSpecFieldsHandle } from "@/components/quotes/PrintSpecFields";
import { HoverTip } from "@/components/ui/hover-tip";
import { Switch } from "@/components/ui/switch";
import { PrintModelArt } from "@/features/quotes/quote-wizard/printModelArt";
import { readQuoteItemPrintSpec } from "@/lib/printSpecLegacy";
import { pluralUk, pluralWordUk } from "@/lib/lastSeen";
import { toneBadgeClass } from "@/lib/statusTones";
import {
  buildPrintSpecRounds,
  buildPrintSpecSave,
  clearPrintSpecDraft,
  applyPrintSpecDefaults,
  createEmptyPrintSpecValues,
  diffPrintSpec,
  formatPrintSpecEntries,
  getFilledPrintSpecFieldIds,
  getPrintSpecColumns,
  getPrintSpecMissingForPrice,
  getPrintSpecPreset,
  isPrintSpecFilled,
  isPrintSpecPriced,
  parsePrintSpecValues,
  pickPrintSpecSource,
  pickRestorableDraft,
  readPrintSpecDraft,
  resolvePriceBaseline,
  needsPriceSnapshot,
  splitPrintSpecEntries,
  writePrintSpecDraft,
  type PrintSpecChange,
  type PrintSpecRound,
  type PrintSpecColumnInfo,
  type PrintSpecEntry,
  type PrintSpecMetadata,
  type PrintSpecPreset,
  type PrintSpecSource,
  type PrintSpecSourceCandidate,
  type PrintSpecStoredDraft,
  type PrintSpecValues,
} from "@/lib/printSpec";

/**
 * Параметри виробу для описових видів поліграфії на картці прорахунку.
 *
 * ЧОМУ САМЕ ТУТ, А НЕ У ВІКНІ СТВОРЕННЯ: заповнює це не той, хто заводить
 * прорахунок, а той, хто його рахує — «спосіб друку не обовʼязково для
 * менеджерів, ми самі з Оленою вибираємо від формату і тиражу». Менеджер при
 * створенні вибирає лише вид виробу й тираж.
 *
 * ЧОМУ ПОРОЖНІЙ СТАН — НЕ ПОМИЛКА: між створенням прорахунку й прорахунком
 * параметрів іще немає, і це нормальний робочий стан. Тому тут заклик заповнити,
 * а не попередження.
 *
 * Компонент сам вирішує, чи йому бути: вид без опису полів — і він не малює
 * нічого. Саме тому його можна безпечно поставити одним рядком на спільну
 * сторінку, яку бачать усі.
 */

export type PrintSpecPanelProps = {
  quoteItemId: string;
  /** `catalog_models.metadata.specPreset` вибраної моделі. */
  presetKey?: string | null;
  /** Що вже збережено в `quote_items.metadata.printSpec`. */
  saved?: PrintSpecMetadata | null;
  canEdit: boolean;
  /** Статус прорахунку (нормалізований): від нього залежить, чи правка повертає на перерахунок. */
  quoteStatus?: string | null;
  /** Коли прорахунок востаннє став «Пораховано» (ISO), якщо відомо. */
  lastPricedAt?: string | null;
  /** `changedAfterPrice` — параметри змінили, поки ціна була, і прорахунок треба повернути на перерахунок. */
  onSaved: (result: { changedAfterPrice: boolean }) => void;
  /** Відступи задає той, хто ставить панель: вона тепер поверх картки, а не вставка. */
  className?: string;
};

export function PrintSpecPanel({
  quoteItemId,
  presetKey,
  saved,
  canEdit,
  quoteStatus,
  lastPricedAt,
  onSaved,
  className,
}: PrintSpecPanelProps) {
  /*
    ПРЕСЕТ БЕРЕМО З МОДЕЛІ, А ЗБЕРЕЖЕНИЙ — ЛИШЕ ЯК ЗАПАСНИЙ. Було навпаки, і
    після заміни щоденника на брошуру панель далі малювала щоденник із його
    33 полями: збережений `presetKey` перемагав пресет моделі, тобто картка
    впевнено показувала параметри товару, якого в позиції вже немає
    (REQ-36#p41). Заміна виду тепер знімає `printSpec` сама
    (`buildModelSwapPatch`), але порядок тут лишається другим запобіжником —
    на позиції, де вид міняли до цієї правки.

    Запасний шлях потрібен: у моделі пресета може не бути взагалі (позиція за
    посиланням, назва руками), а збережені параметри — є, і ховати їх означало б
    втратити відповіді, які вже дали.
  */
  const preset = React.useMemo(
    () => getPrintSpecPreset(presetKey ?? saved?.presetKey),
    [presetKey, saved?.presetKey]
  );
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<PrintSpecValues>({});
  /** Поля зі значенням за замовчуванням, ще не підтвердженим людиною: у перший запис їх не рахуємо правкою. */
  const [initialAuto, setInitialAuto] = React.useState<string[]>([]);
  const [draftAuto, setDraftAuto] = React.useState<string[]>([]);
  /** «Лише незаповнені»: знімок заповнених на момент увімкнення, щоб поле не зникало посеред правки. */
  const [hiddenIds, setHiddenIds] = React.useState<ReadonlySet<string> | null>(null);
  const fieldsRef = React.useRef<PrintSpecFieldsHandle>(null);
  /** Значення, з якими вікно відкрилось: чернетка в сховищі цікава, лише коли від них відрізняється. */
  const [openedValues, setOpenedValues] = React.useState<PrintSpecValues>({});
  /** Незбережене з минулого разу, яке пропонуємо відновити. */
  const [restoreOffer, setRestoreOffer] = React.useState<PrintSpecStoredDraft | null>(null);
  /** Форму перемонтовуємо, коли чернетку замінено ззовні: вона тримає власний стан «за замовчуванням». */
  const [fieldsKey, setFieldsKey] = React.useState(0);
  const [initialTouched, setInitialTouched] = React.useState<string[]>([]);
  /** «Як минулого разу» застосовано: звідки й що було до того — для «Відмінити». */
  const [sourceNote, setSourceNote] = React.useState<{
    from: PrintSpecSource;
    previous: { values: PrintSpecValues; auto: string[] };
  } | null>(null);
  const lastTime = usePrintSpecSource(open, quoteItemId, preset);
  const [saving, setSaving] = React.useState(false);
  const [pickedRound, setPickedRound] = React.useState<string | null>(null);

  const savedValues = React.useMemo(
    () => (preset ? parsePrintSpecValues(preset, saved?.values ?? null) : {}),
    [preset, saved?.values]
  );

  /*
    РАУНДИ (REQ-323#p6): кожен знімок у `versions` — версія, яку рахували (В1…),
    плюс «Зараз» (ще не пораховано) або порахована поточна. Знімок застаріває,
    щойно прорахунок перерахували (`resolvePriceBaseline`). Нічого не пишемо в базу.
  */
  const rounds = React.useMemo<PrintSpecRound[]>(
    () => (preset ? buildPrintSpecRounds(preset, saved?.versions, savedValues, lastPricedAt) : []),
    [preset, saved?.versions, savedValues, lastPricedAt]
  );
  const hasHistory = rounds.length >= 2;
  const pickedIndex = hasHistory ? rounds.findIndex((round) => round.label === pickedRound) : -1;
  const roundIndex = pickedIndex >= 0 ? pickedIndex : rounds.length - 1;
  const viewingLast = !hasHistory || roundIndex === rounds.length - 1;
  const displayValues = hasHistory ? rounds[roundIndex].values : savedValues;
  const unpricedChanges = rounds.length > 0 && rounds[rounds.length - 1].unpriced ? rounds[rounds.length - 1].changes : [];

  /*
    Позначки на картці. Останній раунд: жовті — лише непорахована різниця;
    поля, змінені в раніших раундах, мають сірий ярлик із номером ОСТАННЬОГО
    раунду, де їх міняли. Минула версія: її власні зміни, нейтральним тоном —
    жовте лишається за непорахованим.
  */
  const { marks, tags } = React.useMemo(() => {
    const nextMarks = new Map<string, CardMark>();
    const nextTags = new Map<string, string>();
    if (!hasHistory) return { marks: nextMarks, tags: nextTags };
    if (!viewingLast) {
      for (const change of rounds[roundIndex].changes) nextMarks.set(change.fieldId, { tone: "muted", change });
      return { marks: nextMarks, tags: nextTags };
    }
    rounds.forEach((round, index) => {
      if (index === 0) return;
      for (const change of round.changes) {
        if (round.unpriced) nextMarks.set(change.fieldId, { tone: "warning", change });
        else nextTags.set(change.fieldId, round.label);
      }
    });
    return { marks: nextMarks, tags: nextTags };
  }, [hasHistory, viewingLast, rounds, roundIndex]);

  /*
    ГОЛОВНЕ ВЕЛИКЕ, РЕШТА СІТКОЮ (вигляд В, обраний 11.09.2026 з чотирьох).

    Було двадцять пар «підпис — значення» двома колонками: щоденник займав
    півекрана, і формат читався так само дрібно, як колір резинки. Тепер 3–4
    поля, від яких залежить ціна (`preset.summary`), стоять стрічкою великим, а
    решта — дрібною сіткою в три колонки під рискою: удвічі нижче, і кожне
    поле досі знаходиться за підписом. Рядка «Виріб: Щоденник» тут немає — назва
    виду стоїть заголовком позиції; у рядковому зведенні для списку й
    дизайн-задачі він лишається.
  */
  const entries = React.useMemo(
    () => (preset && isPrintSpecFilled(preset, displayValues) ? formatPrintSpecEntries(preset, displayValues) : []),
    [preset, displayValues]
  );
  const { hero } = React.useMemo(
    () => (preset ? splitPrintSpecEntries(preset, entries) : { hero: [] }),
    [preset, entries]
  );
  const heroIds = React.useMemo(() => new Set(hero.map((entry) => entry.id)), [hero]);
  const entryById = React.useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  /*
    Лічильник «17 з 19» у заголовку — лише поки є порожні поля. Це підказка тому,
    хто рахує, що є куди дозаповнити, а не оцінка: заповнили до кінця — і він
    зникає, бо «19 з 19» нічого не каже.
  */
  const columns = React.useMemo(() => (preset ? getPrintSpecColumns(preset, displayValues) : []), [preset, displayValues]);
  const progress = React.useMemo(() => {
    const total = columns.reduce((sum, column) => sum + column.total, 0);
    const done = columns.reduce((sum, column) => sum + column.filled, 0);
    return total > 0 && done < total ? { done, total } : null;
  }, [columns]);

  /* Лічильник у шапці вікна рахується з ЧЕРНЕТКИ: умовні поля з'являються й зникають від вибору. */
  const draftProgress = React.useMemo(() => {
    if (!preset) return { done: 0, total: 0 };
    const draftColumns = getPrintSpecColumns(preset, draft);
    return {
      done: draftColumns.reduce((sum, column) => sum + column.filled, 0),
      total: draftColumns.reduce((sum, column) => sum + column.total, 0),
    };
  }, [preset, draft]);

  if (!preset) return null;

  /*
    База редактора: версія, яку рахували. Якщо знімка ще немає, але ціна вже була,
    базою стають збережені значення — перша ж правка стане «зміною після ціни»
    (знімок запишеться при збереженні).
  */
  const editorBaseline =
    resolvePriceBaseline({ versions: saved?.versions, lastPricedAt }) ??
    (isPrintSpecFilled(preset, savedValues) && needsPriceSnapshot({ versions: saved?.versions, lastPricedAt, quoteStatus })
      ? savedValues
      : null);
  const priced = isPrintSpecPriced({ lastPricedAt, quoteStatus });
  const missingForPrice = getPrintSpecMissingForPrice(preset, draft);
  const draftChangeCount = editorBaseline
    ? diffPrintSpec(preset, editorBaseline, draft).filter((change) => !draftAuto.includes(change.fieldId)).length
    : 0;

  const openEditor = () => {
    // Значення за замовчуванням лише в чернетці вікна: збережені дані не чіпаємо.
    const opened = applyPrintSpecDefaults(
      preset,
      isPrintSpecFilled(preset, savedValues) ? savedValues : createEmptyPrintSpecValues(preset),
      { auto: [], touched: [], priced }
    );
    setDraft(opened.values);
    setOpenedValues(opened.values);
    setInitialAuto(opened.auto);
    setDraftAuto(opened.auto);
    setInitialTouched([]);
    setHiddenIds(null);
    setSourceNote(null);
    setRestoreOffer(pickRestorableDraft(preset, readPrintSpecDraft(preset, quoteItemId), opened.values));
    setOpen(true);
  };

  /** Правка людини: чернетка пишеться в сховище браузера, поки не збережена (або не повернута до початкового). */
  const changeDraft = (next: PrintSpecValues) => {
    setDraft(next);
    setRestoreOffer(null);
    persistDraft(next);
  };
  const persistDraft = (values: PrintSpecValues) => {
    if (diffPrintSpec(preset, openedValues, values).length === 0) clearPrintSpecDraft(quoteItemId);
    else writePrintSpecDraft(quoteItemId, values);
  };

  /** Чернетку замінено цілком (відновлення, «як минулого разу», «Відмінити»): значення вважаємо свідомими. */
  const replaceDraft = (values: PrintSpecValues, auto: string[], touchedAll: boolean) => {
    setDraft(values);
    setInitialAuto(auto);
    setDraftAuto(auto);
    setInitialTouched(touchedAll ? preset.fields.map((field) => field.id) : []);
    setHiddenIds(null);
    setFieldsKey((key) => key + 1);
    persistDraft(values);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Метадані читаємо перед записом, а не беремо зі стану сторінки: у тому ж
      // обʼєкті живуть sku й варіант каталогу, і запис усього обʼєкта зі старого
      // знімка затер би чужу правку (так уже одного разу зникла аватарка в профілі).
      const { data, error: readError } = await supabase
        .schema("tosho")
        .from("quote_items")
        .select("metadata")
        .eq("id", quoteItemId)
        .maybeSingle();
      if (readError) throw readError;

      const current = (data?.metadata ?? {}) as Record<string, unknown>;
      // `versions` беремо зі СВІЖОГО printSpec: пропс міг відстати, а запис
      // printSpec цілком затер би знімки, зроблені з іншої вкладки. Стара позиція
      // без printSpec читається зі старого формату — інакше її перша правка
      // вважалась би першим заповненням і не лишила версії, за яку бачили ціну.
      const built = buildPrintSpecSave({
        preset,
        current: readQuoteItemPrintSpec(current),
        draft,
        quoteStatus,
        lastPricedAt,
        defaulted: draftAuto,
      });
      const nextMetadata = { ...current, printSpec: built.printSpec };

      const { error: writeError } = await supabase
        .schema("tosho")
        .from("quote_items")
        .update({ metadata: nextMetadata })
        .eq("id", quoteItemId);
      if (writeError) throw writeError;

      clearPrintSpecDraft(quoteItemId);
      toast.success("Параметри виробу збережено");
      setOpen(false);
      onSaved({ changedAfterPrice: built.changedAfterPrice });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти параметри виробу");
    } finally {
      setSaving(false);
    }
  };

  const filled = entries.length > 0;
  const warningCount = unpricedChanges.length;
  const cardColumns = buildCardColumns(preset, columns, entryById, heroIds, marks, tags);

  return (
    <div className={cn("rounded-xl border border-border/50 p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          {/* Назви виду тут немає (Артем, 11.09.2026): вона стоїть заголовком
              позиції на три рядки вище, і другий раз читалась як підпис до
              підпису. У вікні редагування вона лишається — там заголовка немає. */}
          <span>Параметри виробу</span>
          {warningCount > 0 ? <ChangesChip count={warningCount} /> : null}
        </div>
        {filled && progress ? (
          <span className="ml-auto mr-2 flex items-center gap-2.5 text-xs tabular-nums text-muted-foreground">
            {progress.done} з {progress.total}
            <span className="h-1 w-24 overflow-hidden rounded-full bg-border/60">
              <span
                className="block h-full bg-foreground"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </span>
          </span>
        ) : null}
        {canEdit ? (
          <Button variant={filled ? "ghost" : "primary"} size="sm" onClick={openEditor}>
            {filled ? <Pencil className="mr-1.5 h-3.5 w-3.5" /> : null}
            {filled ? "Змінити" : "Заповнити"}
          </Button>
        ) : null}
      </div>

      {hasHistory ? <RoundSwitcher rounds={rounds} active={roundIndex} onPick={setPickedRound} /> : null}

      {warningCount > 0 && viewingLast ? (
        <div className="mt-2 text-xs leading-[17px] text-muted-foreground">
          Порівняно з версією, яку рахували{lastPricedAt ? ` ${formatDayMonth(lastPricedAt)}` : ""}. Позначки зникнуть,
          коли прорахунок перерахують.
        </div>
      ) : null}

      {filled ? (
        <>
          {hero.length > 0 ? <PrintSpecHero entries={hero} marks={marks} tags={tags} /> : null}
          {cardColumns.length > 0 ? (
            <div
              className={cn(
                "grid gap-x-8 gap-y-5",
                CARD_GRID[Math.min(cardColumns.length, 3)],
                hero.length > 0 ? "mt-4 border-t border-border/50 pt-3.5" : "mt-3"
              )}
            >
              {cardColumns.map((column) => (
                <div key={column.title} className="min-w-0">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-2xs font-semibold uppercase tracking-caps text-muted-foreground">
                      {column.title}
                    </span>
                    <span
                      className={cn(
                        "text-2xs tabular-nums",
                        column.filled === column.total ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {column.filled}/{column.total}
                    </span>
                    {column.warnings > 0 ? (
                      <span className="ml-auto text-2xs font-semibold text-warning-foreground">
                        {pluralUk(column.warnings, "зміна", "зміни", "змін")}
                      </span>
                    ) : null}
                  </div>
                  {column.rows.map((row) => (
                    <PrintSpecCardRow key={row.id} row={row} />
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-2 text-sm text-muted-foreground">
          Параметри ще не заповнені{canEdit ? "" : " — їх заповнює той, хто прораховує"}.
        </div>
      )}

      {hasHistory ? <RoundHistory preset={preset} rounds={rounds} /> : null}

      <Dialog open={open} onOpenChange={(next) => (saving ? null : setOpen(next))}>
        {/*
          ШАПКА Й ФУТЕР СТОЯТЬ, ПРОКРУЧУЄТЬСЯ ЛИШЕ ТІЛО: у щоденника двадцять
          полів, і при прокрутці всім вікном зникали і назва виду, і «Зберегти».

          Ширина за кількістю стовпчиків (3 — 1232, 2 — 880, 1 — 560): стовпчик
          вужчий за ~380 px ламає чипи на два рядки без потреби.
        */}
        <DialogContent
          // Перший, кого б сфокусувало вікно, — значок «і» в заголовку, і підказка
          // відкривалась би сама. Фокус лишаємо на самому вікні.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.target as HTMLElement).focus();
          }}
          className={cn(
            "flex h-[min(88vh,46rem)] max-h-[88vh] flex-col overflow-hidden !gap-0 !p-0",
            DIALOG_WIDTH[Math.min(preset.columns?.length ?? 1, 3)]
          )}
        >
          <DialogHeader className="flex-row items-center gap-4 border-b border-border/50 px-6 py-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted/70 text-foreground/75">
              <PrintModelArt presetKey={preset.key} className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex flex-wrap items-center gap-2">
                Параметри виробу · {preset.label}
                <InfoHint label="Параметри виробу" text={DIALOG_HINT} />
                {draftChangeCount > 0 ? <ChangesChip count={draftChangeCount} /> : null}
              </DialogTitle>
              <DialogDescription className="sr-only">{DIALOG_HINT}</DialogDescription>
            </div>
            <span className="mr-8 hidden shrink-0 items-center gap-2.5 text-sm tabular-nums text-muted-foreground sm:flex">
              <span>
                <span className="font-semibold text-foreground">{draftProgress.done}</span> з {draftProgress.total}
              </span>
              <span className="h-1 w-20 overflow-hidden rounded-full bg-border/60">
                <span
                  className="block h-full bg-foreground"
                  style={{
                    width: `${draftProgress.total === 0 ? 0 : Math.round((draftProgress.done / draftProgress.total) * 100)}%`,
                  }}
                />
              </span>
            </span>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border/50 px-6 py-2 text-xs">
            {missingForPrice.length > 0 ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-1 text-foreground">
                <span className="font-medium">Для ціни бракує:</span>
                {missingForPrice.map((field, index) => (
                  <React.Fragment key={field.id}>
                    <button
                      type="button"
                      onClick={() => fieldsRef.current?.focusField(field.id)}
                      className="rounded px-0.5 font-semibold underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                    >
                      {field.label}
                    </button>
                    {index < missingForPrice.length - 1 ? <span aria-hidden="true">,</span> : null}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">Можна рахувати</span>
            )}
            {lastTime ? (
              <HoverTip label={`Беремо з ${lastTime.quoteNumber} від ${formatDayMonth(lastTime.quoteDate)}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  disabled={saving}
                  onClick={() => {
                    setSourceNote({ from: lastTime, previous: { values: draft, auto: draftAuto } });
                    replaceDraft(lastTime.values, [], true);
                  }}
                >
                  <History className="mr-1.5 h-3.5 w-3.5" />
                  Як минулого разу
                </Button>
              </HoverTip>
            ) : null}
            <label className={cn("flex cursor-pointer items-center gap-2 text-muted-foreground", !lastTime && "ml-auto")}>
              Лише незаповнені
              <Switch
                size="sm"
                label="Лише незаповнені"
                checked={hiddenIds !== null}
                onCheckedChange={(next) => setHiddenIds(next ? getFilledPrintSpecFieldIds(preset, draft) : null)}
              />
            </label>
          </div>

          {restoreOffer ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning-soft-border bg-warning-soft/60 px-6 py-2 text-xs text-warning-foreground">
              <span>Є незбережені зміни від {formatTime(restoreOffer.at)}</span>
              <button
                type="button"
                className="font-semibold underline-offset-2 hover:underline"
                onClick={() => {
                  replaceDraft(restoreOffer.values, [], true);
                  setRestoreOffer(null);
                }}
              >
                Відновити
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                className="font-semibold underline-offset-2 hover:underline"
                onClick={() => {
                  clearPrintSpecDraft(quoteItemId);
                  setRestoreOffer(null);
                }}
              >
                Відкинути
              </button>
            </div>
          ) : null}
          {sourceNote ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 bg-muted/40 px-6 py-2 text-xs text-foreground">
              <span>
                Взято з {sourceNote.from.quoteNumber} від {formatDayMonth(sourceNote.from.quoteDate)} — перевірте
              </span>
              <button
                type="button"
                className="font-semibold underline-offset-2 hover:underline"
                onClick={() => {
                  replaceDraft(sourceNote.previous.values, sourceNote.previous.auto, false);
                  setSourceNote(null);
                }}
              >
                Відмінити
              </button>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto bg-muted/25 p-4">
            <PrintSpecFields
              key={fieldsKey}
              ref={fieldsRef}
              hiddenIds={hiddenIds}
              preset={preset}
              values={draft}
              onChange={changeDraft}
              disabled={saving}
              baseline={editorBaseline}
              initialAuto={initialAuto}
              initialTouched={initialTouched}
              priced={priced}
              onAutoChange={setDraftAuto}
            />
          </div>

          <DialogFooter className="border-t border-border/50 bg-muted/25 px-6 py-3.5 sm:items-center sm:justify-between">
            <span className="hidden text-xs text-muted-foreground sm:block">
              Збережене видно в картці прорахунку, у списку та в дизайн-задачі.
            </span>
            <span className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Скасувати
              </Button>
              <Button onClick={() => void save()} loading={saving}>
                Зберегти
              </Button>
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const formatTime = (iso: string): string =>
  new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kiev", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

type SourceRow = {
  created_at: string;
  metadata: unknown;
  quotes: { id: string; number: string; status: string | null; created_at: string } | null;
};

/**
 * «Як минулого разу»: найсвіжіша позиція того самого виду в ІНШОМУ прорахунку
 * того самого замовника. Запит лінивий — на відкриття вікна, а не картки; без
 * замовника (`quotes.customer_id`) чи збігу відповідь `null`, і кнопки немає.
 * Скасовані прорахунки й порожні конфігурації відсіює `pickPrintSpecSource`.
 */
function usePrintSpecSource(open: boolean, quoteItemId: string, preset: PrintSpecPreset | null): PrintSpecSource | null {
  const [source, setSource] = React.useState<PrintSpecSource | null>(null);
  const presetKey = preset?.key ?? null;

  React.useEffect(() => {
    if (!open || !preset || !presetKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const items = supabase.schema("tosho").from("quote_items");
        const own = await items
          .select("quote_id, quotes!inner(customer_id)")
          .eq("id", quoteItemId)
          .maybeSingle();
        const ownRow = own.data as unknown as { quote_id: string; quotes: { customer_id: string | null } | null } | null;
        const customerId = ownRow?.quotes?.customer_id;
        if (!ownRow || !customerId) {
          if (!cancelled) setSource(null);
          return;
        }

        // Старі позиції пакета, блокнота й блоків зберігають вид у `configuratorPreset` — той самий ключ.
        const { data, error } = await supabase
          .schema("tosho")
          .from("quote_items")
          .select("created_at, metadata, quotes!inner(id, number, status, created_at)")
          .eq("quotes.customer_id", customerId)
          .neq("quote_id", ownRow.quote_id)
          .or(`metadata->printSpec->>presetKey.eq.${presetKey},metadata->>configuratorPreset.eq.${presetKey}`)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;

        const candidates: PrintSpecSourceCandidate[] = ((data ?? []) as unknown as SourceRow[]).flatMap((row) =>
          row.quotes
            ? [
                {
                  quoteId: row.quotes.id,
                  quoteNumber: row.quotes.number,
                  quoteDate: row.quotes.created_at,
                  quoteStatus: row.quotes.status,
                  itemCreatedAt: row.created_at,
                  spec: readQuoteItemPrintSpec(row.metadata),
                },
              ]
            : []
        );
        if (!cancelled) setSource(pickPrintSpecSource(candidates, preset, ownRow.quote_id));
      } catch {
        // Підказка-зручність: без неї вікно працює, тож помилку не показуємо.
        if (!cancelled) setSource(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, quoteItemId, preset, presetKey]);

  return source;
}

const DIALOG_HINT = "Обмежень немає — якщо потрібного варіанта немає в списку, вибирайте «Інше…» і пишіть текстом.";

/** Ширина вікна за кількістю стовпчиків; клас мусить бути літералом. */
const DIALOG_WIDTH: Record<number, string> = {
  1: "sm:max-w-[560px]",
  2: "sm:max-w-[880px]",
  3: "sm:max-w-[1232px]",
};

/** Стовпчики картки в ряд. */
const CARD_GRID: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 xl:grid-cols-3",
};

/** Скільки клітинок у ряд стрічки: сітка Tailwind не читає число з пропса. */
const HERO_COLUMNS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

/**
 * Стрічка «головне»: значення великим, підпис під ним, між клітинками риска.
 *
 * На телефоні — по дві в ряд без рисок: чотири клітинки в один ряд на 360 px
 * дали б по 80 px на «Шкірзамінник». Значення не переноситься, а обрізається:
 * стрічка — це те, що читають з відстані, і два рядки в одній клітинці
 * зруйнували б лінію, на якій стоять решта.
 */
function PrintSpecHero({
  entries,
  marks,
  tags,
}: {
  entries: PrintSpecEntry[];
  marks: Map<string, CardMark>;
  tags: Map<string, string>;
}) {
  return (
    <div className={cn("mt-3.5 grid grid-cols-2 gap-y-3", HERO_COLUMNS[Math.min(entries.length, 4)])}>
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          className={cn(
            "min-w-0 sm:px-5",
            index === 0 && "sm:pl-0",
            index > 0 && "sm:border-l sm:border-border/60"
          )}
        >
          <div className="truncate text-xl font-semibold leading-6 tracking-tight text-foreground" title={entry.value}>
            {entry.value}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {entry.label}
            {tags.get(entry.id) ? <VersionTag label={tags.get(entry.id) ?? ""} /> : null}
          </div>
          {marks.get(entry.id) ? (
            <div
              className={cn(
                "mt-0.5 truncate text-2xs",
                marks.get(entry.id)?.tone === "warning" ? "text-warning-foreground" : "text-muted-foreground"
              )}
            >
              було: {marks.get(entry.id)?.change.from || "—"}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Позначка зміни біля поля картки: колір лишається лише за непорахованими змінами. */
type CardMark = { tone: "warning" | "muted"; change: PrintSpecChange };

type CardRow = { id: string; label: string; value?: string; mark?: CardMark; tag?: string };

type CardColumn = { title: string; filled: number; total: number; warnings: number; rows: CardRow[] };

/** DD.MM за київським часом — як у решті CRM (docs/DATETIME.md). */
const formatDayMonth = (iso: string): string =>
  new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kiev", day: "2-digit", month: "2-digit" }).format(new Date(iso));

function ChangesChip({ count }: { count: number }) {
  return (
    <span className={cn("rounded-md border px-2 py-0.5 text-xs font-semibold", toneBadgeClass.warning)}>
      {count} {pluralWordUk(count, "зміна", "зміни", "змін")} після ціни
    </span>
  );
}

/**
 * Рядки стовпчиків картки. Поле зі стрічки «головне» тут не повторюється, а
 * змінене поле, яке стало невидимим, лишається рядком зі старим значенням і «—»:
 * інакше зміна просто зникла б з очей.
 */
function buildCardColumns(
  preset: PrintSpecPreset,
  columns: PrintSpecColumnInfo[],
  entryById: Map<string, PrintSpecEntry>,
  heroIds: Set<string>,
  marks: Map<string, CardMark>,
  tags: Map<string, string>
): CardColumn[] {
  const byTitle = new Map<string, CardColumn>();
  const shown = new Set(heroIds);
  for (const column of columns) {
    const rows: CardRow[] = [];
    for (const field of column.sections.flatMap((section) => section.fields)) {
      shown.add(field.id);
      if (heroIds.has(field.id)) continue;
      rows.push({
        id: field.id,
        label: field.label,
        value: entryById.get(field.id)?.value,
        mark: marks.get(field.id),
        tag: tags.get(field.id),
      });
    }
    byTitle.set(column.title, { title: column.title, filled: column.filled, total: column.total, warnings: 0, rows });
  }

  const presetColumns = preset.columns ?? [{ title: preset.label, sections: preset.sections }];
  for (const mark of marks.values()) {
    if (shown.has(mark.change.fieldId)) continue;
    const title = presetColumns.find((column) => column.sections.includes(mark.change.section))?.title;
    if (!title) continue;
    const column = byTitle.get(title) ?? { title, filled: 0, total: 0, warnings: 0, rows: [] };
    column.rows.push({ id: mark.change.fieldId, label: mark.change.label, mark });
    byTitle.set(title, column);
  }

  return presetColumns
    .map((column) => byTitle.get(column.title))
    .filter((column): column is CardColumn => column !== undefined)
    .map((column) => ({
      ...column,
      warnings: column.rows.filter((row) => row.mark?.tone === "warning").length,
    }));
}

function PrintSpecCardRow({ row }: { row: CardRow }) {
  const { mark } = row;
  const warning = mark?.tone === "warning";
  return (
    <div className="flex items-baseline justify-between gap-3.5 py-1 text-sm">
      <span className={cn("inline-flex min-w-0 items-center gap-1.5", mark ? "font-medium text-foreground" : "text-muted-foreground")}>
        {mark ? (
          <span
            aria-hidden="true"
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", warning ? "bg-warning-solid" : "bg-muted-foreground/50")}
          />
        ) : null}
        {row.label}
      </span>
      {mark ? (
        <span className="inline-flex min-w-0 flex-wrap items-baseline justify-end gap-2 text-right tabular-nums">
          <span className="font-medium text-muted-foreground line-through">{mark.change.from || "—"}</span>
          <span
            className={cn(
              "rounded-md px-2 py-0.5 font-semibold",
              warning ? "bg-warning-soft text-warning-foreground" : "bg-muted text-foreground"
            )}
          >
            {mark.change.to || "—"}
          </span>
        </span>
      ) : (
        <span className="inline-flex min-w-0 items-baseline justify-end gap-2 text-right">
          <span
            className={cn("min-w-0 font-medium tabular-nums", row.value ? "text-foreground" : "text-muted-foreground/70")}
          >
            {row.value ?? "—"}
          </span>
          {row.tag ? <VersionTag label={row.tag} /> : null}
        </span>
      )}
    </div>
  );
}

/** Сірий ярлик: у якій версії параметр змінили востаннє. */
function VersionTag({ label }: { label: string }) {
  return <span className="rounded bg-muted px-1.5 text-2xs font-semibold text-muted-foreground">{label}</span>;
}

const formatDayMonthTime = (iso: string): string =>
  new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kiev",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/** Перемикач версій у шапці картки: «В1 24.09 · В2 27.09 · Зараз». */
function RoundSwitcher({
  rounds,
  active,
  onPick,
}: {
  rounds: PrintSpecRound[];
  active: number;
  onPick: (label: string) => void;
}) {
  return (
    <div role="group" aria-label="Версії параметрів" className="mt-2.5 inline-flex flex-wrap gap-1 rounded-lg bg-muted/60 p-0.5">
      {rounds.map((round, index) => (
        <button
          key={round.label}
          type="button"
          aria-pressed={index === active}
          onClick={() => onPick(round.label)}
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium tabular-nums transition-colors",
            index === active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {round.unpriced ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning-solid" /> : null}
          {round.label}
          {round.pricedAt ? <span className="font-normal text-muted-foreground">{formatDayMonth(round.pricedAt)}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Історія версій унизу панелі: найновіший раунд згори, праворуч — що змінили. */
function RoundHistory({ preset, rounds }: { preset: PrintSpecPreset; rounds: PrintSpecRound[] }) {
  const presetColumns = preset.columns ?? [{ title: preset.label, sections: preset.sections }];
  const part = (section: string) => presetColumns.find((column) => column.sections.includes(section))?.title ?? section;
  return (
    <div className="mt-4 border-t border-border/50 pt-3">
      <div className="mb-1.5 flex items-center gap-2 text-2xs font-semibold uppercase tracking-caps text-muted-foreground">
        Історія версій <span className="tabular-nums">({rounds.length})</span>
      </div>
      <div className="divide-y divide-border/40">
        {[...rounds].reverse().map((round) => (
          <div key={round.label} className="grid gap-x-4 gap-y-1 py-2 text-xs sm:grid-cols-[16rem_1fr]">
            <div className="flex items-center gap-2 text-muted-foreground">
              {round.unpriced ? (
                <>
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning-solid" />
                  <span className="font-semibold text-foreground">Зараз</span>
                  <span>не пораховано{round.at ? ` · ${formatDayMonthTime(round.at)}` : ""}</span>
                </>
              ) : (
                <>
                  <VersionTag label={round.label} />
                  <span>Пораховано{round.pricedAt ? ` ${formatDayMonth(round.pricedAt)}` : ""}</span>
                </>
              )}
            </div>
            <div className="min-w-0 space-y-0.5 text-foreground">
              {round.label === "В1" ? (
                <div className="text-muted-foreground">Перша ціна</div>
              ) : (
                round.changes.map((change) => (
                  <div key={change.fieldId}>
                    {part(change.section)} · {change.label}:{" "}
                    <span className="text-muted-foreground line-through">{change.from || "—"}</span> →{" "}
                    <span className="font-medium">{change.to || "—"}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
