import { describe, expect, it } from "vitest";

import {
  designActions,
  designApprovalBlockers,
  designCallbackData,
  designKeyboard,
  DESIGN_STATUS_TEXT,
  parseDesignCallback,
} from "../../netlify/functions/_lib/designTaskTelegram";

import { DESIGN_STATUS_LABELS, getApprovalBlockers } from "./designTaskStatus";

/**
 * Бот дзеркалить правила дизайн-задачі (функції не бачать аліасу `@/`).
 * Тест тримає дзеркало чесним: розійдуться правила — впаде тут, а не в Telegram.
 */

const ID = "5f0d1c2b-3a4e-4f56-9876-0123456789ab";

describe("кнопки під фото макета", () => {
  it("розбирає лише dsg:c|a:<uuid>", () => {
    expect(parseDesignCallback(designCallbackData("c", ID))).toEqual({ verb: "c", from: "pm_review", to: "client_review", taskId: ID });
    expect(parseDesignCallback(designCallbackData("a", ID))?.to).toBe("approved");
    expect(parseDesignCallback(`dsg:x:${ID}`)).toBeNull();
    expect(parseDesignCallback(`dsg:c:${ID}:1`)).toBeNull();
    expect(parseDesignCallback("dsg:c:nope")).toBeNull();
    expect(Buffer.byteLength(designCallbackData("a", ID))).toBeLessThanOrEqual(64);
  });

  it("рішення бачить лише той, хто може міняти статуси", () => {
    const url = "https://tosho.pro/design/x";
    expect(designKeyboard("pm_review", ID, false, url)).toEqual([[{ text: "Відкрити в CRM", url }]]);
    expect(designKeyboard("pm_review", ID, true, url)[0][0]).toEqual({ text: "✅ Передати замовнику", callback_data: `dsg:c:${ID}` });
    expect(designKeyboard("client_review", ID, true, url)[0][0].text).toBe("✅ Замовник затвердив");
    expect(designKeyboard("approved", ID, true, url)).toEqual([[{ text: "Відкрити в CRM", url }]]);
    expect(designActions("approved", ID, "/design/x")).toEqual([]);
  });

  it("назви статусів збігаються з CRM", () => {
    for (const [status, label] of Object.entries(DESIGN_STATUS_TEXT)) {
      expect(DESIGN_STATUS_LABELS[status as keyof typeof DESIGN_STATUS_LABELS]).toBe(label);
    }
  });
});

describe("блокери затвердження збігаються з CRM", () => {
  const visual = { id: "v1", output_kind: "visualization" };
  const layout = { id: "l1", output_kind: "layout" };
  const cases: Array<{ name: string; meta: Record<string, unknown>; approvedVisual: number; approvedLayout: number }> = [
    { name: "візуал без позначки", meta: { design_task_type: "visualization", design_output_files: [visual] }, approvedVisual: 0, approvedLayout: 0 },
    { name: "візуал позначено", meta: { design_task_type: "visualization", design_output_files: [visual], selected_visual_output_file_ids: ["v1"] }, approvedVisual: 1, approvedLayout: 0 },
    { name: "візуал + макети, макет не позначено", meta: { design_task_type: "visualization", design_output_files: [visual, layout], selected_visual_output_file_ids: ["v1"] }, approvedVisual: 1, approvedLayout: 0 },
    { name: "макет через легасі-поле", meta: { design_task_type: "layout", design_output_files: [layout], selected_design_output_file_id: "l1" }, approvedVisual: 0, approvedLayout: 1 },
    { name: "адаптація без позначки", meta: { design_task_type: "layout_adaptation", design_output_files: [layout] }, approvedVisual: 0, approvedLayout: 0 },
    { name: "інший тип", meta: { design_task_type: "other" }, approvedVisual: 0, approvedLayout: 0 },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const files = (c.meta.design_output_files as Array<{ output_kind: string }> | undefined) ?? [];
      expect(designApprovalBlockers(c.meta)).toEqual(
        getApprovalBlockers({
          designTaskType: c.meta.design_task_type as never,
          hasLayoutOutputs: files.some((file) => file.output_kind === "layout"),
          approvedVisualizationCount: c.approvedVisual,
          approvedLayoutCount: c.approvedLayout,
        })
      );
    });
  }
});
