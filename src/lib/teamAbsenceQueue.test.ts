/**
 * Порядок і вік заявок у черзі погоджень (REQ-22).
 *
 * Причина, з якої тести саме тут: до цієї картки на одній вкладці «Запити»
 * жили два взаємно протилежні правила сортування, і жодне з них не було ніде
 * зафіксовано — ні в коді підписом, ні тестом.
 */
import { describe, expect, it } from "vitest";

import {
  absenceWaitingDays,
  formatAbsenceSubmittedAgo,
  sortAbsencesByNewest,
  type AbsenceQueueItem,
} from "./teamAbsenceQueue";

const NOW = new Date("2026-08-15T12:00:00+03:00");

function absence(patch: Partial<AbsenceQueueItem> & { id: string }): AbsenceQueueItem {
  return { startDate: "2026-09-01", createdAt: null, ...patch };
}

describe("sortAbsencesByNewest", () => {
  it("свіжо подана заявка на грудень стоїть вище давньої на вересень", () => {
    // Рівно та скарга, з якої почалась картка: сортування за початком
    // відсутності топило щойно подану заявку в самий низ.
    const december = absence({
      id: "december",
      startDate: "2026-12-20",
      createdAt: "2026-08-15T09:00:00Z",
    });
    const september = absence({
      id: "september",
      startDate: "2026-09-01",
      createdAt: "2026-08-08T09:00:00Z",
    });

    expect(sortAbsencesByNewest([september, december]).map((item) => item.id)).toEqual([
      "december",
      "september",
    ]);
  });

  it("не мутує вхідний масив", () => {
    const items = [
      absence({ id: "a", createdAt: "2026-08-01T00:00:00Z" }),
      absence({ id: "b", createdAt: "2026-08-10T00:00:00Z" }),
    ];
    sortAbsencesByNewest(items);
    expect(items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("рядок без дати подання не витісняє той, у якого вона є", () => {
    // Записи з бекфілу лишились без created_at. Якби вони рахувались за
    // «нескінченно свіжі», черга назавжди починалась би з них.
    const withDate = absence({ id: "with", createdAt: "2026-08-01T00:00:00Z" });
    const withoutDate = absence({ id: "without", createdAt: null, startDate: "2026-12-01" });

    expect(sortAbsencesByNewest([withoutDate, withDate]).map((item) => item.id)).toEqual([
      "with",
      "without",
    ]);
  });

  it("однакова секунда подання — порядок стабільний, а не випадковий", () => {
    const first = absence({ id: "aaa", createdAt: "2026-08-10T10:00:00Z", startDate: "2026-09-10" });
    const second = absence({ id: "bbb", createdAt: "2026-08-10T10:00:00Z", startDate: "2026-09-10" });

    expect(sortAbsencesByNewest([second, first]).map((item) => item.id)).toEqual(["aaa", "bbb"]);
    expect(sortAbsencesByNewest([first, second]).map((item) => item.id)).toEqual(["aaa", "bbb"]);
  });
});

describe("absenceWaitingDays", () => {
  it("рахує календарними днями, а не добами", () => {
    // Подано вчора о 23:50 — це «вчора», хоч минуло менше доби.
    expect(absenceWaitingDays("2026-08-14T23:50:00+03:00", NOW)).toBe(1);
  });

  it("без дати подання відповіді немає", () => {
    expect(absenceWaitingDays(null, NOW)).toBeNull();
    expect(absenceWaitingDays("не дата", NOW)).toBeNull();
  });

  it("майбутня дата — нуль, а не мінус", () => {
    expect(absenceWaitingDays("2026-08-20T10:00:00+03:00", NOW)).toBe(0);
  });
});

describe("formatAbsenceSubmittedAgo", () => {
  it("підписує сьогодні, вчора й дні", () => {
    expect(formatAbsenceSubmittedAgo("2026-08-15T09:00:00+03:00", NOW)).toBe("подано сьогодні");
    expect(formatAbsenceSubmittedAgo("2026-08-14T09:00:00+03:00", NOW)).toBe("подано вчора");
    expect(formatAbsenceSubmittedAgo("2026-08-12T09:00:00+03:00", NOW)).toBe("подано 3 дні тому");
    expect(formatAbsenceSubmittedAgo("2026-08-10T09:00:00+03:00", NOW)).toBe("подано 5 днів тому");
  });

  it("після місяця показує дату — «подано 47 днів тому» вже нічого не додає", () => {
    expect(formatAbsenceSubmittedAgo("2026-06-01T09:00:00+03:00", NOW)).toBe("подано 01.06.2026");
  });

  it("без дати подання підпису немає", () => {
    expect(formatAbsenceSubmittedAgo(null, NOW)).toBeNull();
  });
});
