import { describe, expect, it } from "vitest";

import {
  getApprovalBlockers,
  getMissingApprovalKind,
  resolveApprovalRequirements,
} from "@/lib/designTaskStatus";

/**
 * Гейт «Затверджено замовником». Правило коштувало дизайну вечора 25.08.2026:
 * у задачі «Візуалізація/адаптація» з макетами в «Результаті» потрібні ДВА
 * погодження, і менеджер, погодивши візуали, далі бачив «не можна» — бо мовчки
 * бракувало макета з сусідньої вкладки. Тепер те саме правило відповідає й на
 * питання «якого типу бракує», щоб кнопка вела в потрібний таб. Обидві
 * відповіді мають лишатись узгодженими — звідси тести.
 */

const gate = (over: Partial<Parameters<typeof getApprovalBlockers>[0]> = {}) => ({
  designTaskType: "visualization" as const,
  approvedVisualizationCount: 0,
  approvedLayoutCount: 0,
  hasLayoutOutputs: false,
  ...over,
});

describe("resolveApprovalRequirements", () => {
  it("візуалізація вимагає візуал, а макет — лише коли макет справді додали", () => {
    expect(resolveApprovalRequirements({ designTaskType: "visualization", hasLayoutOutputs: false })).toEqual({
      requiresVisualization: true,
      requiresLayout: false,
    });
    expect(resolveApprovalRequirements({ designTaskType: "visualization", hasLayoutOutputs: true })).toEqual({
      requiresVisualization: true,
      requiresLayout: true,
    });
  });

  it("чисті макетні типи вимагають макет завжди", () => {
    for (const designTaskType of ["layout", "layout_adaptation"] as const) {
      expect(resolveApprovalRequirements({ designTaskType, hasLayoutOutputs: false })).toEqual({
        requiresVisualization: false,
        requiresLayout: true,
      });
    }
  });

  it("презентація й креатив не вимагають нічого", () => {
    for (const designTaskType of ["presentation", "creative"] as const) {
      expect(resolveApprovalRequirements({ designTaskType, hasLayoutOutputs: true })).toEqual({
        requiresVisualization: false,
        requiresLayout: false,
      });
    }
  });
});

describe("getApprovalBlockers", () => {
  it("випадок Дар'ї: візуалізація з макетами тримає ДВА блокери, не один", () => {
    expect(getApprovalBlockers(gate({ hasLayoutOutputs: true }))).toEqual([
      "Потрібно погодити хоча б один візуал",
      "Потрібно погодити хоча б один макет",
    ]);
  });

  it("погоджений візуал не знімає вимогу макета — саме тут ламалась логіка людини", () => {
    expect(getApprovalBlockers(gate({ hasLayoutOutputs: true, approvedVisualizationCount: 1 }))).toEqual([
      "Потрібно погодити хоча б один макет",
    ]);
  });

  it("обидва погоджені — блокерів немає", () => {
    expect(
      getApprovalBlockers(
        gate({ hasLayoutOutputs: true, approvedVisualizationCount: 1, approvedLayoutCount: 1 })
      )
    ).toEqual([]);
  });

  it("тип без вимог не блокує навіть із порожніми погодженнями", () => {
    expect(getApprovalBlockers(gate({ designTaskType: "creative", hasLayoutOutputs: true }))).toEqual([]);
  });
});

describe("getMissingApprovalKind", () => {
  it("спершу веде у «Візуал», а коли той погоджено — у «Макет»", () => {
    expect(getMissingApprovalKind(gate({ hasLayoutOutputs: true }))).toBe("visualization");
    expect(getMissingApprovalKind(gate({ hasLayoutOutputs: true, approvedVisualizationCount: 1 }))).toBe(
      "layout"
    );
  });

  it("нічого не бракує — нікуди й не веде", () => {
    expect(
      getMissingApprovalKind(
        gate({ hasLayoutOutputs: true, approvedVisualizationCount: 1, approvedLayoutCount: 1 })
      )
    ).toBeNull();
  });

  it("тримається за той самий перелік, що й блокери", () => {
    const cases = [
      gate({ hasLayoutOutputs: true }),
      gate({ hasLayoutOutputs: true, approvedVisualizationCount: 2 }),
      gate({ designTaskType: "layout" }),
      gate({ designTaskType: "layout", approvedLayoutCount: 1 }),
      gate({ designTaskType: "presentation", hasLayoutOutputs: true }),
    ];
    for (const input of cases) {
      const hasBlockers = getApprovalBlockers(input).length > 0;
      expect(getMissingApprovalKind(input) !== null).toBe(hasBlockers);
    }
  });
});
