import { describe, expect, it } from "vitest";
import {
  CARD_MENU_ATTR,
  MODULE_UNSET_LABEL,
  buildCardMeta,
  isCardMenuTarget,
  isUrgentCard,
  resolveAuthor,
} from "./cardModel";
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

const keys = (req: DevRequest) => buildCardMeta(req).map((item) => item.key);
const chip = (req: DevRequest, key: string) =>
  buildCardMeta(req).find((item) => item.key === key);

describe("нижній рядок картки", () => {
  /**
   * ГОЛОВНЕ ПРАВИЛО РЯДУ. «Звичайний» пріоритет не підписується ніде: він
   * стоїть на більшості карток, нічого не розрізняє і з'їдає місце в ряду,
   * який сканують очима. Тест стоїть тут саме тому, що поламати це можна
   * одним рядком у верстці й не помітити.
   */
  it("«звичайний» пріоритет не показуємо взагалі", () => {
    expect(chip(request({ priority: "normal" }), "priority")).toBeUndefined();
    expect(keys(request({ priority: "normal" }))).not.toContain("priority");
  });

  it("непроставлений пріоритет теж мітки не додає", () => {
    expect(keys(request({ priority: null }))).not.toContain("priority");
  });

  it("підписуються лише два краї шкали: «терміново» голосно, «не горить» тихо", () => {
    expect(chip(request({ priority: "high" }), "priority")).toEqual({
      key: "priority",
      label: "Терміново",
      weight: "loud",
    });
    expect(chip(request({ priority: "low" }), "priority")).toEqual({
      key: "priority",
      label: "Не горить",
      weight: "quiet",
    });
  });

  it("тип запиту в нижній ряд не потрапляє — він живе у верхньому рядку", () => {
    expect(keys(request({ kind: "friction" }))).not.toContain("kind");
  });

  /**
   * Порожній напрямок називаємо словами. Порожнє місце читається як «поля
   * немає», а насправді поле є — його просто ніхто не заповнив.
   */
  it("напрямку немає — так і написано, приглушено", () => {
    expect(chip(request({ moduleKey: null }), "module")).toMatchObject({
      label: MODULE_UNSET_LABEL,
      weight: "quiet",
    });
  });

  it("напрямок підписується з реєстру модулів, а не власним списком", () => {
    expect(chip(request({ moduleKey: "quotes" }), "module")).toMatchObject({
      label: "Прорахунки",
      weight: "normal",
    });
  });

  it("ключ, якого в реєстрі немає, читається як невизначений напрямок", () => {
    expect(chip(request({ moduleKey: "payments" }), "module")?.label).toBe(MODULE_UNSET_LABEL);
  });

  it("автор, лічильник прохань і «закрита» стають мітками", () => {
    const meta = buildCardMeta(
      request({ displayName: "Олена Борщ", askedByCount: 3, isPrivate: true })
    );
    expect(meta.find((item) => item.key === "author")?.label).toBe("Олена Борщ");
    expect(meta.find((item) => item.key === "asked")?.label).toBe("просили 3");
    expect(meta.find((item) => item.key === "private")?.label).toBe("закрита");
  });

  it("одну людину не рахуємо: «просили 1» — це шум, а не факт", () => {
    expect(keys(request({ askedByCount: 1 }))).not.toContain("asked");
  });

  it("порядок сталий: пріоритет → напрямок → автор → просили → закрита", () => {
    expect(
      keys(
        request({
          priority: "high",
          moduleKey: "design",
          displayName: "Олена Борщ",
          askedByCount: 2,
          isPrivate: true,
        })
      )
    ).toEqual(["priority", "module", "author", "asked", "private"]);
  });
});

/**
 * Підсвітка картки й слово «Терміново» вмикаються з однієї умови — інакше з
 * часом на дошці зʼявиться червона картка без пояснення.
 */
describe("підсвітка термінової картки", () => {
  it("горить лише на «терміново»", () => {
    expect(isUrgentCard(request({ priority: "high" }))).toBe(true);
    expect(isUrgentCard(request({ priority: "normal" }))).toBe(false);
    expect(isUrgentCard(request({ priority: "low" }))).toBe(false);
    expect(isUrgentCard(request({ priority: null }))).toBe(false);
  });

  it("умова та сама, що й у гучної мітки", () => {
    const urgent = request({ priority: "high" });
    expect(isUrgentCard(urgent)).toBe(
      buildCardMeta(urgent).some((item) => item.weight === "loud")
    );
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
