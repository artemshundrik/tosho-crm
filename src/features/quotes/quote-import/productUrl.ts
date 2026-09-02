/**
 * Посилання на товар без рекламного хвоста (REQ-178#p4).
 *
 * ЗВІДКИ ЦЕ ВЗЯЛОСЬ. Менеджери копіюють посилання не з адресного рядка, а з
 * листа, чату або результату пошуку — тобто разом із усім, що туди дописала
 * реклама. У референсному файлі KMZ таких було більшість: одне посилання на
 * dok.ua тягло за собою 260 символів `utm_*`, `gclid` і `gbraid`, і рівно в
 * такому вигляді воно лягало в `metadata.supplierUrl` — назавжди, бо на
 * картці позиції ця адреса стає кнопкою «Постачальник».
 *
 * ЧОМУ ПЕРЕЛІК, А НЕ «ВИКИНУТИ ВСІ ПАРАМЕТРИ». У старих магазинів товар часто
 * й живе в параметрі (`?id=1234`, `?product=550`), тож жадібне різання
 * перетворило б робоче посилання на биту адресу — а це гірше за довгий хвіст:
 * довгий хоч відкривається.
 *
 * ЧОМУ ЯКІР ЛИШАЄТЬСЯ. У файлі KMZ трапився `…/otvertka-…/#characteristics`, і
 * спокуса зрізати решітку велика. Але в частини сайтів саме після неї живе
 * маршрут товару (`#/product/550`), і там зріз лишив би менеджера на головній.
 * Зайвий якір нікому не шкодить, бита адреса шкодить.
 */

/** Точні імена параметрів, які не значать нічого, крім обліку реклами. */
const TRACKING_PARAMS = new Set([
  "gclid",
  "gclsrc",
  "gbraid",
  "wbraid",
  "dclid",
  "gad_source",
  "gad_campaignid",
  "srsltid",
  "fbclid",
  "msclkid",
  "yclid",
  "ysclid",
  "twclid",
  "ttclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_openstat",
  "sc_content",
  "sc_campaign",
  "sc_medium",
]);

/**
 * Префікси сімейств: `utm_source`, `utm_term`, `utm_id` і скільки їх там ще
 * вигадають. Перелічувати поіменно — гарантовано відстати від реклами.
 */
const TRACKING_PREFIXES = ["utm_"];

function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return TRACKING_PARAMS.has(key) || TRACKING_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Посилання без рекламних параметрів.
 *
 * Повертає РІВНО ТОЙ САМИЙ рядок, якщо різати не було чого: `URL.toString()`
 * нормалізує адресу (додає скісну, перекодовує кирилицю), і робити це на
 * рівному місці означало б без потреби міняти те, що менеджер бачить у полі.
 * Нерозпізнану адресу теж віддаємо як є — вирішувати, посилання це чи ні, тут
 * не наша справа: за це відповідає перевірка на вході.
 */
export function normalizeProductUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  const doomed = [...parsed.searchParams.keys()].filter(isTrackingParam);
  if (doomed.length === 0) return trimmed;

  for (const name of doomed) parsed.searchParams.delete(name);
  // Порожній `?` після зачистки — той самий сміттєвий хвіст, лише коротший.
  if (![...parsed.searchParams.keys()].length) parsed.search = "";

  return parsed.toString();
}
