import { areCompanyNamesEquivalent, normalizeCompanyNameLooseKey } from "./companyNameSearch";

/**
 * Підказка «така компанія вже є» — поки людина друкує назву.
 *
 * НАВІЩО НЕ НА ЗБЕРЕЖЕННІ. Перевірка на дублі в CRM була й до цього, але вона
 * спрацьовувала на кнопці «Зберегти» — тобто тоді, коли форму вже заповнено.
 * Рішення Артема 27.08.2026: попередження, що приходить після роботи, роботи не
 * economить. Людина має побачити збіг ще на назві — і сама вирішити не заводити.
 *
 * ЧОМУ САМЕ НАЗВА, А НЕ ТЕЛЕФОН. Телефон — сильніший сигнал, але він у формі
 * НИЖЧЕ: поки до нього дійдеш, усе інше вже набрано. Тому телефон лишається
 * перевіркою «на виході», а акцент — на назві, яку вводять першою.
 *
 * ЩО НЕ СПРАЦЮВАЛО ДО ЦЬОГО. Влад завів «KMZ Industries - КМЗ», навмисно
 * написавши назву двома мовами, щоб колеги не задублювали. Дар'я завела «KMZ» —
 * і CRM промовчала, бо порівняння вимагало збігу НАЗВИ ЦІЛКОМ:
 * `kmzindustrieskmz` проти `kmz`. Іронія в тому, що старання написати назву
 * повніше зробило збіг МЕНШ імовірним.
 */

/**
 * Коротше за це не підказуємо: на двох літерах у списку опиниться пів бази, і
 * підказку почнуть гортати повз.
 */
export const COMPANY_HINT_MIN_WORD = 3;

/**
 * Правові форми — не назва компанії.
 *
 * Замір 27.08.2026 показав це прямо: набираєш «ТОВ» — і в підказці п'ять чужих
 * ТОВ, жодне з яких не має стосунку до того, що ти заводиш. Ключі вже
 * нормалізовані в фонетичну латиницю, тож і перелік тут у ній.
 */
const LEGAL_FORM_WORDS = new Set([
  "tov", // ТОВ
  "fop", // ФОП
  "pp", // ПП
  "tm", // ТМ
  "gk", // ГК
  "llc",
  "ltd",
  "inc",
  "kompania", // КОМПАНІЯ
  "company",
  "grup", // ГРУП / GROUP після фонетичної нормалізації
  "group",
]);

const words = (value: string): string[] =>
  normalizeCompanyNameLooseKey(value)
    .split(" ")
    .filter((word) => word.length >= COMPANY_HINT_MIN_WORD && !LEGAL_FORM_WORDS.has(word));

/**
 * Чи схожа назва настільки, щоб показати її людині.
 *
 * ЗА ЦІЛИМИ СЛОВАМИ, А НЕ ЗА ПІДРЯДКОМ. Замір бази 27.08.2026 (230 лідів,
 * 134 замовники) показав, чим це різниться. Підрядок дає сміття: «Ропа»
 * знаходиться всередині «Аг-РОПА-нцир», «EDS» — усередині «mass-EEDS»,
 * і людина перестає читати підказку вже на третій. Порівняння за словами те
 * саме сміття відсіює, але зберігає всі справжні збіги з тієї ж вибірки:
 * «KMZ» ↔ «KMZ Industries - КМЗ», «НіКС/ N-iX» ↔ «НІКС / NIX Solutions»,
 * «ВЕКТОР ВС (Vector VS)» ↔ «Vector», «ЗЕМЛЕРОБ КОМПАНІЯ» ↔ «землероб».
 *
 * ПРЕФІКС, А НЕ ТОЧНА РІВНІСТЬ СЛОВА: підказка живе під полем, поки в ньому
 * друкують, і чекати останньої літери означало б показати її тоді, коли назву
 * вже дописали. Ціна — кілька приблизних збігів на кшталт «ICL» / «Iclub»; для
 * підказки, яка нічого не забороняє, це дешевше за пропущений дубль.
 *
 * Порівнюємо В ОБИДВА БОКИ: однаково важливо і коли коротшу назву вводять при
 * наявній довгій, і навпаки.
 */
export function isSimilarCompanyName(query: string, candidate: string): boolean {
  if (!query.trim() || !candidate.trim()) return false;
  if (areCompanyNamesEquivalent(query, candidate)) return true;

  const queryWords = words(query);
  const candidateWords = words(candidate);
  if (queryWords.length === 0 || candidateWords.length === 0) return false;

  return queryWords.some((queryWord) =>
    candidateWords.some(
      (candidateWord) => candidateWord.startsWith(queryWord) || queryWord.startsWith(candidateWord)
    )
  );
}

export type CompanyHintCandidate = {
  id: string;
  /** Назва, яку показуємо людині. */
  name: string;
  /** Друга назва картки (юридична) — теж привід для збігу. */
  legalName?: string | null;
  manager?: string | null;
  /** Потрібен, щоб підтягнути аватарку менеджера: імена бувають неоднозначні. */
  managerUserId?: string | null;
};

export type CompanyHintMatch = CompanyHintCandidate & { kind: "лід" | "замовник" };

/**
 * Відібрати з результатів пошуку ті, що варто показати.
 *
 * Стеля навмисно низька: підказка стоїть під полем і не має відсувати форму.
 * Якщо збігів більше, важливо не перелічити всі, а сказати, що вони є.
 */
export const COMPANY_HINT_LIMIT = 3;

export function pickCompanyHints(
  query: string,
  leads: CompanyHintCandidate[],
  customers: CompanyHintCandidate[]
): CompanyHintMatch[] {
  const matches = (rows: CompanyHintCandidate[], kind: "лід" | "замовник"): CompanyHintMatch[] =>
    rows
      .filter((row) => isSimilarCompanyName(query, row.name) || isSimilarCompanyName(query, row.legalName ?? ""))
      .map((row) => ({ ...row, kind }));

  // Замовники першими: наявний замовник — важливіша знахідка за ліда, бо з ним
  // уже працюють, і заводити його вдруге дорожче.
  return [...matches(customers, "замовник"), ...matches(leads, "лід")].slice(0, COMPANY_HINT_LIMIT);
}
