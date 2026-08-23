import { describe, expect, it } from "vitest";

import {
  buildPermissions,
  canEditQuoteDelivery,
  permissionsForViewAs,
  resolveQuoteRunPriceFieldAccess,
} from "./permissions";

/**
 * Чотири поля ціни в тиражі раніше висіли на одному прапорці canEditRuns, тож
 * будь-хто, хто редагував вміст прорахунку, міняв і собівартість, і логістику.
 * Матриця нижче — це домовленість з картки REQ-37, а не здогад.
 */
const permissionsFor = (jobRole: string | null, accessRole = "member") =>
  buildPermissions({ accessRole, jobRole });

const accessFor = (jobRole: string | null, accessRole = "member") =>
  resolveQuoteRunPriceFieldAccess({
    viewerJobRole: jobRole,
    permissions: permissionsFor(jobRole, accessRole),
  });

describe("resolveQuoteRunPriceFieldAccess", () => {
  it("менеджер веде собівартість і власний заробіток, але не нанесення й не логістику", () => {
    const access = accessFor("manager");

    expect(access.unit_price_model).toBe(true);
    expect(access.desired_manager_income).toBe(true);
    expect(access.unit_price_print).toBe(false);
    expect(access.logistics_cost).toBe(false);
  });

  it("молодший менеджер із продажів має ті самі права, що й менеджер", () => {
    expect(accessFor("junior_sales_manager")).toEqual(accessFor("manager"));
  });

  it("логіст ставить тільки логістику й більше нічого", () => {
    const access = accessFor("logistics");

    expect(access.logistics_cost).toBe(true);
    expect(access.unit_price_model).toBe(false);
    expect(access.unit_price_print).toBe(false);
    expect(access.desired_manager_income).toBe(false);
  });

  it("начальник відділу логістики прирівняний до логіста, а не лишається ні з чим", () => {
    expect(accessFor("head_of_logistics")).toEqual(accessFor("logistics"));
  });

  it("проєктний менеджер веде нанесення й логістику", () => {
    const access = accessFor("pm");

    expect(access.unit_price_print).toBe(true);
    expect(access.logistics_cost).toBe(true);
  });

  it("owner і seo можуть усе — це задум, а не виняток", () => {
    for (const access of [accessFor(null, "owner"), accessFor("seo")]) {
      expect(access.unit_price_model).toBe(true);
      expect(access.unit_price_print).toBe(true);
      expect(access.logistics_cost).toBe(true);
      expect(access.desired_manager_income).toBe(true);
    }
  });

  it("сторонні посади не редагують жодного поля ціни", () => {
    const access = accessFor("designer");

    expect(Object.values(access).every((allowed) => allowed === false)).toBe(true);
  });
});

describe("canEditQuoteDelivery", () => {
  const context = { userId: "u1", quoteManagerUserId: "u2", quoteCreatedByUserId: "u2" };

  it("пускає начальника відділу логістики так само, як логіста", () => {
    for (const jobRole of ["logistics", "head_of_logistics"]) {
      expect(
        canEditQuoteDelivery({
          ...context,
          viewerJobRole: jobRole,
          permissions: permissionsFor(jobRole),
        })
      ).toBe(true);
    }
  });
});

/**
 * Режим «Дивитись як» не має бути обхідним шляхом до чужих прав. Сесія в базі
 * лишається власною, тож кнопка, домальована «бо я приміряв старшу роль», за
 * відсутності серверної перевірки виконала б справжню дію. Тому інваріант
 * один: режим ЗВУЖУЄ, ніколи не розширює.
 */
describe("permissionsForViewAs", () => {
  const owner = buildPermissions({ accessRole: "owner", jobRole: "it_specialist" });
  const seo = buildPermissions({ accessRole: "member", jobRole: "seo" });
  const designer = buildPermissions({ accessRole: "member", jobRole: "designer" });

  it("owner нічого не втрачає й нічого не додає — бачить рівно те, що ціль", () => {
    const asDesigner = permissionsForViewAs(owner, designer);
    expect(asDesigner).toEqual(designer);
  });

  it("прапорці «хто я» беруться з цілі, інакше рольових екранів не побачити", () => {
    const asDesigner = permissionsForViewAs(owner, designer);
    expect(asDesigner.isDesigner).toBe(true);
    expect(asDesigner.isSuperAdmin).toBe(false);
  });

  it("не додає вміння, якого немає у справжніх правах", () => {
    // SEO не редагує ролі учасників; приміряна посада не має цього змінити.
    expect(seo.canEditMemberRoles).toBe(false);
    const seoAsOwner = permissionsForViewAs(seo, owner);
    expect(seoAsOwner.canEditMemberRoles).toBe(false);
  });

  it("жодне вміння не стає true, якщо воно було false у власних правах", () => {
    const seoAsOwner = permissionsForViewAs(seo, owner);
    (Object.keys(seoAsOwner) as (keyof typeof seoAsOwner)[]).forEach((key) => {
      if (["isSuperAdmin", "isAdmin", "isSeo", "isManagerJob", "isDesigner"].includes(key)) return;
      if (!seo[key]) expect(seoAsOwner[key]).toBe(false);
    });
  });

  it("звужує до цілі: те, чого немає в посади, вимкнено навіть в owner", () => {
    const asDesigner = permissionsForViewAs(owner, designer);
    expect(owner.canManageDesignStatuses).toBe(true);
    expect(asDesigner.canManageDesignStatuses).toBe(false);
  });
});
