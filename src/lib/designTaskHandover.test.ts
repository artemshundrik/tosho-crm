import { describe, expect, it } from "vitest";

import { getHandoverSources, planDesignerHandover, readDesignerHandovers } from "./designTaskHandover";
import { resolveDesignerReadiness } from "./designTaskReadiness";

const NOW = "2026-11-19T15:40:00.000Z";
const meta = (over: Record<string, unknown> = {}) => ({
  status: "in_progress",
  status_changed_at: "2026-11-19T10:00:00.000Z",
  collaborator_user_ids: ["lena"],
  designer_ready: { lena: { at: "2026-11-19T13:12:00.000Z" } },
  ...over,
});

describe("planDesignerHandover", () => {
  it("виконавиця передає співвиконавиці — та стає виконавицею й лишається сама", () => {
    const plan = planDesignerHandover({
      metadata: meta(), assigneeUserId: "maryana", fromUserId: "maryana", toUserId: "lena", byUserId: "maryana", nowIso: NOW,
    });
    expect(plan).toMatchObject({ assigneeUserId: "lena", collaboratorUserIds: [], assigneeChanged: true });
    // Дизайнер один — правило «кожен здає свою версію» більше не діє, Лєна закриває як звичайну задачу.
    const after = resolveDesignerReadiness({ status: "in_progress", metadata: plan!.metadata, assigneeUserId: "lena" });
    expect(after.required).toBe(false);
  });

  it("передачу видно й потім: хто, кому, хто натиснув", () => {
    const plan = planDesignerHandover({
      metadata: meta(), assigneeUserId: "maryana", fromUserId: "maryana", toUserId: "lena", byUserId: "dasha", nowIso: NOW,
    });
    expect(readDesignerHandovers(plan!.metadata)).toEqual([
      { from_user_id: "maryana", to_user_id: "lena", by_user_id: "dasha", at: NOW },
    ]);
  });

  it("виконавиця передає комусь новому — співвиконавиця лишається", () => {
    const plan = planDesignerHandover({
      metadata: meta(), assigneeUserId: "maryana", fromUserId: "maryana", toUserId: "elina", byUserId: null, nowIso: NOW,
    });
    expect(plan).toMatchObject({ assigneeUserId: "elina", collaboratorUserIds: ["lena"] });
  });

  it("співвиконавиця передає свою частину — виконавець той самий", () => {
    const plan = planDesignerHandover({
      metadata: meta(), assigneeUserId: "maryana", fromUserId: "lena", toUserId: "elina", byUserId: "lena", nowIso: NOW,
    });
    expect(plan).toMatchObject({ assigneeUserId: "maryana", collaboratorUserIds: ["elina"], assigneeChanged: false });
    expect(plan!.metadata.designer_ready).toEqual({});
  });

  it("співвиконавиця передає виконавиці — та лишається сама", () => {
    const plan = planDesignerHandover({
      metadata: meta(), assigneeUserId: "maryana", fromUserId: "lena", toUserId: "maryana", byUserId: "lena", nowIso: NOW,
    });
    expect(plan).toMatchObject({ assigneeUserId: "maryana", collaboratorUserIds: [] });
  });

  it("не можна передати від того, хто не в задачі, чи самому собі", () => {
    const base = { metadata: meta(), assigneeUserId: "maryana", byUserId: null, nowIso: NOW };
    expect(planDesignerHandover({ ...base, fromUserId: "elina", toUserId: "lena" })).toBeNull();
    expect(planDesignerHandover({ ...base, fromUserId: "lena", toUserId: "lena" })).toBeNull();
  });
});

describe("getHandoverSources", () => {
  const base = { metadata: meta(), assigneeUserId: "maryana" };
  it("дизайнер передає лише свою частину", () => {
    expect(getHandoverSources({ ...base, actorUserId: "lena", canManageAssignments: false })).toEqual(["lena"]);
  });
  it("дизайнер не з цієї задачі нічого не передає", () => {
    expect(getHandoverSources({ ...base, actorUserId: "elina", canManageAssignments: false })).toEqual([]);
  });
  it("менеджер може передати частину будь-кого з дизайнерів", () => {
    expect(getHandoverSources({ ...base, actorUserId: "dasha", canManageAssignments: true })).toEqual(["maryana", "lena"]);
  });
});
