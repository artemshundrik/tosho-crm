import { describe, expect, it } from "vitest";

import {
  checklistProgress,
  waitingDays,
  groupChecklist,
  nextState,
  parseChecklist,
  type ChecklistItem,
} from "./checklist";

const item = (overrides: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id: "p1",
  kind: "task",
  text: "Друк накладної з дошки",
  state: "todo",
  group: null,
  who: null,
  since: null,
  note: null,
  answer: null,
  ...overrides,
});

describe("parseChecklist", () => {
  it("не масив — порожній список, а не падіння", () => {
    expect(parseChecklist(null)).toEqual([]);
    expect(parseChecklist({})).toEqual([]);
    expect(parseChecklist("сміття")).toEqual([]);
  });

  it("пункт без тексту відкидається", () => {
    // Порожній рядок у списку неможливо ні зробити, ні прибрати — він просто
    // займає місце й лякає.
    expect(parseChecklist([{ text: "" }, { text: "   " }, { nope: 1 }])).toEqual([]);
  });

  it("невідомий стан читається як «не почато», а не ламає список", () => {
    expect(parseChecklist([{ text: "щось", state: "вигадка" }])[0].state).toBe("todo");
  });

  it("пункт без id отримує його з позиції — старі записи лишаються робочими", () => {
    const parsed = parseChecklist([{ text: "перший" }, { text: "другий" }]);
    expect(parsed.map((entry) => entry.id)).toEqual(["p1", "p2"]);
  });

  it("тип пункту: усе, крім question, — звичайна робота", () => {
    expect(parseChecklist([{ text: "a", kind: "question" }])[0].kind).toBe("question");
    expect(parseChecklist([{ text: "a", kind: "вигадка" }])[0].kind).toBe("task");
  });
});

describe("nextState", () => {
  it("клік веде по колу", () => {
    expect(nextState("todo")).toBe("doing");
    expect(nextState("doing")).toBe("waiting");
    expect(nextState("waiting")).toBe("done");
    expect(nextState("done")).toBe("todo");
  });
});

/**
 * «Зависло N днів» — головне число цієї штуки: задача зупиняється тихо, і
 * помічають це тоді, коли вже ніяково нагадувати. Тому воно рахується саме, а
 * не ставиться руками.
 */
describe("checklistProgress", () => {
  const now = new Date("2026-08-09T12:00:00Z");

  it("рахує стани", () => {
    const progress = checklistProgress(
      [
        item({ state: "done" }),
        item({ state: "done" }),
        item({ state: "doing" }),
        item({ state: "waiting", who: "СЕО", since: "2026-08-01" }),
        item({ state: "todo" }),
      ],
      now
    );
    expect(progress).toMatchObject({ total: 5, done: 2, doing: 1, waiting: 1, todo: 1 });
  });

  it("бере НАЙСТАРІШЕ очікування і його адресата", () => {
    const progress = checklistProgress(
      [
        item({ state: "waiting", who: "Марʼяна", since: "2026-08-06" }),
        item({ state: "waiting", who: "СЕО", since: "2026-07-28" }),
      ],
      now
    );
    expect(progress.stuckDays).toBe(12);
    expect(progress.stuckWho).toBe("СЕО");
  });

  it("нічого не чекає — нуль днів і нікого", () => {
    const progress = checklistProgress([item({ state: "done" }), item({ state: "todo" })], now);
    expect(progress.stuckDays).toBe(0);
    expect(progress.stuckWho).toBeNull();
  });

  it("очікування без дати не рахується як зависання", () => {
    // Дату ставить перехід у стан «чекає». Її відсутність — стара картка, а не
    // привід показати «зависло 20 000 днів».
    const progress = checklistProgress([item({ state: "waiting", who: "СЕО" })], now);
    expect(progress.stuckDays).toBe(0);
  });

  it("дата в майбутньому не дає відʼємних днів", () => {
    const progress = checklistProgress([item({ state: "waiting", since: "2026-08-20" })], now);
    expect(progress.stuckDays).toBe(0);
  });
});

describe("groupChecklist", () => {
  it("групи в порядку першої появи, а не за абеткою", () => {
    // Порядок задає той, хто складав список: спершу однотипне пачкою, потім
    // спільні шматки. Абетка цей задум зруйнувала б.
    const groups = groupChecklist([
      item({ group: "Документи" }),
      item({ group: "Дошка" }),
      item({ group: "Документи" }),
      item({ group: null }),
    ]);
    expect(groups.map((entry) => entry.group)).toEqual(["Документи", "Дошка", null]);
    expect(groups[0].items).toHaveLength(2);
  });
});

describe("waitingDays", () => {
  const now = new Date("2026-08-09T12:00:00Z");

  it("рахує дні від дати початку очікування", () => {
    expect(waitingDays(item({ state: "waiting", since: "2026-07-30" }), now)).toBe(10);
  });

  it("пункт не в очікуванні — нічого не рахуємо", () => {
    expect(waitingDays(item({ state: "todo", since: "2026-07-30" }), now)).toBeNull();
    expect(waitingDays(item({ state: "done", since: "2026-07-30" }), now)).toBeNull();
  });

  it("очікування без дати — теж null, а не «20 000 днів»", () => {
    expect(waitingDays(item({ state: "waiting", since: null }), now)).toBeNull();
    expect(waitingDays(item({ state: "waiting", since: "не дата" }), now)).toBeNull();
  });

  it("сьогоднішнє очікування — нуль, а не мінус", () => {
    expect(waitingDays(item({ state: "waiting", since: "2026-08-09" }), now)).toBe(0);
    expect(waitingDays(item({ state: "waiting", since: "2026-08-20" }), now)).toBe(0);
  });
});
