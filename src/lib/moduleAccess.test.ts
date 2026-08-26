import { describe, expect, it } from "vitest";
import { JOB_ROLE_NAMES } from "./jobRoles";
import {
  defaultModuleAccess,
  describeModuleLock,
  hasDefaultFinanceAccess,
  hasModuleAccess,
  hasPayrollAccess,
  isModuleVisibleInMenu,
  MODULE_DEFINITIONS,
  MODULE_GROUPS,
  MODULE_KEYS,
  normalizeModuleAccess,
} from "./moduleAccess";

/**
 * Реєстр модулів керує тим, хто що бачить, тож найризикованіше тут — тихо
 * забрати доступ у людини, яка його мала. Ці тести фіксують саме це.
 */

const DESIGNER = { accessRole: "member", jobRole: "designer" };
const OWNER = { accessRole: "owner", jobRole: "it_specialist" };
const SEO = { accessRole: "admin", jobRole: "seo" };

describe("успадкування зі старих ключів", () => {
  it("розділені «замовлення» успадковують доступ зі спільного ключа", () => {
    // Реальний запис Лєни до розділення: orders=true і жодних customers/quotes.
    const access = normalizeModuleAccess({ overview: true, orders: true, design: true }, DESIGNER.accessRole, DESIGNER.jobRole);
    expect(access.orders).toBe(true);
    expect(access.customers).toBe(true);
    expect(access.quotes).toBe(true);
    expect(access.shipping).toBe(true);
  });

  it("вимкнені замовлення так само успадковуються — не вмикаємо зайвого", () => {
    // Настя-маркетолог має orders=false; нові ключі мусять лишитись false.
    const access = normalizeModuleAccess({ orders: false }, "member", "marketer");
    expect(access.customers).toBe(false);
    expect(access.quotes).toBe(false);
    expect(access.shipping).toBe(false);
  });

  it("явно записаний ключ перебиває успадкування", () => {
    const access = normalizeModuleAccess({ orders: true, quotes: false }, "member", "designer");
    expect(access.orders).toBe(true);
    expect(access.quotes).toBe(false);
  });
});

describe("«Команда» вимкненню не підлягає", () => {
  it("лишається true навіть коли в базі записано false", () => {
    // У проді в більшості людей team=false — після переїзду ключа це вже не
    // має ховати сторінку команди.
    expect(normalizeModuleAccess({ team: false }, "member", "designer").team).toBe(true);
    expect(defaultModuleAccess(DESIGNER).team).toBe(true);
    expect(hasModuleAccess({ team: false } as never, "team")).toBe(true);
  });
});

describe("«Ролі та доступи» лишаються в тих самих руках", () => {
  it("дає доступ власнику і SEO, але не рядовому учаснику", () => {
    expect(defaultModuleAccess(OWNER).members_access).toBe(true);
    expect(defaultModuleAccess(SEO).members_access).toBe(true);
    expect(defaultModuleAccess(DESIGNER).members_access).toBe(false);
  });

  it("не протікає до тих, хто мав лише старий ключ team", () => {
    // Ключ team тепер alwaysOn, тож не має ставати перепусткою до керування
    // правами: members_access вирішується роллю, а не ним.
    expect(normalizeModuleAccess({ team: true }, "member", "designer").members_access).toBe(false);
  });
});

/**
 * «Dev» — перший обмежений модуль: галочка тут лише показує пункт меню, а дані
 * ріже RLS. Тому найризикованіше — тихо дозволити його не тій ролі: людина
 * потрапила б не на «немає доступу», а на порожній екран.
 */
