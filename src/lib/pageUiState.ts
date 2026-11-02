/**
 * Коли сторінка списку відновлює свої фільтри: протягом сесії вкладки.
 *
 * Вибір (менеджер, статус, сортування, пошук) тримається, поки людина ходить
 * сторінками — через бічне меню так само, як кнопкою «Назад». Перезавантаження,
 * нова вкладка чи наступний день — і знову стоїть те, що за посадою: менеджер
 * бачить себе (REQ-173#p19).
 *
 * Доти відновлювала лише «Назад» протягом 30 хв, а клік у меню скидав усе.
 * Межа «до перезавантаження» — час завантаження цього модуля: стан, записаний
 * раніше, належить попередньому завантаженню сторінки, хоч sessionStorage його
 * й пережив.
 */
const PAGE_LOADED_AT = Date.now();

export function shouldRestorePageUiState(cachedAt?: number | null) {
  if (!Number.isFinite(cachedAt ?? NaN)) return false;
  return Number(cachedAt) >= PAGE_LOADED_AT;
}

/**
 * Явний вибір людини у фільтрі — окремо від стану сторінки.
 *
 * Сторінка зберігає свої фільтри одразу при монтуванні, ще до того, як
 * дефолт «себе» встиг підставитись (він чекає відповіді з бази). Повторне
 * монтування в тому ж завантаженні відновлювало те автоматичне «всі» як
 * вибір — і «себе» так і не ставало (02.11, Артем на Дизайні). Тому вибір
 * пишеться лише тоді, коли людина справді клацнула.
 */
const choiceKey = (scope: string) => `tosho:filter-choice:${scope}`;

export function readFilterChoice(scope: string): string | undefined {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(choiceKey(scope)) ?? "null") as { value?: unknown; at?: number } | null;
    if (!parsed || typeof parsed.value !== "string") return undefined;
    return shouldRestorePageUiState(parsed.at) ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

export function writeFilterChoice(scope: string, value: string) {
  try {
    sessionStorage.setItem(choiceKey(scope), JSON.stringify({ value, at: Date.now() }));
  } catch {
    // Приватне вікно — вибір просто не переживе перехід між сторінками.
  }
}
