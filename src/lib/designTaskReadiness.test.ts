import { describe, expect, it } from "vitest";

import {
  formatReadinessLine,
  resolveDesignerReadiness,
  withDesignerReady,
} from "./designTaskReadiness";
import { resolveDesignTaskActions, type DesignTaskActionContext } from "./designTaskStatus";

const ROUND_START = "2026-11-19T10:00:00.000Z";
const meta = (over: Record<string, unknown> = {}) => ({
  status: "in_progress",
  status_changed_at: ROUND_START,
  collaborator_user_ids: ["lina"],
  ...over,
});

describe("resolveDesignerReadiness", () => {
  it("не діє для задачі з одним дизайнером", () => {
    const r = resolveDesignerReadiness({
      status: "in_progress",
      metadata: meta({ collaborator_user_ids: [] }),
      assigneeUserId: "elina",
    });
    expect(r.required).toBe(false);
  });

  it("не діє поза статусом «В роботі»", () => {
    const r = resolveDesignerReadiness({ status: "pm_review", metadata: meta(), assigneeUserId: "elina" });
    expect(r.required).toBe(false);
  });

  it("рахує, хто здав у поточному раунді", () => {
    const metadata = withDesignerReady(meta(), "elina", true, "2026-11-19T11:00:00.000Z");
    const r = resolveDesignerReadiness({ status: "in_progress", metadata, assigneeUserId: "elina" });
    expect(r).toMatchObject({ required: true, readyIds: ["elina"], waitingIds: ["lina"] });
  });

  it("позначка минулого раунду не рахується — правки скидають її самі", () => {
    const metadata = withDesignerReady(meta(), "elina", true, "2026-11-18T11:00:00.000Z");
    const r = resolveDesignerReadiness({ status: "in_progress", metadata, assigneeUserId: "elina" });
    expect(r.readyIds).toEqual([]);
  });

  it("співвиконавець, який дублює виконавця, не рахується двічі", () => {
    const r = resolveDesignerReadiness({
      status: "in_progress",
      metadata: meta({ collaborator_user_ids: ["elina", "lina"] }),
      assigneeUserId: "elina",
    });
    expect(r.designerIds).toEqual(["elina", "lina"]);
  });

  it("«Ще не готово» знімає позначку", () => {
    const ready = withDesignerReady(meta(), "elina", true, "2026-11-19T11:00:00.000Z");
    const unready = withDesignerReady(ready, "elina", false, "2026-11-19T11:05:00.000Z");
    const r = resolveDesignerReadiness({ status: "in_progress", metadata: unready, assigneeUserId: "elina" });
    expect(r.readyIds).toEqual([]);
  });
});

describe("formatReadinessLine", () => {
  it("мовчить, поки ніхто не здав", () => {
    expect(formatReadinessLine([], ["Ліна Н."])).toBeNull();
  });
  it("каже, хто здав і на кого чекаємо", () => {
    expect(formatReadinessLine(["Еліна Л."], ["Ліна Н."])).toBe("Готово: Еліна Л. · чекаємо: Ліна Н.");
  });
});

describe("смуга дій із готовністю кожного дизайнера", () => {
  const base: DesignTaskActionContext = {
    status: "in_progress",
    canManageStatuses: false,
    canManageAssignments: false,
    canSelfAssign: true,
    isAssignee: true,
    hasAssignee: true,
    assigneeName: "Еліна Л.",
    locked: false,
  };

  it("дизайнер бачить «Моя версія готова», а не «Дизайн готовий»", () => {
    const plan = resolveDesignTaskActions({
      ...base,
      readiness: { meReady: false, readyNames: [], waitingNames: ["Еліна Л.", "Ліна Н."] },
    });
    expect(plan.primary).toEqual({ id: { kind: "designer_ready", ready: true }, label: "Моя версія готова" });
  });

  it("здав — бачить, на кого чекаємо, і може забрати позначку", () => {
    const plan = resolveDesignTaskActions({
      ...base,
      readiness: { meReady: true, readyNames: ["Еліна Л."], waitingNames: ["Ліна Н."] },
    });
    expect(plan.primary).toBeNull();
    expect(plan.secondary?.id).toEqual({ kind: "designer_ready", ready: false });
    expect(plan.stateText).toBe("Вашу версію здано · чекаємо: Ліна Н.");
  });

  it("менеджер може прийняти, не чекаючи всіх", () => {
    const plan = resolveDesignTaskActions({
      ...base,
      isAssignee: false,
      canManageStatuses: true,
      canManageAssignments: true,
      readiness: { meReady: false, readyNames: ["Еліна Л."], waitingNames: ["Ліна Н."] },
    });
    expect(plan.primary).toEqual({ id: { kind: "status", next: "pm_review" }, label: "Прийняти зараз" });
    expect(plan.stateText).toBe("Готово: Еліна Л. · чекаємо: Ліна Н.");
  });

  it("без правила — смуга та сама, що й була", () => {
    const plan = resolveDesignTaskActions(base);
    expect(plan.primary).toEqual({ id: { kind: "status", next: "pm_review" }, label: "Дизайн готовий" });
  });
});
