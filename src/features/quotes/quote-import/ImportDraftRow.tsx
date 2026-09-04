import * as React from "react";
import { Check, ChevronDown, ImageOff, Link2, Plus, Tag, Trash2, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { cn } from "@/lib/utils";

import type {
  QuoteImportDraftCatalog,
  QuoteImportDraftImprint,
  QuoteImportDraftItem,
  QuoteImportFlag,
  QuoteImportLinkPreview,
} from "./types";

/** Вид товару для вибору в рядку: те саме, що `CatalogKindOption` у візарді. */
export type DraftKindOption = Pick<QuoteImportDraftCatalog, "kindId" | "kindName" | "typeId" | "typeName">;

/**
 * Місце нанесення для списку: рядок довідника виду (`id`) або вже вписане
 * руками на іншій позиції цього ж виду (`id: null`) — щоб два однакові товари
 * в одному прорахунку не вимагали набирати те саме двічі.
 */
export type PlaceOption = { id: string | null; label: string };

/**
 * Один рядок прев'ю імпорту — той самий у вікні «Імпорт з файлу» й у візарді
 * (REQ-237#p2). Що людина бачить і править: назва, тиражі, нанесення,
 * коментар; що лише бачить: фото, рядок файлу, зв'язок варіантів, ознаки,
 * посилання.
 *
 * РОЗКЛАДКА «ТИРАЖІ ОДНИМ ПОЛЕМ» (REQ-182#p22, варіант А з п'яти).
 *
 * ЩО БУЛО НЕ ТАК. Кожен тираж був окремим полем на 80 px, тож третій влазив
 * лише за рахунок назви (вона стискалась до свого мінімуму й ховала кінець), а
 * четвертий кидав увесь блок на новий рядок — картка росла зі 123 до 175 px.
 * Заміри проду 04.09.2026: три тиражі це 11 % позицій, чотири — 0,8 %, тобто
 * ламалось воно на кожній дев'ятій. Окремий рядок «Кепка · Одяг» з'їдав ще
 * 21 px на КОЖНІЙ позиції заради двох слів.
 *
 * ЯК ТЕПЕР. Тиражі живуть в ОДНОМУ полі з роздільниками: один чи чотири —
 * ширина росте на 49 px, висота не змінюється взагалі. Вид переїхав чипом на
 * початок смуги нанесення, тож окремого рядка метаданих у позиції з каталогу
 * більше немає — він лишається тільки там, де справді є що сказати (рядок
 * файлу, посилання, варіант, попередження).
 *
 * ПЕРШИЙ РЯДОК НЕ ПЕРЕНОСИТЬСЯ (`flex` без `flex-wrap`), і смуга нанесення
 * теж, поки на неї не відповіли: висота позиції — 102 px незалежно від
 * кількості тиражів, довжини назви й довжини назв методів. Названі пари
 * «метод + місце» — виняток (REQ-182#p24): їх переносить на другий рядок, бо
 * обрізана відповідь гірша за вищий рядок, а третя пара — це 0,9 % позицій.
 */

/** Гола іконка-дія в рядку позиції: та сама вага, що в кошика. */
const ICON_ACTION =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";

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
export function ImportItemPhoto({ preview, name }: { preview: QuoteImportLinkPreview | undefined; name: string }) {
  // 44 px, як у затвердженому прототипі (REQ-182#p20): фото тут упізнавання,
  // а не розгляд, і на шести позиціях 64 px з'їдали пів екрана.
  const base = "h-11 w-11 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-border/60";

  if (!preview) {
    return (
      <div className={cn(base, "flex items-center justify-center bg-muted/40")} aria-hidden>
        <ImageOff className="h-3.5 w-3.5 text-muted-foreground/40" />
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
      <ImageOff className="h-3.5 w-3.5 text-muted-foreground/50" />
    </div>
  );
}

export function ImportDraftRow({
  draft,
  preview,
  disabled,
  onPatch,
  onPatchRun,
  onRemove,
  onAddRun,
  onRemoveRun,
  namePlaceholder,
  autoFocusName,
  imprintOptions,
  onChangeImprints,
  kindOptions,
  onChangeKind,
}: {
  draft: QuoteImportDraftItem;
  preview: QuoteImportLinkPreview | undefined;
  disabled?: boolean;
  onPatch: (patch: Partial<QuoteImportDraftItem>) => void;
  onPatchRun: (runKey: string, patch: Partial<QuoteImportDraftItem["runs"][number]>) => void;
  /**
   * Прибрати рядок зовсім. Коли задано — замість галочки стоїть кошик: у
   * файлі зайве ЗНІМАЮТЬ (щоб було видно, що воно там було), а введене руками
   * просто прибирають.
   */
  onRemove?: () => void;
  /**
   * Додати ще один тираж. Коли не задано — кнопки немає: в імпорті тиражі
   * приходять із файлу, і дописувати їх руками там нема потреби.
   */
  onAddRun?: () => void;
  onRemoveRun?: (runKey: string) => void;
  namePlaceholder?: string;
  autoFocusName?: boolean;
  /**
   * Методи й місця нанесення цього виду — смугою під назвою (REQ-182#p24).
   * Не задано — смуги немає: в імпорті з файлу виду ще не знають, а без виду
   * методу нема на що вказувати.
   */
  imprintOptions?: { methods: Array<{ id: string; name: string }>; places: PlaceOption[] };
  onChangeImprints?: (next: QuoteImportDraftImprint[]) => void;
  /**
   * Види каталогу для рядка без моделі (REQ-182#p18): припущення з назви
   * стоїть чипом «Кепка · припущення», людина клацає й виправляє. Не задано —
   * чипа немає (імпорт у картці).
   */
  kindOptions?: DraftKindOption[];
  onChangeKind?: (kind: DraftKindOption | null) => void;
}) {
  /*
    Рядок метаданих не просто ховається, а НЕ РЕНДЕРИТЬСЯ, коли сказати нема
    чого. `space-y-2` у Tailwind v4 вішає відступ на кожну дитину, крім
    останньої, — тож порожній прихований <div> лишався останнім і додавав
    рядку зайві 8 px висоти (заміряно: 110 замість 102).
  */
  const hasMeta =
    draft.sourceRows.length > 0 ||
    Boolean(draft.catalog && !draft.catalog.modelId) ||
    Boolean(draft.variant) ||
    draft.flags.length > 0 ||
    draft.links.length > 0 ||
    Boolean(preview && preview.status !== "pending" && preview.status !== "done");

  const kindChip =
    kindOptions && onChangeKind && !draft.catalog?.modelId ? (
      <KindChip value={draft.catalog ?? null} options={kindOptions} disabled={disabled} onChange={onChangeKind} />
    ) : draft.catalog ? (
      // Позиція з каталогу: вид — факт, а не вибір, тож це підпис, а не кнопка.
      <span className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground">
        <Tag className="h-3.5 w-3.5" />
        {draft.catalog.kindName} · {draft.catalog.typeName}
      </span>
    ) : null;
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 p-3 transition-colors",
        !draft.selected && "opacity-50"
      )}
    >
      <div className="flex items-start gap-3">
        {onRemove ? null : (
          <Checkbox
            checked={draft.selected}
            disabled={disabled}
            aria-label={`Імпортувати «${draft.name}»`}
            onCheckedChange={(checked) => onPatch({ selected: checked === true })}
            // Монохром: галочка тут не статус, а «беремо/не беремо» —
            // синій робив із неї акцент сильніший за саму позицію.
            className="mt-1.5 data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
          />
        )}
        <ImportItemPhoto preview={preview} name={draft.name} />
        <div className="min-w-0 flex-1 space-y-2">
          {/*
            ПЕРШИЙ РЯДОК: назва, тиражі одним полем, кошик. Без `flex-wrap`
            навмисно — саме перенесення цього блоку й розганяло висоту картки.
          */}
          <div className="flex items-center gap-2">
            <Input
              value={draft.name}
              disabled={disabled}
              controlSize="md"
              aria-label="Назва позиції"
              placeholder={namePlaceholder}
              autoFocus={autoFocusName}
              className="min-w-0 flex-1"
              onChange={(event) => onPatch({ name: event.target.value })}
            />
            <RunsField
              runs={draft.runs}
              disabled={disabled}
              onPatchRun={onPatchRun}
              onAddRun={onAddRun}
              onRemoveRun={onRemoveRun}
            />
            {onRemove ? (
              <button
                type="button"
                disabled={disabled}
                aria-label={`Прибрати «${draft.name || "позицію"}»`}
                onClick={onRemove}
                className={cn(ICON_ACTION, "hover:bg-danger-soft hover:text-danger-foreground")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {/*
            СМУГА НАНЕСЕННЯ. Вид стоїть тут першим чипом — методи належать саме
            йому, тож вони поруч, а не через рядок. Смуга не переноситься:
            «ще N» забирає все, що не влізло.
          */}
          {kindChip || (imprintOptions && onChangeImprints) ? (
            <div
              className={cn(
                "flex items-center gap-1.5",
                // Поки нанесення не назвали, смуга тримається одного рядка й
                // ріже зайве; названі пари ховати не можна — вони переносяться.
                draft.imprints.length > 0 ? "flex-wrap" : "overflow-hidden"
              )}
            >
              {kindChip}
              {imprintOptions && onChangeImprints ? (
                <ImprintChips
                  imprints={draft.imprints}
                  methods={imprintOptions.methods}
                  places={imprintOptions.places}
                  disabled={disabled}
                  onChange={onChangeImprints}
                />
              ) : null}
            </div>
          ) : null}

          {hasMeta ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
            {/*
              Мітки рядка й варіанта більше не пігулки: пігулка обіцяє дію або
              стан, а це просто підпис звідки взялась позиція. Пігулка лишилась
              там, де вона щось означає, — на попередженні про діапазон.
            */}
            {draft.sourceRows.length > 0 ? (
              <span className="text-muted-foreground">рядок {draft.sourceRows.join(", ")}</span>
            ) : null}
            {/* Позиція з каталогу каже це категорією, а не плашкою «з бази»:
                «Худі · Одяг» — і зрозуміло, звідки вона, і що це таке. */}
            {/* Вид·тип переїхав у чип смуги нанесення — тут лишається лише те,
                що більше ніде не видно. */}
            {draft.catalog && !draft.catalog.modelId ? (
              // Вид є, моделі ще немає: на «Створити» товар стане рядком каталогу.
              <span className="text-muted-foreground">додасться в базу</span>
            ) : null}
            {/* Зв'язок варіантів — словами. Бедж «альтернатива» казав, що щось
                не так, але не казав що саме: під номером 30 у файлі лежать два
                різних дзен-сади, і це вибір із двох, а не два товари. */}
            {draft.variant ? (
              <span className="font-medium text-muted-foreground">
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
                title={link}
                className="inline-flex max-w-[260px] items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
              >
                <Link2 className="h-3 w-3 shrink-0" />
                <span className="truncate underline underline-offset-2">{link.replace(/^https?:\/\//, "")}</span>
              </a>
            ))}
            {/* Причина відсутнього фото стоїть саме тут, поруч із посиланням:
                «сайт не пускає роботів» — це підказка відкрити його руками, а
                не повідомлення про поломку. */}
            {preview && preview.status !== "pending" && preview.status !== "done" ? (
              <span className="text-muted-foreground/70">{preview.reason}</span>
            ) : null}
          </div>
          ) : null}

          {draft.comment || draft.notes ? (
            <Input
              value={draft.comment}
              disabled={disabled}
              controlSize="md"
              aria-label="Коментар замовника"
              placeholder={draft.notes ?? "Коментар замовника"}
              onChange={(event) => onPatch({ comment: event.target.value })}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Скільки методів пропонуємо чипами, поки нанесення ще не назвали (REQ-182#p22).
 *
 * Було три запропоновані ПЛЮС усі обрані, тобто до п'яти чипів, і смуга
 * розповзалась на другий рядок. Заміри проду: один метод обирають у 85 %
 * позицій, два в 15 %, три — тричі за весь час. Тож двох чипів вистачає на
 * дев'ять випадків із десяти, а решта живе за «ще N».
 *
 * Двох, а не трьох: разом із чипом виду й підписом «Нанесення» третій чип не
 * влазив у смугу й обрізався разом із «ще N» — тобто ховав саму дорогу до
 * решти методів (заміряно: 508 px вмісту в 410 px смуги).
 */
const VISIBLE_METHODS = 2;

/**
 * ESC ЗАКРИВАЄ СПИСОК, А НЕ ВІКНО. Перевірено живим натиском: без цього
 * Escape при відкритому списку лишав список на екрані й вів діалог до
 * питання «Закрити без збереження?» — тобто клавіша робила рівно протилежне
 * очікуваному. Слухаємо на фазі ЗАХОПЛЕННЯ й глушимо подію повністю:
 * обробники Radix (і поповера, і діалога) висять на document на фазі
 * спливання, тож до них вона вже не доходить.
 */
function usePopoverEscape(open: boolean, close: () => void) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, close]);
}

/**
 * Нанесення парами «метод + місце» (REQ-182#p24).
 *
 * ДВА СТАНИ СМУГИ, І ЦЕ НАВМИСНО. Поки не відповіли — смуга ПИТАЄ: «Без
 * нанесення» увімкнене, поруч два найчастіші методи виду й «ще N». Щойно
 * відповіли — смуга ПОКАЗУЄ відповідь: кожна пара окремим чипом «ДТФ ·
 * Груди», плюс «+» на ще одну. Тримати обидва разом означало б до семи чипів
 * у рядку на 410 px, а обране й запропоноване виглядали б однаково.
 *
 * МІСЦЕ ВИДНО НЕЗАПОВНЕНИМ. Чип без місця каже «ДТФ · місце?» приглушеним
 * хвостиком: питання, на яке ще не відповіли, має бути видно в рядку, а не
 * ховатись за клік. Саме через невидиме питання 203 нанесення з 332 поїхали
 * з «Індивідуальний» — єдиним місцем, яке взагалі пропонувалось.
 */
function ImprintChips({
  imprints,
  methods,
  places,
  disabled,
  onChange,
}: {
  imprints: QuoteImportDraftImprint[];
  methods: Array<{ id: string; name: string }>;
  places: PlaceOption[];
  disabled?: boolean;
  onChange: (next: QuoteImportDraftImprint[]) => void;
}) {
  const [listOpen, setListOpen] = React.useState(false);
  const closeList = React.useCallback(() => setListOpen(false), []);
  usePopoverEscape(listOpen, closeList);

  const add = (methodId: string) =>
    onChange([...imprints, { key: crypto.randomUUID(), methodId, positionId: null, positionLabel: null }]);
  const patch = (key: string, next: Partial<QuoteImportDraftImprint>) =>
    onChange(imprints.map((imprint) => (imprint.key === key ? { ...imprint, ...next } : imprint)));
  const remove = (key: string) => onChange(imprints.filter((imprint) => imprint.key !== key));
  const methodName = (methodId: string) => methods.find((method) => method.id === methodId)?.name ?? "Метод";

  if (imprints.length > 0) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label="Нанесення">
        {imprints.map((imprint) => (
          <ImprintChip
            key={imprint.key}
            imprint={imprint}
            methodLabel={methodName(imprint.methodId)}
            methods={methods}
            places={places}
            disabled={disabled}
            onPatch={(next) => patch(imprint.key, next)}
            onRemove={() => remove(imprint.key)}
          />
        ))}
        {/* «Ще одне нанесення» — не «ще методи»: пара додається цілком. */}
        <Popover open={listOpen} onOpenChange={setListOpen}>
          <PopoverTrigger asChild>
            <Chip
              size="sm"
              disabled={disabled}
              icon={<Plus />}
              aria-label="Додати нанесення"
              className="shrink-0 border-dashed px-2.5 text-muted-foreground"
            >
              нанесення
            </Chip>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-72 w-56 overflow-y-auto p-1.5">
            <PopoverHeading>Метод</PopoverHeading>
            {methods.map((method) => (
              <ListRow
                key={method.id}
                label={method.name}
                checked={false}
                onSelect={() => {
                  add(method.id);
                  setListOpen(false);
                }}
              />
            ))}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  const visible = methods.slice(0, VISIBLE_METHODS);
  const hidden = methods.length - visible.length;

  return (
    <div className="flex min-w-0 items-center gap-1.5" role="group" aria-label="Нанесення">
      {/*
        Підпису «Нанесення» тут немає: перший чип каже «Без нанесення», тобто
        слово вже на екрані. Зайняті ним 76 px коштували дорожче — через них
        обрізався третій чип разом із «ще N». Групу називає aria-label.
      */}
      {/* Чипи можуть обрізатись, «ще N» — ніколи: це єдиний шлях до решти методів. */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        <Chip size="sm" disabled={disabled} active aria-pressed="true" onClick={() => onChange([])}>
          Без нанесення
        </Chip>
        {visible.map((method) => (
          <Chip
            key={method.id}
            size="sm"
            disabled={disabled}
            aria-pressed="false"
            onClick={() => add(method.id)}
          >
            {method.name}
          </Chip>
        ))}
      </div>
      {hidden > 0 ? (
        <Popover open={listOpen} onOpenChange={setListOpen}>
          <PopoverTrigger asChild>
            <Chip
              size="sm"
              disabled={disabled}
              icon={<ChevronDown />}
              aria-label={`Усі методи нанесення, ще ${hidden}`}
              className="shrink-0 border-transparent bg-muted text-muted-foreground"
            >
              ще {hidden}
            </Chip>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-h-72 w-60 overflow-y-auto p-1.5">
            {methods.map((method) => (
              <ListRow
                key={method.id}
                label={method.name}
                checked={false}
                onSelect={() => {
                  add(method.id);
                  setListOpen(false);
                }}
              />
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

/**
 * Одна пара в смузі: чип «метод · місце», під ним панель із двома питаннями.
 *
 * ОДИН ЧИП — ОДНА ПАНЕЛЬ, А НЕ ДВА ОКРЕМІ ДРОПДАУНИ. Метод і місце
 * запитуються разом, бо разом і живуть: у базі це один запис масиву
 * `methods`. Два дропдауни поруч з'їли б удвічі більше смуги й дозволили б
 * місце без методу — стан, якого в базі немає.
 *
 * МІСЦЕ ВПИСУЄТЬСЯ РУКАМИ, І ЦЕ ГОЛОВНИЙ ШЛЯХ, а не запасний: довідник місць
 * заповнений у трьох видів із 92. Вписане не гине в тексті — на «Створити»
 * воно стає рядком довідника цього виду, тож наступного разу вже стоїть у
 * списку (як товар за посиланням стає рядком каталогу, REQ-182#p18).
 */
function ImprintChip({
  imprint,
  methodLabel,
  methods,
  places,
  disabled,
  onPatch,
  onRemove,
}: {
  imprint: QuoteImportDraftImprint;
  methodLabel: string;
  methods: Array<{ id: string; name: string }>;
  places: PlaceOption[];
  disabled?: boolean;
  onPatch: (next: Partial<QuoteImportDraftImprint>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const close = React.useCallback(() => setOpen(false), []);
  usePopoverEscape(open, close);

  const place = imprint.positionLabel?.trim() || "";
  const applyTyped = (value: string) => {
    const label = value.trim();
    if (!label) return;
    // Вписали те, що вже є в списку виду, — беремо рядок довідника, а не текст:
    // однакове місце має лишатись одним місцем, хай навіть його набрали руками.
    const known = places.find((option) => option.id && option.label.toLowerCase() === label.toLowerCase());
    onPatch({ positionId: known?.id ?? null, positionLabel: known?.label ?? label.slice(0, 60) });
    setTyped("");
  };

  return (
    <div className="group/imprint relative shrink-0">
      <Popover
        open={open}
        onOpenChange={(next) => {
          // Набране й не підтверджене Enter'ом не пропадає: закриття панелі —
          // теж відповідь, і людина вважає, що вписала місце, бо вона його вписала.
          if (!next) applyTyped(typed);
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <Chip
            size="sm"
            disabled={disabled}
            active
            title={place ? `${methodLabel} · ${place}` : `${methodLabel} — місце не вказане`}
            aria-label={place ? `Нанесення: ${methodLabel}, місце ${place}` : `Нанесення: ${methodLabel}, місце не вказане`}
            className="max-w-[190px]"
          >
            <span className="flex min-w-0 items-center gap-1">
              <span className="shrink-0">{methodLabel}</span>
              <span className="text-muted-foreground">·</span>
              <span className={cn("min-w-0 truncate", !place && "font-normal text-muted-foreground")}>
                {place || "місце?"}
              </span>
            </span>
          </Chip>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-80 w-64 overflow-y-auto p-1.5">
          {/*
            МІСЦЕ СТОЇТЬ ПЕРШИМ, хоч у назві пари воно друге. Пари без методу
            не буває — його вже назвали, коли пару створювали, — а місце саме
            те, чого бракує. Перевірено живцем: із методами вгорі список місць
            ішов під край панелі, і питання, заради якого її відкрили, було не
            видно без прокрутки. Поле фокусується саме, бо в 89 видів із 92
            місця вписують, а не вибирають.
          */}
          <PopoverHeading>Місце</PopoverHeading>
          <Input
            value={typed}
            controlSize="md"
            aria-label="Своє місце нанесення"
            placeholder={places.length > 0 ? "Або своє місце…" : "Напишіть місце…"}
            className="mb-1"
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              applyTyped(typed);
              setOpen(false);
            }}
          />
          {places.map((option) => (
            <ListRow
              key={option.id ?? option.label}
              label={option.label}
              checked={
                option.id
                  ? imprint.positionId === option.id
                  : !imprint.positionId && imprint.positionLabel === option.label
              }
              onSelect={() => {
                onPatch({ positionId: option.id, positionLabel: option.label });
                setOpen(false);
              }}
            />
          ))}
          {place ? (
            <ListRow
              label="Без місця"
              checked={false}
              onSelect={() => {
                onPatch({ positionId: null, positionLabel: null });
                setOpen(false);
              }}
            />
          ) : null}
          <div className="my-1.5 h-px bg-border/60" />
          <PopoverHeading>Метод</PopoverHeading>
          {methods.map((method) => (
            <ListRow
              key={method.id}
              label={method.name}
              checked={method.id === imprint.methodId}
              onSelect={() => onPatch({ methodId: method.id })}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
            className="mt-1 flex w-full items-center rounded-[var(--radius-md)] border-t border-border/60 px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
          >
            Прибрати нанесення
          </button>
        </PopoverContent>
      </Popover>
      {/*
        Хрестик лежить НА чипі, а не поруч: пара й так найширший елемент смуги,
        і окрема кнопка забрала б місце в назви методу. Той самий прийом, що на
        комірці тиражу.
      */}
      <button
        type="button"
        disabled={disabled}
        aria-label={`Прибрати нанесення ${methodLabel}`}
        onClick={onRemove}
        className="absolute -right-0.5 -top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-muted text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/imprint:opacity-100"
      >
        <X className="h-2.5 w-2.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

/** Підпис секції в панелі нанесення — той самий, що над групою видів. */
function PopoverHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

/** Рядок списку в панелі: клік застосовує одразу, панель лишається відкритою. */
function ListRow({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm hover:bg-muted/60"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {checked ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
    </button>
  );
}

/**
 * Чип виду для рядка без моделі (REQ-182#p18). Вгаданий вид підписаний
 * «припущення» і стоїть пунктиром: це не факт, а здогад з назви сторінки, і
 * від нього залежать методи нанесення — тому виправити його має бути так само
 * легко, як клацнути чип.
 */
function KindChip({
  value,
  options,
  disabled,
  onChange,
}: {
  value: QuoteImportDraftCatalog | null;
  options: DraftKindOption[];
  disabled?: boolean;
  onChange: (kind: DraftKindOption | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const groups = React.useMemo(() => {
    const byType = new Map<string, { typeName: string; kinds: DraftKindOption[] }>();
    for (const option of options) {
      const group = byType.get(option.typeId) ?? { typeName: option.typeName, kinds: [] };
      group.kinds.push(option);
      byType.set(option.typeId, group);
    }
    return [...byType.values()];
  }, [options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip
          size="sm"
          disabled={disabled}
          icon={<Tag />}
          aria-label={value ? `Вид товару: ${value.kindName}${value.guessed ? ", припущення" : ""}` : "Вид товару"}
          className={cn(!value || value.guessed ? "border-dashed" : undefined, value && !value.guessed && "bg-muted")}
        >
          {value ? (
            <>
              {value.kindName}
              {value.guessed ? <span className="font-normal text-muted-foreground"> · припущення</span> : null}
            </>
          ) : (
            "Вид товару?"
          )}
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-64 overflow-y-auto p-1.5">
        {groups.map((group) => (
          <div key={group.typeName} className="mb-1 last:mb-0">
            <div className="px-2 pb-1 pt-1.5 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.typeName}
            </div>
            {group.kinds.map((kind) => (
              <button
                key={kind.kindId}
                type="button"
                role="option"
                aria-selected={value?.kindId === kind.kindId}
                onClick={() => {
                  onChange(kind);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 truncate">{kind.kindName}</span>
                {value?.kindId === kind.kindId ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            ))}
          </div>
        ))}
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="mt-1 flex w-full items-center rounded-[var(--radius-md)] border-t border-border/60 px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
          >
            Без виду — в каталог не записувати
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Тиражі одним полем (REQ-182#p22).
 *
 * ОДНЕ ПОЛЕ, А НЕ N ПОЛІВ. Тиражі взаємовиключні — це «а скільки буде, якщо
 * стільки», один запит клієнта, — тож і виглядати вони мусять як одна
 * відповідь із варіантами, а не як чотири різні поля. Практична ціна старого
 * вигляду: кожне поле 80 px, тож на трьох тиражах назва стискалась до
 * мінімуму, а на чотирьох рядок переносився й картка росла на 52 px.
 *
 * Комірка 48 px тримає п'ятизначне число (найбільший тираж у базі — 25 000),
 * роздільники повторюють ті самі волосяні лінії, що в решті інтерфейсу, а
 * «плюс» стоїть усередині поля: додати тираж — це дописати варіант у ту саму
 * відповідь, а не окрема дія збоку.
 */
function RunsField({
  runs,
  disabled,
  onPatchRun,
  onAddRun,
  onRemoveRun,
}: {
  runs: QuoteImportDraftItem["runs"];
  disabled?: boolean;
  onPatchRun: (runKey: string, patch: Partial<QuoteImportDraftItem["runs"][number]>) => void;
  onAddRun?: () => void;
  onRemoveRun?: (runKey: string) => void;
}) {
  const divider = <span aria-hidden className="my-2 w-px shrink-0 self-stretch bg-border/60" />;
  /*
    ЩЕ ОДИН ТИРАЖ — ЛИШЕ КОЛИ ПОПЕРЕДНІЙ ЗАПОВНЕНИЙ.
    Порожній тираж — це не варіант, це незадане питання: «Створити» на ньому
    однаково спиняється й каже вписати кількість. Кнопка, яка додає другу таку
    саму зупинку, лише забирає ширину в назви. Тому «плюс» чекає на число.
  */
  const blocked = runs.some((run) => run.quantity <= 0);

  return (
    <div
      className={cn(
        // Та сама поверхня, що в полів застосунку (CONTROL_BASE), лише зібрана
        // вручну: всередині живуть кілька комірок, тож рамка спільна.
        "flex h-9 shrink-0 items-center rounded-lg border border-border/50 bg-muted/40",
        disabled && "opacity-50"
      )}
    >
      <span className="shrink-0 pl-2.5 pr-2 text-2xs text-muted-foreground">Тираж</span>
      {runs.map((run) => (
        <React.Fragment key={run.key}>
          {divider}
          <div className="group/run relative">
            <NumberInput
              value={run.quantity > 0 ? run.quantity : null}
              min={0}
              emptyValue={0}
              controlSize="md"
              disabled={disabled}
              aria-label="Кількість тиражу"
              placeholder="к-ть"
              className={cn(
                "h-9 w-12 rounded-none border-0 bg-transparent px-0 text-center tabular-nums",
                "placeholder:text-2xs focus:placeholder:text-transparent",
                "focus-visible:border-0 focus-visible:bg-transparent"
              )}
              onValueChange={(next) => onPatchRun(run.key, { quantity: Math.max(0, next ?? 0) })}
            />
            {onRemoveRun && runs.length > 1 ? (
              <button
                type="button"
                disabled={disabled}
                aria-label="Прибрати тираж"
                onClick={() => onRemoveRun(run.key)}
                className="absolute right-0 top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-muted text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/run:opacity-100"
              >
                <X className="h-2.5 w-2.5" strokeWidth={2.5} />
              </button>
            ) : null}
          </div>
        </React.Fragment>
      ))}
      {onAddRun ? (
        <>
          {divider}
          <button
            type="button"
            disabled={disabled || blocked}
            aria-label="Додати ще тираж"
            title={
              blocked
                ? "Спершу впишіть кількість — порожній тираж нема з чим порівнювати"
                : "Клієнт просить порахувати кілька кількостей"
            }
            onClick={onAddRun}
            className="grid h-9 w-8 shrink-0 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </>
      ) : null}
    </div>
  );
}
