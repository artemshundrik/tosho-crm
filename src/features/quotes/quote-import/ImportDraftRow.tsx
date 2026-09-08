import * as React from "react";
import { Check, ExternalLink, ImageOff, Plus, Search, Tag, Trash2, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { HoverTip } from "@/components/ui/hover-tip";
import { supplierNameFromUrl } from "@/lib/supplierPoolRows";
import { cn } from "@/lib/utils";

import { ImprintChips, type PlaceOption } from "@/features/quotes/quote-details/ImprintChips";

import type {
  QuoteImportDraftCatalog,
  QuoteImportDraftImprint,
  QuoteImportDraftItem,
  QuoteImportFlag,
  QuoteImportLinkPreview,
} from "./types";

export type { PlaceOption };

/** Вид товару для вибору в рядку: те саме, що `CatalogKindOption` у візарді. */
export type DraftKindOption = Pick<QuoteImportDraftCatalog, "kindId" | "kindName" | "typeId" | "typeName">;

/**
 * Один рядок прев'ю імпорту — той самий у вікні «Імпорт з файлу» й у візарді
 * (REQ-237#p2). Що людина бачить і править: назва, тиражі, нанесення,
 * коментар; що лише бачить: фото, рядок файлу, зв'язок варіантів, ознаки,
 * посилання.
 *
 * РОЗКЛАДКА У ДВІ СМУГИ (REQ-250#p34, макет Б з чотирьох).
 *
 * ЩО БУЛО НЕ ТАК. Рядок складався для ексельки, де про товар відомі назва й
 * тираж. Товар із пулу приносить утричі більше: обраний колір, його код, ціну,
 * два сайти, вид і нанесення. В один рядок це лізло лише за рахунок назви, а
 * половина фактів не показувалась узагалі — колір і код, які людина щойно
 * обрала, ніде не було видно, ціна з пулу теж (Артем, 08.09.2026).
 *
 * ЯК ТЕПЕР. Верхня смуга — ЩО ЦЕ ЗА ТОВАР: фото 52 px, назва, звідки він
 * (сайти назвами, не адресами) і ціна за одиницю великим числом праворуч.
 * Нижня — ЯК РАХУЄМО: вид, колір із кодом, нанесення, а праворуч тиражі
 * рівними комірками з «плюсом».
 *
 * НАЗВА — ПІДПИС, КОЛИ ЇЇ ДАЛО ДЖЕРЕЛО. Полем вона лишається там, де її
 * справді пишуть: рядок ексельки, товар за посиланням, позиція руками.
 *
 * ЦІНА — ЧИСЛО, А НЕ ПОЛЕ, і суми «тираж × ціна» немає навмисно: до націнки
 * вона виглядала б як відповідь, не будучи нею.
 */

/**
 * Чип, який нічого не робить: вид, колір, код. Висота й радіус — ті самі, що в
 * `Chip size="sm"` із нанесення, бо вони стоять в одній смузі; але це <span>, а
 * не кнопка — пігулка, на яку не можна натиснути, не має вдавати кнопку.
 */
const STATIC_CHIP =
  "inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground";

/** Гола іконка-дія в рядку позиції: та сама вага, що в кошика. */
const ICON_ACTION =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";

const FLAG_LABELS: Record<QuoteImportFlag, string> = {
  quantity_range: "діапазон → два тиражі",
};

/** Ті самі копійки й той самий пробіл, що в підказці пошуку постачальників. */
const formatAmount = (value: number) =>
  value.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currencyLabel = (code: string) => (code === "UAH" ? "грн" : code);

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
  // 52 px (REQ-250#p34). Було 44 — розмір із часів, коли позиція вміщалась в
  // один рядок і фото лишалось упізнаванням. Тепер у смузі вміщається колір, і
  // фото відповідає на «той самий колір я обрав?» — на 44 px відтінок не
  // читався. 64 px, від яких відмовились у REQ-182#p20, і далі завеликі: на
  // шести позиціях вони з'їдали пів екрана.
  const base = "h-13 w-13 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-border/60";

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
    Артикул приходить двома шляхами (REQ-247): візард кладе його в чернетку
    одразу, а вікно «Імпорт з файлу» тримає відповідь розвідки збоку, у
    `preview`. Рядок не мусить знати, яке з вікон його малює.
  */
  const sku = draft.sku ?? (preview && preview.status !== "pending" ? preview.sku ?? null : null);
  const color = draft.color ?? null;

  /*
    НАЗВА — ПІДПИС, А НЕ ПОЛЕ, коли її дало джерело (REQ-250#p34). Товар із
    пулу й товар із каталогу приходять із готовою назвою, і поле під нею
    питало те, на що вже відповіли: позиція виглядала як порожня форма, хоч
    заповнити в ній лишалось тільки тираж.

    Поле лишається там, де назву справді пишуть: рядок ексельки (її склала
    модель із брудної таблиці), товар за посиланням (назва зі сторінки) і
    позиція, набрана руками.
  */
  const nameIsGiven = Boolean(draft.catalog?.modelId || draft.supplierProductId || color);

  /*
    ДЖЕРЕЛА — НАЗВАМИ САЙТІВ, А НЕ АДРЕСАМИ. Голе посилання займало пів рядка
    й нічого не додавало: «totobi.com.ua/product/12345» однаково читають як
    «Тотобі», а решту домальовують очима. Повна адреса лишилась у підказці.

    Підписів «наш магазин» і «оптовик» тут немає навмисно — у команді й так
    знають, хто є хто, а порядок (спершу наш, потім оптовик) це й показує.
  */
  const sources = React.useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ url: string; name: string }> = [];
    for (const url of [draft.avantprintUrl, draft.supplierUrl, ...draft.links]) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, name: supplierNameFromUrl(url) ?? "посилання" });
    }
    return out;
  }, [draft.avantprintUrl, draft.supplierUrl, draft.links]);

  /*
    Рядок метаданих не просто ховається, а НЕ РЕНДЕРИТЬСЯ, коли сказати нема
    чого: порожня дитина в колонці з відступами додавала висоти кожній
    позиції з каталогу, а сказати їй нічого.
  */
  const hasMeta =
    Boolean(color || sku) ||
    draft.sourceRows.length > 0 ||
    Boolean(draft.catalog && !draft.catalog.modelId) ||
    Boolean(draft.variant) ||
    draft.flags.length > 0 ||
    Boolean(preview && preview.status !== "pending" && preview.status !== "done");

  const kindChip =
    kindOptions && onChangeKind && !draft.catalog?.modelId ? (
      <KindChip value={draft.catalog ?? null} options={kindOptions} disabled={disabled} onChange={onChangeKind} />
    ) : draft.catalog ? (
      // Позиція з каталогу: вид — факт, а не вибір, тож це підпис, а не кнопка.
      <span className={cn(STATIC_CHIP, "gap-1.5")}>
        <Tag className="h-3.5 w-3.5" />
        {draft.catalog.kindName} · {draft.catalog.typeName}
      </span>
    ) : null;

  const price = draft.poolPrice ?? null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 transition-colors",
        !draft.selected && "opacity-50"
      )}
    >
      {/*
        ВЕРХНЯ СМУГА — ЩО ЦЕ ЗА ТОВАР: фото, назва, звідки він і скільки
        коштує. Нижня — як ми його рахуємо. Дві смуги замість одного рядка
        з'явились тому, що товар із пулу приносить утричі більше фактів, ніж
        рядок ексельки, і в один рядок вони лізли лише за рахунок назви.
      */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {onRemove ? null : (
          <Checkbox
            checked={draft.selected}
            disabled={disabled}
            aria-label={`Імпортувати «${draft.name}»`}
            onCheckedChange={(checked) => onPatch({ selected: checked === true })}
            // Монохром: галочка тут не статус, а «беремо/не беремо» —
            // синій робив із неї акцент сильніший за саму позицію.
            className="data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
          />
        )}
        <ImportItemPhoto preview={preview} name={draft.name} />
        <div className="min-w-0 flex-1 space-y-1">
          {nameIsGiven ? (
            <div className="truncate text-sm font-medium" title={draft.name}>
              {draft.name}
            </div>
          ) : (
            <Input
              value={draft.name}
              disabled={disabled}
              controlSize="md"
              aria-label="Назва позиції"
              placeholder={namePlaceholder}
              autoFocus={autoFocusName}
              className="min-w-0"
              onChange={(event) => onPatch({ name: event.target.value })}
            />
          )}

          {hasMeta ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
              {/*
                Мітки рядка й варіанта не пігулки: пігулка обіцяє дію або стан,
                а це просто підпис, звідки взялась позиція. Пігулка лишилась
                там, де вона щось означає, — на попередженні про діапазон.
              */}
              {/*
                КОЛІР І КОД — ПІД НАЗВОЮ, а не чипом у нижній смузі (Артем,
                08.09.2026). Чип обіцяв дію, якої в нього немає: колір обрали
                ще в підказці, і тут він просто паспорт товару — те саме, що
                «додасться в базу», яке стоїть поруч.
              */}
              {color || sku ? (
                <span
                  className="inline-flex items-center gap-1.5 text-muted-foreground"
                  title={sku ? `Артикул: ${sku}` : undefined}
                >
                  {color ? <span className="max-w-52 truncate">{color}</span> : null}
                  {sku ? <span className="font-medium tabular-nums">{sku}</span> : null}
                </span>
              ) : null}
              {draft.sourceRows.length > 0 ? (
                <span className="text-muted-foreground">рядок {draft.sourceRows.join(", ")}</span>
              ) : null}
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
              {/* Причина відсутнього фото стоїть поруч із джерелами: «сайт не
                  пускає роботів» — це підказка відкрити його руками, а не
                  повідомлення про поломку. */}
              {preview && preview.status !== "pending" && preview.status !== "done" ? (
                <span className="text-muted-foreground/70">{preview.reason}</span>
              ) : null}
            </div>
          ) : null}

          {sources.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={source.url}
                  className="inline-flex items-center gap-1 text-2xs text-muted-foreground transition-colors hover:text-primary"
                >
                  <span className="underline underline-offset-2">{source.name}</span>
                  <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-60" />
                </a>
              ))}
            </div>
          ) : null}

          {draft.comment || draft.notes ? (
            <Input
              value={draft.comment}
              disabled={disabled}
              controlSize="sm"
              aria-label="Коментар замовника"
              placeholder={draft.notes ?? "Коментар замовника"}
              onChange={(event) => onPatch({ comment: event.target.value })}
            />
          ) : null}
        </div>

        {/*
          ЦІНА — ЧИСЛО, А НЕ ПОЛЕ. Вона приходить із пулу, її не набирають, і
          підпис «закупівельна» їй не потрібен: у команді знають, яка це ціна,
          а число такого розміру вже саме каже, що воно тут головне. Суми
          «тираж × ціна» немає навмисно — до націнки вона виглядала б як
          відповідь, не будучи нею.
        */}
        {price ? (
          <div className="flex shrink-0 items-baseline gap-1" title="Ціна за одиницю з пулу постачальників">
            <span className="text-xl font-semibold leading-none tabular-nums">{formatAmount(price.amount)}</span>
            <span className="text-2xs text-muted-foreground">{currencyLabel(price.currency)}</span>
          </div>
        ) : null}

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
        НИЖНЯ СМУГА — ЯК РАХУЄМО: вид, колір, нанесення й тиражі. Тиражі
        стоять праворуч рівними комірками з «плюсом»: вони ВЗАЄМОВИКЛЮЧНІ —
        250 · 500 · 1000 означає три ціни на вибір замовника, а не 1750 штук, —
        тому між ними немає ані знаків додавання, ані підсумку.
      */}
      <div className="flex items-center gap-1.5 border-t border-border/60 bg-muted/20 px-3 py-2">
        {/*
          Ліва частина стискається, права — ні. Поки нанесення не назвали,
          смуга пропонує методи, і їх завжди більше, ніж влазить: без цього
          пропозиції відсували тиражі на другий рядок, і смуга виростала
          вдвічі на КОЖНІЙ позиції. «Ще N» усередині вже забирає зайве.
          Названі пари — виняток (REQ-182#p24): відповідь ховати не можна,
          тож вони переносяться.
        */}
        <div
          className={cn(
            "flex min-w-0 items-center gap-1.5",
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
        {/*
          Комірки стоять без підписів «тиражі» й «шт» (Артем, 08.09.2026):
          порожня каже «к-ть» сама, а заповнена — це число в рядку позиції,
          де інших чисел немає. Два підписи на кожній позиції коштували більше
          за те, що пояснювали.
        */}
        <div className="ml-auto shrink-0 pl-2">
          <RunsField
            runs={draft.runs}
            disabled={disabled}
            onPatchRun={onPatchRun}
            onAddRun={onAddRun}
            onRemoveRun={onRemoveRun}
          />
        </div>
      </div>
    </div>
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
  /**
   * Пошук по видах. Їх 92 — гортати стільки, щоб знайти «Поло», людина не буде
   * (скарга Артема 05.09). Фільтр чисто на клієнті: список уже в пам'яті, тож
   * ні запиту, ні витрат.
   *
   * Шукаємо і по виду, і по ТИПУ: серед 92 є однойменні види в різних типах
   * («Антистрес» двічі), і без типу вибір із двох однакових рядків — лотерея.
   */
  const [search, setSearch] = React.useState("");
  const needle = search.trim().toLowerCase();

  React.useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const groups = React.useMemo(() => {
    const byType = new Map<string, { typeName: string; kinds: DraftKindOption[] }>();
    for (const option of options) {
      if (needle && !`${option.kindName} ${option.typeName}`.toLowerCase().includes(needle)) continue;
      const group = byType.get(option.typeId) ?? { typeName: option.typeName, kinds: [] };
      group.kinds.push(option);
      byType.set(option.typeId, group);
    }
    return [...byType.values()];
  }, [options, needle]);

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
            /*
              БЕЗ СЛОВА «ПРИПУЩЕННЯ» (Артем, 08.09.2026). Те саме вже сказано
              двічі: пунктирна рамка чипа й підпис «додасться в базу» під
              назвою. Третій раз забирав ширину в смуги нанесення. Здогад
              лишається здогадом — про це каже пунктир, і виправити його
              однаково один клік.
            */
            value.kindName
          ) : (
            "Вид товару?"
          )}
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <div className="relative mb-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Пошук виду"
            className="h-8 rounded-full pl-8 text-sm"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">Такого виду немає</p>
        ) : null}
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
        </div>
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
 * Тиражі — рівні комірки з «плюсом» (REQ-250#p34).
 *
 * ВОНИ ВЗАЄМОВИКЛЮЧНІ, і розкладка мусить це казати. Тираж — це «а скільки
 * буде, якщо стільки»: 250 · 500 · 1000 означає три ціни на вибір замовника,
 * а не 1750 штук. Тому комірки стоять поруч рівними варіантами, без знаків
 * додавання й без підсумку, а підписи «тиражі» й «шт» лишились по краях
 * групи — одні на всі комірки, скільки б їх не було.
 *
 * ДО ЦЬОГО вони жили одним полем із роздільниками (REQ-182#p22): так вони
 * влазили в один рядок поруч із назвою, і саме заради цього все й робилось.
 * Тепер тиражі переїхали на власну смугу, місця там вистачає й на чотири, і
 * склеєне поле лишалось би рішенням для проблеми, якої більше немає.
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
  /*
    ЩЕ ОДИН ТИРАЖ — ЛИШЕ КОЛИ ПОПЕРЕДНІЙ ЗАПОВНЕНИЙ.
    Порожній тираж — це не варіант, це незадане питання: «Створити» на ньому
    однаково спиняється й каже вписати кількість. Кнопка, яка додає другу таку
    саму зупинку, лише забирає місце.
  */
  const blocked = runs.some((run) => run.quantity <= 0);

  return (
    <div className={cn("flex items-center gap-1.5", disabled && "opacity-50")}>
      {runs.map((run) => (
        <div key={run.key} className="group/run relative">
          <NumberInput
            value={run.quantity > 0 ? run.quantity : null}
            min={0}
            emptyValue={0}
            controlSize="sm"
            disabled={disabled}
            aria-label="Кількість тиражу"
            placeholder="к-ть"
            // Комірка 64 px тримає п'ятизначне число (найбільший тираж у базі —
            // 25 000). Число праворуч: так вони читаються стовпчиком, а не
            // стрибають за довжиною.
            className="w-16 bg-background text-right tabular-nums placeholder:text-2xs focus:placeholder:text-transparent"
            onValueChange={(next) => onPatchRun(run.key, { quantity: Math.max(0, next ?? 0) })}
          />
          {onRemoveRun && runs.length > 1 ? (
            <button
              type="button"
              disabled={disabled}
              aria-label="Прибрати тираж"
              onClick={() => onRemoveRun(run.key)}
              className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-border/60 bg-background text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/run:opacity-100"
            >
              <X className="h-2.5 w-2.5" strokeWidth={2.5} />
            </button>
          ) : null}
        </div>
      ))}
      {onAddRun ? (
        <HoverTip
          asChild
          label={
            blocked
              ? "Спершу впишіть кількість — порожній тираж нема з чим порівнювати"
              : "Клієнт просить порахувати кілька кількостей"
          }
        >
          <button
            type="button"
            disabled={disabled || blocked}
            aria-label="Додати ще тираж"
            onClick={onAddRun}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </HoverTip>
      ) : null}
    </div>
  );
}
