import { describe, expect, it } from "vitest";

import { buildDevRequestMeta, formatRequestNumber } from "./devRequestBot";

/**
 * Раніше цей рядок перевірявся через відповідь бота в чат. Бот заводити картки
 * більше не вміє, а рядок лишився — його показує ендпоінт захоплення й дошка,
 * тож перевіряємо його прямо.
 */
describe("buildDevRequestMeta", () => {
  const base = { kind: "bug" as const, moduleKey: "quotes", priority: "high" as const };

  it("людський рядок «тип · напрямок · пріоритет»", () => {
    // Підпис напрямку береться з реєстру модулів, а не з власного списку.
    expect(buildDevRequestMeta(base)).toBe("Не працює · Прорахунки · Терміново");
  });

  it("немає напрямку — рядок просто коротший, без «null» і зайвих роздільників", () => {
    const meta = buildDevRequestMeta({ ...base, moduleKey: null, priority: "normal" });
    expect(meta).toBe("Не працює · Звичайний");
    expect(meta).not.toContain("null");
    expect(meta).not.toContain("·  ·");
  });

  it("вигаданий моделлю ключ напрямку не потрапляє в текст", () => {
    const meta = buildDevRequestMeta({ ...base, moduleKey: "payments" });
    expect(meta).not.toContain("payments");
    expect(meta).toBe("Не працює · Терміново");
  });
});

describe("formatRequestNumber", () => {
  it("той самий формат, що на дошці", () => {
    expect(formatRequestNumber(1)).toBe("REQ-1");
    expect(formatRequestNumber(326)).toBe("REQ-326");
  });
});
