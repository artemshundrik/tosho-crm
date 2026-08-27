import { describe, expect, it } from "vitest";

import type { ChecklistItem } from "./checklist";
import {
  canTakeToday,
  isPapercutCard,
  papercutLabel,
  pruneToday,
  splitQueue,
} from "./queueShelves";
import type { DevRequest, RequestStatus } from "./types";

function make(
  id: string,
  status: RequestStatus,
  checklist: ChecklistItem[] = [],
  title = "Звичайна картка"
): DevRequest {
  return { id, number: Number(id), status, checklist, title } as unknown as DevRequest;
}

function waiting(who = "СЕО", since = "2026-07-30"): ChecklistItem {
  return {
    id: "w",
    kind: "task",
    closed: null,
    sha: null,
    text: "Чекаємо відповіді",
    state: "waiting",
    group: null,
    who,
    since,
    note: null,
    answer: null,
  };
}

describe("полиці черги", () => {
  it("картка потрапляє рівно на одну полицю", () => {
    const requests = [
      make("1", "queued"),
      make("2", "triage"),
      make("3", "done_local"),
      make("4", "in_progress", [waiting()]),
    ];
    const shelves = splitQueue(requests, []);
    const total = Object.values(shelves).reduce((sum, list) => sum + list.length, 0);
    expect(total).toBe(requests.length);
  });

  it("заблоковане не лежить у «можна брати»", () => {
    // Головне правило вигляду. Картка, яка чекає на СЕО 27 днів, у списку
    // доступного щодня марно претендувала б на увагу.
    const shelves = splitQueue([make("1", "in_progress", [waiting()])], []);
    expect(shelves.free).toHaveLength(0);
    expect(shelves.blocked).toHaveLength(1);
  });

  it("нерозібране не потрапляє ні в «можна брати», ні в «стоїть за людьми»", () => {
    // Про нерозібрану картку ще нічого не вирішено — вона не може претендувати
    // ні на «беру», ні на «чекаю».
    const shelves = splitQueue([make("1", "triage", [waiting()])], []);
    expect(shelves.triage).toHaveLength(1);
    expect(shelves.blocked).toHaveLength(0);
    expect(shelves.free).toHaveLength(0);
  });

  it("«взято на сьогодні» сильніше за все інше, навіть за блокування", () => {
    const blocked = make("1", "in_progress", [waiting()]);
    const shelves = splitQueue([blocked], ["1"]);
    expect(shelves.today.map((r) => r.id)).toEqual(["1"]);
    expect(shelves.blocked).toHaveLength(0);
  });

  it("готове локально стоїть окремо — воно чекає деплою, а не рішення", () => {
    const shelves = splitQueue([make("1", "done_local")], []);
    expect(shelves.shipped).toHaveLength(1);
    expect(shelves.free).toHaveLength(0);
  });

  it("БЛОКУВАННЯ СИЛЬНІШЕ за «готово локально»", () => {
    // Заміряно на проді: REQ-123 стояла в «чекає деплою», хоч її хвіст чекав на
    // чужий реліз typescript-eslint. Полиця обіцяла, що досить викотити.
    const shelves = splitQueue([make("1", "done_local", [waiting("реліз typescript-eslint")])], []);
    expect(shelves.blocked).toHaveLength(1);
    expect(shelves.shipped).toHaveLength(0);
  });
});

