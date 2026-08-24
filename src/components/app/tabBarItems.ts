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
 * Слотів під вкладки за замовчуванням.
 *
 * Правило смуги (картка 146): максимум 5 елементів, кружечок ToSho AI та
 * кнопка меню займають по слоту. AI поки що є завжди, тож вкладок — 3.
 * Кастомізація (вимкнути AI → 4 вкладки) передасть сюди інше число.
 */
const DEFAULT_TAB_SLOTS = 3;

/** Топ доступних модулів за пріоритетом. Чиста функція — крита тестами. */
export function resolveTabItems(
  links: readonly TabSourceLink[],
  slots: number = DEFAULT_TAB_SLOTS
): TabSourceLink[] {
  const byModule = new Map<ModuleKey, TabSourceLink>();
  for (const link of links) {
    if (link.moduleKey && !byModule.has(link.moduleKey)) {
      byModule.set(link.moduleKey, link);
    }
  }
  const items: TabSourceLink[] = [];
  for (const key of DEFAULT_TAB_PRIORITY) {
    const link = byModule.get(key);
    if (link) items.push(link);
    if (items.length === slots) break;
  }
  return items;
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
