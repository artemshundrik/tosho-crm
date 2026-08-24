import type React from "react";
import type { ModuleKey } from "@/lib/moduleAccess";

/**
 * Мінімум, який нижній смузі вкладок потрібно знати про пункт сайдбару.
 *
 * Смуга навмисно НЕ має власного переліку розділів: вона їсть ті самі
 * `visibleSidebarLinks`, що й сайдбар із дровером, — реєстр навігації один, і
 * доступи (`moduleAccess`, роль, «Дивитись як») застосовуються в одному місці.
 */
export type TabSourceLink = {
  label: string;
  to: string;
  icon: React.ElementType;
  moduleKey?: ModuleKey;
};

/**
 * Порядок, у якому модулі претендують на слоти смуги, поки людина не
 * налаштувала власний набір (кастомізація — окремий пункт плану картки 146).
 *
 * Перші чотири ДОСТУПНІ перемагають: у типових ролей це ті самі чотири
 * вкладки, що були захардкоджені раніше, — для них зміна невидима. А кому
 * модуль вимкнено, той замість мертвої вкладки одержує наступний свій.
 */
const DEFAULT_TAB_PRIORITY: ModuleKey[] = [
  "quotes",
  "customers",
  "orders",
  "design",
  "finance",
  "shipping",
  "catalog",
  "stock",
  "marketing",
  "team",
];

/**
 * Слотів під вкладки, коли про налаштування ще нічого не відомо.
 *
 * Чотири — бо кружечок ToSho AI за замовчуванням увімкнений і займає п'ятий
 * (правило смуги в [[tabBarSettings]]). Кнопки меню в смузі немає: до решти
 * розділів веде гамбургер у шапці.
 */
const DEFAULT_TAB_SLOTS = 4;

/** Пункт, доступний людині, за ключем модуля. */
function indexByModule(links: readonly TabSourceLink[]) {
  const byModule = new Map<ModuleKey, TabSourceLink>();
  for (const link of links) {
    if (link.moduleKey && !byModule.has(link.moduleKey)) {
      byModule.set(link.moduleKey, link);
    }
  }
  return byModule;
}

/**
 * Вкладки смуги: обране людиною, інакше — топ доступних за пріоритетом.
 *
 * `chosen` фільтрується по доступах навмисно: якщо модуль колись обрали, а
 * потім забрали доступ, вкладка мусить зникнути — інакше людина тапала б у
 * порожній екран. Порожній результат вибору (усе поховалось) чесно
 * повертається порожнім, а не підмінюється дефолтом: смугу без обраного
 * краще показати короткою, ніж підсунути чуже.
 */
export function resolveTabItems(
  links: readonly TabSourceLink[],
  slots: number = DEFAULT_TAB_SLOTS,
  chosen?: readonly string[] | null
): TabSourceLink[] {
  const byModule = indexByModule(links);

  if (chosen) {
    const items: TabSourceLink[] = [];
    for (const key of chosen) {
      const link = byModule.get(key as ModuleKey);
      if (link && !items.includes(link)) items.push(link);
      if (items.length === slots) break;
    }
    return items;
  }

  const items: TabSourceLink[] = [];
  for (const key of DEFAULT_TAB_PRIORITY) {
    const link = byModule.get(key);
    if (link) items.push(link);
    if (items.length === slots) break;
  }
  return items;
}

/** Усі доступні розділи в порядку сайдбару — для екрана налаштувань смуги. */
export function availableTabChoices(links: readonly TabSourceLink[]): TabSourceLink[] {
  return links.filter((link) => Boolean(link.moduleKey));
}

/**
 * Вкладка активна на своєму маршруті та його підсторінках.
 *
 * Саме `to + "/"`, а не голий `startsWith(to)`: інакше маршрут "/" (Огляд,
 * якщо колись потрапить у смугу через кастомізацію) був би активним завжди.
 */
export function isTabActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(to + "/");
}
