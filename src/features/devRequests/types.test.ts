import { describe, expect, it } from "vitest";
import { BOARD_COLUMNS, formatRequestNumber, toDevRequest } from "./types";

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
});
