import { describe, expect, it } from "vitest";
import {
  actionLabel,
  categorizeAction,
  categoryColor,
  entityLabel,
  isNoiseActivity,
  CATEGORY_META,
} from "@/components/team/activityCategories";

describe("categorizeAction", () => {
  it("prefers entity_type over text heuristics", () => {
    // Real row: action is a free-form Ukrainian phrase on a quote. Without the
    // entity_type signal the title would misfile it as "Статуси".
    expect(categorizeAction("змінив статус", "Статус: На прорахунку → Пораховано", "quotes")).toBe("quote");
  });

  it("handles plural and singular entity types", () => {
    expect(categorizeAction(null, null, "quotes")).toBe("quote");
    expect(categorizeAction(null, null, "quote")).toBe("quote");
    expect(categorizeAction(null, null, "orders")).toBe("order");
    expect(categorizeAction(null, null, "design_task")).toBe("design");
    expect(categorizeAction(null, null, "customers")).toBe("crm");
    expect(categorizeAction(null, null, "leads")).toBe("crm");
  });

  it("falls back to action/title heuristics when entity_type is absent", () => {
    expect(categorizeAction("design_task_status", "Статус: Новий → В роботі")).toBe("design");
    expect(categorizeAction("comment", "Коментар")).toBe("comment");
    expect(categorizeAction(null, "Статус змінено")).toBe("status");
    expect(categorizeAction(null, null)).toBe("other");
  });

  it("never returns a key missing from the palette", () => {
    const samples: Array<[string | null, string | null, string | null]> = [
      ["design_task_status", null, "design_task"],
      ["змінив статус", null, "quotes"],
      ["whatever", "щось", null],
      [null, null, null],
    ];
    for (const [action, title, entity] of samples) {
      expect(CATEGORY_META[categorizeAction(action, title, entity)]).toBeDefined();
    }
  });
});

describe("categoryColor", () => {
  it("uses the brand primary for the dominant design category (no purple)", () => {
    const color = categoryColor("design");
    expect(color).toContain("--brand-h");
    expect(color).not.toMatch(/\b2[4-9]\d\s/); // no violet hue range
  });

  it("falls back to the neutral colour for unknown keys", () => {
    expect(categoryColor("definitely-not-a-category")).toBe(CATEGORY_META.other.color);
  });

  it("has no purple/violet hue anywhere in the palette", () => {
    for (const { color } of Object.values(CATEGORY_META)) {
      const hue = Number(color.match(/hsl\((\d+)/)?.[1] ?? NaN);
      if (!Number.isNaN(hue)) {
        expect(hue < 240 || hue > 300).toBe(true);
      }
    }
  });
});

describe("isNoiseActivity", () => {
  it("filters system promo impressions", () => {
    expect(isNoiseActivity("telegram_promo_shown", null)).toBe(true);
  });

  it("filters rows with neither action nor title", () => {
    expect(isNoiseActivity(null, null)).toBe(true);
    expect(isNoiseActivity("", "   ")).toBe(true);
  });

  it("keeps real actions", () => {
    expect(isNoiseActivity("design_task_status", "Статус: Новий → В роботі")).toBe(false);
    expect(isNoiseActivity("змінив статус", "Статус: ...")).toBe(false);
  });
});

describe("actionLabel", () => {
  it("maps known machine actions to readable labels", () => {
    expect(actionLabel("design_task_status")).toBe("Статус дизайну");
    expect(actionLabel("design_output_upload")).toBe("Завантаження макета");
    expect(actionLabel("comment")).toBe("Коментар");
  });

  it("passes through Ukrainian phrases, capitalized", () => {
    expect(actionLabel("змінив статус")).toBe("Змінив статус");
    expect(actionLabel("прорахував тиражі")).toBe("Прорахував тиражі");
  });

  it("falls back for unknown latin actions", () => {
    expect(actionLabel("some_unknown_action")).toBe("Дія в CRM");
    expect(actionLabel(null)).toBe("Інше");
  });
});

describe("entityLabel", () => {
  it("handles the plural forms that activity_log actually stores", () => {
    expect(entityLabel("quotes")).toBe("Прорахунок");
    expect(entityLabel("design_task")).toBe("Дизайн-задача");
    expect(entityLabel("orders")).toBe("Замовлення");
  });

  it("returns null for unknown or empty types", () => {
    expect(entityLabel(null)).toBeNull();
    expect(entityLabel("")).toBeNull();
    expect(entityLabel("telegram_promo")).toBeNull();
  });
});
