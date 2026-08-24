import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseBody, validateBody } from "./parseBody";

// Схема з живої функції: рішення щодо працевлаштування (team-member-employment).
const schema = z
  .object({
    userId: z.string().min(1).optional(),
    decision: z.enum(["inactive", "reactivate"]).optional(),
  })
  .strict();

describe("parseBody", () => {
  it("пропускає валідне тіло й віддає розібране значення", () => {
    const result = parseBody(JSON.stringify({ userId: "u1", decision: "inactive" }), schema);
    expect(result).toEqual({ ok: true, data: { userId: "u1", decision: "inactive" } });
  });

  it("порожнє тіло — це порожній об'єкт, а не помилка", () => {
    // Функції самі вирішують, яких полів їм бракує: у більшості з них
    // обов'язковість залежить від режиму (`mode`/`action`).
    expect(parseBody(null, schema)).toEqual({ ok: true, data: {} });
    expect(parseBody("", schema)).toEqual({ ok: true, data: {} });
  });

  it("зламаний JSON віддає зрозумілу помилку, а не падає", () => {
    const result = parseBody("{ not json", schema);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Invalid JSON body");
  });

  it("називає поле, яке не збіглося за типом", () => {
    const result = parseBody(JSON.stringify({ userId: 42 }), schema);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("userId");
  });

  it("називає поле, яке не збіглося за переліком", () => {
    const result = parseBody(JSON.stringify({ decision: "fire" }), schema);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("decision");
  });

  it("відхиляє невідоме поле — це або друкарська помилка, або спроба підсунути зайве", () => {
    const result = parseBody(JSON.stringify({ userId: "u1", isAdmin: true }), schema);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("isAdmin");
  });

  it("показує кілька проблем одразу, але не більше п'яти", () => {
    const wide = z
      .object({
        a: z.string(),
        b: z.string(),
        c: z.string(),
        d: z.string(),
        e: z.string(),
        f: z.string(),
        g: z.string(),
      })
      .strict();
    const result = parseBody(JSON.stringify({}), wide);
    expect(result.ok).toBe(false);
    // Рівно п'ять пар «поле: причина», розділених «; ».
    expect(result.ok === false && result.error.split("; ")).toHaveLength(5);
  });
});

describe("validateBody", () => {
  it("перевіряє вже зібране значення — для GET із параметрами адреси", () => {
    // Так робить dropbox-manage: у GET поля приходять в адресі, а не в тілі.
    const result = validateBody({ userId: "u1", decision: undefined }, schema);
    expect(result.ok).toBe(true);
  });

  it("не об'єкт — теж помилка, а не мовчазне проходження", () => {
    const result = validateBody("рядок", schema);
    expect(result.ok).toBe(false);
  });
});
