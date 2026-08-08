import { describe, expect, it } from "vitest";
import { CARD_MENU_ATTR, buildRequestChips, isCardMenuTarget, resolveAuthor } from "./cardModel";
import type { DevRequest } from "./types";

function request(overrides: Partial<DevRequest> = {}): DevRequest {
  return {
    id: "1",
    number: 3,
    label: "REQ-3",
    teamId: "t",
    title: "Кнопка не відкриває картку",
    body: "",
    kind: "bug",
    status: "triage",
    moduleKey: null,
    priority: null,
    autoClassified: false,
    isPrivate: false,
    authorUserId: null,
    tgUsername: null,
    displayName: null,
    askedByCount: 1,
    createdAt: "2026-08-08T10:00:00Z",
    ...overrides,
  };
}

const keys = (req: DevRequest) => buildRequestChips(req).map((chip) => chip.key);
const chip = (req: DevRequest, key: string) =>
  buildRequestChips(req).find((item) => item.key === key);

describe("мітки картки", () => {
  it("тип є завжди — це єдина мітка, якої не може не бути", () => {
    expect(chip(request({ kind: "friction" }), "kind")).toEqual({
      key: "kind",
      label: "Незручно",
      weight: "normal",
    });
  });

  /**
   * Головне правило ряду міток: порожній напрямок не показуємо взагалі.
   * Мітка-заглушка займає місце в ряду й читається як справжня категорія.
   */
  it("порожнього напрямку в ряду немає — саме немає, а не порожній чип", () => {
    expect(keys(request({ moduleKey: null }))).toEqual(["kind"]);
  });

  it("напрямок підписується з реєстру модулів, а не власним списком", () => {
    expect(chip(request({ moduleKey: "quotes" }), "module")?.label).toBe("Прорахунки");
  });

  it("ключа, якого в реєстрі немає, теж не показуємо", () => {
    expect(keys(request({ moduleKey: "payments" }))).toEqual(["kind"]);
  });

  it("пріоритет: «терміново» голосно, «не горить» тихо, решта рівно", () => {
    expect(chip(request({ priority: "high" }), "priority")).toEqual({
      key: "priority",
      label: "Терміново",
      weight: "loud",
    });
    expect(chip(request({ priority: "low" }), "priority")?.weight).toBe("quiet");
    expect(chip(request({ priority: "normal" }), "priority")?.weight).toBe("normal");
  });

  it("непроставлений пріоритет мітки не додає", () => {
    expect(keys(request({ priority: null }))).toEqual(["kind"]);
  });

  it("повний набір іде в сталому порядку: тип → напрямок → пріоритет", () => {
    expect(keys(request({ moduleKey: "design", priority: "high" }))).toEqual([
      "kind",
      "module",
      "priority",
    ]);
  });
});

/**
 * Захист перетягування. Перевірити походження жесту в самому dragstart не
 * вийде — подія стріляє на картці, а не на кнопці меню, — тож усе тримається
 * на цій перевірці по mousedown. Зламається вона тихо: картка просто почне
 * їздити за кнопкою меню.
 */
describe("натиснули на меню картки", () => {
  const stub = (result: unknown) => ({
    closest: (selector: string) => (selector === `[${CARD_MENU_ATTR}]` ? result : null),
  });

  it("ціль усередині меню — так", () => {
    expect(isCardMenuTarget(stub({ tagName: "DIV" }))).toBe(true);
  });

  it("ціль поза меню — ні", () => {
    expect(isCardMenuTarget(stub(null))).toBe(false);
  });

  it("не-елемент (текстовий вузол, null, вікно) не валить обробник", () => {
    expect(isCardMenuTarget(null)).toBe(false);
    expect(isCardMenuTarget(undefined)).toBe(false);
    expect(isCardMenuTarget({})).toBe(false);
    expect(isCardMenuTarget("не вузол")).toBe(false);
  });

  it("шукає саме за атрибутом-позначкою, а не за будь-чим", () => {
    const seen: string[] = [];
    isCardMenuTarget({
      closest: (selector: string) => {
        seen.push(selector);
        return null;
      },
    });
    expect(seen).toEqual([`[${CARD_MENU_ATTR}]`]);
  });
});

describe("автор картки", () => {
  it("ім'я з Telegram головне, нікнейм ховається в підказку", () => {
    expect(resolveAuthor(request({ displayName: "Олена Борщ", tgUsername: "olena" }))).toEqual({
      label: "Олена Борщ",
      hint: "@olena",
    });
  });

  it("без імені лишається нікнейм", () => {
    expect(resolveAuthor(request({ tgUsername: "olena" }))).toEqual({ label: "@olena" });
  });

  it("немає нічого — немає й рядка автора", () => {
    expect(resolveAuthor(request())).toBeNull();
  });
});
