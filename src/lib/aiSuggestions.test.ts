import { describe, expect, it } from "vitest";
import {
  AI_SUGGESTIONS_LIMIT,
  countRemainingSuggestions,
  resolveAiBucket,
  resolveAiSuggestions,
} from "./aiSuggestions";

/**
 * Підказки — перше, що людина бачить у палітрі. Помилка тут не падає: вона
 * просто показує бухгалтеру чергу візуалів, і той більше сюди не заходить.
 */

describe("яка посада в який кошик", () => {
  it("менеджери всіх ґатунків — в продажі", () => {
    expect(resolveAiBucket({ jobRole: "manager" })).toBe("sales");
    expect(resolveAiBucket({ jobRole: "junior_sales_manager" })).toBe("sales");
    expect(resolveAiBucket({ jobRole: "pm" })).toBe("sales");
  });

  it("власник дивиться згори, хоч би що стояло в посаді", () => {
    expect(resolveAiBucket({ accessRole: "owner", jobRole: "it_specialist" })).toBe("chief");
    expect(resolveAiBucket({ accessRole: "admin", jobRole: "designer" })).toBe("chief");
  });

  it("невідома посада не лишає людину без підказок", () => {
    expect(resolveAiBucket({ jobRole: "хтозна-хто" })).toBe("general");
    expect(resolveAiBucket({})).toBe("general");
    expect(resolveAiSuggestions({ pathname: "/overview", dayKey: "2026-08-11" }).length).toBeGreaterThan(0);
  });
});

describe("набір під сторінку", () => {
  it("дизайнеру в дизайні першими йдуть задачі дизайну", () => {
    const list = resolveAiSuggestions({ jobRole: "designer", pathname: "/design", dayKey: "2026-08-11" });
    expect(list[0].question).toContain("дизайн-задачі");
    expect(list).toHaveLength(AI_SUGGESTIONS_LIMIT);
  });

  it("та сама людина поза дизайном отримує інший порядок", () => {
    const onDesign = resolveAiSuggestions({ jobRole: "designer", pathname: "/design", dayKey: "2026-08-11" });
    const elsewhere = resolveAiSuggestions({ jobRole: "designer", pathname: "/finances", dayKey: "2026-08-11" });
    expect(elsewhere[0].key).not.toBe(onDesign[0].key);
  });

  it("бухгалтеру не пропонують чергу візуалів", () => {
    const list = resolveAiSuggestions({ jobRole: "accountant", pathname: "/finances", dayKey: "2026-08-11" });
    expect(list.map((item) => item.question).join(" ")).not.toContain("візуал");
  });
});

describe("добова ротація", () => {
  it("сторінкові підказки не переїжджають, хвіст — так", () => {
    const monday = resolveAiSuggestions({ jobRole: "designer", pathname: "/design", dayKey: "2026-08-10" });
    const tuesday = resolveAiSuggestions({ jobRole: "designer", pathname: "/design", dayKey: "2026-08-11" });
    // Перші три — ті, що прив'язані до /design: вони стоять на місці.
    expect(tuesday.slice(0, 3).map((s) => s.key)).toEqual(monday.slice(0, 3).map((s) => s.key));
    // А далі набір відрізняється — інакше хвіст не побачив би ніхто.
    expect(tuesday.map((s) => s.key)).not.toEqual(monday.map((s) => s.key));
  });

  it("той самий день дає той самий набір", () => {
    const first = resolveAiSuggestions({ jobRole: "manager", pathname: "/overview", dayKey: "2026-08-11" });
    const second = resolveAiSuggestions({ jobRole: "manager", pathname: "/overview", dayKey: "2026-08-11" });
    expect(first.map((s) => s.key)).toEqual(second.map((s) => s.key));
  });
});

describe("лічильник решти", () => {
  it("каже, скільки питань не влізло у вікно", () => {
    expect(countRemainingSuggestions({ jobRole: "manager" })).toBeGreaterThan(0);
  });
});

/**
 * Сторож на майбутнє. Помічник (netlify/functions/tosho-ai.ts) не вміє
 * відповідати про відсутності, гроші, склад і виробництво — а підказки в
 * порожньому полі читаються як обіцянка. Одного разу ми вже пообіцяли «хто
 * сьогодні на лікарняному» й отримали замість відповіді «Фокус менеджера».
 */
describe("не обіцяємо того, чого помічник не вміє", () => {
  const FORBIDDEN = [
    "лікарнян",
    "відпуст",
    "відсутн",
    "платеж",
    "оплат",
    "витрат",
    // Не голий корінь «склад»: під нього підпадає «склади лист». Беремо саме
    // ті форми, якими питають про склад як місце.
    "на складі",
    "зі складу",
    "накладн",
    "ттн",
    "виробництв",
    "відвантаж",
    "портфоліо",
  ];

  const BUCKETS = ["sales", "design", "production", "finance", "chief", "marketing", "general"] as const;
  const ROLE_BY_BUCKET: Record<(typeof BUCKETS)[number], string> = {
    sales: "manager",
    design: "designer",
    production: "logistics",
    finance: "accountant",
    chief: "seo",
    marketing: "marketer",
    general: "office_manager",
  };

  it.each(BUCKETS)("набір «%s» не згадує недоступних тем", (bucket) => {
    const list = resolveAiSuggestions({
      jobRole: ROLE_BY_BUCKET[bucket],
      pathname: "/overview",
      dayKey: "2026-08-12",
      limit: 20,
    });
    const text = list.map((item) => `${item.title} ${item.question}`).join(" ").toLowerCase();
    for (const word of FORBIDDEN) {
      expect(text).not.toContain(word);
    }
  });
});
