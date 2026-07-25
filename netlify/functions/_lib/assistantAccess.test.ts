import { describe, expect, it } from "vitest";

import {
  canQueryOtherPeople,
  canSeeAiCosts,
  canSeeMoney,
  canSeeSystemHealth,
  canUseQuotes,
  resolveAccessLevel,
} from "./assistantAccess";

// Реальні ролі з прода: власник має job_role=seo, обидва СЕО — access_role=admin.
const OWNER = { accessRole: "owner", jobRole: "seo" };
const SEO = { accessRole: "admin", jobRole: "seo" };
const MANAGER = { accessRole: "member", jobRole: "manager" };
const DESIGNER = { accessRole: "member", jobRole: "designer" };
const ACCOUNTANT = { accessRole: "member", jobRole: "accountant" };

describe("resolveAccessLevel", () => {
  it("власник і SEO — повний доступ", () => {
    expect(resolveAccessLevel(OWNER)).toBe("full");
    expect(resolveAccessLevel(SEO)).toBe("full");
  });

  it("менеджери й PM — рівень продажів", () => {
    expect(resolveAccessLevel(MANAGER)).toBe("sales");
    expect(resolveAccessLevel({ accessRole: "member", jobRole: "pm" })).toBe("sales");
    expect(resolveAccessLevel({ accessRole: "member", jobRole: "junior_sales_manager" })).toBe("sales");
  });

  it("дизайнер — свій рівень", () => {
    expect(resolveAccessLevel(DESIGNER)).toBe("design");
  });

  it("невідома або відсутня роль падає у базовий рівень, а не в повний", () => {
    // Це головне: помилка в даних не має відкривати гроші компанії.
    expect(resolveAccessLevel(ACCOUNTANT)).toBe("basic");
    expect(resolveAccessLevel({ accessRole: null, jobRole: null })).toBe("basic");
    expect(resolveAccessLevel({ accessRole: "", jobRole: "хтозна-хто" })).toBe("basic");
  });

  it("не плутається на регістрі й пробілах", () => {
    expect(resolveAccessLevel({ accessRole: " OWNER ", jobRole: null })).toBe("full");
    expect(resolveAccessLevel({ accessRole: "member", jobRole: " Designer " })).toBe("design");
  });
});

describe("гроші", () => {
  it("дизайнер не бачить сум ніколи", () => {
    expect(canSeeMoney("design")).toBe(false);
    expect(canUseQuotes("design")).toBe(false);
  });

  it("решта команди теж не бачить", () => {
    expect(canSeeMoney("basic")).toBe(false);
    expect(canUseQuotes("basic")).toBe(false);
  });

  it("продажі й керівництво бачать", () => {
    expect(canSeeMoney("sales")).toBe(true);
    expect(canSeeMoney("full")).toBe(true);
  });
});

describe("статистика про інших людей", () => {
  it("доступна лише керівництву", () => {
    expect(canQueryOtherPeople("full")).toBe(true);
    expect(canQueryOtherPeople("sales")).toBe(false);
    expect(canQueryOtherPeople("design")).toBe(false);
    expect(canQueryOtherPeople("basic")).toBe(false);
  });
});

describe("внутрішня кухня", () => {
  it("стан системи — лише власнику, навіть при повному рівні", () => {
    // SEO має рівень full, але бекапи й cron його не стосуються.
    expect(canSeeSystemHealth("full", true)).toBe(true);
    expect(canSeeSystemHealth("full", false)).toBe(false);
    expect(canSeeSystemHealth("sales", false)).toBe(false);
  });

  it("AI-кости — керівництву", () => {
    expect(canSeeAiCosts("full")).toBe(true);
    expect(canSeeAiCosts("sales")).toBe(false);
    expect(canSeeAiCosts("design")).toBe(false);
  });
});
