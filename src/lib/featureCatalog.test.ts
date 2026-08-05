import { describe, expect, it } from "vitest";
import { defaultModuleAccess } from "./moduleAccess";
import {
  FEATURE_CATEGORY_LABEL,
  FEATURE_CATEGORY_ORDER,
  FEATURE_DEFINITIONS,
  FEATURE_KEYS,
  MEASURABLE_FEATURE_KEYS,
  groupFeatures,
  isFeatureVisible,
  visibleFeatures,
  type FeatureDefinition,
  type FeatureViewerContext,
} from "./featureCatalog";

/**
 * Реєстр можливостей вирішує, що людина взагалі побачить у розділі
 * «Можливості». Найгірше, що тут може статися, — показати фічу тому,
 * у кого немає доступу до модуля: людина клікне «Спробувати» й упреться
 * в «потрібен доступ». Ці тести фіксують саме межі видимості.
 */

// defaultModuleAccess приймає ОБʼЄКТ RoleContext, не два аргументи.
function ctx(role: { accessRole: string | null; jobRole: string | null }): FeatureViewerContext {
  return {
    access: defaultModuleAccess({ accessRole: role.accessRole, jobRole: role.jobRole }),
    accessRole: role.accessRole,
    jobRole: role.jobRole,
  };
}

const DESIGNER = ctx({ accessRole: "member", jobRole: "designer" });
const MANAGER = ctx({ accessRole: "member", jobRole: "manager" });
const MARKETER = ctx({ accessRole: "member", jobRole: "marketer" });
const SEO = ctx({ accessRole: "admin", jobRole: "seo" });
const OWNER = ctx({ accessRole: "owner", jobRole: "it_specialist" });

// Синтетичні визначення: правило видимості має працювати й для тих
// можливостей, яких у реєстрі поки немає (додамо наступними фазами).
const GALLERY: FeatureDefinition = {
  key: "marketing_gallery" as FeatureDefinition["key"],
  label: "Галерея візуалів",
  category: "design",
  summary: "Усі готові макети в одному місці.",
  steps: ["крок", "крок", "крок"],
  moduleKey: "marketing",
  route: "/marketing",
};

const TIMER: FeatureDefinition = {
  key: "design_timer" as FeatureDefinition["key"],
  label: "Таймер роботи",
  category: "design",
  summary: "Скільки часу пішло на візуал.",
  steps: ["крок", "крок", "крок"],
  moduleKey: "design",
  jobRoles: ["designer", "pm", "head_of_production"],
  route: "/design",
};

describe("реєстр", () => {
  it("ключі унікальні", () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });

  it("у кожної можливості рівно три кроки, маршрут і змістовний опис", () => {
    for (const def of FEATURE_DEFINITIONS) {
      expect(def.steps, def.key).toHaveLength(3);
      expect(def.route.startsWith("/"), def.key).toBe(true);
      expect(def.summary.length, def.key).toBeGreaterThan(10);
      expect(def.label.length, def.key).toBeGreaterThan(2);
    }
  });

  it("вимірювані ключі — підмножина всіх", () => {
    for (const key of MEASURABLE_FEATURE_KEYS) {
      expect(FEATURE_KEYS).toContain(key);
    }
  });

  it("у кожної можливості є відомий розділ", () => {
    for (const def of FEATURE_DEFINITIONS) {
      expect(FEATURE_CATEGORY_ORDER, def.key).toContain(def.category);
      expect(FEATURE_CATEGORY_LABEL[def.category], def.key).toBeTruthy();
    }
  });
});

describe("групування для рейки", () => {
  it("порожніх розділів у рейці немає", () => {
    const groups = groupFeatures([...FEATURE_DEFINITIONS]);
    for (const group of groups) {
      expect(group.features.length, group.category).toBeGreaterThan(0);
    }
  });

  it("жодна можливість не губиться при групуванні", () => {
    const groups = groupFeatures([...FEATURE_DEFINITIONS]);
    const flat = groups.flatMap((group) => group.features.map((def) => def.key));
    expect(flat.sort()).toEqual([...FEATURE_KEYS].sort());
  });

  it("порядок розділів сталий, а не за появою в реєстрі", () => {
    const groups = groupFeatures([...FEATURE_DEFINITIONS]);
    const order = groups.map((group) => group.category);
    const expected = FEATURE_CATEGORY_ORDER.filter((category) => order.includes(category));
    expect(order).toEqual(expected);
  });
});

describe("видимість", () => {
  it("можливості без модуля бачать усі ролі", () => {
    for (const def of FEATURE_DEFINITIONS.filter((item) => item.moduleKey === null)) {
      for (const viewer of [DESIGNER, MANAGER, MARKETER, SEO, OWNER]) {
        expect(isFeatureVisible(def, viewer), `${def.key} / ${viewer.jobRole}`).toBe(true);
      }
    }
  });

  it("усі три стартові можливості доступні кожному", () => {
    expect(visibleFeatures(DESIGNER)).toHaveLength(FEATURE_DEFINITIONS.length);
    expect(visibleFeatures(MARKETER)).toHaveLength(FEATURE_DEFINITIONS.length);
  });

  it("модуль без доступу ховає можливість", () => {
    expect(isFeatureVisible(GALLERY, DESIGNER)).toBe(false);
    expect(isFeatureVisible(GALLERY, MANAGER)).toBe(false);
  });

  it("модуль із доступом показує можливість", () => {
    expect(isFeatureVisible(GALLERY, MARKETER)).toBe(true);
    expect(isFeatureVisible(GALLERY, SEO)).toBe(true);
  });

  it("jobRoles звужує всередині модуля", () => {
    // Модуль «дизайн» увімкнений усім за замовчуванням, але таймер —
    // інструмент виконавця, тож менеджеру він у каталозі не потрібен.
    expect(isFeatureVisible(TIMER, DESIGNER)).toBe(true);
    expect(isFeatureVisible(TIMER, MANAGER)).toBe(false);
  });

  it("власник і SEO бачать усе — це задум, а не діра в правах", () => {
    for (const def of [GALLERY, TIMER]) {
      expect(isFeatureVisible(def, OWNER), def.key).toBe(true);
      expect(isFeatureVisible(def, SEO), def.key).toBe(true);
    }
  });

  it("порожній контекст нікого не роняє", () => {
    const anonymous = ctx({ accessRole: null, jobRole: null });
    expect(() => visibleFeatures(anonymous)).not.toThrow();
    expect(isFeatureVisible(GALLERY, anonymous)).toBe(false);
  });
});
