/**
 * Назви методів нанесення: нормалізація і пошук схожих.
 *
 * Один файл на всі шляхи запису — форму каталогу й імпорт із сайту
 * постачальника. Доти правило жило лише в імпорті, а кнопка «Додати» писала
 * набране як є; звідси «Уф» поруч з «УФ», «УФ дрк» і «т амподрук».
 *
 * `normalizeMethodName` — точне дзеркало tosho.normalize_method_name() у
 * scripts/catalog-method-directory.sql. Правила мусять збігатися посимвольно:
 * саме за цим ключем база тримає унікальність, і якщо форма вважатиме назву
 * новою там, де база вважає її дублем, користувач отримає сирий текст помилки
 * замість людської підказки.
 *
 * NB: жодного String.normalize("NFKD") — вона розкладає українську «й» на
 * «и» + діакритику, після чого «Йорж» і «Иорж» стають одним словом. Цей самий
 * баг колись з'їв пошук за назвою компанії.
 */

/** Ключ порівняння: без регістру, пробілів і розділових знаків. «УФ - друк» === «уф друк». */
export const normalizeMethodName = (value?: string | null): string =>
  (value ?? "")
    .replace(/ё/g, "е")
    .replace(/Ё/g, "Е")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();

/** Прибирає зайві пробіли, але лишає слова роздільними — те, що йде в базу як назва. */
export const cleanMethodName = (value?: string | null): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

/**
 * Ключі з урахуванням синонімів — для м'якшого зіставлення при імпорті, де назву
 * пише чужий сайт. Тут «термотрансфер», «термоперенос» і «FLEX (плівка)» — одне.
 * Свідомо ширше за `normalizeMethodName`: помилитись у бік «це те саме» можна
 * лише при імпорті, де назву однаково підтверджує людина, а не в довіднику.
 */
export const methodLookupKeys = (name: string): Set<string> => {
  const normalized = normalizeMethodName(name);
  const keys = new Set([normalized]);
  if (!normalized) return keys;

  if (
    normalized.includes("термодрук") ||
    normalized.includes("термоперенос") ||
    normalized.includes("термотрансфер")
  ) {
    keys.add(normalizeMethodName("термодрук"));
    keys.add(normalizeMethodName("термоперенос"));
    keys.add(normalizeMethodName("термотрансфер"));
    keys.add(normalizeMethodName("FLEX плівка"));
  }
  if (normalized.includes("шовкодрук") || normalized.includes("шовкограф")) {
    keys.add(normalizeMethodName("шовкодрук"));
    keys.add(normalizeMethodName("шовкографія"));
  }
  if (normalized.includes("вишив")) {
    keys.add(normalizeMethodName("вишивка"));
  }
  if (normalized.includes("dtf")) {
    keys.add("dtf");
  }
  return keys;
};

/** Чи це та сама назва з погляду бази. */
export const isSameMethodName = (a?: string | null, b?: string | null): boolean => {
  const left = normalizeMethodName(a);
  return Boolean(left) && left === normalizeMethodName(b);
};

/**
 * Схожі назви для підказки «схоже на існуючий». Спершу точні збіги за ключем,
 * далі — входження одного в інше («уф» знайде «УФ-друк» і «УФ-ДТФ»). Порядок:
 * точний збіг, потім початок назви, потім решта — щоб потрібне було зверху.
 */
export const findSimilarMethods = <T extends { name: string }>(
  query: string,
  candidates: readonly T[],
  limit = 6
): T[] => {
  const key = normalizeMethodName(query);
  if (!key) return [];
  const queryKeys = methodLookupKeys(query);

  const scored = candidates
    .map((candidate) => {
      const candidateKey = normalizeMethodName(candidate.name);
      if (!candidateKey) return null;
      if (candidateKey === key) return { candidate, rank: 0 };
      if (candidateKey.startsWith(key)) return { candidate, rank: 1 };
      if (candidateKey.includes(key) || key.includes(candidateKey)) return { candidate, rank: 2 };
      const shared = Array.from(queryKeys).some((queryKey) =>
        methodLookupKeys(candidate.name).has(queryKey)
      );
      return shared ? { candidate, rank: 3 } : null;
    })
    .filter((entry): entry is { candidate: T; rank: number } => entry !== null)
    .sort((a, b) => a.rank - b.rank || a.candidate.name.localeCompare(b.candidate.name, "uk"));

  return scored.slice(0, limit).map((entry) => entry.candidate);
};