describe("обмежені модулі (restrictedTo)", () => {
  it("дефолтом дає доступ власнику й SEO", () => {
    expect(defaultModuleAccess({ accessRole: "owner" }).dev).toBe(true);
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "seo" }).dev).toBe(true);
  });

  it("не дає решті — навіть якщо в базі лежить явний true", () => {
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "designer" }).dev).toBe(false);
    expect(normalizeModuleAccess({ dev: true }, "member", "designer").dev).toBe(false);
    expect(normalizeModuleAccess({ dev: true }, "member", "chief_accountant").dev).toBe(false);
  });

  it("уповноважена роль може сховати пункт із очей", () => {
    expect(normalizeModuleAccess({ dev: false }, "owner", null).dev).toBe(false);
  });

  it("hasModuleAccess вимагає ЯВНОГО true, а не мовчазного дозволу", () => {
    // Саме через зворотне правило («незаписаний ключ = дозволено») приватні
    // розділи гейтились повз реєстр: старий JSON відкрив би розділ усім.
    expect(hasModuleAccess({}, "dev")).toBe(false);
    expect(hasModuleAccess(null, "dev")).toBe(false);
    expect(hasModuleAccess({ dev: true }, "dev")).toBe(true);
  });

  it("старий JSON без ключа dev нікому його не відкриває", () => {
    const legacy = { overview: true, orders: true, design: true };
    expect(normalizeModuleAccess(legacy, "member", "designer").dev).toBe(false);
    expect(normalizeModuleAccess(legacy, "member", "manager").dev).toBe(false);
  });
});

/**
 * Стартові набори посад. Найдорожча помилка тут — не «дали зайве», а «посада
 * лишилась без сторінок»: саме так режим «Приміряти посаду» показував
 * менеджеру меню з чотирьох пунктів, бо половина ключів не мала дефолту.
 */
describe("стартове меню посади", () => {
  it("менеджер бачить замовників, прорахунки й каталог", () => {
    const access = defaultModuleAccess({ accessRole: "member", jobRole: "manager" });
    expect(access.customers).toBe(true);
    expect(access.quotes).toBe(true);
    expect(access.catalog).toBe(true);
    expect(access.orders).toBe(true);
    expect(access.design).toBe(true);
  });

  it("дизайнер працює з прорахунку, тож замовники й прорахунки в нього є", () => {
    const access = defaultModuleAccess(DESIGNER);
    expect(access.customers).toBe(true);
    expect(access.quotes).toBe(true);
  });

  it("маркетолог лишається без замовлень і цін", () => {
    const access = defaultModuleAccess({ accessRole: "member", jobRole: "marketer" });
    expect(access.marketing).toBe(true);
    expect(access.design).toBe(true);
    expect(access.orders).toBe(false);
    expect(access.quotes).toBe(false);
    expect(access.customers).toBe(false);
  });

  it("бухгалтерія: «Фінанси» всім трьом посадам, «Виплати команді» — жодній", () => {
    // Молодшому бухгалтеру фінанси відкрили 26.08.2026 (і в RLS теж).
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "junior_accountant" }).finance).toBe(true);
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "junior_accountant" }).vchasno).toBe(true);
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "accountant" }).finance).toBe(true);
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "chief_accountant" }).vchasno_send).toBe(true);
    // А зарплати колег — ні в кого з них, включно з головбухом.
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "junior_accountant" }).payroll).toBe(false);
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "accountant" }).payroll).toBe(false);
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "chief_accountant" }).payroll).toBe(false);
    expect(defaultModuleAccess({ accessRole: "admin", jobRole: "seo" }).payroll).toBe(true);
    expect(defaultModuleAccess({ accessRole: "owner", jobRole: "it_specialist" }).payroll).toBe(true);
  });

  it("логіст бачить відвантаження, а менеджер — ні", () => {
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "logistics" }).shipping).toBe(true);
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "manager" }).shipping).toBe(false);
  });

  it("прорахунки має і PM, і логіст — у них написано, що й куди їде", () => {
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "pm" }).quotes).toBe(true);
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "logistics" }).quotes).toBe(true);
  });

  it("«Огляд» і «Команда» — у кожної посади без винятку", () => {
    for (const role of [...Object.keys(JOB_ROLE_NAMES), "вписана-руками", ""]) {
      const access = defaultModuleAccess({ accessRole: "member", jobRole: role });
      expect(access.overview, `overview / ${role}`).toBe(true);
      expect(access.team, `team / ${role}`).toBe(true);
    }
  });

  it("власник відкриває все — Rule 0", () => {
    const access = defaultModuleAccess(OWNER);
    expect(Object.values(access).every(Boolean)).toBe(true);
  });

  it("кожна посада з довідника має свій набір, а не запасний", () => {
    // Запасний набір — це «overview + замовлення + дизайн». Нова посада, забута
    // в ROLE_MENUS, мовчки провалилась би саме в нього.
    const fallback = defaultModuleAccess({ accessRole: "member", jobRole: "невідома-посада" });
    for (const role of Object.keys(JOB_ROLE_NAMES)) {
      const access = defaultModuleAccess({ accessRole: "member", jobRole: role });
      expect(access, role).not.toEqual(fallback);
    }
  });

  it("посада без запису в довіднику лишається з робочим мінімумом", () => {
    const access = defaultModuleAccess({ accessRole: "member", jobRole: null });
    expect(access.overview).toBe(true);
    expect(access.orders).toBe(true);
    expect(access.design).toBe(true);
    expect(access.finance).toBe(false);
    expect(access.members_access).toBe(false);
  });

  it("збережене значення сильніше за дефолт — правка наборів нікого не роззброює", () => {
    // Настя-маркетолог має design=true в базі, хоч набір посади це й дає;
    // важливіше зворотне: явний false лишається false.
    const access = normalizeModuleAccess({ catalog: false }, "member", "manager");
    expect(access.catalog).toBe(false);
    expect(access.quotes).toBe(true);
  });
});

