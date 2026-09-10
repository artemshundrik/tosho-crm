import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, ImageOff, Link2, Loader2, Plus, Search } from "lucide-react";

import { SEARCH_LEFT_ICON } from "@/components/ui/controlStyles";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  applySupplierVariant,
  formatSupplierPoolPrice,
  searchSupplierPool,
  supplierDisplayName,
  supplierVariantUnit,
  type SupplierPoolProduct,
} from "@/lib/supplierPool";
import { cn } from "@/lib/utils";

import { useCatalogSkuMatches } from "./catalogSkuSearch";
import { detectCommandFieldMode, parseCommandFieldLinks, type CommandFieldMode } from "./commandFieldValue";
import { rankCatalogSuggestions, type CatalogSuggestion } from "./catalogSuggestions";
import {
  filterSupplierPool,
  POOL_FILTER_ALL,
  SuggestListFooter,
  SupplierPoolFilterBar,
  type PoolFilter,
} from "@/components/catalog/SupplierPoolFilterBar";

/**
 * Одне поле замість трьох вкладок (REQ-182#p14).
 *
 * ЩО ВОНО РОЗУМІЄ. Посилання — і поле каже «Посилання» праворуч: Enter додає
 * позицію, а сторінку читає розвідка. Будь-що інше — це назва, і поле каже
 * «Шукаю за назвою»: під ним підказки з каталогу, а останнім рядком «Додати як нову
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
 * Стрілки ходять по рядках, Enter бере підсвічену ПІДКАЗКУ (але не «додати як
 * нову позицію» — та лише кліком), Esc ховає список, не стираючи набраного.
 */

