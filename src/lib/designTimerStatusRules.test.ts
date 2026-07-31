import { describe, expect, it } from "vitest";

import {
  pickNewestChangeRequestId,
  shouldPauseTimerForStatusChange,
  shouldStartTimerForStatusChange,
} from "./designTimerStatusRules";

const DESIGNER = "designer-1";
const MANAGER = "manager-1";
const HELPER = "designer-2";

describe("shouldPauseTimerForStatusChange", () => {
  it("зупиняє на будь-якому виході з «В роботі»", () => {
    for (const next of ["pm_review", "client_review", "approved", "changes", "cancelled", "new"]) {
      expect(shouldPauseTimerForStatusChange("in_progress", next)).toBe(true);
    }
  });

  it("не чіпає переходи, що не виходять із «В роботі»", () => {
    expect(shouldPauseTimerForStatusChange("new", "in_progress")).toBe(false);
    expect(shouldPauseTimerForStatusChange("pm_review", "client_review")).toBe(false);
    expect(shouldPauseTimerForStatusChange("in_progress", "in_progress")).toBe(false);
  });
});

describe("shouldStartTimerForStatusChange", () => {
  const base = { assigneeUserId: DESIGNER, collaboratorUserIds: [HELPER] };

  it("запускає, коли виконавець сам бере задачу в роботу", () => {
    expect(
      shouldStartTimerForStatusChange({ ...base, previousStatus: "new", nextStatus: "in_progress", actorUserId: DESIGNER })
    ).toBe(true);
  });

  it("запускає для співвиконавця так само", () => {
    expect(
      shouldStartTimerForStatusChange({ ...base, previousStatus: "changes", nextStatus: "in_progress", actorUserId: HELPER })
    ).toBe(true);
  });

  it("НЕ запускає, коли статус повертає менеджер — дизайнер зараз не працює", () => {
    expect(
      shouldStartTimerForStatusChange({ ...base, previousStatus: "pm_review", nextStatus: "in_progress", actorUserId: MANAGER })
    ).toBe(false);
  });

  it("не запускає без виконавця й без автора", () => {
    expect(
      shouldStartTimerForStatusChange({
        previousStatus: "new",
        nextStatus: "in_progress",
        actorUserId: DESIGNER,
        assigneeUserId: null,
      })
    ).toBe(false);
    expect(
      shouldStartTimerForStatusChange({ ...base, previousStatus: "new", nextStatus: "in_progress", actorUserId: null })
    ).toBe(false);
  });

  it("не запускає на переходах повз «В роботі» і на повторному збереженні того ж статусу", () => {
    expect(
      shouldStartTimerForStatusChange({ ...base, previousStatus: "in_progress", nextStatus: "pm_review", actorUserId: DESIGNER })
    ).toBe(false);
    expect(
      shouldStartTimerForStatusChange({ ...base, previousStatus: "in_progress", nextStatus: "in_progress", actorUserId: DESIGNER })
    ).toBe(false);
  });
});

describe("pickNewestChangeRequestId", () => {
  it("бере останню правку за датою, а не за порядком у масиві", () => {
    const metadata = {
      design_brief_change_requests: [
        { id: "cr-old", requested_at: "2026-07-01T10:00:00.000Z" },
        { id: "cr-new", requested_at: "2026-07-20T09:00:00.000Z" },
        { id: "cr-mid", requested_at: "2026-07-10T09:00:00.000Z" },
      ],
    };
    expect(pickNewestChangeRequestId(metadata)).toBe("cr-new");
  });

  it("при однаковій даті вирішує id — щоб вибір був стабільним", () => {
    const metadata = {
      design_brief_change_requests: [
        { id: "cr-a", requested_at: "2026-07-20T09:00:00.000Z" },
        { id: "cr-b", requested_at: "2026-07-20T09:00:00.000Z" },
      ],
    };
    expect(pickNewestChangeRequestId(metadata)).toBe("cr-b");
  });

  it("повертає null, коли правок немає або записи неповні", () => {
    expect(pickNewestChangeRequestId(null)).toBeNull();
    expect(pickNewestChangeRequestId({})).toBeNull();
    expect(pickNewestChangeRequestId({ design_brief_change_requests: "не масив" })).toBeNull();
    expect(pickNewestChangeRequestId({ design_brief_change_requests: [{ id: "cr-1" }] })).toBeNull();
  });
});
