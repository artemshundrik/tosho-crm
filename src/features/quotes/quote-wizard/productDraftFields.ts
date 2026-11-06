import type {
  QuoteImportDraftItem,
  QuoteImportLinkPreview,
} from "@/features/quotes/quote-import/types";
import { fetchLinkPreview } from "@/features/quotes/quote-import/useLinkPreviews";
import {
  applySupplierVariant,
  SHOP_SUPPLIER_SLUG,
  type SupplierPoolProduct,
  type SupplierPoolVariant,
} from "@/lib/supplierPool";

import { guessKindFromTitle, type CatalogKindOption } from "./catalogSuggestions";

/**
 * Як товар стає позицією: спільне для вікна прорахунку й вікна замовлення без
 * прорахунку (REQ-353).
 *
 * ЧИСТІ ФУНКЦІЇ, БЕЗ СТАНУ. Вікна різні: у прорахунку є тиражі й файл, у
 * замовленні є ціна й кількість. Спільне в них саме правило, чим заповнити
 * позицію, і двом копіям цього правила нема чого розходитись.
 */

/** Поля позиції, які заповнює сторінка товару. */
type ProductFields = Pick<
  QuoteImportDraftItem,
  | "name"
  | "sku"
  | "color"
  | "catalog"
  | "supplierProductId"
  | "poolVariantRowId"
  | "poolVariantImageUrl"
  | "poolPrice"
>;

/**
 * Поля позиції з товару пулу. І нова позиція, і прив'язка кандидата до наявного
 * рядка файлу заповнюють товар одним і тим самим способом (REQ-182#p27).
 */
export function supplierProductFields(
  kinds: CatalogKindOption[],
  product: SupplierPoolProduct
): Partial<QuoteImportDraftItem> {
  /**
   * Вид — припущення, і джерел у нього два, у порядку надійності.
   *
   * СПЕРШУ КАТЕГОРІЯ ПОСТАЧАЛЬНИКА. Це не здогад із рядка, а його власна
   * класифікація: berrytex сам каже «Футболки» (750 товарів), «Поло» (511),
   * «Светри» (425). Наявне вгадування вже порівнює по основі слова, тож
   * «Футболки» знаходить наш вид «Футболка» без жодного нового коду.
   *
   * ПОТІМ НАЗВА — те саме, що для позицій за посиланням. Потрібне для
   * джерел без категорій: у мапах avanprint і bergamo їх немає взагалі.
   *
   * `guessed: true` тут принципове: чип підпише «припущення», і людина
   * побачить, що це версія CRM, а не факт від постачальника.
   */
  const guess = guessKindFromTitle(kinds, product.category) ?? guessKindFromTitle(kinds, product.name);
  const { supplierUrl, avantprintUrl } = supplierSourceUrls(product);
  /*
    ВАРІАНТ — ЦЕ ВІДПОВІДЬ ПРО КОЛІР. Товар приходить сюди вже звуженим
    (`applySupplierVariant`) або з одним-єдиним виконанням — і в обох
    випадках у нього рівно один варіант, тобто колір і його код відомі.
    Кілька варіантів означає, що вибору не було: тоді кольору немає, і чип
    під нього не малюється.
  */
  const variant = product.variants.length === 1 ? product.variants[0] : null;
  return {
    name: product.name,
    color: variant?.label ?? null,
    poolVariantRowId: variant?.id ?? null,
    poolVariantImageUrl: variant ? variant.imageUrl ?? product.imageUrl : null,
    sku: variant?.article ?? product.article,
    // Ціна — та сама, що стояла в підказці. Це показ, а не запис: у базу їде
    // `supplierProductId`, і число там читає вона сама.
    poolPrice: product.priceMin !== null ? { amount: product.priceMin, currency: product.currency } : null,
    supplierUrl,
    avantprintUrl,
    // Чип «Дитяча» переїжджає з підказки в рядок позиції: попередження живе
    // стільки ж, скільки сама позиція, а не вісім секунд тоста.
    isKids: product.isKids,
    // ВАРТІСТЬ ТОВАРУ — не число, а РЯДОК ПУЛУ, з якого його прочитає база.
    // Що саме брати, вирішує вона ж: `retail` (вітрина постачальника) туди
    // не пройде, бо з неї нічого не порахуєш.
    supplierProductId: product.priceRowId,
    catalog: guess
      ? {
          modelId: null,
          kindId: guess.kindId,
          typeId: guess.typeId,
          kindName: guess.kindName,
          typeName: guess.typeName,
          // Фото пулу — те саме, яке людина щойно бачила в підказці. Звідси
          // воно доїжджає до моделі каталогу (`bindCatalogModel`), а з неї —
          // на картку позиції.
          imageUrl: product.imageUrl,
          guessed: true,
        }
      : null,
  };
}

