import type { ModuleKey } from "@/lib/moduleAccess";

/**
 * Унікальні ключі модулів зі списку пунктів меню.
 *
 * Дрібниця, винесена з AppLayout: сам сайдбар упирається в стелю розміру, а
 * тут ще й є що перевірити — пункти Dev ділять один ключ на чотири маршрути,
 * і без унікалізації мітка «Нове» гасла б лише на тому, куди зайшли.
 */
export function moduleKeysOf(links: ReadonlyArray<{ moduleKey?: ModuleKey }>): ModuleKey[] {
  return Array.from(
    new Set(links.map((link) => link.moduleKey).filter((key): key is ModuleKey => Boolean(key)))
  );
}
