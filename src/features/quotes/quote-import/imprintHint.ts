import type { QuoteImportDraftImprint, QuoteImportDraftItem } from "./types";

/**
 * Нанесення з ТЗ → чіп у чернетці (REQ-182#p28).
 *
 * ЧОМУ ОКРЕМИЙ МОДУЛЬ. `imprintHint` — слова з файлу, `imprints` — пари
 * «метод + місце» на конкретний вид каталогу. Місток між ними — це підбір
 * методу за назвою, а не факт про сам імпорт, тож тестується він окремо від
 * `mapping.ts` і від рендеру рядка.
 *
 * ПОХІДНА ФУНКЦІЯ, А НЕ ЕФЕКТ. `withHintImprints` нічого не запам'ятовує —
 * вона рахується щоразу заново з того, що вже лежить у чернетці й у
 * `optionsByKind` (REQ-182#p16). Тому єдиний спосіб «прибити» підказку
 * назавжди — це `imprintHintApplied`, який ставить сам візард, коли людина
 * торкнулась чипів руками; сама вона нічого не запам'ятовує і не має права
 * запам'ятовувати, бо методи виду доїжджають лінивим запитом і на перших
 * рендерах їх просто ще нема.
 */

/**
 * Синоніми методів, якими постачальники й клієнти звуть те саме нанесення.
 * Кожна група — один спосіб друку різними словами; матч по будь-якому слову
 * групи веде до тієї самої групи цілком, а звідти вже шукаємо серед методів
 * виду.
 */
const SYNONYMS: string[][] = [
  ["вишивка", "машинна вишивка", "вишивання"],
  ["шовкодрук", "шовкографія", "трафаретний друк"],
  ["dtf", "дтф"],
  ["сублімація", "сублімаційний"],
  ["гравіювання", "гравірування", "лазерне гравіювання"],
  ["уф-друк", "уф друк", "uv-друк", "uv друк"],
  ["тамподрук", "тампонний друк"],
  ["тиснення", "конгрев"],
];

/** Регістр і розділові знаки не значущі — лишається голий текст для порівняння. */
const norm = (value: string) => value.toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/giu, " ").trim();

/**
 * Метод із ТЗ (текст) → рядок довідника ВИДУ (`catalog_methods.id`) або
 * `null`, коли зіставити нема з чим — і вигадувати заміну не можна.
 *
 * ЛИШЕ «НАЗВА МЕТОДУ МІСТИТЬ ТЕРМІН», НІКОЛИ НАВПАКИ. Перевірка у зворотний
 * бік («термін містить назву методу») прив'язала б «УФ-друк» до загального
 * виду «Друк» — слово «друк» входить в обидва, — а вигадане нанесення гірше
 * за порожнє: людина йому повірить, не побачивши підказки поруч.
 */
export function matchMethodId(method: string | null, methods: Array<{ id: string; name: string }>): string | null {
  const wanted = norm(method ?? "");
  if (!wanted) return null;
  const group = SYNONYMS.find((terms) => terms.some((term) => wanted.includes(norm(term))));
  const terms = (group ?? [wanted]).map(norm);
  const found = methods.find((item) => terms.some((term) => norm(item.name) === term || norm(item.name).includes(term)));
  return found?.id ?? null;
}

/**
 * Домішує чіп нанесення з `imprintHint`, коли для цього вже є все потрібне.
 *
 * ЧОТИРИ ПРИЧИНИ МОВЧКИ ВІДДАТИ ЧЕРНЕТКУ БЕЗ ЗМІН, і жодна не помилка:
 * нема підказки з файлу (звичайна ексель-позиція); людина вже торкалась
 * чипів (`imprintHintApplied`) — підмішувати далі не можна, навіть якщо вона
 * прибрала останній чип; чипи вже є з іншого джерела (каталог, ручний вибір)
 * — не ставити другий поверх; вид іще не відомий (`catalog === null`) —
 * методи нанесення належать виду, і без нього нема на що спертись.
 *
 * Вид відомий, а методи ЦЬОГО виду ще не доїхали (`useKindImprintOptions`
 * ліниво тягне їх по кожному виду окремо) — теж мовчки лишає чернетку як є:
 * функція рахується щоразу заново, тож щойно методи прийдуть, той самий
 * виклик на наступному рендері підбере метод сам, без ефекту й без стану.
 */
export function withHintImprints(
  draft: QuoteImportDraftItem,
  methodsByKind: Record<string, { methods: Array<{ id: string; name: string }> } | undefined>
): QuoteImportDraftItem {
  if (!draft.imprintHint || draft.imprintHintApplied || draft.imprints.length > 0 || !draft.catalog) return draft;
  const methods = methodsByKind[draft.catalog.kindId]?.methods;
  if (!methods) return draft;
  const methodId = matchMethodId(draft.imprintHint.method, methods);
  if (!methodId) return draft;
  const hintImprint: QuoteImportDraftImprint = {
    key: `${draft.key}-hint`,
    methodId,
    positionId: null,
    // Місце — словами з ТЗ, як і в довідник місць, які вписали руками: у
    // трьох видів із 92 він узагалі є, тож майже завжди сюди ляже текст.
    positionLabel: draft.imprintHint.place,
  };
  return { ...draft, imprints: [hintImprint] };
}