const MODE_LABELS: Record<CommandFieldMode, { label: string; icon: typeof Link2 }> = {
  link: { label: "Посилання", icon: Link2 },
  search: { label: "Шукаю за назвою", icon: Search },
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
  /**
   * Вікно, за межі якого поповер не вилазить. Запам'ятовується, коли поле
   * стає в DOM, а не читається з рефа під час рендеру: реф у рендері — це
   * значення, якого React у цей момент ще не гарантує, і компілятор має рацію,
   * коли на це свариться. Поле живе всередині вікна прорахунку, тож предок
   * `[role="dialog"]` на місці вже на монтуванні.
   */
  const [dialogBoundary, setDialogBoundary] = React.useState<Element | null>(null);
  const attachInput = React.useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    setDialogBoundary(node?.closest('[role="dialog"]') ?? null);
  }, []);
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
    // ДВАДЦЯТЬ ЧОТИРИ, А НЕ ШІСТЬ. Шість карток на чотири джерела — це
    // півтори на джерело, і список показував не найкраще, а першу-ліпшу пару з
    // кожного (Артем, 08.09.2026: «давай не 6, а більше, у нас є місце»).
    // Місце справді є: список тепер із власним скролом, тож довжина його не
    // роздуває. Квота рядків на джерело в RPC від цього не залежить — вона й
    // так не менша за двісті.
    queryFn: () => searchSupplierPool(poolTerm, { limit: 24 }),
    enabled: poolTerm.length >= 2,
    staleTime: 60_000,
  });
  const pool = React.useMemo(
    () => (poolTerm.length >= 2 ? poolData ?? [] : []),
    [poolTerm, poolData]
  );

  /**
   * Фільтр джерел. Живе тут, а не в смузі, бо від нього залежить нумерація
   * рядків для стрілок: сховане джерело не має «з'їдати» натиски вниз.
   */
  const [poolFilter, setPoolFilter] = React.useState<PoolFilter>(POOL_FILTER_ALL);
  const visiblePool = React.useMemo(() => filterSupplierPool(pool, poolFilter), [pool, poolFilter]);
  const changeFilter = (next: PoolFilter) => {
    setPoolFilter(next);
    // Підсвітка вертається на початок: рядок під нею щойно міг зникнути.
    setActive(0);
    setExpandedPoolKey(null);
  };

  // ЛУПА СТАЄ КРУТІЛКОЮ. Пул шукається запитом у базу, і на широкому слові це
  // помітна пауза — а поле мовчало: людина не розуміла, чи воно думає, чи вже
  // нічого не знайшло, і встигала дописати ще пів слова. Крутілка на місці
  // лупи не додає в поле жодного нового елемента, тож нічого не зсуває.
  //
  // Дебаунс теж рахується за пошук. `poolTerm` відстає від набраного на 250 мс,
  // і поки він відстає, ЖОДЕН прапорець завантаження ще не піднятий — а пауза
  // вже йде. Без цієї умови крутілка спалахувала б із запізненням і саме на
  // короткі запити не з'являлась би взагалі.
  const searching =
    mode === "search" &&
    trimmed.length >= 2 &&
    (poolTerm !== trimmed || poolSearching || suggestionsLoading || skuSearching);

  // Рядків у списку: каталог + постачальники + «Додати як нову позицію».
  // Каталог згорнутий за замовчуванням, тож його рядки в нумерації участі не
  // беруть: інакше стрілки провалювалися б у невидимі рядки.
  const [catalogOpen, setCatalogOpen] = React.useState(false);
  const catalogRows = catalogOpen ? ranked.length : 0;
  const rowCount = visiblePool.length + catalogRows + 1;
  const addRowIndex = visiblePool.length + catalogRows;
  const open = focused && !dismissed && mode === "search" && trimmed.length > 0;

  // Новий текст — новий список: підсвітка повертається на перший рядок, а
  // схований Esc список показується знову, бо людина продовжила набирати.
  React.useEffect(() => {
    setActive(0);
    setDismissed(false);
    setCatalogOpen(false);
    // Фільтр теж скидається: він відповідав на ПОПЕРЕДНЄ слово, і залишений
    // «Бергамо» на новому запиті виглядав би як «у нас нічого немає».
    setPoolFilter(POOL_FILTER_ALL);
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
  /**
   * «Показати всі кольори» пам'ятає ТОВАР, а не так/ні. Раніше це був прапорець
   * плюс ефект, який гасив його на зміну розкритого рядка, — тобто зайвий прохід
   * рендеру на кожне розкриття. Ключ дає те саме: розкрили інший товар — умова
   * перестала збігатись, і список кольорів знову підрізаний.
   */
  const [allColorsKey, setAllColorsKey] = React.useState<string | null>(null);
  const allColors = allColorsKey !== null && allColorsKey === expandedPoolKey;
  /**
   * КЛІК ПО КОЛЬОРУ ДОДАЄ ПОЗИЦІЮ (Артем, 09.09.2026).
   *
   * Один день між рішеннями: 08.09 колір став СТАНОМ — плитка обирала, а
   * додавала окрема кнопка, щоб фото рядка встигло стати фотом того кольору.
   * Відтоді плитка навчилась показувати і фото кольору, і його код просто на
   * собі, тож підтверджувати стало нічого: кнопка повторювала вже зроблений
   * вибір і до того ж накривала «ще N».
   */
  /**
   * ОДИН ТОВАР РОЗКРИВАЄТЬСЯ САМ (Артем, 08.09.2026, за макетом вузького пошуку).
   *
   * Вузький пошук — головний спосіб користуватись цим полем: менеджер знає, яка
   * модель йому потрібна, і шукає кодом або назвою. Заміряно на проді: точний код
   * дає 2 рядки, «zian» і «marieta» — по одній картці. У такому списку вибирати
   * нема з чого, а колір однаково доведеться обрати — без нього товар не
   * додається. Тобто обов'язковий клік по єдиному рядку не ніс жодного рішення.
   *
   * Розкриваємо лише те, що САМЕ ПОТРЕБУЄ вибору кольору: у картки зі спільним
   * артикулом розкривати нічого, її додають одним кліком як і раніше.
   */
  React.useEffect(() => {
    if (visiblePool.length !== 1) return;
    const only = visiblePool[0];
    if (!only || !needsVariantChoice(only)) return;
    setExpandedPoolKey(only.key);
  }, [visiblePool]);

  const commitRow = (index: number) => {
    const suggestion = catalogOpen ? ranked[index - visiblePool.length] : undefined;
    if (suggestion) {
      onPickCatalog(suggestion);
      onValueChange("");
      return;
    }
    const product = visiblePool[index];
    if (product) {
      /**
       * БЕЗ КОЛЬОРУ ТОВАР НЕ ДОДАЄТЬСЯ, якщо код у кольорів різний (Артем,
       * 08.09.2026). Артикул у пулі — це код КОЛЬОРУ, і картка показує його
       * лише тоді, коли він однаковий у всіх варіантів; таких меншість —
       * заміряно на проді: 44% карток Аванпринта, 39% Тотобі, 32% Бергамо.
       * Тобто клік по рядку в більшості випадків клав у прорахунок позицію
       * БЕЗ коду — а за кодом товар і замовляють. Вгадати його не можна:
       * неправильний гірший за порожній, бо його ніхто не перевіряє очима.
       *
       * Тому такий клік не додає, а РОЗКРИВАЄ кольори. Запасного «додати без
       * кольору» немає навмисно: він би й лишився головним шляхом.
       */
      if (needsVariantChoice(product)) {
        setExpandedPoolKey(product.key);
        return;
      }
      // Товар постачальника — це ще НЕ модель каталогу: у нього немає ні виду,
      // ні пресетів. Але назву, фото, артикул і посилання він приносить із
      // собою — саме те, що людина щойно бачила в підказці.
      onPickSupplier(product);
      onValueChange("");
      return;
    }
    commitName();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (mode === "link") {
        commitLinks();
        return;
      }
      /**
       * ENTER НЕ СТВОРЮЄ ПОЗИЦІЮ З НАБРАНОГО ТЕКСТУ (Артем, 08.09.2026).
       *
       * Раніше створював, і це давало сміття рівно там, де людина ні в чому не
       * винна: поки пул шукається, список ще порожній, і рядок «Додати як нову
       * позицію» лишається ЄДИНИМ, тобто підсвіченим. Той, хто набрав назву й
       * за звичкою натиснув Enter, діставав позицію з голим текстом замість
       * товару, який приїхав би за півсекунди.
       *
       * Тепер Enter бере лише СПРАВЖНЮ підказку — з каталогу або від
       * постачальника. Рядок «додати як нову» нікуди не подівся (без нього
       * нема чим порахувати нестандарт), але тепер він вимагає свідомого
       * кліку, а не випадкового натиску.
       */
      if (open && !searching && active < addRowIndex) commitRow(active);
      return;
    }
    if (!open) return;
    /**
     * ДЖЕРЕЛО ПЕРЕМИКАЄТЬСЯ З КЛАВІАТУРИ, І БЕЗ ЦЬОГО ФІЛЬТР БУВ БИ ЛИШЕ ДЛЯ
     * МИШІ. Фокус у цьому полі навмисно нікуди не йде — ані на відкритті
     * списку, ані на кліку по рядку, — тож дійти до чипів табом не можна не
     * зламавши цього. Alt зі стрілками вбік не конфліктує ні з рухом по
     * рядках (просто стрілки), ні з правкою тексту.
     */
    if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      const slugs = [null, ...new Set(pool.flatMap((item) => item.sources.map((source) => source.supplierSlug)))];
      const at = slugs.indexOf(poolFilter.source);
      const step = event.key === "ArrowRight" ? 1 : -1;
      changeFilter({ ...poolFilter, source: slugs[(at + step + slugs.length) % slugs.length] ?? null });
      return;
    }
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
          {searching ? (
            <Loader2 className={cn(SEARCH_LEFT_ICON, "h-4 w-4 animate-spin")} aria-label="Шукаю" />
          ) : (
            <Search className={cn(SEARCH_LEFT_ICON, "h-4 w-4")} aria-hidden />
          )}
          <Input
            ref={attachInput}
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
        /*
          МЕЖА — САМЕ ВІКНО, А НЕ ЕКРАН (Артем, 09.09.2026: «щоб цей поповер не
          вилазив за модалку»). Поповер портується в body, тож за замовчуванням
          Radix міряє відстань до краю ЕКРАНА — і на довгому списку підказка
          звисала нижче вікна прорахунку, наче окрема сторінка поверх нього.
          Межа запам'ятовується на монтуванні поля — вікно на той час уже в
          DOM, бо поле живе всередині нього.
        */
        collisionBoundary={dialogBoundary}
        collisionPadding={12}
        className="w-[var(--radix-popover-trigger-width)] p-0"
        // Фокус лишається в полі: список — це підказка до набору, а не форма.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        // Клік по рядку — «вибрати», а не «клікнули повз поле»: без цього
        // втрата фокуса закривала б список раніше, ніж клік доходив до рядка.
        onInteractOutside={(event) => {
          if (event.target instanceof Node && inputRef.current?.contains(event.target)) event.preventDefault();
        }}
      >
        <SupplierPoolFilterBar products={pool} filter={poolFilter} onChange={changeFilter} />
        {/* СКРОЛ ЖИВЕ НА СПИСКУ, а не на поповері: смуга фільтра зверху й
            підвал знизу мусять лишатись на місці, поки рядки гортаються.

            ВИСОТА — СКІЛЬКИ МІСЦЯ Є, а не двадцять одна ремка. Стеля була
            стала й розрахована на десять простих рядків; відтоді рядок уміє
            розкриватись у картку з кольорами, і в неї лишалось три рядки
            плиток при половині порожнього екрана під вікном (Артем, 08.09).
            Radix сам міряє відстань до краю екрана — забираємо з неї смугу
            фільтра з підвалом (≈5rem) і не даємо впасти нижче 21rem, щоб на
            низькому екрані список не перетворився на щілину. */}
        <ul
          id={listId}
          role="listbox"
          aria-label="Підказки з каталогу"
          className="max-h-[max(21rem,calc(var(--radix-popover-content-available-height,31rem)-5rem))] space-y-0.5 overflow-y-auto overscroll-contain p-1.5"
        >
          {searching && pool.length === 0 && ranked.length === 0 ? (
            <li aria-live="polite" className="space-y-0.5" aria-label="Шукаю">
              {[0, 1, 2, 3].map((row) => (
                <span key={row} className="flex items-center gap-3 px-2 py-1.5">
                  <span className="h-9 w-9 shrink-0 animate-pulse rounded-[var(--radius-md)] bg-muted" />
                  <span className="min-w-0 flex-1 space-y-1.5">
                    <span className="block h-3 animate-pulse rounded bg-muted" style={{ width: `${58 - row * 6}%` }} />
                    <span className="block h-2 w-1/3 animate-pulse rounded bg-muted" />
                  </span>
                  <span className="h-3 w-14 shrink-0 animate-pulse rounded bg-muted" />
                </span>
              ))}
            </li>
          ) : null}
          {/*
            «Немає» не блимає, поки шукаємо за артикулом: код знаходиться
            запитом, і сказати «немає» до відповіді означало б збрехати на
            двісті мілісекунд рівно тим людям, які вставили артикул.
          */}
          {!searching && ranked.length === 0 && pool.length === 0 ? (
            <li className="px-2 pb-2 pt-2 text-center">
              <span className="block text-xs text-muted-foreground">Ні в каталозі, ні в постачальників</span>
              <span className="mt-1 block text-2xs text-muted-foreground/70">
                Спробуйте коротше слово — «термокружка» замість «термокружка 350 мл»
              </span>
            </li>
          ) : null}
          {/* Знайшлось, але фільтр усе сховав — це ІНША ситуація, ніж «немає»,
              і вихід із неї теж інший: не міняти слово, а зняти фільтр. */}
          {!searching && pool.length > 0 && visiblePool.length === 0 ? (
            <li className="px-2 pb-2 pt-2 text-center">
              <span className="block text-xs text-muted-foreground">
                {poolFilter.pricedOnly ? "У цьому джерелі немає позицій із ціною" : "У цьому джерелі нічого не знайшлось"}
              </span>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => changeFilter(POOL_FILTER_ALL)}
                className="mt-1.5 rounded-[var(--radius-md)] border border-border/60 px-2.5 py-1 text-2xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Показати всі джерела
              </button>
            </li>
          ) : null}

          {/* Постачальники — та сама вітрина, тільки вбудована в один список.
              Заголовок пояснює, чому ці рядки виглядають інакше: у них немає
              виду й пресетів, зате є ціна й сайт. */}
          {visiblePool.length > 0 ? (
            <li
              aria-hidden
              className={cn(
                /**
                 * `-mx-1.5 px-3.5` — той самий повношириний прийом, що й у
                 * дивайдерах меню. Список має падінг 1.5, тож липка шапка,
                 * обмежена шириною вмісту, лишає по шість пікселів з боків — і
                 * крізь них видно, що проїжджає ПІД нею. Виглядає як
                 * артефакт-привид уздовж країв.
                 */
                // `-top-1.5` разом із `-mx-1.5`: липкий край рахується від
                // ПАДІНГОВОЇ коробки списку, тож на `top-0` над заголовком
                // лишалась шестипіксельна щілина, і крізь неї було видно
                // рядок, що проїжджає (заміряно 08.09: рівно 6 px).
                "sticky -top-1.5 z-10 -mx-1.5 bg-popover px-3.5 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground/70"
              )}
            >
              У постачальників
            </li>
          ) : null}
          {visiblePool.map((product, index) => {
            const price = formatSupplierPoolPrice(product);
            const expanded = expandedPoolKey === product.key;
            const unit = supplierVariantUnit(product);
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
                  {/* Фото йде за обраним кольором; поки не обрано — фото моделі. */}
                  <SuggestionPhoto url={product.imageUrl} name={product.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium" title={product.name}>{product.name}</span>
                    {/* Доменів у злитої картки два — та сама річ у нашому
                        магазині й в оптовика, склеєна за артикулом. Першим
                        стоїть той, чия ціна показана праворуч; підказка
                        називає товар його ж словами, бо назва на картці —
                        Аванпринтова.
                        ПІДСВІЧУЄТЬСЯ ТОЙ, НА ЯКОМУ КУРСОР, а не обидва
                        разом. Спершу тут стояв `group-hover` від рядка — і при
                        наведенні будь-де синіли обидва домени одразу, ніби це
                        одне посилання (Артем: «це якось странно, вони двома»).
                        Тепер кожен домен сам собі група: свій колір, своє
                        підкреслення, своя іконка.
                        Перехід на сайт живе НА САМОМУ ДОМЕНІ, а не в правому
                        краю рядка. Спершу я поставив іконку праворуч, поруч із
                        ціною — і вона посунула всю праву частину рядка, бо
                        місце під неї резервується завжди, хоч видно її лише на
                        наведенні. Тут вона дописується в кінець рядка, після
                        якого нічого немає, тож не зсуває нічого. І читається
                        як належить: «відкрити ось цей сайт».
                        stopPropagation обов'язковий — клік по рядку КОМІТИТЬ
                        позицію, тож без нього «глянути» означало б «додати». */}
                    <span className="block truncate text-2xs text-muted-foreground">
                      {/* Підпису «код у кожного кольору свій» тут більше немає
                          (Артем, 09.09.2026): плитки під карткою показують код
                          біля кожного кольору, тож пояснювати нема чого. */}
                      {product.article ? `${product.article} · ` : null}
                      {product.sources.map((source, sourceIndex) => (
                        <React.Fragment key={source.supplierSlug}>
                          {sourceIndex > 0 ? " · " : null}
                          {source.url ? (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`«${source.name}» на ${source.supplierSlug}`}
                              onClick={(event) => event.stopPropagation()}
                              onMouseDown={(event) => {
                                event.stopPropagation();
                                event.preventDefault();
                              }}
                              className="group/site inline-flex items-center gap-0.5 align-baseline underline-offset-2 transition-colors hover:text-primary hover:underline"
                            >
                              {/* Назва бренду, а не домен: «Тотобі» й «Berrytex»
                                  читаються з відстані, «totobi.com.ua» — ні.
                                  Повна адреса лишилась у підказці (Артем,
                                  09.09.2026). */}
                              {supplierDisplayName(source.supplierSlug)}
                              {/* Іконка — тільки на ОСТАННЬОМУ домені. Вона
                                  схована через opacity, а opacity місця не
                                  звільняє: на першому з двох доменів вона
                                  вибивала помітну дірку перед «· avanprint.ua»
                                  (видно в прев'ї). У кінці рядка, після якого
                                  нічого немає, не зсуває нічого — та сама
                                  причина, з якої її колись прибрали з правого
                                  краю. */}
                              {sourceIndex === product.sources.length - 1 ? (
                                <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover/site:opacity-100" />
                              ) : null}
                            </a>
                          ) : (
                            supplierDisplayName(source.supplierSlug)
                          )}
                        </React.Fragment>
                      ))}
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
                      {/* «Обрати» — не окраса. Клік по такому рядку не додає
                          товар, а розкриває кольори (артикул у пулі — це код
                          КОЛЬОРУ), і без цього слова кнопка читалась як
                          «додати», а розкриття — як «не спрацювало». */}
                      {needsVariantChoice(product) && !expanded ? " — обрати" : null}
                      <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
                    </button>
                  ) : null}
                  <span
                    className={cn(
                      "shrink-0 whitespace-nowrap text-2xs tabular-nums",
                      price ? "text-muted-foreground" : "text-muted-foreground/50"
                    )}
                  >
                    {price ?? "ціни немає"}
                  </span>
                </span>

                {/* Рядка «Оберіть колір — його артикул поїде в замовлення»
                    більше немає (Артем, 09.09.2026). Він писався тоді, коли
                    плитки показували самі кольори; тепер під кожним кольором
                    стоїть його код, і речення повторювало те, що видно. */}
                {expanded ? (
                  /**
                   * ПЛИТКИ КОЛЬОРУ ПЕРЕРОБЛЕНІ (Артем, 08.09.2026: «мені не
                   * подобається, як вони розкриваються та виглядають»).
                   *
                   * Було три вади одразу. Фото 24 пікселі — за ним кольору не
                   * видно. Назва різалась на восьми ремках, тож «Королівський
                   * синій» ставав «Королівський син…». І головне: КОДУ НЕ БУЛО
                   * ВЗАГАЛІ, хоч саме він їде в замовлення й саме через нього
                   * цей вибір узагалі існує.
                   *
                   * Стало: фото 28, назва повністю, під нею код. Плитка стала
                   * вищою, тож більше сімнадцяти в один ряд не влізе — але їх і
                   * не буває стільки: заміряно на 5602 картках пулу, 88% мають
                   * вісім кольорів або менше, а 37% узагалі один. Довгий хвіст
                   * ріже `COLOR_CAP`, інакше картка з 246 кольорами (є така в
                   * Аванпринті) розсипала б увесь список.
                   */
                  <span className="mt-2 flex flex-wrap gap-1.5 pl-11">
                    {(allColors ? product.variants : product.variants.slice(0, COLOR_CAP)).map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        title={[variant.label, variant.article].filter(Boolean).join(" · ")}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.stopPropagation();
                          // КЛІК ПО КОЛЬОРУ — ЦЕ Й Є ВИБІР (Артем, 09.09.2026).
                          // Проміжний крок «спершу обери, потім натисни
                          // Додати» був потрібен, поки плитка показувала самий
                          // колір: тоді підтвердження давало побачити фото й
                          // код. Тепер код стоїть на самій плитці, тож друга
                          // кнопка лише повторювала вже зроблений вибір — і
                          // накривала «ще N» (знімок Артема).
                          onPickSupplier(applySupplierVariant(product, variant));
                          onValueChange("");
                          setExpandedPoolKey(null);
                        }}
                        className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border/60 py-1 pl-1 pr-2.5 text-left transition-colors hover:border-foreground hover:bg-muted/60"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
                          <VariantPhoto url={variant.imageUrl} label={variant.label} />
                        </span>
                        <span className="min-w-0">
                          <span className="block whitespace-nowrap text-2xs text-foreground">
                            {variant.label ?? "Без підпису"}
                          </span>
                          {variant.article ? (
                            <span className="block whitespace-nowrap text-[0.625rem] tabular-nums text-muted-foreground/70">
                              {variant.article}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    ))}
                    {!allColors && product.variants.length > COLOR_CAP ? (
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.stopPropagation();
                          setAllColorsKey(expandedPoolKey);
                        }}
                        // Та сама висота, що в плитки кольору: інакше «ще N»
                        // з'їжджало під ряд і ставало окремим рядком.
                        className="self-stretch rounded-[var(--radius-md)] border border-dashed border-border px-2.5 text-2xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                      >
                        ще {product.variants.length - COLOR_CAP}
                      </button>
                    ) : null}
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
              /**
               * `z-10` ТУТ ОБОВ'ЯЗКОВИЙ, і без нього рядок ламає список.
               * Липкий елемент без свого шару лишається в потоці: наступні
               * рядки малюються ПОВЕРХ нього, і крізь «Додати як нову позицію»
               * просвічує текст товару, що під ним (спіймано на знімку, запит
               * «malfin»). Заголовок секції має `z-10` з тієї ж причини.
               * `bg-popover` сам по собі не рятує — він фарбує тло, а не піднімає.
               */
              // `-bottom-1.5` — та сама щілина знизу: `bottom-0` тримає рядок
              // на шість пікселів вище краю прокрутки, і смуга під ним
              // світилась товаром, що проїжджає (Артем прислав знімок).
              "sticky -bottom-1.5 z-10 -mx-1.5 -mb-1.5 flex cursor-pointer items-center gap-3 bg-popover px-3.5 py-2 text-sm",
              addRowIndex > 0 && "mt-1 border-t border-border/60 pt-2",
              active === addRowIndex ? "bg-muted" : "hover:bg-muted/50"
            )}
            onMouseEnter={() => setActive(addRowIndex)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commitRow(addRowIndex)}
            style={{ boxShadow: "0 -8px 12px -8px hsl(var(--foreground) / 0.10)" }}
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
        <SuggestListFooter shown={visiblePool.length + catalogRows} total={pool.length + ranked.length} />
      </PopoverContent>
    </Popover>
  );
}

