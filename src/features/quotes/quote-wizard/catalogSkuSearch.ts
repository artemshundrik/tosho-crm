import * as React from "react";

import { fetchCatalogVariantsBySku, type CatalogVariantMatch } from "@/features/quotes/quote-details/queries";

import { looksLikeSku, scoreSkuMatch } from "./catalogSuggestions";

/**
 * Пошук товару за артикулом ВАРІАНТА — запитом до бази (REQ-248).
 *
 * ЩО БУЛО НЕ ТАК. Поле позиції знало лише артикул моделі — один скаляр
 * `metadata.sku`. А постачальник дає код кольору: «TSRA170-BK», тоді як модель
 * підписана «TSRA170-WH» (перший колір у списку). Замір на проді 04.09.2026:
 * із 71 моделі з артикулом рівно у 56 є артикули варіантів, яких з артикула
 * моделі не видно. Тобто вставлений код найчастіше не знаходив нічого.
 *
 * ЧОМУ НЕ ЗАБРАТИ ВАРІАНТИ В БРАУЗЕР, як забрали артикул моделі. Масив
 * `variants` на 250 моделях важить 661 кБ і їхав би на КОЖНЕ відкриття вікна
 * заради пошуку, яким користуються зрідка. Каталог росте (1851 товар у планах),
 * і ця вага росте разом із ним, а користь — ні.
 *
 * ЗАПИТ ІДЕ НЕ НА КОЖНУ ЛІТЕРУ, А ЛИШЕ НА СХОЖЕ НА КОД. Назви шукаються в
 * браузері, як і раніше, — миттєво й без мережі. У базу йдемо, тільки коли
 * набране виглядає артикулом (`looksLikeSku`), тобто в тому єдиному випадку,
 * коли локального знання свідомо бракує.
 */

/** Скільки моделей забираємо за раз: підказок усе одно показуємо вісім. */
const SKU_SEARCH_LIMIT = 12;

/**
 * Пауза перед запитом. Код зазвичай ВСТАВЛЯЮТЬ, тож ця затримка майже не
 * відчутна; вона рятує від черги запитів, коли артикул набирають руками.
 */
const SKU_SEARCH_DELAY_MS = 200;

const NO_MATCHES: ReadonlyMap<string, CatalogVariantMatch> = new Map();

/**
 * Моделі, у яких є варіант із таким артикулом: `modelId` → сам той варіант
 * (id, назва кольору, артикул).
 *
 * Без React Query навмисно — як і решта стану цього вікна: результат живе
 * рівно стільки, скільки набране в полі, і кешувати його нема сенсу.
 */
export function useCatalogSkuMatches(teamId: string, query: string) {
  const [matches, setMatches] = React.useState<ReadonlyMap<string, CatalogVariantMatch>>(NO_MATCHES);
  const [searching, setSearching] = React.useState(false);
  const needle = looksLikeSku(query) ? query.trim() : "";

  React.useEffect(() => {
    if (!needle || !teamId) {
      setMatches(NO_MATCHES);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        const result = await fetchCatalogVariantsBySku(teamId, needle, SKU_SEARCH_LIMIT);
        if (!alive) return;
        // Запит не вдався — поле працює далі на локальних підказках: ламати
        // пошук назв через невдалий запит по коду нема чого.
        const next = new Map<string, CatalogVariantMatch>();
        if (result.ok) {
          for (const row of result.data) {
            // Одна модель — один найкращий варіант: показувати десять кольорів
            // того самого товару підказкою не є.
            const best = next.get(row.modelId);
            if (!best || scoreSkuMatch(needle, row.sku) > scoreSkuMatch(needle, best.sku)) {
              next.set(row.modelId, row);
            }
          }
        }
        setMatches(next);
        setSearching(false);
      })();
    }, SKU_SEARCH_DELAY_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [teamId, needle]);

  return { matches, searching };
}
