import { normalizeMethodName } from "./catalogMethodName";
import { transliterateLatinToCyrillic } from "./companyNameSearch";

/**
 * Пошук методу нанесення за словом — «Інші методи…» у прорахунку (REQ-292).
 *
 * ЛАТИНИЦЯ ЗНАХОДИТЬ КИРИЛИЦЮ. Менеджер пише так, як пише замовник чи
 * постачальник: «DTF», «UV». У довіднику ті самі методи названі кирилицею —
 * «ДТФ», «УФ-друк», — і пошук за самим регістром не знаходив нічого. Тому і
 * назву, і запит зводимо до кирилиці ОДНИМ правилом і порівнюємо вже там:
 * «DTF» знаходить і «ДТФ», і «УФ-ДТФ», а «ДТФ» — «Термотрансфер (DTF)».
 * Транслітерація та сама, що в пошуку компаній, — друге правило поруч
 * розійшлося б із першим на першій же літері.
 *
 * СКОРОЧЕННЯ, ЩО ЧИТАЮТЬСЯ НЕ ЗА БУКВАМИ, — окремим переліком. «UV» — це
 * ультрафіолет, тобто «УФ»; побуквено вийшло б «ув», і воно не знайшло б
 * нічого. «DTF» сюди не потрапив: d-t-f і так дає «дтф».
 *
 * СЛОВА ЗАПИТУ — НЕЗАЛЕЖНО, розділові знаки — байдуже: «друк уф» знаходить
 * «УФ-друк», «уф дтф» — «УФ-ДТФ». Кожне слово має бути в назві.
 */
const NOT_LETTER_BY_LETTER: ReadonlyArray<readonly [RegExp, string]> = [[/uv/g, "уф"]];

/** Ключ для порівняння через кирилицю: без регістру й розділових, латиниця переписана. */
const cyrillicKey = (value: string) => {
  let key = normalizeMethodName(value);
  for (const [latin, cyrillic] of NOT_LETTER_BY_LETTER) key = key.replace(latin, cyrillic);
  return transliterateLatinToCyrillic(key);
};

/** Чи назва методу підходить під набране в пошуку. Порожній запит підходить усім. */
export const matchesMethodQuery = (name: string, query: string): boolean => {
  const words = query
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => normalizeMethodName(word))
    .filter(Boolean);
  if (words.length === 0) return true;
  const plain = normalizeMethodName(name);
  const folded = cyrillicKey(name);
  return words.every((word) => plain.includes(word) || folded.includes(cyrillicKey(word)));
};
