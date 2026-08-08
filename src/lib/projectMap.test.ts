import { describe, expect, it } from "vitest";
import { FEATURE_DEFINITIONS } from "./featureCatalog";
import { MODULE_DEFINITIONS } from "./moduleAccess";
import { MODULE_KEYS, buildProjectMap, isKnownModuleKey, moduleKeyLabel } from "./projectMap";

/**
 * Карта їде в кожен запит розбору задачі. Ламається вона тихо: модель просто
 * почне вгадувати напрямок «зі стелі», а картки виглядатимуть класифікованими.
 * Тому тут зафіксовано і вміст, і стеля розміру.
 */

/** Карта поміщається в промпт із запасом; байти рахуємо, бо кирилиця — 2 байти на літеру. */
const MAX_MAP_BYTES = 4096;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

describe("карта проєкту", () => {
  it("не порожня і має обидва розділи", () => {
    const map = buildProjectMap();
    expect(map.length).toBeGreaterThan(200);
    expect(map).toContain("Напрямки CRM");
    expect(map).toContain("Що CRM уже вміє");
  });

  it("містить кожен ключ напрямку разом із підписом", () => {
    const map = buildProjectMap();
    MODULE_DEFINITIONS.forEach((item) => {
      expect(map).toContain(`${item.key} — ${item.label}`);
    });
    // Точкова звірка на випадок, якщо реєстр колись почнуть фільтрувати:
    // ці три напрямки — найчастіші адресати запитів.
    expect(map).toContain("quotes — Прорахунки");
    expect(map).toContain("design — Дизайн");
    expect(map).toContain("finance — Фінанси");
  });

  it("перелічує можливості з довідника", () => {
    const map = buildProjectMap();
    FEATURE_DEFINITIONS.forEach((feature) => {
      expect(map).toContain(feature.label);
    });
  });

  it("описи скорочені до одного речення", () => {
    const map = buildProjectMap();
    // Telegram-бот має найдовший опис — два речення. У карту йде лише перше.
    expect(map).toContain("Один бот робить дві речі: шле робочі сповіщення в звичайний чат і");
    expect(map).not.toContain("Ним же оформлюють лікарняний");
  });

  it("можливості можна вимкнути — лишиться сам перелік напрямків", () => {
    const short = buildProjectMap({ includeFeatures: false });
    expect(short).toContain("quotes — Прорахунки");
    expect(short).not.toContain("Що CRM уже вміє");
    expect(byteLength(short)).toBeLessThan(byteLength(buildProjectMap()));
  });

  it("не роздувається — інакше платимо за неї в кожному запиті", () => {
    expect(byteLength(buildProjectMap())).toBeLessThan(MAX_MAP_BYTES);
  });
});

describe("перевірка напрямку", () => {
  it("пускає справжній ключ", () => {
    expect(isKnownModuleKey("quotes")).toBe(true);
    expect(isKnownModuleKey("vchasno_send")).toBe(true);
    MODULE_KEYS.forEach((key) => {
      expect(isKnownModuleKey(key)).toBe(true);
    });
  });

  it("відкидає вигаданий — саме такі ключі й вигадує модель", () => {
    expect(isKnownModuleKey("payments")).toBe(false);
    expect(isKnownModuleKey("tasks")).toBe(false);
    expect(isKnownModuleKey("Quotes")).toBe(false);
    expect(isKnownModuleKey("")).toBe(false);
    expect(isKnownModuleKey(null)).toBe(false);
    expect(isKnownModuleKey(undefined)).toBe(false);
    expect(isKnownModuleKey(42)).toBe(false);
  });

  it("підпис бере з реєстру, для чужого ключа — нічого", () => {
    expect(moduleKeyLabel("quotes")).toBe("Прорахунки");
    expect(moduleKeyLabel("payments")).toBeNull();
    expect(moduleKeyLabel(null)).toBeNull();
  });
});
