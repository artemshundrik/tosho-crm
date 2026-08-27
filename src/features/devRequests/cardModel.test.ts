import { describe, expect, it } from "vitest";
import {
  CARD_MENU_ATTR,
  buildCardMeta,
  formatIdleAge,
  isCardMenuTarget,
  isUrgentCard,
  resolveAuthor,
  shouldRestoreMenuFocus,
  type CardMetaOptions,
} from "./cardModel";
import { REQUEST_ZONES, type DevRequest } from "./types";

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
    releasedAt: null,
    theme: null,
    checklist: [],
    autoClassified: false,
    isPrivate: false,
    authorUserId: null,
    tgUsername: null,
    displayName: null,
    askedByCount: 1,
    commitShas: [],
    todayBy: null,
    todayAt: null,
    createdAt: "2026-08-08T10:00:00Z",
    ...overrides,
  };
}

const keys = (req: DevRequest, options?: CardMetaOptions) =>
  buildCardMeta(req, options).map((item) => item.key);
const chip = (req: DevRequest, key: string, options?: CardMetaOptions) =>
  buildCardMeta(req, options).find((item) => item.key === key);

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

  /**
   * Сторож проти повернення трьох класифікацій на картку. Зону прибрано
   * 26.08.2026: разом із напрямком і темою вона давала 137 сірих чипів на 50
   * карток, і за ними не читався єдиний підпис, що справді вирішує, — «чекає
   * СЕО · 27 дн». Зона лишилась у фільтрах, у дровері й у групуванні.
   */
  it("зони на картці немає — ЖОДНОЇ з реєстру", () => {
    for (const zone of REQUEST_ZONES) {
      expect(keys(request({ zone }))).not.toContain("zone");
    }
  });

  it("тема показується як є, а порожньої немає взагалі", () => {
    expect(chip(request({ theme: "навігація" }), "theme")?.label).toBe("навігація");
    expect(keys(request({ theme: null }))).not.toContain("theme");
  });

  it("тип запиту в нижній ряд не потрапляє — він живе у верхньому рядку", () => {
    expect(keys(request({ kind: "friction" }))).not.toContain("kind");
  });

  /**
   * Напрямок пішов із картки разом із зоною, і з тієї самої причини: це поле
   * для фільтра, а не для показу на кожній картці. У дровері воно лишається —
   * там це відповідь на пряме питання «який напрямок».
   */
  it("напрямку на картці немає — ні заповненого, ні порожнього", () => {
    expect(keys(request({ moduleKey: null }))).not.toContain("module");
    expect(keys(request({ moduleKey: "quotes" }))).not.toContain("module");
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

  it("порядок сталий: тема → автор → просили → закрита", () => {
    // Картка з УСІМА заповненими полями дає рівно чотири мітки. Доти їх було
    // шість, і три перші були класифікацією — саме той ряд однакових плашок,
    // за яким переставало читатись усе інше.
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
    ).toEqual(["theme", "author", "asked", "private"]);
  });
});

/**
 * Підсвітка картки й повна шкала пріоритету вмикаються з однієї умови —
 * інакше з часом на дошці зʼявиться червона картка без пояснення.
 */
/**
 * Свій автор із мітки зникає: усі картки заводить власник, і підпис «Артем»
 * стояв на кожній — однаковий, найдовший у ряду й ні про що. Чужий лишається:
 * саме він і є інформацією («це просила Юлія»).
 */
describe("автор картки", () => {
  it("свою картку автором не підписуємо", () => {
    const own = request({ authorUserId: "u1", displayName: "Артем" });
    expect(keys(own)).toContain("author");
    expect(keys(own, { viewerId: "u1" })).not.toContain("author");
  });

  it("чужу — підписуємо", () => {
    const other = request({ authorUserId: "u2", displayName: "Юлія" });
    expect(chip(other, "author", { viewerId: "u1" })?.label).toBe("Юлія");
  });

  it("без viewerId нічого не ховаємо", () => {
    expect(keys(request({ authorUserId: "u1", displayName: "Артем" }))).toContain("author");
  });
});

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