/**
 * «Наш магазин» і «оптовик» — різні кнопки на картці, тож і розкладаємо їх за
 * роллю джерела, а не за порядком у списку.
 */
export function supplierSourceUrls(product: Pick<SupplierPoolProduct, "sources">) {
  const shop = product.sources.find((source) => source.supplierSlug === SHOP_SUPPLIER_SLUG);
  const wholesale = product.sources.find((source) => source.supplierSlug !== SHOP_SUPPLIER_SLUG);
  return { supplierUrl: wholesale?.url ?? null, avantprintUrl: shop?.url ?? null };
}

/**
 * Позиція після того, як сайт відповів.
 *
 * Беремо ЛИШЕ назву й фото. Опис зі сторінки не тягнемо: у магазинів це рекламний
 * абзац («замовляйте оптом для брендування»), який у позиції не значить нічого, а
 * місце в рядку займає. Правки менеджера не затираємо: він міг почати вписувати
 * назву, поки сайт думав, тому назва лягає лише в порожнє поле.
 */
export function applyLinkPreview<T extends ProductFields>(
  kinds: CatalogKindOption[],
  draft: T,
  preview: QuoteImportLinkPreview
): T {
  const answered = preview.status === "pending" ? null : preview;
  const title = answered?.title ?? null;
  const sku = answered?.sku ?? null;
  // Вид — припущення з назви сторінки (REQ-182#p18): «Кепка 5-панельна…»
  // → Кепка. Лише якщо людина ще не поставила вид сама.
  // Посилання, яке впізнав пул, несе й категорію постачальника — вона
  // надійніша за назву, тож іде першою, як і для товару з пошуку в пулі
  // (REQ-324#p3). Раніше посилання її мовчки губило.
  const pooled = answered?.pool ?? null;
  const guess = guessKindFromTitle(kinds, pooled?.product.category) ?? guessKindFromTitle(kinds, title);
  // Артикул сторінка називає сама (REQ-247), тож він лягає одразу й не чекає
  // фонової розвідки. У порожнє: якщо менеджер уже вписав свій — його рука
  // головніша за розмітку магазину.
  const next: T = { ...draft, name: draft.name || title || "", sku: draft.sku || sku };
  // НАША ЦІНА З ПУЛУ (REQ-285). Число не їде через браузер: ми лише називаємо
  // РЯДОК пулу, а собівартість читає й пише сама база
  // (`set_quote_run_cost_from_pool`) — так само, як для товару, обраного в
  // пошуку. Коли кольори різні, рядок ще не визначений: його назве вибір
  // кольору, інакше ціна була б від чужого кольору.
  if (pooled && !pooled.needsColor) next.supplierProductId = pooled.product.priceRowId;
  // ЦІНУ ВИДНО ОДРАЗУ, а не лише після створення. Число тут — те саме, що
  // менеджер бачить у підказці пулу. Поки кольори не розведені, ціна може
  // різнитись (у Топтайма 269,99–301,35), тож не показуємо нічого: одне число
  // з діапазону читалось би як відповідь.
  if (pooled && !pooled.needsColor && pooled.product.priceMin !== null) {
    next.poolPrice = { amount: pooled.product.priceMin, currency: pooled.product.currency };
  }
  if (guess && !draft.catalog) {
    next.catalog = {
      modelId: null,
      kindId: guess.kindId,
      typeId: guess.typeId,
      kindName: guess.kindName,
      typeName: guess.typeName,
      imageUrl: null,
      guessed: true,
    };
  }
  return next;
}

/**
 * Людина обрала колір на картці товару. Артикул тут головний: саме він їде в
 * замовлення. Рядок пулу беремо звужений до обраного кольору: у Е-Сувеніра ціни
 * кольорів збігаються, а в Топтайма ні, і платимо ми за той, що обрали.
 *
 * Колір і його фото їдуть у позицію. Коли вони лишались лише у вікні, позиція
 * діставала артикул без кольору, а розвідка підставляла перший-ліпший знімок
 * товару: обирали Navy, а на прорахунку лежав Sage.
 */
