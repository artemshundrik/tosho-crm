import { describe, expect, it } from "vitest";
import {
  CARD_MENU_ATTR,
  buildCardMeta,
  formatIdleAge,
  isCardMenuTarget,
  isUrgentCard,
  resolveAuthor,
  shouldRestoreMenuFocus,
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
    zone: null,
    theme: null,
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

  /**
   * Пріоритет пішов із нижнього ряду 2026-08-09 — його малює PriorityBars у
   * верхньому. Тест лишається як сторож: чіп зі словом можна лише прочитати, а
   * пріоритет сканують по колонці не читаючи, і повернути мітку назад «поки
   * правив верстку» не має вийти непомітно.
   */
  it("пріоритет у нижній ряд не потрапляє — він живе стовпчиками у верхньому", () => {
    expect(keys(request({ priority: "high" }))).not.toContain("priority");
    expect(keys(request({ priority: "low" }))).not.toContain("priority");
  });

  it("зона підписана словом із реєстру", () => {
    expect(chip(request({ zone: "access" }), "zone")).toEqual({
      key: "zone",
      label: "доступи",
      weight: "normal",
      hint: "Що чіпає ця робота",
    });
  });

  it("тема показується як є, а порожньої немає взагалі", () => {
    expect(chip(request({ theme: "навігація" }), "theme")?.label).toBe("навігація");
    expect(keys(request({ theme: null }))).not.toContain("theme");
  });

  it("тип запиту в нижній ряд не потрапляє — він живе у верхньому рядку", () => {
    expect(keys(request({ kind: "friction" }))).not.toContain("kind");
  });

  /**
   * Порожній напрямок називаємо словами. Порожнє місце читається як «поля
   * немає», а насправді поле є — його просто ніхто не заповнив.
   */
  /**
   * Правило перевернулось 2026-08-09: підпис «напрямок не визначено» стояв
   * майже на кожній картці — розбір лишає поле порожнім часто, — був найдовшим
   * у ряду й ні про що. На дошці, яку сканують очима, це шум, що витісняє тему,
   * зону й автора. У дровері підпис лишається: там це відповідь на питання.
   */
  it("напрямку немає — чіпа немає взагалі", () => {
    expect(keys(request({ moduleKey: null }))).not.toContain("module");
  });

  it("напрямок підписується з реєстру модулів, а не власним списком", () => {
    expect(chip(request({ moduleKey: "quotes" }), "module")).toMatchObject({
      label: "Прорахунки",
      weight: "normal",
    });
  });

  it("ключ, якого в реєстрі немає, чіпа теж не дає", () => {
    // Модель регулярно вигадує правдоподібні ключі («payments», «tasks»).
    // Такий напрямок нікуди не веде — показувати його не можна ні як є, ні
    // під виглядом «не визначено».
    expect(keys(request({ moduleKey: "payments" }))).not.toContain("module");
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

  it("порядок сталий: тема → зона → напрямок → автор → просили → закрита", () => {
    expect(
      keys(
        request({
          priority: "high",
          theme: "навігація",
          zone: "polish",
          moduleKey: "design",
          displayName: "Олена Борщ",
          askedByCount: 2,
          isPrivate: true,
        })
      )
    ).toEqual(["theme", "zone", "module", "author", "asked", "private"]);
  });
});

/**
 * Підсвітка картки й повна шкала пріоритету вмикаються з однієї умови —
 * інакше з часом на дошці зʼявиться червона картка без пояснення.
 */
describe("підсвітка термінової картки", () => {
  it("горить лише на «терміново»", () => {
    expect(isUrgentCard(request({ priority: "high" }))).toBe(true);
    expect(isUrgentCard(request({ priority: "normal" }))).toBe(false);
    expect(isUrgentCard(request({ priority: "low" }))).toBe(false);
    expect(isUrgentCard(request({ priority: null }))).toBe(false);
  });

  it("умова та сама, що й у трьох залитих стовпчиків", () => {
    // Мітка «Терміново» з нижнього ряду пішла, тож звіряємось із джерелом
    // самої шкали: підсвітка вмикається рівно на priority === "high".
    expect(isUrgentCard(request({ priority: "high" }))).toBe(true);
    expect(isUrgentCard(request({ priority: "normal" }))).toBe(false);
    expect(isUrgentCard(request({ priority: null }))).toBe(false);
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

/**
 * Рінг на «⋯» після кліку мишею. Полагоджено не глушінням рінга, а тим, кому
 * повертаємо фокус, — тож тест захищає саме доступність: клавіатура має
 * отримати фокус назад завжди.
 */
describe("фокус після закриття меню картки", () => {
  it("клавіатурі фокус повертаємо — інакше Tab почне обхід спочатку", () => {
    expect(shouldRestoreMenuFocus("keyboard")).toBe(true);
  });

  it("миші не повертаємо — саме звідти брався синій ореол на кнопці", () => {
    expect(shouldRestoreMenuFocus("pointer")).toBe(false);
  });
});

/**
 * Вік у списку «Ідеї» — єдиний запобіжник проти того, щоб купа відкладеного
 * стала другим цвинтарем. Тому перевіряємо не лише число, а й відмінювання:
 * «лежить 2 місяць» читається як поломка й підриває довіру до самої мітки.
 */
describe("вік відкладеної картки", () => {
  const now = new Date("2026-08-09T12:00:00.000Z");
  const ago = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  it("сьогоднішня картка ще не «лежить»", () => {
    expect(formatIdleAge(ago(0), now)).toBe("сьогодні");
    expect(formatIdleAge(ago(0.9), now)).toBe("сьогодні");
  });

  it("дні відмінюються: 1 день / 3 дні / 5 днів / 11 днів", () => {
    expect(formatIdleAge(ago(1), now)).toBe("лежить 1 день");
    expect(formatIdleAge(ago(3), now)).toBe("лежить 3 дні");
    expect(formatIdleAge(ago(5), now)).toBe("лежить 5 днів");
    // 11-14 — виняток української: «одинадцять днів», а не «день».
    expect(formatIdleAge(ago(11), now)).toBe("лежить 11 днів");
    expect(formatIdleAge(ago(21), now)).toBe("лежить 21 день");
  });

  it("після місяця рахуємо місяцями — саме той випадок зі спеки", () => {
    expect(formatIdleAge(ago(30), now)).toBe("лежить 1 місяць");
    expect(formatIdleAge(ago(70), now)).toBe("лежить 2 місяці");
    expect(formatIdleAge(ago(7 * 30 + 3), now)).toBe("лежить 7 місяців");
  });

  it("між місяцями й роками діри немає — 364 дні не стають «0 років»", () => {
    expect(formatIdleAge(ago(364), now)).toBe("лежить 12 місяців");
    expect(formatIdleAge(ago(365), now)).toBe("лежить 1 рік");
    expect(formatIdleAge(ago(365 * 2), now)).toBe("лежить 2 роки");
    expect(formatIdleAge(ago(365 * 5), now)).toBe("лежить 5 років");
  });

  it("дата з майбутнього не дає від'ємного віку", () => {
    expect(formatIdleAge(ago(-10), now)).toBe("сьогодні");
  });

  it("нечитабельна дата = мітки немає, а не «лежить NaN днів»", () => {
    expect(formatIdleAge("", now)).toBeNull();
    expect(formatIdleAge("позавчора", now)).toBeNull();
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
