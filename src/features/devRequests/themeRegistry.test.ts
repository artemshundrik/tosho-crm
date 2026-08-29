import { describe, expect, it } from "vitest";

import {
  isKnownTheme,
  KNOWN_THEMES,
  THEME_FALLBACK,
  THEME_LOOK,
  themeLook,
} from "./themeRegistry";

/**
 * Тони, віддані СТАНУ. Тема, яка візьме будь-який із них, почне означати те
 * саме, що «чекає СЕО», «частина в проді» або «терміново» — і сигнал стану
 * знеціниться. Саме це й сталось у першій версії реєстру, тому тут сторож.
 */
const STATE_TONES = ["warning", "accent", "danger"] as const;

describe("реєстр напрямів", () => {
  it("жодна тема не бере тон, зайнятий станом", () => {
    for (const [theme, look] of Object.entries(THEME_LOOK)) {
      expect(STATE_TONES, `тема «${theme}»`).not.toContain(look.tone);
    }
    expect(STATE_TONES).not.toContain(THEME_FALLBACK.tone);
  });

  it("іконка в кожної теми своя — саме вона й розрізняє", () => {
    // Тонів менше, ніж тем, тож колір лише групує. Якщо дві теми отримають ще
    // й однакову іконку, вони стануть нерозрізненними взагалі.
    const icons = Object.values(THEME_LOOK).map((look) => look.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("іконка теми не збігається із запасною — інакше «відома» й «невідома» виглядають однаково", () => {
    expect(Object.values(THEME_LOOK).map((l) => l.icon)).not.toContain(THEME_FALLBACK.icon);
  });

  it("невідома тема має вигляд, а порожня не має жодного", () => {
    expect(themeLook("прорахунки й гроші")).toBe(THEME_LOOK["прорахунки й гроші"]);
    // Тема, якої в реєстрі немає, мітку все одно отримує: реєстр описує вигляд,
    // а не дозволений перелік, і нова тема не має чекати на правку коду. Тут
    // узята розпущена назва — так само поводиться й ще не заведена.
    expect(themeLook("гроші замовлення")).toBe(THEME_FALLBACK);
    expect(themeLook(null)).toBeNull();
    expect(themeLook("   ")).toBeNull();
  });

  it("краї рядка не роблять із теми невідому", () => {
    expect(themeLook("  стек  ")).toBe(THEME_LOOK["стек"]);
    expect(isKnownTheme(" стек ")).toBe(true);
    expect(isKnownTheme("невідоме")).toBe(false);
  });

  it("дві теми не відрізняються лише регістром чи пробілами", () => {
    // Правило «синонім не заводиться ніколи» (docs/DEV_REQUESTS_DESIGN.md §7.4)
    // тримається людиною, але найдешевший його різновид — «AI» проти «ai» —
    // ловиться механічно. Пошук теми регістр РОЗРІЗНЯЄ (`themeLook` лише
    // зрізає краї), тож два таких ключі дали б дві різні групи на дошці й дві
    // однакові на вигляд підказки в полі — при тому, що робота одна.
    const normalized = Object.keys(THEME_LOOK).map((theme) => theme.trim().toLowerCase());
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it("перелік тем віддається повністю", () => {
    expect(KNOWN_THEMES).toHaveLength(Object.keys(THEME_LOOK).length);
    expect(KNOWN_THEMES).toContain("довіра до релізу");
  });
});