describe("цілісність реєстру", () => {
  it("ключі унікальні", () => {
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length);
  });

  it("усі модулі потрапили рівно в одну групу", () => {
    const grouped = MODULE_GROUPS.flatMap((section) => section.modules.map((item) => item.key));
    expect(grouped.sort()).toEqual([...MODULE_KEYS].sort());
  });

  it("успадкування вказує на наявний ключ і не зациклюється", () => {
    MODULE_DEFINITIONS.forEach((item) => {
      if (!item.inheritsFrom) return;
      expect(MODULE_KEYS).toContain(item.inheritsFrom);
      expect(item.inheritsFrom).not.toBe(item.key);
    });
  });

  it("нормалізація завжди повертає повний набір ключів", () => {
    expect(Object.keys(normalizeModuleAccess(null)).sort()).toEqual([...MODULE_KEYS].sort());
    expect(Object.keys(normalizeModuleAccess("сміття")).sort()).toEqual([...MODULE_KEYS].sort());
  });
});

/**
 * Пункт «Фінанси» вирішує РОЛЬ, а не галочка: доступ до фінансових таблиць
 * ріже RLS-функція `tosho.has_finance_access`. Правило живе в чотирьох місцях
 * (реєстр, сайдбар, гейт маршруту, база) — і саме тому розходиться.
 *
 * Привід: 26.08.2026 бухгалтерка (job_role = accountant) не бачила розділу,
 * хоча на «Ролях і доступах» перемикач стоїть увімкненим і заблокованим.
 */
