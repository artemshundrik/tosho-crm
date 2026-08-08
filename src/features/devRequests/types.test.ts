import { describe, expect, it } from "vitest";
import { BOARD_COLUMNS, MODULE_LABELS, formatRequestNumber, toDevRequest } from "./types";

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
});
