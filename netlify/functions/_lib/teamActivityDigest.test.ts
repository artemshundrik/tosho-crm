import { describe, expect, it } from "vitest";
import { countChanges, parseMultirange, renderPerson, renderTeamActivity } from "./teamActivityDigest";

/**
 * Цей звіт щоранку читає власник, і з нього роблять висновки про людей.
 * Помилка тут не падає — вона тихо показує людині не той робочий день.
 */

describe("parseMultirange", () => {
  it("розбирає відрізки з рядка Postgres і сортує їх", () => {
    expect(parseMultirange("{[640,700),[551,600)}")).toEqual([
      { from: 551, to: 600 },
      { from: 640, to: 700 },
    ]);
  });

  it("порожній multirange і не-рядок — нуль відрізків", () => {
    expect(parseMultirange("{}")).toEqual([]);
    expect(parseMultirange(null)).toEqual([]);
  });
});

describe("renderPerson", () => {
  it("перша/остання активність, активний час без перерв і перелік перерв", () => {
    const text = renderPerson({
      name: "Петренко Євген",
      // 09:11–12:40, 13:25–18:23
      spans: [
        { from: 551, to: 760 },
        { from: 805, to: 1103 },
      ],
      activeMinutes: 0,
      changes: 21,
    });
    expect(text).toBe(
      "<b>Петренко Євген</b>\n09:11–18:23 · активно 8 год 27 хв · змін: 21\nперерви: 12:40–13:25"
    );
  });

  it("більше трьох перерв — кількість і сума, а не довгий рядок", () => {
    const spans = [0, 1, 2, 3, 4].map((i) => ({ from: 540 + i * 60, to: 540 + i * 60 + 40 }));
    const text = renderPerson({ name: "А", spans, activeMinutes: 0, changes: 0 });
    expect(text).toContain("перерв: 4, разом 1 год 20 хв");
  });

  it("день без відрізків (стара вкладка) — лише хвилини, без вигаданих годин", () => {
    expect(renderPerson({ name: "Б", spans: [], activeMinutes: 37, changes: 2 })).toBe(
      "<b>Б</b>\nактивно 37 хв · змін: 2"
    );
  });

  it("екранує ім'я для HTML Telegram", () => {
    expect(renderPerson({ name: "<x>", spans: [], activeMinutes: 1, changes: 0 })).toContain("&lt;x&gt;");
  });
});

describe("renderTeamActivity", () => {
  it("сортує за першою активністю й додає «не заходили» з причиною", () => {
    const text = renderTeamActivity({
      dayLabel: "пт, 9 жовт.",
      people: [
        { name: "Пізній", spans: [{ from: 660, to: 700 }], activeMinutes: 0, changes: 1 },
        { name: "Ранній", spans: [{ from: 500, to: 520 }], activeMinutes: 0, changes: 1 },
      ],
      absent: [{ name: "Відпускник", reason: "відпустка" }, { name: "Тихий", reason: null }],
    });
    expect(text.indexOf("Ранній")).toBeLessThan(text.indexOf("Пізній"));
    expect(text).toContain("Не заходили: Відпускник (відпустка), Тихий");
  });
});

describe("countChanges", () => {
  it("одна зміна в двох журналах за ту саму хвилину — один раз", () => {
    const counts = countChanges([
      { userId: "u1", entityId: "q1", rowId: "a", at: "2026-10-09T11:43:05+00:00" },
      { userId: "u1", entityId: "q1", rowId: "b", at: "2026-10-09T11:43:40+00:00" },
      { userId: "u1", entityId: "q1", rowId: "c", at: "2026-10-09T11:44:01+00:00" },
      { userId: "u1", entityId: null, rowId: "d", at: "2026-10-09T11:44:01+00:00" },
      { userId: null, entityId: "q2", rowId: "e", at: "2026-10-09T11:44:01+00:00" },
    ]);
    expect(counts.get("u1")).toBe(3);
    expect(counts.size).toBe(1);
  });
});
