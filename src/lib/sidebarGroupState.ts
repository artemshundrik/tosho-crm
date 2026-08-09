/**
 * Які секції сайдбару людина згорнула.
 *
 * Живе в localStorage, а не в базі: це налаштування конкретного екрана, а не
 * робочий стан. На ноутбуці власника меню може бути згорнуте, на великому
 * моніторі — розгорнуте, і синхронізувати ці два стани було б шкідливо.
 *
 * Зберігаємо тільки ЗГОРНУТІ ключі. Так нова секція завжди зʼявляється
 * розгорнутою: інакше після додавання розділу він тихо ховався б у всіх, хто
 * колись щось згортав, і виглядав би як невикочений.
 */

const STORAGE_KEY = "sidebar:collapsed-groups";

export type SidebarGroupState = Record<string, boolean>;

export function readCollapsedGroups(): SidebarGroupState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return {};
    const result: SidebarGroupState = {};
    parsed.forEach((key) => {
      if (typeof key === "string") result[key] = true;
    });
    return result;
  } catch {
    return {};
  }
}

export function writeCollapsedGroups(state: SidebarGroupState) {
  try {
    const collapsed = Object.entries(state)
      .filter(([, value]) => value)
      .map(([key]) => key);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
  } catch {
    // Приватний режим або переповнене сховище — не привід ламати навігацію.
  }
}