describe("доступ до Фінансів за роллю", () => {
  it("бухгалтер, головбух, SEO і власник мають фінанси за роллю", () => {
    expect(hasDefaultFinanceAccess("member", "accountant")).toBe(true);
    expect(hasDefaultFinanceAccess("member", "chief_accountant")).toBe(true);
    expect(hasDefaultFinanceAccess("admin", "seo")).toBe(true);
    expect(hasDefaultFinanceAccess("owner", "it_specialist")).toBe(true);
  });

  it("молодший бухгалтер теж має фінанси — рішення CEO 26.08.2026", () => {
    // Той самий перелік стоїть у tosho.has_finance_access (scripts/access-lockout.sql
    // і scripts/finances-access-rls.sql). Міняти можна ЛИШЕ обидва боки разом:
    // інакше або людина бачить розділ, у якому кожен запит порожній, або має
    // доступ до даних, а пункту меню не бачить.
    expect(hasDefaultFinanceAccess("member", "junior_accountant")).toBe(true);
  });

  it("менеджер і дизайнер фінансів не мають", () => {
    expect(hasDefaultFinanceAccess("member", "manager")).toBe(false);
    expect(hasDefaultFinanceAccess("member", "designer")).toBe(false);
    expect(hasDefaultFinanceAccess("admin", "pm")).toBe(false);
  });
});

/**
 * Виплати команді — вужчий контур усередині Фінансів: власник і SEO.
 * Дзеркало `tosho.has_payroll_access` і політик `tosho.payroll_entries`.
 */
describe("доступ до «Виплат команді»", () => {
  it("власник і SEO — так", () => {
    expect(hasPayrollAccess("owner", "it_specialist")).toBe(true);
    expect(hasPayrollAccess("admin", "seo")).toBe(true);
  });

  it("бухгалтери — ні, хоч фінанси в них є", () => {
    // Обидві половини важливі: доступ до Фінансів у них ЄСТЬ, а до зарплат — ні.
    expect(hasDefaultFinanceAccess("member", "accountant")).toBe(true);
    expect(hasPayrollAccess("member", "accountant")).toBe(false);
    expect(hasPayrollAccess("member", "junior_accountant")).toBe(false);
    expect(hasPayrollAccess("member", "chief_accountant")).toBe(false);
  });

  it("решта команди — ні", () => {
    expect(hasPayrollAccess("member", "manager")).toBe(false);
    expect(hasPayrollAccess("admin", "pm")).toBe(false);
  });
});

describe("видимість пункту меню", () => {
  it("бухгалтер бачить Фінанси навіть зі збереженим finance=false", () => {
    // Саме цей випадок і був у проді: на сторінці доступів перемикач
    // ЗАБЛОКОВАНИЙ увімкненим (isForcedModuleAccess), гейт маршруту пускає за
    // роллю — а меню ховало пункт через давнє false у профілі. Розділ працював,
    // просто до нього не було як дійти.
    expect(
      isModuleVisibleInMenu("finance", { finance: false }, { jobRole: "accountant", isSuperAdmin: false })
    ).toBe(true);
  });

  it("молодший бухгалтер бачить Фінанси незалежно від галочки", () => {
    expect(
      isModuleVisibleInMenu("finance", { finance: true }, { jobRole: "junior_accountant", isSuperAdmin: false })
    ).toBe(true);
    expect(
      isModuleVisibleInMenu("finance", { finance: false }, { jobRole: "junior_accountant", isSuperAdmin: false })
    ).toBe(true);
  });

  it("менеджер без ролі й без галочки Фінансів не бачить", () => {
    expect(isModuleVisibleInMenu("finance", {}, { jobRole: "manager", isSuperAdmin: false })).toBe(false);
  });

  it("для решти модулів знята галочка ховає пункт навіть власнику", () => {
    expect(
      isModuleVisibleInMenu("catalog", { catalog: false }, { accessRole: "owner", isSuperAdmin: true })
    ).toBe(false);
    expect(isModuleVisibleInMenu("catalog", {}, { accessRole: "owner", isSuperAdmin: true })).toBe(true);
  });

  it("незаписаний ключ звичайного модуля означає «показувати»", () => {
    expect(isModuleVisibleInMenu("design", {}, { jobRole: "designer", isSuperAdmin: false })).toBe(true);
    expect(
      isModuleVisibleInMenu("design", { design: false }, { jobRole: "designer", isSuperAdmin: false })
    ).toBe(false);
  });

  it("обмежений модуль («Dev») вимагає явного true", () => {
    expect(isModuleVisibleInMenu("dev", {}, { accessRole: "owner", isSuperAdmin: true })).toBe(false);
    expect(isModuleVisibleInMenu("dev", { dev: true }, { accessRole: "owner", isSuperAdmin: true })).toBe(true);
  });
});