export function applyPoolVariant<T extends ProductFields>(
  draft: T,
  product: SupplierPoolProduct | null | undefined,
  variant: SupplierPoolVariant
): T {
  const picked = product ? applySupplierVariant(product, variant) : null;
  return {
    ...draft,
    sku: variant.article ?? draft.sku,
    color: variant.label ?? variant.article ?? draft.color ?? null,
    poolVariantRowId: variant.id,
    // Без власного фото в кольору тут порожньо: чужий знімок брехав би про колір.
    poolVariantImageUrl: picked ? picked.imageUrl : variant.imageUrl,
    supplierProductId: picked?.priceRowId ?? draft.supplierProductId,
    // Ціна теж стає кольоровою: показувати далі діапазон означало б ховати те,
    // що вже вирішено.
    poolPrice: picked?.priceMin != null ? { amount: picked.priceMin, currency: picked.currency } : draft.poolPrice,
  };
}

/**
 * Прев'ю після вибору кольору: фото теж стає кольоровим, бо досі лежить знімок
 * картки, тобто першого-ліпшого кольору. Кольору без власного фото це не
 * стосується: у Бергамо таких половина, і підміняти наявний знімок порожнечею
 * було б гірше. `null` — міняти нема чого.
 */
export function previewAfterVariant(
  current: QuoteImportLinkPreview | undefined,
  variant: SupplierPoolVariant
): QuoteImportLinkPreview | null {
  if (!variant.imageUrl || !current || current.status === "pending") return null;
  return {
    status: "done",
    imageUrl: variant.imageUrl,
    title: current.title ?? null,
    sku: variant.article,
    pool: current.pool,
  };
}

/**
 * Черга читання посилань. Ходимо по трьох сайтах заразом, решта чекає: більше не
 * дає виграшу, бо магазини відповідають від пів секунди до восьми.
 */
export async function readLinkPreviews(
  entries: Array<{ key: string; url: string }>,
  onPreview: (key: string, preview: QuoteImportLinkPreview) => void
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor];
      cursor += 1;
      onPreview(entry.key, await fetchLinkPreview(entry.url));
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, entries.length) }, worker));
}

/**
 * Вид руками для рядка без моделі (REQ-182#p18). Зміна виду скидає нанесення:
 * методи й місця належать виду, і чужі id у чернетці були б брехнею.
 */
export function applyDraftKind<T extends Pick<QuoteImportDraftItem, "catalog" | "imprints">>(
  draft: T,
  kind: Pick<CatalogKindOption, "kindId" | "kindName" | "typeId" | "typeName"> | null
): T {
  if (!kind) return { ...draft, catalog: null, imprints: [] };
  return {
    ...draft,
    imprints: draft.catalog?.kindId === kind.kindId ? draft.imprints : [],
    catalog: {
      modelId: null,
      kindId: kind.kindId,
      typeId: kind.typeId,
      kindName: kind.kindName,
      typeName: kind.typeName,
      imageUrl: null,
      guessed: false,
    },
  };
}

/**
 * Місця виду: довідник плюс те, що вже вписали руками на інших позиціях ЦЬОГО Ж
 * виду. Рядок довідника з'явиться лише після збереження, а прорахунок на десять
 * однакових футболок збирають до нього — і набирати «по центру спереду» десять
 * разів людина не буде.
 */
export function mergeKindPlaces(
  drafts: Array<Pick<QuoteImportDraftItem, "catalog" | "imprints">>,
  optionsByKind: Record<string, { places: Array<{ id: string; label: string }> }>
): Record<string, Array<{ id: string | null; label: string }>> {
  const typed = new Map<string, Map<string, string>>();
  for (const draft of drafts) {
    const kindId = draft.catalog?.kindId;
    if (!kindId) continue;
    for (const imprint of draft.imprints) {
      const label = imprint.positionLabel?.trim();
      if (!label || imprint.positionId) continue;
      const forKind = typed.get(kindId) ?? new Map<string, string>();
      forKind.set(label.toLowerCase(), label);
      typed.set(kindId, forKind);
    }
  }
  const result: Record<string, Array<{ id: string | null; label: string }>> = {};
  for (const kindId of new Set([...Object.keys(optionsByKind), ...typed.keys()])) {
    const known = optionsByKind[kindId]?.places ?? [];
    const knownLabels = new Set(known.map((place) => place.label.toLowerCase()));
    const extra = [...(typed.get(kindId)?.entries() ?? [])]
      .filter(([lower]) => !knownLabels.has(lower))
      .map(([, label]) => ({ id: null, label }));
    result[kindId] = [...known, ...extra];
  }
  return result;
}
