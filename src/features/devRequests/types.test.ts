import { describe, expect, it } from "vitest";
import {
  ARCHIVE_AFTER_DAYS,
  BOARD_COLUMNS,
  MODULE_LABELS,
  OFF_BOARD_STATUSES,
  OPEN_STATUSES,
  STATUS_LABELS,
  formatRequestNumber,
  isArchivedRequest,
  isOpenRequestStatus,
  toDevRequest,
} from "./types";

describe("номер запиту", () => {
  it("збирається застосунком, а не базою", () => {
    expect(formatRequestNumber(42)).toBe("REQ-42");
    expect(formatRequestNumber(1)).toBe("REQ-1");
  });
});

describe("мапер рядка", () => {
  it("переводить snake_case у camelCase і підставляє порожні значення", () => {
    const row = {
      id: "11111111-1111-1111-1111-111111111111",
      number: 7,
      team_id: "22222222-2222-2222-2222-222222222222",
      title: "Кнопка не відкриває картку",
      body: null,
      kind: "bug",
      status: "queued",
      module_key: "quotes",
      priority: "high",
      zone: "access",
      released_at: null,
        theme: "  навігація  ",
      checklist: [],
      auto_classified: true,
      is_private: false,
      author_user_id: null,
      tg_username: "vasya",
      display_name: null,
      asked_by_count: 3,
      created_at: "2026-08-08T10:00:00Z",
    };

    expect(toDevRequest(row)).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      number: 7,
      label: "REQ-7",
      teamId: "22222222-2222-2222-2222-222222222222",
      title: "Кнопка не відкриває картку",
      body: "",
      kind: "bug",
      status: "queued",
      moduleKey: "quotes",
      priority: "high",
      zone: "access",
      releasedAt: null,
      theme: "навігація",
      checklist: [],
      autoClassified: true,
      isPrivate: false,
      authorUserId: null,
      tgUsername: "vasya",
      displayName: null,
      askedByCount: 3,
      createdAt: "2026-08-08T10:00:00Z",
    });
  });

  it("невідомий статус із бази не ламає дошку, а їде в перший стовпчик", () => {
    const row = {
      id: "3",
      number: 1,
      team_id: "t",
      title: "щось",
      body: null,
      kind: "friction",
      status: "щось_нове",
      module_key: null,
      priority: null,
      zone: null,
      released_at: null,
      theme: null,
      checklist: [],
      auto_classified: false,
      is_private: false,
      author_user_id: null,
      tg_username: null,
      display_name: null,
      asked_by_count: 1,
      created_at: "2026-08-08T10:00:00Z",
    };
    expect(toDevRequest(row).status).toBe("triage");
  });
});

/**
 * Констрейнта на module_key в базі немає — напрямок звіряє застосунок. Ці три
 * випадки і є вся його відповідальність: чужий ключ не має доїхати до картки
 * під виглядом справжнього напрямку.
 */
describe("напрямок і пріоритет", () => {
  function row(overrides: Partial<Parameters<typeof toDevRequest>[0]>) {
    return {
      id: "1",
      number: 1,
      team_id: "t",
      title: "щось",
      body: null,
      kind: "friction",
      status: "queued",
      module_key: null,
      priority: null,
      zone: null,
      released_at: null,
      theme: null,
      checklist: [],
      auto_classified: false,
      is_private: false,
      author_user_id: null,
      tg_username: null,
      display_name: null,
      asked_by_count: 1,
      created_at: "2026-08-08T10:00:00Z",
      ...overrides,
    };
  }

  it("ключ із реєстру модулів проходить", () => {
    expect(toDevRequest(row({ module_key: "design" })).moduleKey).toBe("design");
  });

  it("вигаданий ключ читаємо як «напрямку немає»", () => {
    expect(toDevRequest(row({ module_key: "payments" })).moduleKey).toBeNull();
  });

  it("невідомий пріоритет не стає «терміново»", () => {
    expect(toDevRequest(row({ priority: "urgent" })).priority).toBeNull();
    expect(toDevRequest(row({ priority: "low" })).priority).toBe("low");
  });

  it("порожній auto_classified читається як «ставила людина»", () => {
    expect(toDevRequest(row({ auto_classified: null })).autoClassified).toBe(false);
    expect(toDevRequest(row({ auto_classified: true })).autoClassified).toBe(true);
  });
});

describe("підпис напрямку", () => {
  it("береться з реєстру модулів, а не з власного списку", () => {
    expect(MODULE_LABELS.quotes).toBe("Прорахунки");
    expect(MODULE_LABELS.design).toBe("Дизайн");
    expect(MODULE_LABELS.payments).toBeUndefined();
  });
});