/**
 * Кожен рядок «Ролей і доступів» має або справді керувати, або пояснювати, хто
 * вирішив за нього. Доти сторінка показувала заблоковані галочки без жодного
 * слова — і бухгалтерка резонно вважала, що доступ у неї є, коли його не було.
 */
describe("що написано біля перемикача", () => {
  const ACCOUNTANT = { accessRole: "member", jobRole: "accountant" };
  const MANAGER = { accessRole: "member", jobRole: "manager" };
  const SEO = { accessRole: "admin", jobRole: "seo" };
  const OWNER = { accessRole: "owner", jobRole: "it_specialist" };

  it("«Фінанси» бухгалтеру: увімкнено, заблоковано, і сказано чому", () => {
    const lock = describeModuleLock("finance", { finance: false }, ACCOUNTANT);
    expect(lock.checked).toBe(true);
    expect(lock.locked).toBe(true);
    // Збережене false не має впливати НІ на галочку, НІ на пояснення.
    expect(lock.reason).toContain("Бухгалтер");
    expect(lock.reason).toContain("має цей доступ завжди — вимкнути не можна");
  });

  it("«Фінанси» менеджеру: вимкнено, заблоковано, названо причину", () => {
    const lock = describeModuleLock("finance", { finance: true }, MANAGER);
    expect(lock.checked).toBe(false);
    expect(lock.locked).toBe(true);
    expect(lock.reason).toContain("Менеджер");
    expect(lock.reason).toContain("закриті в самій базі");
  });

  it("«Виплати команді» видно окремим рядком і закрито всім, крім власника й SEO", () => {
    expect(describeModuleLock("payroll", {}, OWNER)).toMatchObject({ checked: true, locked: true });
    expect(describeModuleLock("payroll", {}, SEO)).toMatchObject({ checked: true, locked: true });
    for (const ctx of [
      ACCOUNTANT,
      { accessRole: "member", jobRole: "junior_accountant" },
      { accessRole: "member", jobRole: "chief_accountant" },
      MANAGER,
    ]) {
      const lock = describeModuleLock("payroll", { payroll: true }, ctx);
      expect(lock.checked).toBe(false);
      expect(lock.locked).toBe(true);
      expect(lock.reason).toContain("закриті в самій базі");
    }
  });

  it("«Склад» власнику заблокований увімкненим, менеджеру — вільний", () => {
    expect(describeModuleLock("stock", {}, OWNER)).toMatchObject({ checked: true, locked: true });
    const manager = describeModuleLock("stock", { stock: true }, MANAGER);
    expect(manager).toMatchObject({ checked: true, locked: false, reason: null });
  });

  it("звичайний модуль лишається звичайним перемикачем", () => {
    expect(describeModuleLock("design", { design: true }, MANAGER)).toMatchObject({
      checked: true,
      locked: false,
      reason: null,
    });
    expect(describeModuleLock("design", { design: false }, MANAGER)).toMatchObject({
      checked: false,
      locked: false,
    });
  });

  it("«Команда» — доступна всім і вимкнути не можна", () => {
    expect(describeModuleLock("team", { team: false }, MANAGER)).toMatchObject({
      checked: true,
      locked: true,
    });
  });

  it("«Dev» менеджеру заблокований вимкненим із поясненням", () => {
    const lock = describeModuleLock("dev", { dev: true }, MANAGER);
    expect(lock).toMatchObject({ checked: false, locked: true });
    expect(lock.reason).toContain("Менеджер");
  });
});
