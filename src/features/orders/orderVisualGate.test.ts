import { describe, expect, it } from "vitest";

import { isVisualizationPending, type DesignTaskApprovalSnapshot } from "./orderVisualGate";
import { getSpecificationVisualBlocker } from "./orderDocumentRequirements";

const task = (patch: Partial<DesignTaskApprovalSnapshot>): DesignTaskApprovalSnapshot => ({
  status: "in_progress",
  type: "visualization",
  hasSelectedVisualization: false,
  hasSelectedLayout: false,
  hasLegacySelectedOutput: false,
  ...patch,
});
const approved = task({ status: "approved", hasSelectedVisualization: true });

describe("isVisualizationPending (REQ-322#p42)", () => {
  it("візуал у роботі — чекаємо", () => {
    expect(isVisualizationPending(true, false, [task({})])).toBe(true);
  });

  it("погоджений з обраним файлом — не чекаємо", () => {
    expect(isVisualizationPending(true, false, [approved])).toBe(false);
  });

  it("погодили до створення, потім повернули на доопрацювання — знову чекаємо", () => {
    expect(isVisualizationPending(true, true, [task({ status: "changes" })])).toBe(true);
  });

  it("легасі approved без обраного файлу, знімок погоджений — не блокуємо", () => {
    expect(isVisualizationPending(true, true, [task({ status: "approved", type: "layout" }), task({ status: "approved", type: null })])).toBe(false);
  });

  it("без нанесення, без задач чи лише макет — не чекаємо", () => {
    expect(isVisualizationPending(false, false, [task({})])).toBe(false);
    expect(isVisualizationPending(true, false, [])).toBe(false);
    expect(isVisualizationPending(true, false, [task({ type: "layout" })])).toBe(false);
  });
});

describe("getSpecificationVisualBlocker", () => {
  const pending = { visualizationPending: true, specificationCreatedAt: null };
  it("СП з візуалом чекає погодження", () => {
    expect(getSpecificationVisualBlocker(pending, true)).toMatch(/не погоджено/);
  });
  it("без візуалу в СП — можна", () => {
    expect(getSpecificationVisualBlocker(pending, false)).toBeNull();
  });
  it("передрук створеної СП не блокуємо", () => {
    expect(getSpecificationVisualBlocker({ ...pending, specificationCreatedAt: "2026-11-04" }, true)).toBeNull();
  });
});
