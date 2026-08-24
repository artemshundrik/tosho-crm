/**
 * Налаштування нижньої смуги вкладок — що людина обрала собі на телефон.
 *
 * Живе в localStorage, а не в базі, з тієї ж причини, що й згорнуті секції
 * сайдбару ([[sidebarGroupState]]): це налаштування конкретного екрана. Смуга
 * взагалі існує лише на телефоні, і переносити її склад на чужий пристрій
 * було б не послугою, а сюрпризом.
 *
 * ПРАВИЛО СЛОТІВ (картка 146). У смузі максимум п'ять елементів. Кружечок
 * ToSho AI — не розділ, а дія, і коли він увімкнений, то займає свій слот:
 * лишається чотири вкладки. Вимкнений — усі п'ять слотів під розділи.
 */

const TABS_KEY = "tabbar:tabs";
const AI_KEY = "tabbar:ai";

/** Скільки елементів узагалі вміщає смуга. */
export const MAX_TAB_BAR_SLOTS = 5;

export type TabBarPrefs = {
  /** Обрані розділи в порядку показу; null — людина нічого не міняла. */
  tabs: string[] | null;
  /** Чи показувати кружечок ToSho AI. */
  ai: boolean;
};

/** Скільки слотів лишається під вкладки при заданому стані AI. */
export function tabSlotCount(ai: boolean) {
  return ai ? MAX_TAB_BAR_SLOTS - 1 : MAX_TAB_BAR_SLOTS;
}

const DEFAULT_PREFS: TabBarPrefs = { tabs: null, ai: true };

/**
 * Знімок кешується, бо `useSyncExternalStore` вимагає стабільного значення:
 * новий об'єкт на кожен виклик дав би нескінченний цикл рендерів.
 */
let snapshot: TabBarPrefs | null = null;
const listeners = new Set<() => void>();

function readFromStorage(): TabBarPrefs {
  if (typeof localStorage === "undefined") return DEFAULT_PREFS;
  try {
    const rawTabs = localStorage.getItem(TABS_KEY);
    const rawAi = localStorage.getItem(AI_KEY);
    let tabs: string[] | null = null;
    if (rawTabs) {
      const parsed: unknown = JSON.parse(rawTabs);
      if (Array.isArray(parsed)) {
        tabs = parsed.filter((item): item is string => typeof item === "string");
      }
    }
    return { tabs, ai: rawAi === null ? true : rawAi === "1" };
  } catch {
    // Приватний режим або зіпсований запис — не привід лишити людину без смуги.
    return DEFAULT_PREFS;
  }
}

export function getTabBarPrefs(): TabBarPrefs {
  snapshot ??= readFromStorage();
  return snapshot;
}

/** Для рендеру на сервері налаштувань немає — віддаємо дефолт. */
export function getServerTabBarPrefs(): TabBarPrefs {
  return DEFAULT_PREFS;
}

export function subscribeTabBarPrefs(onChange: () => void) {
  listeners.add(onChange);
  // Сусідня вкладка браузера теж може змінити налаштування.
  if (typeof window !== "undefined") window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", onChange);
  };
}

export function setTabBarPrefs(next: TabBarPrefs) {
  try {
    if (next.tabs) localStorage.setItem(TABS_KEY, JSON.stringify(next.tabs));
    else localStorage.removeItem(TABS_KEY);
    localStorage.setItem(AI_KEY, next.ai ? "1" : "0");
  } catch {
    // Записати не вдалось — застосунок усе одно має працювати далі.
  }
  snapshot = { tabs: next.tabs ? [...next.tabs] : null, ai: next.ai };
  listeners.forEach((listener) => listener());
}
