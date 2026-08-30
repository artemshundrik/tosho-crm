import { describe, expect, it } from "vitest";

import {
  isCategoryVisibleForRole,
  isChannelEnabled,
  NOTIFICATION_CATEGORIES,
  visibleNotificationCategories,
} from "@/lib/notificationCategories";
import {
  isCategoryVisibleForRole as botIsCategoryVisibleForRole,
  NOTIFICATION_CATEGORIES as BOT_CATEGORIES,
} from "../../netlify/functions/_notificationCategories";

/**
 * Категорії живуть ДВОМА копіями — у застосунку й у боті, — і синхронність між
 * ними тримається лише коментарем «тримати синхронно». Коментар не падає.
 *
 * Ціна розсинхрону тиха й неприємна: людина вимикає категорію в налаштуваннях
 * CRM, а доставка про такий ключ не знає й шле далі. Або навпаки — бот показує
 * у /settings рядок, якого в матриці немає.
 */

const ROLES = {
  owner: { accessRole: "owner", jobRole: "it_specialist" },
  seo: { accessRole: "admin", jobRole: "seo" },
  chief: { accessRole: "member", jobRole: "chief_accountant" },
  accountant: { accessRole: "member", jobRole: "accountant" },
  manager: { accessRole: "member", jobRole: "manager" },
  pm: { accessRole: "member", jobRole: "pm" },
  designer: { accessRole: "member", jobRole: "designer" },
};

describe("копії категорій не розходяться", () => {
  it("той самий перелік ключів і той самий порядок", () => {
    expect(BOT_CATEGORIES.map((c) => c.key)).toEqual(NOTIFICATION_CATEGORIES.map((c) => c.key));
  });

  it("ті самі назви", () => {
    expect(BOT_CATEGORIES.map((c) => c.label)).toEqual(NOTIFICATION_CATEGORIES.map((c) => c.label));
  });

  it("та сама видимість за роллю — на кожній категорії й кожній ролі", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      for (const [name, ctx] of Object.entries(ROLES)) {
        expect(
          botIsCategoryVisibleForRole(category.key, ctx),
          `${category.key} × ${name}`
        ).toBe(isCategoryVisibleForRole(category.key, ctx));
      }
    }
  });
});

describe("погодження накрутки — дві категорії, а не одна (REQ-149)", () => {
  it("запит бачать тільки ті, хто його вирішує", () => {
    for (const role of [ROLES.owner, ROLES.seo, ROLES.chief]) {
      expect(isCategoryVisibleForRole("quote_markup_request", role)).toBe(true);
    }
    // Менеджеру перемикач на чужі запити був би брехнею: їх йому не шлють.
    for (const role of [ROLES.manager, ROLES.pm, ROLES.accountant, ROLES.designer]) {
      expect(isCategoryVisibleForRole("quote_markup_request", role)).toBe(false);
    }
  });

  it("відповідь на запит бачить той, хто просив", () => {
    for (const role of [ROLES.manager, ROLES.pm, ROLES.seo, ROLES.owner]) {
      expect(isCategoryVisibleForRole("quote_markup_decision", role)).toBe(true);
    }
    // Бухгалтерія й дизайнери відповідей не отримують — рядок їм ні до чого.
    for (const role of [ROLES.accountant, ROLES.designer]) {
      expect(isCategoryVisibleForRole("quote_markup_decision", role)).toBe(false);
    }
  });

  it("вимкнути чужі запити не глушить відповідь на власне прохання", () => {
    const prefs = { quote_markup_request: { telegram: false } };
    expect(isChannelEnabled(prefs, "quote_markup_request", "telegram")).toBe(false);
    expect(isChannelEnabled(prefs, "quote_markup_decision", "telegram")).toBe(true);
  });

  it("обидві категорії стоять поруч у списку налаштувань", () => {
    const keys = visibleNotificationCategories(ROLES.seo).map((c) => c.key);
    expect(keys.indexOf("quote_markup_decision")).toBe(keys.indexOf("quote_markup_request") + 1);
  });
});

describe("канал за замовчуванням увімкнено", () => {
  it("невідома категорія доставляється — інакше новий продюсер мовчав би", () => {
    expect(isChannelEnabled(null, undefined, "telegram")).toBe(true);
    expect(isChannelEnabled({}, "quote_markup_request", "push")).toBe(true);
  });
});
