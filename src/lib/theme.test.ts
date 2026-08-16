import { afterEach, describe, expect, it } from "vitest";

import {
  THEME_OPTIONS,
  normalizeThemePreference,
  resolveTheme,
  subscribeToSystemTheme,
  systemPrefersDark,
  themeMenuTitle,
  themeSwitcherLabel,
} from "./theme";

describe("normalizeThemePreference", () => {
  it("розпізнає всі три режими", () => {
    expect(normalizeThemePreference("light")).toBe("light");
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("system")).toBe("system");
    expect(normalizeThemePreference(" DARK ")).toBe("dark");
  });

  it("порожнє сховище означає «як у системі», а не світлу тему", () => {
    // До цієї задачі перемикач при першому ж рендері записував у localStorage
    // конкретну тему, тож «системного» стану не існувало взагалі. Тепер
    // відсутність запису — це повноцінний режим: іде за налаштуванням ОС.
    expect(normalizeThemePreference(null)).toBe("system");
    expect(normalizeThemePreference(undefined)).toBe("system");
    expect(normalizeThemePreference("")).toBe("system");
  });

  it("сміття в сховищі не ламає тему", () => {
    expect(normalizeThemePreference("auto")).toBe("system");
    expect(normalizeThemePreference(42)).toBe("system");
    expect(normalizeThemePreference({})).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("явний вибір сильніший за налаштування ОС", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("«системна» йде за ОС", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("THEME_OPTIONS", () => {
  it("порядок: світла, темна, системна", () => {
    // Порядок тримає й меню, і стрілки на клавіатурі, і зсув «пігулки»
    // активного рядка — вона позиціонується за індексом у цьому масиві.
    expect(THEME_OPTIONS.map((option) => option.value)).toEqual(["light", "dark", "system"]);
  });

  it("кожен варіант має назву", () => {
    for (const option of THEME_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });
});

describe("themeMenuTitle", () => {
  it("заголовок меню називає поточний режим", () => {
    expect(themeMenuTitle("light")).toBe("Тема · світла");
    expect(themeMenuTitle("dark")).toBe("Тема · темна");
    expect(themeMenuTitle("system")).toBe("Тема · системна");
  });
});

/**
 * Стеження за темою ОС.
 *
 * Перевіряється юнітом, а не в браузері свідомо: емуляція prefers-color-scheme
 * у переглядачі міняє значення медіазапиту, але події `change` слухачам не
 * шле — тобто саме те, що тут важливо, очима не побачиш. Тому підставляємо
 * власний matchMedia і дивимось на контракт: підписались, отримали зміну,
 * відписались — і більше нічого не приходить.
 */
describe("subscribeToSystemTheme", () => {
  type MediaListener = (event: { matches: boolean }) => void;

  const stubMatchMedia = (initial: boolean) => {
    const listeners = new Set<MediaListener>();
    const media = {
      matches: initial,
      addEventListener: (_type: string, listener: MediaListener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: MediaListener) => listeners.delete(listener),
    };
    (globalThis as { window?: unknown }).window = { matchMedia: () => media };
    return {
      listenerCount: () => listeners.size,
      emit(matches: boolean) {
        media.matches = matches;
        for (const listener of listeners) listener({ matches });
      },
    };
  };

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("читає поточний стан системи", () => {
    stubMatchMedia(true);
    expect(systemPrefersDark()).toBe(true);
  });

  it("повідомляє про зміну теми в ОС і відписується", () => {
    const media = stubMatchMedia(false);
    const seen: boolean[] = [];

    const unsubscribe = subscribeToSystemTheme((prefersDark) => seen.push(prefersDark));
    media.emit(true);
    media.emit(false);

    expect(seen).toEqual([true, false]);

    unsubscribe();
    expect(media.listenerCount()).toBe(0);
    media.emit(true);
    expect(seen).toEqual([true, false]);
  });

  it("без matchMedia не падає, а вважає систему світлою", () => {
    // Старі вбудовані переглядачі й тести без DOM: тема має лишитись робочою.
    expect(systemPrefersDark()).toBe(false);
    expect(subscribeToSystemTheme(() => {})).toBeTypeOf("function");
  });
});

describe("themeSwitcherLabel", () => {
  it("для явної теми називає саме її", () => {
    expect(themeSwitcherLabel("light", "light")).toBe("Тема: світла");
    expect(themeSwitcherLabel("dark", "dark")).toBe("Тема: темна");
  });

  it("для системної додає, яка тема зараз насправді", () => {
    // Інакше на кнопці місяць, у меню «Системна», і незрозуміло, що з чим
    // пов'язано. Скрінрідер має прочитати обидва факти.
    expect(themeSwitcherLabel("system", "dark")).toBe("Тема: як у системі (зараз темна)");
    expect(themeSwitcherLabel("system", "light")).toBe("Тема: як у системі (зараз світла)");
  });
});
