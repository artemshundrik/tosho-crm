import { areCompanyNamesEquivalent } from "./companyNameSearch";

/**
 * Зіставлення замовника чи ліда за НАЗВОЮ.
 *
 * НАВІЩО ЦЕ ВЗАГАЛІ ПОТРІБНО. У таблиці прорахунків немає поля для ліда: є
 * `customer_id` (лише для замовників) і текстове `customer_name`. Прорахунок,
 * що належить ліду, тримається на тексті, замороженому в момент створення. Тож
 * коли картку перейменовують, єдиний спосіб знайти її знову — зіставити назви.
 *
 * ЧОМУ ЦЕ ОКРЕМИЙ МОДУЛЬ. Правило вже жило у трьох місцях по-різному, і саме
 * розбіжність між ними коштувала: 27.08.2026 Артем перейменував ліда
 * «masseeds» на «MAS Seeds», і клік по «Замовник» у дизайн-задачі відкрив
 * картку ЗОВСІМ ІНШОГО ліда — «EDS», з чужим контактом і телефоном.
 *
 * ЯК САМЕ ЛАМАЛОСЬ. Стара функція мала чотири щаблі, і два останні не мали
 * жодного порога: третій приймав будь-яку компанію, чия назва є ПІДРЯДКОМ
 * запиту («masseeds».includes(«eds») — істина), а четвертий просто повертав
 * `rows[0]`. Ліди відсортовані за назвою, тож «EDS» стояв раніше за
 * «MAS Seeds». А четвертий щабель на назві, якої в базі немає взагалі,
 * відкривав перший лід за абеткою — у нас це записи з назвами «.» і «..».
 */

/** Порівняння «як пишуть»: регістр, пробіли й лапки не рахуються. */
export const normalizePartyMatch = (value?: string | null) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[«»"'`]/g, "");

/**
 * Стиснутий ключ: без пробілів і розділових.
 *
 * САМЕ ВІН ЛОВИТЬ «masseeds» ↔ «MAS Seeds», і саме його бракувало. Фонетичне
 * порівняння (`areCompanyNamesEquivalent`) тут не рятує: воно схлопує подвоєні
 * літери, а в «MAS Seeds» подвоєна `s` розірвана пробілом і не схлопується —
 * виходить `masseds` проти `maseds`, і збігу немає. Стиснення пробілів дає
 * `masseeds` з обох боків.
 */
export const compactPartyMatch = (value?: string | null) =>
  normalizePartyMatch(value)
    .replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Правові форми на початку назви.
 *
 * НАВІЩО ЇХ ЗНІМАТИ. У прорахунку пишуть «АВАНТІ ГРУП», а в картці юридична
 * назва «ТОВ «АВАНТІ ГРУП»» — це та сама компанія, просто в різних документах.
 * Стара функція ловила такий випадок ПОБІЧНО, через порівняння підрядком; коли
 * підрядок прибрали як небезпечний, цю здатність довелося зробити явною —
 * інакше правильні збіги зникли б разом із хибними.
 *
 * Знімаємо ЛИШЕ з початку: «ТОВ» усередині назви — частина назви.
 */
const LEGAL_FORM_PREFIX =
  /^(тов|тзов|пп|фоп|пат|прат|ват|зат|ат|дп|кп|llc|ltd|inc|plc|gmbh)\s+/u;

const stripLegalForm = (value: string) => value.replace(LEGAL_FORM_PREFIX, "").trim();

/** Назви картки, за якими її можна впізнати. */
export type PartyNames = { name?: string | null; legalName?: string | null };

/**
 * Чи це впевнено та сама компанія.
 *
 * ТРИ ЩАБЛІ, І ЖОДНОГО «НА ОКО». Точний збіг, стиснутий ключ, фонетична
 * рівність — усе це твердження про те, що назви ОДНАКОВІ, просто записані
 * по-різному. Підрядок таким твердженням не є: «EDS» усередині «masseeds» —
 * це збіг літер, а не компанія.
 */
export function isSameParty(query: string, party: PartyNames): boolean {
  const values = [party.name ?? "", party.legalName ?? ""].filter((value) => value.trim() !== "");
  if (values.length === 0 || !query.trim()) return false;

  const normalizedQuery = stripLegalForm(normalizePartyMatch(query));
  const compactQuery = compactPartyMatch(stripLegalForm(normalizePartyMatch(query)));

  return values.some((value) => {
    const normalizedValue = stripLegalForm(normalizePartyMatch(value));
    return (
      normalizedValue === normalizedQuery ||
      (!!compactQuery && compactPartyMatch(normalizedValue) === compactQuery) ||
      areCompanyNamesEquivalent(normalizedValue, normalizedQuery)
    );
  });
}

/**
 * Знайти картку за назвою — або НІЧОГО.
 *
 * `null` замість «найкращого з наявних» тут принциповий. Показати чужу
 * компанію з чужим телефоном гірше, ніж сказати «не знайшли»: у першому
 * випадку людина дзвонить не туди й не має підстав засумніватись, у другому —
 * просто бачить, що зв'язку немає.
 */
export function findParty<T extends PartyNames>(rows: readonly T[], query: string): T | null {
  return rows.find((row) => isSameParty(query, row)) ?? null;
}
