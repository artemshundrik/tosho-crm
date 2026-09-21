import { supabase } from "@/lib/supabaseClient";
import type { CustomerRow } from "@/lib/toshoApi";

import { comparePartyName, filterQuoteParties } from "./quotePartiesFilter";

/**
 * Пошук замовників і лідів одним списком — те, що стоїть за чіпом
 * «Замовник / Лід» у всіх вікнах створення прорахунку.
 *
 * ЧОМУ ОКРЕМИЙ МОДУЛЬ. Той самий десяток рядків лежав у QuotesPage двічі —
 * в ефекті з дебаунсом і в обробнику набору тексту, — а тепер його потребує ще
 * й візард. Три копії мапера ліда в опцію розійшлись би на першій же зміні
 * полів, і одне з вікон показувало б порожні назви.
 *
 * ЧОМУ СПИСОК ТЕПЕР БЕРЕТЬСЯ ЦІЛКОМ, А ПОШУК ЇДЕ В БРАУЗЕР (REQ-302).
 *
 * Доти кожна літера в полі спричиняла ВІСІМ запитів до бази: пошук будує
 * варіанти написання («fantom» → фантом, fanntom, fanttom), і кожен варіант
 * ішов окремим запитом, окремо по замовниках і окремо по лідах. Українська
 * назва дає сім варіантів, тобто чотирнадцять запитів. Заміряно живцем на
 * зібраному застосунку: кожен запит 230–280 мс — і це не база, а дорога та
 * PostgREST, бо рядків усього 376. Разом із паузою в 250 мс людина чекала
 * близько двох секунд на кожне слово.
 *
 * Тому тепер один запит на таблицю без пошукового терміна, список лежить у
 * памʼяті вкладки, а фільтрує його той самий `scoreCompanyNameMatch`, яким
 * список і так ранжувався після відповіді сервера. Кожна наступна літера
 * коштує нуль.
 *
 * ЧОМУ ЦЕ БЕЗПЕЧНО ПРИ ЗРОСТАННІ. Стеля `LOAD_LIMIT` не декоративна: доки
 * замовників і лідів менше за неї, список у памʼяті повний і збіг гарантовано
 * знайдеться. Якщо колись упремось — це видно з `isTruncated`, і тоді пошук
 * доведеться повертати на сервер, але вже одним запитом, а не вісьмома.
 */

export type QuotePartyOption = CustomerRow & {
  entityType?: "customer" | "lead";
};

export { filterQuoteParties } from "./quotePartiesFilter";

export const EMPTY_QUOTE_PARTIES: QuotePartyOption[] = [];

/**
 * Скільки рядків тягнемо в памʼять. 2000 при нинішніх 144 замовниках і 232
 * лідах — запас років на десять; у байтах це приблизно 200 кБ на обидві
 * таблиці, разово на вкладку.
 */
const LOAD_LIMIT = 2000;

/**
 * Скільки живе завантажений список. Хвилина — не «щоб швидше», а щоб картка,
 * заведена колегою в сусідній вкладці, зʼявилась сама, без перезавантаження
 * сторінки. Створене В ЦІЙ вкладці не чекає таймера: його кладе
 * `rememberQuoteParty`.
 */
const CACHE_TTL_MS = 60_000;

type PartiesCache = {
  teamId: string;
  loadedAt: number;
  parties: QuotePartyOption[];
  isTruncated: boolean;
};

let cache: PartiesCache | null = null;
let inFlight: { teamId: string; promise: Promise<PartiesCache> } | null = null;

async function loadParties(teamId: string): Promise<PartiesCache> {
  const [customers, leads] = await Promise.all([
    supabase
      .schema("tosho")
      .from("customers")
      .select("id,name,legal_name,logo_url,manager,manager_user_id")
      .eq("team_id", teamId)
      .order("name", { ascending: true })
      .limit(LOAD_LIMIT),
    // Ліди — приємний додаток: їх таблиці може не бути в старішій схемі, і це
    // не привід лишити менеджера без списку замовників.
    supabase
      .schema("tosho")
      .from("leads")
      .select("id,company_name,legal_name,logo_url,manager,manager_user_id")
      .eq("team_id", teamId)
      .order("company_name", { ascending: true })
      .limit(LOAD_LIMIT),
  ]);

  if (customers.error) throw customers.error;

  const customerRows = (customers.data ?? []) as unknown as CustomerRow[];
  const leadRows = (leads.error ? [] : leads.data ?? []) as unknown as Array<{
    id: string;
    company_name: string | null;
    legal_name: string | null;
    logo_url: string | null;
    manager: string | null;
    manager_user_id: string | null;
  }>;

  const parties: QuotePartyOption[] = [
    ...customerRows.map((customer) => ({ ...customer, entityType: "customer" as const })),
    ...leadRows.map((lead) => ({
      id: lead.id,
      name: lead.company_name ?? lead.legal_name ?? null,
      legal_name: lead.legal_name ?? null,
      logo_url: lead.logo_url ?? null,
      manager: lead.manager ?? null,
      manager_user_id: lead.manager_user_id ?? null,
      entityType: "lead" as const,
    })),
  ];

  return {
    teamId,
    loadedAt: Date.now(),
    parties,
    isTruncated: customerRows.length >= LOAD_LIMIT || leadRows.length >= LOAD_LIMIT,
  };
}

async function getParties(teamId: string): Promise<PartiesCache> {
  if (cache && cache.teamId === teamId && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache;
  }
  // Друга літера не має піднімати другий запит: поки перший у дорозі, усі
  // чекають ту саму обіцянку.
  if (inFlight && inFlight.teamId === teamId) return inFlight.promise;

  const promise = loadParties(teamId)
    .then((loaded) => {
      cache = loaded;
      return loaded;
    })
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
  inFlight = { teamId, promise };
  return promise;
}

/**
 * Щойно заведений замовник або лід — одразу в список, не чекаючи таймера.
 * Інакше його не було б видно у ВЛАСНОМУ ж пошуку хвилину після створення.
 */
export function rememberQuoteParty(party: QuotePartyOption): void {
  if (!cache) return;
  const type = party.entityType ?? "customer";
  const exists = cache.parties.some(
    (row) => row.id === party.id && (row.entityType ?? "customer") === type
  );
  if (exists) return;
  cache = { ...cache, parties: [...cache.parties, party].sort(comparePartyName) };
}

export async function searchQuoteParties(teamId: string, search: string): Promise<QuotePartyOption[]> {
  const loaded = await getParties(teamId);
  return filterQuoteParties(loaded.parties, search);
}
