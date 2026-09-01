import { describe, expect, it } from "vitest";

import {
  buildPermissions,
  canApproveQuoteMarkup,
  canEditQuoteDelivery,
  permissionsForViewAs,
  resolveQuoteRunPriceFieldAccess,
} from "./permissions";

/**
 * Чотири поля ціни в тиражі раніше висіли на одному прапорці canEditRuns, тож
 * будь-хто, хто редагував вміст прорахунку, міняв і вартість товару, і логістику.
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
  it("менеджер веде накрутку й власний заробіток, але не вартість товару", () => {
    // REQ-229: вартість товару пішла до проєктного менеджера. Менеджер
    // домовляється про ціну ДЛЯ КЛІЄНТА — це накрутка, а не закупівельна сума.
    const access = accessFor("manager");

    expect(access.unit_price_model).toBe(false);
    expect(access.markup_rate).toBe(true);
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

  it("проєктний менеджер веде вартість товару, нанесення й логістику", () => {
    const access = accessFor("pm");

    expect(access.unit_price_model).toBe(true);
    expect(access.unit_price_print).toBe(true);
    expect(access.logistics_cost).toBe(true);
  });

  it("вартість товару — тільки проєктний менеджер (плюс owner і seo)", () => {
    // Дзеркало тригера scripts/quote-run-price-field-access-pm-cost.sql: якщо
    // цей перелік розійдеться з базою, інтерфейс покаже поле, яке база не дасть
    // зберегти, — а це гірше за замкнене поле.
    for (const role of ["manager", "sales_manager", "junior_sales_manager", "logistics", "accountant", "chief_accountant"]) {
      expect(accessFor(role).unit_price_model).toBe(false);
    }
    expect(accessFor("pm").unit_price_model).toBe(true);
    expect(accessFor(null, "owner").unit_price_model).toBe(true);
    expect(accessFor("seo").unit_price_model).toBe(true);
  });

  it("накрутку веде менеджер, а проєктний менеджер — НІ", () => {
    // Єдине поле, де pm відрізняється від сусіднього desired_manager_income.
    // Замір 30.08.2026: із 28 змін заробітку 12 зробив pm, у 9 випадках
    // менеджер потім переписував число (TS-0826-0039: pm поставив 1000 ₴,
    // менеджер за дві хвилини виправив на 500 ₴).
    expect(accessFor("manager").markup_rate).toBe(true);
    expect(accessFor("sales_manager").markup_rate).toBe(true);
    expect(accessFor("pm").markup_rate).toBe(false);
    expect(accessFor("pm").desired_manager_income).toBe(true);
  });

  it("бухгалтерія накрутку не рухає — вона лише погоджує", () => {
    for (const role of ["accountant", "chief_accountant", "junior_accountant"]) {
      expect(accessFor(role).markup_rate).toBe(false);
    }
  });

  it("owner і seo можуть усе — це задум, а не виняток", () => {
    for (const access of [accessFor(null, "owner"), accessFor("seo")]) {
      expect(access.unit_price_model).toBe(true);
      expect(access.unit_price_print).toBe(true);
      expect(access.logistics_cost).toBe(true);
      expect(access.desired_manager_income).toBe(true);
      expect(access.markup_rate).toBe(true);
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
    // CEO не редагує ролі учасників; приміряна посада не має цього змінити.
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

/**
 * Погодження накрутки: два різні правила, і плутати їх не можна (REQ-182).
 * Мерч — за роллю, поліграфія — іменем однієї людини.
 */
describe("canApproveQuoteMarkup", () => {
  const OLENA = "olena-user-id";
  const SLAVA = "slava-user-id";
  const approve = (
    jobRole: string | null,
    userId: string | null,
    extra: { isPrintQuote?: boolean; printApproverUserId?: string | null } = {}
  ) =>
    canApproveQuoteMarkup({
      viewerJobRole: jobRole,
      permissions: permissionsFor(jobRole),
      viewerUserId: userId,
      ...extra,
    });

  it("на мерчі підписує будь-хто з трьох — як домовлялись 30.08.2026", () => {
    expect(approve("seo", SLAVA)).toBe(true);
    expect(approve("seo", OLENA)).toBe(true);
    expect(approve("chief_accountant", "buh")).toBe(true);
    expect(approve("manager", "manager-id")).toBe(false);
  });

  it("на поліграфії підписує ЛИШЕ призначена людина", () => {
    // Артем 01.09.2026: «тільки СЕО Олена, саме Олена». Роль тут не годиться —
    // СЕО в компанії двоє, і другий не має ставити рішення за неї.
    const print = { isPrintQuote: true, printApproverUserId: OLENA };

    expect(approve("seo", OLENA, print)).toBe(true);
    expect(approve("seo", SLAVA, print)).toBe(false);
    expect(approve("chief_accountant", "buh", print)).toBe(false);
  });

  it("порожнє налаштування повертає загальне правило, а не глухий кут", () => {
    // Інакше поліграфічний запит не міг би погодити НІХТО й висів би вічно.
    const print = { isPrintQuote: true, printApproverUserId: null };

    expect(approve("seo", SLAVA, print)).toBe(true);
    expect(approve("chief_accountant", "buh", print)).toBe(true);
  });

  it("невідомий глядач не підписує поліграфію навіть із правильним налаштуванням", () => {
    expect(approve("seo", null, { isPrintQuote: true, printApproverUserId: OLENA })).toBe(false);
  });
});