describe("вибране на сьогодні", () => {
  it("стелі немає — скільки взяв, стільки й лежить", () => {
    // Три місця тут стояли до 27.08.2026; правило знято на прохання Артема.
    // Полиця від цього не стає другим беклогом лише завдяки чистці нижче.
    const many = Array.from({ length: 9 }, (_, i) => make(String(i + 1), "queued"));
    const ids = many.map((r) => r.id);
    expect(splitQueue(many, ids).today).toHaveLength(9);
    expect(pruneToday(ids, many)).toHaveLength(9);
  });

  it("брати можна лише те, про що рішення вже є", () => {
    expect(canTakeToday(make("1", "queued"))).toBe(true);
    expect(canTakeToday(make("2", "in_progress"))).toBe(true);
    // Нерозібране — ще не рішення; готове локально рішень уже не потребує.
    expect(canTakeToday(make("3", "triage"))).toBe(false);
    expect(canTakeToday(make("4", "done_local"))).toBe(false);
    expect(canTakeToday(make("5", "released"))).toBe(false);
  });

  it("заблоковане взяти МОЖНА — саме сьогодні й вибиваєш ту відповідь", () => {
    expect(canTakeToday(make("1", "in_progress", [waiting()]))).toBe(true);
  });

  it("викочене й відхилене йдуть із полиці самі", () => {
    const requests = [make("1", "queued"), make("2", "released"), make("3", "wont_do")];
    expect(pruneToday(["1", "2", "3"], requests)).toEqual(["1"]);
  });

  it("картка, якої більше немає в даних, теж зникає", () => {
    expect(pruneToday(["1", "404"], [make("1", "queued")])).toEqual(["1"]);
  });

  it("порядок збережених id не переставляється — це порядок, у якому їх клали", () => {
    const requests = [make("1", "queued"), make("2", "queued"), make("3", "queued")];
    expect(pruneToday(["3", "1", "2"], requests)).toEqual(["3", "1", "2"]);
  });
});

describe("накопичувачі дрібниць", () => {
  const cut = (id: string, title: string, status: RequestStatus = "queued") =>
    make(id, status, [], title);

  it("упізнається за назвою, без огляду на регістр і пробіли", () => {
    expect(isPapercutCard(cut("1", "Дрібниці: мова інтерфейсу"))).toBe(true);
    expect(isPapercutCard(cut("2", "  дрібниці: гроші  "))).toBe(true);
    expect(isPapercutCard(cut("3", "Дрібниця в списку"))).toBe(false);
    expect(isPapercutCard(cut("4", "Уніфікувати таблиці"))).toBe(false);
  });

  it("напрям читається з назви", () => {
    expect(papercutLabel(cut("1", "Дрібниці: мова інтерфейсу"))).toBe("мова інтерфейсу");
    // Назва без напряму лишається як є — порожнього заголовка бути не має.
    expect(papercutLabel(cut("2", "Дрібниці:"))).toBe("Дрібниці:");
  });

  it("лежить на власній полиці, а не в «можна брати»", () => {
    const shelves = splitQueue([cut("1", "Дрібниці: мова інтерфейсу")], []);
    expect(shelves.papercuts).toHaveLength(1);
    expect(shelves.free).toHaveLength(0);
  });

  it("не потрапляє ні в «готово локально», ні в «стоїть за людьми»", () => {
    // Накопичувач не буває ні готовим, ні заблокованим: у нього інше
    // призначення, і в тих полицях він вдавав би роботу, якої ніхто не бере.
    const done = cut("1", "Дрібниці: стек", "done_local");
    const blocked = make("2", "in_progress", [waiting()], "Дрібниці: гроші");
    const shelves = splitQueue([done, blocked], []);
    expect(shelves.papercuts).toHaveLength(2);
    expect(shelves.shipped).toHaveLength(0);
    expect(shelves.blocked).toHaveLength(0);
  });

  it("взятий на сьогодні — лежить у «Сьогодні», а не в дрібницях", () => {
    const shelves = splitQueue([cut("1", "Дрібниці: стек")], ["1"]);
    expect(shelves.today).toHaveLength(1);
    expect(shelves.papercuts).toHaveLength(0);
  });

  it("на сьогодні його взяти МОЖНА — «сьогодні розгрібаю дрібниці» це намір на день", () => {
    // Заборона трималась на стелі в три місця: список, який не закінчується,
    // зайняв би одне назавжди. Стелі немає з 27.08.2026, немає й заборони.
    expect(canTakeToday(cut("1", "Дрібниці: мова інтерфейсу"))).toBe(true);
  });

  it("нерозібране сильніше за накопичувач", () => {
    // Картка, назву якої тільки-но надиктували, спершу має пройти розбір.
    const shelves = splitQueue([cut("1", "Дрібниці: щось", "triage")], []);
    expect(shelves.triage).toHaveLength(1);
    expect(shelves.papercuts).toHaveLength(0);
  });
});
