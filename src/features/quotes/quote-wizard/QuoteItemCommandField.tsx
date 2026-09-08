import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Database, ExternalLink, ImageOff, Link2, Loader2, Plus, Search } from "lucide-react";

import { SEARCH_LEFT_ICON } from "@/components/ui/controlStyles";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  applySupplierVariant,
  formatSupplierPoolPrice,
  searchSupplierPool,
  type SupplierPoolProduct,
} from "@/lib/supplierPool";
import { cn } from "@/lib/utils";

import { useCatalogSkuMatches } from "./catalogSkuSearch";
import { detectCommandFieldMode, parseCommandFieldLinks, type CommandFieldMode } from "./commandFieldValue";
import { rankCatalogSuggestions, type CatalogSuggestion } from "./catalogSuggestions";

/**
 * Одне поле замість трьох вкладок (REQ-182#p14).
 *
 * ЩО ВОНО РОЗУМІЄ. Посилання — і поле каже «Посилання» праворуч: Enter додає
 * позицію, а сторінку читає розвідка. Будь-що інше — це назва, і поле каже
 * «З бази»: під ним підказки з каталогу, а останнім рядком «Додати як нову
 * позицію» — колишнє «руками», яке тепер не окремий шлях, а те, що лишається,
 * коли в базі такого немає.
 *
 * ЧОМУ БЕЗ ВКЛАДОК. Вкладки «Руками · Excel · Посилання» просили відповісти
 * «звідки», перш ніж сказати «що». А «що» саме й каже «звідки»: адреса видно
 * по собі, назва — теж. Перемикач між ними не ніс інформації, лише скидав
 * список позицій при кожному перемиканні.
 *
 * ФОКУС ЛИШАЄТЬСЯ В ПОЛІ. Підказки не забирають фокус ані при відкритті, ані
 * при кліку по рядку: після вибору менеджер одразу набирає наступний товар.
 * Стрілки ходять по рядках, Enter бере підсвічений, Esc ховає список, не
 * стираючи набраного.
 */

const MODE_LABELS: Record<CommandFieldMode, { label: string; icon: typeof Link2 }> = {
  link: { label: "Посилання", icon: Link2 },
  search: { label: "З бази", icon: Database },
};

/**
 * Як поле зветься при кожному виді прорахунку (REQ-178#p11).
 *
 * Було одне слово «Товар» на обидва: у режимі «Поліграфія» поле просило товар,
 * хоч рахуємо щоденники й каталоги, — і читач екрана казав те саме. Слово в
 * підписі має збігатися з тим, що людина щойно обрала плиткою «Рахуємо».
 */
const KIND_WORDING: Record<
  "merch" | "print",
  { label: string; placeholder: string; more: string }
> = {
  merch: {
    label: "Товар: посилання або назва",
    placeholder: "Вставте посилання на товар або почніть писати назву — підкажемо з бази",
    more: "Ще товар: посилання або назва з бази",
  },
  print: {
    label: "Позиція: посилання або назва",
    placeholder: "Вставте посилання на виріб або почніть писати назву — підкажемо з бази",
    more: "Ще позиція: посилання або назва з бази",
  },
};

