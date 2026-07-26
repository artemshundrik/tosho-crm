import { describe, expect, it } from "vitest";
import {
  defaultModuleAccess,
  hasModuleAccess,
  MODULE_DEFINITIONS,
  MODULE_GROUPS,
  MODULE_KEYS,
  normalizeModuleAccess,
} from "./moduleAccess";

/**
 * Реєстр модулів керує тим, хто що бачить, тож найризикованіше тут — тихо
 * забрати доступ у людини, яка його мала. Ці тести фіксують саме це.
 */

const DESIGNER = { accessRole: "member", jobRole: "designer" };
const OWNER = { accessRole: "owner", jobRole: "it_specialist" };
const SEO = { accessRole: "admin", jobRole: "seo" };

describe("успадкування зі старих ключів", () => {
  it("розділені «замовлення» успадковують доступ зі спільного ключа", () => {
    // Реальний запис Лєни до розділення: orders=true і жодних customers/quotes.
    const access = normalizeModuleAccess({ overview: true, orders: true, design: true }, DESIGNER.accessRole, DESIGNER.jobRole);
    expect(access.orders).toBe(true);
    expect(access.customers).toBe(true);
    expect(access.quotes).toBe(true);
    expect(access.shipping).toBe(true);
  });

  it("вимкнені замовлення так само успадковуються — не вмикаємо зайвого", () => {
    // Настя-маркетолог має orders=false; нові ключі мусять лишитись false.
    const access = normalizeModuleAccess({ orders: false }, "member", "marketer");
    expect(access.customers).toBe(false);
    expect(access.quotes).toBe(false);
    expect(access.shipping).toBe(false);
  });

  it("явно записаний ключ перебиває успадкування", () => {
    const access = normalizeModuleAccess({ orders: true, quotes: false }, "member", "designer");
    expect(access.orders).toBe(true);
    expect(access.quotes).toBe(false);
  });
});

describe("«Команда» вимкненню не підлягає", () => {
  it("лишається true навіть коли в базі записано false", () => {
    // У проді в більшості людей team=false — після переїзду ключа це вже не
    // має ховати сторінку команди.
    expect(normalizeModuleAccess({ team: false }, "member", "designer").team).toBe(true);
    expect(defaultModuleAccess(DESIGNER).team).toBe(true);
    expect(hasModuleAccess({ team: false } as never, "team")).toBe(true);
  });
});

describe("«Ролі та доступи» лишаються в тих самих руках", () => {
  it("дає доступ власнику і SEO, але не рядовому учаснику", () => {
    expect(defaultModuleAccess(OWNER).members_access).toBe(true);
    expect(defaultModuleAccess(SEO).members_access).toBe(true);
    expect(defaultModuleAccess(DESIGNER).members_access).toBe(false);
  });

  it("не протікає до тих, хто мав лише старий ключ team", () => {
    // Ключ team тепер alwaysOn, тож не має ставати перепусткою до керування
    // правами: members_access вирішується роллю, а не ним.
    expect(normalizeModuleAccess({ team: true }, "member", "designer").members_access).toBe(false);
  });
});

describe("цілісність реєстру", () => {
  it("ключі унікальні", () => {
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length);
  });

  it("усі модулі потрапили рівно в одну групу", () => {
    const grouped = MODULE_GROUPS.flatMap((section) => section.modules.map((item) => item.key));
    expect(grouped.sort()).toEqual([...MODULE_KEYS].sort());
  });

  it("успадкування вказує на наявний ключ і не зациклюється", () => {
    MODULE_DEFINITIONS.forEach((item) => {
      if (!item.inheritsFrom) return;
      expect(MODULE_KEYS).toContain(item.inheritsFrom);
      expect(item.inheritsFrom).not.toBe(item.key);
    });
  });

  it("нормалізація завжди повертає повний набір ключів", () => {
    expect(Object.keys(normalizeModuleAccess(null)).sort()).toEqual([...MODULE_KEYS].sort());
    expect(Object.keys(normalizeModuleAccess("сміття")).sort()).toEqual([...MODULE_KEYS].sort());
  });
});