describe("колонки дошки", () => {
  it("порядок від входу до викоченого, «не робимо» окремо", () => {
    expect(BOARD_COLUMNS.map((c) => c.status)).toEqual([
      "triage",
      "queued",
      "in_progress",
      "done_local",
      "released",
    ]);
  });

  /**
   * Підпис першої колонки має говорити «сюди все прилітає», а не «тут щось не
   * так із карткою». Тест стоїть саме тому, що назад тягне: «Треба уточнити»
   * звучить діловито, але означає геть інше, ніж статус triage.
   */
  it("перша колонка — кошик входу, а не діагноз картці", () => {
    expect(BOARD_COLUMNS[0]?.label).toBe("Вхідні");
  });

  /**
   * ЦЕЙ ТЕСТ — СТОРОЖ РІШЕННЯ, а не перевірка коду.
   *
   * «Ідеї» й «Не робимо» колонок не мають навмисно: колонка читається як етап
   * роботи, а ці стани роботою не є. Якщо ви прийшли сюди, бо тест «заважає
   * додати колонку», — перечитайте коментар над BOARD_COLUMNS: купа «колись
   * зроблю» в ряду з рештою стовпчиків повертає рівно ту ваду, від якої її й
   * відділяли від черги.
   */
  it("«Ідеї» та «Не робимо» колонками НЕ стають — вони живуть списками", () => {
    const columns = BOARD_COLUMNS.map((c) => c.status);
    expect(columns).not.toContain("someday");
    expect(columns).not.toContain("wont_do");
    expect(columns).toHaveLength(5);
    expect([...OFF_BOARD_STATUSES]).toEqual(["someday", "wont_do"]);
  });
});

describe("відкрита черга", () => {
  it("«Ідеї» до неї не належать — так само, як викочене й відхилене", () => {
    expect(isOpenRequestStatus("queued")).toBe(true);
    expect(isOpenRequestStatus("triage")).toBe(true);
    expect(isOpenRequestStatus("someday")).toBe(false);
    expect(isOpenRequestStatus("wont_do")).toBe(false);
    expect(isOpenRequestStatus("released")).toBe(false);
  });

  /**
   * Перелік ДОЗВОЛЕНИХ, а не заборонених: із відніманням («усе, крім
   * released») кожен новий стан потрапляв би у відкриту чергу сам собою — і
   * саме так «Ідеї» ледь не опинились у списку, з якого їх виносили.
   */
  it("дзеркалить OPEN_STATUSES із функцій — одна відповідь на дошку, бота й ендпоінт", () => {
    expect([...OPEN_STATUSES]).toEqual(["triage", "queued", "in_progress", "done_local"]);
  });
});

describe("підписи станів", () => {
  it("«Ідеї» — саме так, як на перемикачі", () => {
    expect(STATUS_LABELS.someday).toBe("Ідеї");
    expect(STATUS_LABELS.wont_do).toBe("Не робимо");
  });
});

describe("автоархів", () => {
  const NOW = new Date("2026-09-20T12:00:00Z");
  const daysAgo = (days: number) =>
    new Date(NOW.getTime() - days * 86_400_000).toISOString();

  it("викочене місяць тому йде в архів, свіже лишається на дошці", () => {
    expect(isArchivedRequest({ status: "released", releasedAt: daysAgo(31) }, NOW)).toBe(true);
    expect(isArchivedRequest({ status: "released", releasedAt: daysAgo(29) }, NOW)).toBe(false);
  });

  it("рівно на межі ще не архів — день має пройти повністю", () => {
    expect(
      isArchivedRequest({ status: "released", releasedAt: daysAgo(ARCHIVE_AFTER_DAYS) }, NOW)
    ).toBe(false);
  });

  /**
   * «Ідеї» — не завершене, а відкладене: архівувати їх означало б ховати те,
   * до чого свідомо збираються повернутись. Решта відкритих станів не має
   * released_at узагалі.
   */
  it("нічого, крім викоченого, не архівується — навіть якщо картка давня", () => {
    for (const status of ["someday", "wont_do", "queued", "triage", "in_progress", "done_local"] as const) {
      expect(isArchivedRequest({ status, releasedAt: daysAgo(400) }, NOW)).toBe(false);
    }
  });

  it("викочене без дати релізу лишається видимим, а не зникає мовчки", () => {
    expect(isArchivedRequest({ status: "released", releasedAt: null }, NOW)).toBe(false);
    expect(isArchivedRequest({ status: "released", releasedAt: "не дата" }, NOW)).toBe(false);
  });
});