export function QuoteItemCommandField({
  teamId,
  kind = "merch",
  value,
  onValueChange,
  suggestions,
  suggestionsLoading,
  disabled,
  busy,
  hasDrafts,
  onPickCatalog,
  onAddLinks,
  onAddName,
  onPickSupplier,
  onInvalid,
}: {
  /** Для пошуку за артикулом варіанта — він іде запитом у базу (REQ-248). */
  teamId: string;
  /** Що рахуємо: від цього залежить, як поле себе називає (REQ-178#p11). */
  kind?: "merch" | "print";
  value: string;
  onValueChange: (next: string) => void;
  suggestions: CatalogSuggestion[];
  suggestionsLoading: boolean;
  disabled?: boolean;
  /** Розвідка посилань ще йде — крутилка праворуч, поле при цьому НЕ блокується. */
  busy?: boolean;
  hasDrafts: boolean;
  onPickCatalog: (suggestion: CatalogSuggestion) => void;
  onAddLinks: (urls: string[]) => void;
  onAddName: (name: string) => void;
  /**
   * Обрано товар постачальника. Окремо від `onAddName`, бо він несе ще й фото та
   * артикул — те, що людина щойно бачила в підказці. Через `onAddName` картинка
   * губилась, і в позиції лишався сірий квадрат.
   */
  onPickSupplier: (product: SupplierPoolProduct) => void;
  /** Що саме не схоже на посилання — вікно покаже це своєю смугою помилки. */
  onInvalid: (message: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [active, setActive] = React.useState(0);

  const trimmed = value.trim();
  const wording = KIND_WORDING[kind];
  const mode = detectCommandFieldMode(value);
  // Артикули варіантів шукає база — і лише коли набране схоже на код; на
  // назви цей запит не йде взагалі (REQ-248).
  const { matches: skuMatches, searching: skuSearching } = useCatalogSkuMatches(
    teamId,
    mode === "search" ? trimmed : ""
  );
  const ranked = React.useMemo(
    () => (mode === "search" ? rankCatalogSuggestions(suggestions, trimmed, undefined, skuMatches) : []),
    [mode, suggestions, trimmed, skuMatches]
  );

  /**
   * Товари постачальників — у ТОМУ САМОМУ списку, а не окремим пошуком
   * (рішення Артема 05.09). Менеджер не має вирішувати наперед, де шукати:
   * він пише назву, а звідки вона знайшлась — уже відповідь, а не питання.
   *
   * Каталог іде першим свідомо: перевірене, що ми вже продавали, має стояти
   * вище прайсу на тисячі позицій (§6а docs/CATALOG_DESIGN.md).
   */
  const poolTerm = useDebouncedValue(mode === "search" ? trimmed : "", 250);
  const { data: poolData, isFetching: poolSearching } = useQuery({
    queryKey: ["supplier-pool", poolTerm],
    queryFn: () => searchSupplierPool(poolTerm, { limit: 6 }),
    enabled: poolTerm.length >= 2,
    staleTime: 60_000,
  });
  const pool = poolTerm.length >= 2 ? poolData ?? [] : [];

  // Рядків у списку: каталог + постачальники + «Додати як нову позицію».
  // Каталог згорнутий за замовчуванням, тож його рядки в нумерації участі не
  // беруть: інакше стрілки провалювалися б у невидимі рядки.
  const [catalogOpen, setCatalogOpen] = React.useState(false);
  const catalogRows = catalogOpen ? ranked.length : 0;
  const rowCount = pool.length + catalogRows + 1;
  const addRowIndex = pool.length + catalogRows;
  const open = focused && !dismissed && mode === "search" && trimmed.length > 0;

  // Новий текст — новий список: підсвітка повертається на перший рядок, а
  // схований Esc список показується знову, бо людина продовжила набирати.
  React.useEffect(() => {
    setActive(0);
    setDismissed(false);
    setCatalogOpen(false);
  }, [trimmed]);

  const commitName = () => {
    if (!trimmed) return;
    onAddName(trimmed);
    onValueChange("");
  };

  const commitLinks = () => {
    const { urls, bad } = parseCommandFieldLinks(value);
    if (bad) {
      // Одна адреса — кажемо, чого їй бракує; список — називаємо, який саме
      // рядок зайвий, бо решту вже впізнали як посилання.
      const single = value.trim().split(/[\s,]+/).filter(Boolean).length === 1;
      onInvalid(
        single
          ? "Це не схоже на посилання: потрібна адреса, що починається з http:// або https://."
          : `«${bad.slice(0, 60)}» не схоже на посилання — приберіть його зі списку.`
      );
      return;
    }
    if (urls.length === 0) return;
    onAddLinks(urls);
    onValueChange("");
  };

  // Який товар зараз показує кольори. Один на весь список: два розкриті рядки
  // одночасно перетворюють підказку на простирадло.
  const [expandedPoolKey, setExpandedPoolKey] = React.useState<string | null>(null);

  const commitRow = (index: number) => {
    const suggestion = catalogOpen ? ranked[index - pool.length] : undefined;
    if (suggestion) {
      onPickCatalog(suggestion);
      onValueChange("");
      return;
    }
    const product = pool[index];
    if (product) {
      // Товар постачальника — це ще НЕ модель каталогу: у нього немає ні виду,
      // ні пресетів. Але назву, фото й артикул він приносить із собою — саме те,
      // що людина щойно бачила в підказці. Прив'язка позиції до самої пропозиції
      // — наступний крок (p9/p10), і робити її тихо тут було б рішенням за людину.
      onPickSupplier(product);
      onValueChange("");
      return;
    }
    commitName();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (mode === "link") commitLinks();
      else if (open) commitRow(active);
      else commitName();
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % rowCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + rowCount) % rowCount);
    } else if (event.key === "Escape") {
      // Esc ховає список, але НЕ закриває вікно: зупиняємо подію тут, інакше
      // діалог сприйме її як «закрити», і набране пропаде разом із вікном.
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
    }
  };

  const ModeIcon = MODE_LABELS[mode].icon;
  const listId = React.useId();

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        {/*
          ЦЕ ТОЙ САМИЙ ПОШУК, ЩО В ТУЛБАРІ ПРОРАХУНКІВ, а не схожий на нього.
          Спершу я зібрав поле руками за прототипом: своя висота 44, тло замість
          рамки й підсвітка `ring-2` на фокусі. Рінг у цьому застосунку прибрано
          свідомо (див. CONTROL_BASE у controlStyles: «рінг давав блюр-глоу на
          темній»), тож моє поле поводилось інакше за всі інші поля CRM — на це
          Артем і поскаржився. Тепер тут звичайний <Input> із канонічною
          поверхнею: на фокусі темнішає рамка й тло стає `background`, як у
          «Пошук за назвою…». Іконка ліворуч — тим самим `SEARCH_LEFT_ICON`.
        */}
        <div className="relative">
          <Search className={cn(SEARCH_LEFT_ICON, "h-4 w-4")} aria-hidden />
          <Input
            ref={inputRef}
            value={value}
            disabled={disabled}
            role="combobox"
            aria-label={wording.label}
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder={hasDrafts ? wording.more : wording.placeholder}
            // Праворуч сидить підпис режиму, тож поле лишає під нього місце —
            // інакше довгий текст заїжджав би під «Посилання».
            className={cn("pl-9", trimmed || busy ? "pr-32" : "pr-3.5")}
            onChange={(event) => onValueChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
          />
          {/*
            Підпис праворуч — не кнопка, а відповідь поля на набране: «це я
            прочитаю як посилання» або «це шукаю в базі». Показується, щойно є
            що тлумачити; на порожньому полі йому нема про що казати.
          */}
          <div className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Читаю сторінку" /> : null}
            {trimmed ? (
              <span
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
                aria-live="polite"
              >
                <ModeIcon className="h-3 w-3" />
                {MODE_LABELS[mode].label}
              </span>
            ) : null}
          </div>
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] p-1.5"
        // Фокус лишається в полі: список — це підказка до набору, а не форма.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        // Клік по рядку — «вибрати», а не «клікнули повз поле»: без цього
        // втрата фокуса закривала б список раніше, ніж клік доходив до рядка.
        onInteractOutside={(event) => {
          if (event.target instanceof Node && inputRef.current?.contains(event.target)) event.preventDefault();
        }}
      >
        <ul id={listId} role="listbox" aria-label="Підказки з каталогу" className="space-y-0.5">
          {(suggestionsLoading || skuSearching) && ranked.length === 0 ? (
            <li className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {suggestionsLoading ? "Читаю каталог…" : "Шукаю за артикулом…"}
            </li>
          ) : null}
          {/*
            «Немає» не блимає, поки шукаємо за артикулом: код знаходиться
            запитом, і сказати «немає» до відповіді означало б збрехати на
            двісті мілісекунд рівно тим людям, які вставили артикул.
          */}
          {!suggestionsLoading && !skuSearching && ranked.length === 0 && pool.length === 0 && !poolSearching ? (
            <li className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">У базі такого немає</li>
          ) : null}

          {/* Постачальники — та сама вітрина, тільки вбудована в один список.
              Заголовок пояснює, чому ці рядки виглядають інакше: у них немає
              виду й пресетів, зате є ціна й сайт. */}
          {pool.length > 0 ? (
            <li
              aria-hidden
              className={cn(
                "px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground/70"
              )}
            >
              У постачальників
            </li>
          ) : null}
          {pool.map((product, index) => {
            const price = formatSupplierPoolPrice(product);
            const expanded = expandedPoolKey === product.key;
            const unit = product.variantsAreColors ? "кольор." : "вар.";
            return (
              <li
                key={product.key}
                role="option"
                aria-selected={active === index}
                className={cn(
                  "group cursor-pointer rounded-[var(--radius-lg)] px-2 py-1.5 text-sm",
                  active === index ? "bg-muted" : "hover:bg-muted/50"
                )}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitRow(index)}
              >
                <span className="flex items-center gap-3">
                  <SuggestionPhoto url={product.imageUrl} name={product.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium" title={product.name}>{product.name}</span>
                    {/* Перехід на сайт живе НА САМОМУ ДОМЕНІ, а не в правому
                        краю рядка. Спершу я поставив іконку праворуч, поруч із
                        ціною — і вона посунула всю праву частину рядка, бо
                        місце під неї резервується завжди, хоч видно її лише на
                        наведенні. Тут вона дописується в кінець рядка, після
                        якого нічого немає, тож не зсуває нічого. І читається
                        як належить: «відкрити ось цей сайт».
                        stopPropagation обов'язковий — клік по рядку КОМІТИТЬ
                        позицію, тож без нього «глянути» означало б «додати». */}
                    <span className="block truncate text-2xs text-muted-foreground">
                      {product.article ? `${product.article} · ` : null}
                      {product.url ? (
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Відкрити на сайті постачальника"
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                          }}
                          className="inline-flex items-center gap-0.5 align-baseline underline-offset-2 transition-colors group-hover:text-primary group-hover:underline"
                        >
                          {product.supplierSlug}
                          <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        </a>
                      ) : (
                        product.supplierSlug
                      )}
                    </span>
                  </span>
                  {/* Лічильник варіантів став кнопкою: клік розкриває кольори, а
                      не додає товар. Тому й stopPropagation — рядок навколо
                      комітить позицію. */}
                  {product.variantCount > 1 ? (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpandedPoolKey(expanded ? null : product.key);
                      }}
                      className="flex shrink-0 items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    >
                      {product.variantCount} {unit}
                      <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
                    </button>
                  ) : null}
                  {price ? (
                    <span className="shrink-0 whitespace-nowrap text-2xs tabular-nums text-muted-foreground">{price}</span>
                  ) : null}
                </span>

                {expanded ? (
                  <span className="mt-1.5 flex flex-wrap gap-1.5 pl-11">
                    {product.variants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        title={[variant.label, variant.article].filter(Boolean).join(" · ")}
                        onClick={(event) => {
                          event.stopPropagation();
                          onPickSupplier(applySupplierVariant(product, variant));
                          onValueChange("");
                          setExpandedPoolKey(null);
                        }}
                        className="flex items-center gap-1.5 rounded-md border border-border/60 py-0.5 pl-0.5 pr-2 text-2xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
                          {variant.imageUrl ? (
                            <img src={variant.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : null}
                        </span>
                        <span className="max-w-[8rem] truncate">{variant.label ?? "Без підпису"}</span>
                      </button>
                    ))}
                  </span>
                ) : null}
              </li>
            );
          })}

          {/* КАТАЛОГ ПІД ПОСТАЧАЛЬНИКАМИ І ЗГОРНУТИЙ (рішення Артема 08.09.2026).
              Спершу він стояв першим: перевірене, що ми вже продавали, мало
              бути вище прайсу на тисячі позицій. Але пул виріс до шістнадцяти
              тисяч рядків з артикулами, цінами й фото — і каталог зі своїми
              250 моделями почав не підтверджувати вибір, а відсувати те, за чим
              прийшли. Тепер він унизу й за клацанням: видно, що річ ми вже
              продавали, але місця в списку він не займає. */}
          {/* Заголовок каталогу — БЕЗ aria-hidden, на відміну від заголовка
              постачальників: там просто підпис, а тут кнопка. Схована гілка
              дерева доступності робить її невидимою і для читалки екрана, і
              для тестів. */}
          {ranked.length > 0 ? (
            <li
              role="presentation"
              className={cn("pt-1", pool.length > 0 && "mt-1 border-t border-border/60")}
            >
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setCatalogOpen((value) => !value)}
                className="flex w-full items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <ChevronDown className={cn("h-3 w-3 transition-transform", !catalogOpen && "-rotate-90")} />
                Уже в каталозі
                <span className="font-normal normal-case tracking-normal">({ranked.length})</span>
              </button>
            </li>
          ) : null}
          {catalogOpen ? (
            ranked.map((suggestion, rankedIndex) => {
              const index = pool.length + rankedIndex;
              return (
              <li
                key={suggestion.modelId}
                role="option"
                aria-selected={active === index}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] px-2 py-1.5 text-sm",
                  active === index ? "bg-muted" : "hover:bg-muted/50"
                )}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitRow(index)}
              >
                <SuggestionPhoto url={suggestion.imageUrl} name={suggestion.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" title={suggestion.name}>{suggestion.name}</span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {suggestion.kindName} · {suggestion.typeName}
                    {/* Артикул у другому рядку — щоб було видно, ЧОМУ модель
                        знайшлась, коли шукали кодом, а не назвою (REQ-178#p7).
                        Знайшлась за кодом кольору — показуємо САМЕ той код, а не
                        артикул першого варіанта: інакше збіг виглядає випадковим,
                        і менеджер не впізнає свій товар (REQ-248). */}
                    {suggestion.matched?.sku ?? suggestion.sku ? (
                      <span className="text-muted-foreground/70"> · арт. {suggestion.matched?.sku ?? suggestion.sku}</span>
                    ) : null}
                  </span>
                </span>
              </li>
              );
            })
          ) : null}

          <li
            role="option"
            aria-selected={active === addRowIndex}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] px-2 py-1.5 text-sm",
              addRowIndex > 0 && "mt-1 border-t border-border/60 pt-2",
              active === addRowIndex ? "bg-muted" : "hover:bg-muted/50"
            )}
            onMouseEnter={() => setActive(addRowIndex)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commitRow(addRowIndex)}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] border border-dashed border-border text-muted-foreground">
              <Plus className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                Додати «<span className="font-medium">{trimmed}</span>» як нову позицію
              </span>
              <span className="block text-2xs text-muted-foreground">Без каталогу — назва й тираж, решта в картці</span>
            </span>
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Пауза перед запитом до пулу: каталог уже в пам'яті, а пул — це база. */
function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function SuggestionPhoto({ url, name }: { url: string | null; name: string }) {
  const base = "h-9 w-9 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-border/60 bg-background";
  if (!url) {
    return (
      <span className={cn(base, "grid place-items-center bg-muted/40")} aria-hidden>
        <ImageOff className="h-3.5 w-3.5 text-muted-foreground/50" />
      </span>
    );
  }
  return <img src={url} alt={name} loading="lazy" className={cn(base, "object-contain")} />;
}
