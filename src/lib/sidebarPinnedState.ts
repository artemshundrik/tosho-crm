/**
 * Які пункти меню людина закріпила вгорі сайдбару.
 *
 * Живе в localStorage поруч зі згорнутими секціями ([[sidebarGroupState]]) і з
 * тієї ж причини: це налаштування конкретного екрана, а не робочий стан. На
 * ноутбуці власника закріплені свої чотири маршрути, на великому моніторі меню
 * може бути розгорнуте цілком — синхронізувати ці стани було б шкідливо.
 *
 * Зберігаємо МАСИВ, а не набір: порядок закріплених пунктів — це вибір людини
 * (що додала першим, те й вище), і Set його втратив би.
 *
 * Ключ пункта — його маршрут (`link.to`). Маршрути стабільні, на відміну від
 * підписів, а зниклий маршрут просто відсіється при читанні: пункт, до якого
 * більше немає доступу, не має вискакувати у закріплених привидом.
 */

const STORAGE_KEY = "sidebar:pinned-links";

export function readPinnedLinks(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.filter((item): item is string => {
      if (typeof item !== "string" || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  } catch {
    return [];
  }
}

export function writePinnedLinks(routes: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  } catch {
    // Приватний режим або переповнене сховище — не привід ламати навігацію.
  }
}