/** Пауза перед запитом до пулу: каталог уже в пам'яті, а пул — це база. */
/**
 * Чи треба спершу обрати колір. Так — коли картка не має спільного для всіх
 * варіантів артикула, але артикули у варіантів є. Якщо їх немає ні в кого,
 * вибирати нема з чого, і розкриття було б глухим кутом.
 */
/**
 * Скільки кольорів показуємо, поки не попросили решту. Дванадцять — це три ряди
 * плиток: далі картка перестає бути підказкою й стає сторінкою товару.
 */
const COLOR_CAP = 12;

function needsVariantChoice(product: SupplierPoolProduct): boolean {
  return product.article === null && product.variants.some((variant) => variant.article);
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Фото рядка. «Немає адреси» і «адреса є, але мертва» мають виглядати ОДНАКОВО —
 * значком «фото немає», а не битою картинкою браузера.
 *
 * Заміряно 08.09.2026 на запиті «футболка»: із 354 карток 6 показували порожню
 * плитку, усі шість — Бергамо. Адреси там не з фіда, а виведені за правилом
 * `<артикул>_a.jpg`, і частина таких кадрів на сайті просто називається інакше.
 * Аванпринт і Тотобі віддали 124 з 124 живих. Без цієї підстраховки браузер
 * малює зламану картинку, і виглядає це як поломка CRM, а не як дірка у фіді.
 */
function SuggestionPhoto({ url, name }: { url: string | null; name: string }) {
  const base = "h-9 w-9 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-border/60 bg-background";
  // Ловимо саме АДРЕСУ, а не прапорець: рядок списку React переживає зміну
  // товару, і голий `failed` лишився б піднятим для наступного, живого фото.
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  if (!url || failedUrl === url) {
    return (
      <span className={cn(base, "grid place-items-center bg-muted/40")} aria-hidden>
        <ImageOff className="h-3.5 w-3.5 text-muted-foreground/50" />
      </span>
    );
  }
  return (
    // Порядок, а не вага: фото тут чуже й необроблене (оригінал вітрини, у
    // середньому 209 кБ на кадр — замір 10.09.2026), а менеджер прийшов по
    // назву, артикул і ціну. `fetchPriority="low"` і `decoding="async"`
    // пропускають дані пулу вперед, `loading="lazy"` качає лише видимі рядки.
    // Те саме стоїть у PoolPhoto (src/components/catalog/SupplierPoolRow.tsx):
    // це ТІ САМІ картинки, просто вікно прорахунку малює їх своїм компонентом.
    <img
      src={url}
      alt={name}
      loading="lazy"
      fetchPriority="low"
      decoding="async"
      onError={() => setFailedUrl(url)}
      className={cn(base, "object-contain")}
    />
  );
}

/** Плитка кольору — те саме правило, тільки дрібніше. У Бергамо ПОЛОВИНА
 *  колірних рядків без власного фото (5135 із 10076), тож порожніх плиток тут
 *  більше, ніж у списку, і значок потрібен ще дужче. */
function VariantPhoto({ url, label }: { url: string | null; label: string | null }) {
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  if (!url || failedUrl === url) {
    return <ImageOff className="h-3 w-3 text-muted-foreground/50" aria-hidden />;
  }
  return (
    // Пріоритет той самий, що в SuggestionPhoto, і тут він важить найбільше:
    // розгорнута картка Бергамо це десятки колірних плиток, тобто десятки
    // повнорозмірних кадрів одним залпом.
    <img
      src={url}
      alt={label ?? ""}
      loading="lazy"
      fetchPriority="low"
      decoding="async"
      onError={() => setFailedUrl(url)}
      className="h-full w-full object-cover"
    />
  );
}
