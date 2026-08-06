import { describe, expect, it } from "vitest";
import {
  deltaPercent,
  groupByMonth,
  monthIn,
  monthOf,
  monthTitle,
  paceDelta,
  scopeBreakdown,
  scopeLabel,
  summarize,
  typeLabel,
  workingDays,
  type Release,
  type ReleaseChange,
} from "./releaseHistory";

/**
 * Зведення відповідає на питання «скільки роботи зроблено за місяць». Помилка
 * тут не падає — вона просто показує неправильні цифри керівництву, і це
 * гірше, ніж не показувати нічого.
 */

function change(patch: Partial<ReleaseChange> = {}): ReleaseChange {
  return {
    sha: patch.sha ?? "abc12345",
    type: patch.type ?? "feat",
    scope: patch.scope ?? null,
    subject: patch.subject ?? "щось зроблено",
  };
}

function release(releasedAt: string, changes: ReleaseChange[]): Release {
  return { id: releasedAt, releasedAt, title: null, changes };
}

describe("переклад на людську", () => {
  it("відомі типи й розділи мають назви", () => {
    expect(typeLabel("feat")).toBe("нове");
    expect(typeLabel("fix")).toBe("виправлення");
    expect(scopeLabel("features")).toBe("Можливості");
  });

  it("невідомий скоуп показуємо як є — краще технічне, ніж вигадане", () => {
    expect(scopeLabel("zzz-невідоме")).toBe("zzz-невідоме");
  });

  it("порожній скоуп стає «Інше»", () => {
    expect(scopeLabel(null)).toBe("Інше");
  });

  it("той самий розділ під різними скоупами має одну назву", () => {
    // np і nova-poshta — один розділ CRM, який у комітах звали по-різному.
    expect(scopeLabel("np")).toBe(scopeLabel("nova-poshta"));
    expect(scopeLabel("finance")).toBe(scopeLabel("finances"));
  });
});

describe("зведення за період", () => {
  const releases = [
    release("2026-08-06T10:00:00Z", [
      change({ type: "feat", scope: "features" }),
      change({ type: "feat", scope: "features" }),
      change({ type: "fix", scope: "ui" }),
    ]),
    release("2026-08-05T10:00:00Z", [
      change({ type: "fix", scope: "features" }),
      change({ type: "refactor", scope: "nav" }),
    ]),
  ];

  it("рахує релізи й зміни", () => {
    const summary = summarize(releases);
    expect(summary.releases).toBe(2);
    expect(summary.changes).toBe(5);
  });

  it("розкладає за типами у сталому порядку", () => {
    const summary = summarize(releases);
    expect(summary.byType.map((item) => item.type)).toEqual(["feat", "fix", "refactor"]);
    expect(summary.byType[0].count).toBe(2);
  });

  it("невідомий тип падає в «інше», а не губиться", () => {
    const summary = summarize([release("2026-08-06T10:00:00Z", [change({ type: "wip" })])]);
    expect(summary.changes).toBe(1);
    expect(summary.byType).toEqual([{ type: "other", count: 1 }]);
  });

  it("показує найбільш зачеплені розділи", () => {
    const summary = summarize(releases);
    expect(summary.topScopes[0]).toEqual({ scope: "Можливості", count: 3 });
  });

  it("обрізає список розділів", () => {
    const many = release(
      "2026-08-06T10:00:00Z",
      ["a", "b", "c", "d", "e", "f"].map((scope) => change({ scope }))
    );
    expect(summarize([many], 3).topScopes).toHaveLength(3);
  });
});

describe("розподіл за розділами", () => {
  const releases = [
    release("2026-08-06T10:00:00Z", [
      change({ type: "feat", scope: "np", sha: "a1" }),
      change({ type: "fix", scope: "nova-poshta", sha: "a2" }),
      change({ type: "feat", scope: "team", sha: "a3" }),
    ]),
    release("2026-08-05T10:00:00Z", [
      change({ type: "feat", scope: "team", sha: "b1" }),
      change({ type: "feat", scope: "team", sha: "b2" }),
    ]),
  ];

  it("від найбільшого розділу", () => {
    const buckets = scopeBreakdown(releases);
    expect(buckets[0].scope).toBe("Команда");
    expect(buckets[0].total).toBe(3);
  });

  it("склеює різні скоупи одного розділу", () => {
    const buckets = scopeBreakdown(releases);
    const np = buckets.find((bucket) => bucket.scope === "Нова Пошта");
    expect(np?.total).toBe(2);
    expect(np?.byType).toEqual([
      { type: "feat", count: 1 },
      { type: "fix", count: 1 },
    ]);
  });

  it("жодна зміна не губиться і не дублюється", () => {
    const buckets = scopeBreakdown(releases);
    expect(buckets.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(5);
    const shas = buckets.flatMap((bucket) => bucket.changes.map((item) => item.sha));
    expect(new Set(shas).size).toBe(5);
  });

  it("зберігає самі зміни для розгортання", () => {
    const buckets = scopeBreakdown(releases);
    expect(buckets[0].changes).toHaveLength(3);
    expect(buckets[0].changes[0].sha).toBe("a3");
  });
});

describe("дні роботи", () => {
  it("два релізи в один день — це один день", () => {
    const days = workingDays([
      release("2026-08-06T09:00:00Z", [change()]),
      release("2026-08-06T18:00:00Z", [change()]),
      release("2026-08-05T10:00:00Z", [change()]),
    ]);
    expect(days).toBe(2);
  });
});

describe("порівняння з минулим періодом", () => {
  it("рахує приріст і спад", () => {
    expect(deltaPercent(112, 95)).toBe(18);
    expect(deltaPercent(80, 100)).toBe(-20);
  });

  it("без попереднього періоду порівняння немає", () => {
    // «+100%» на першому місяці — це вигадка, а не зростання.
    expect(deltaPercent(112, 0)).toBeNull();
  });

  it("недожитий місяць не виглядає як падіння", () => {
    // Справжній випадок: 112 змін за 6 днів проти 161 за 9. Порівняння сум
    // дало б −30% і збрехало б керівництву, що роботи стало менше.
    const days = (from: number, count: number, perDay: number) =>
      Array.from({ length: count }, (_, i) =>
        release(
          `2026-0${from}-0${i + 1}T10:00:00Z`,
          Array.from({ length: perDay }, (_, j) => change({ sha: `${from}${i}${j}` }))
        )
      );

    const august = days(8, 6, 19); // 114 змін за 6 днів
    const july = days(7, 9, 18); // 162 зміни за 9 днів

    expect(deltaPercent(114, 162)).toBe(-30);
    expect(paceDelta(august, july)).toBe(6);
  });
});

describe("назви місяців", () => {
  it("три відмінки, бо в тексті потрібні всі", () => {
    expect(monthTitle("2026-08")).toBe("Серпень 2026");
    expect(monthIn("2026-08")).toBe("серпні"); // «змін у серпні», не «у серпень»
    expect(monthOf("2026-07")).toBe("липня"); // «темп до липня», не «до липень»
  });

  it("побитий ключ показуємо як є, а не падаємо", () => {
    expect(monthTitle("хтозна")).toBe("хтозна");
    expect(monthIn("2026-13")).toBe("2026-13");
  });
});

describe("групування за місяцями", () => {
  it("від найновішого місяця", () => {
    const groups = groupByMonth([
      release("2026-07-30T10:00:00Z", [change()]),
      release("2026-08-06T10:00:00Z", [change()]),
    ]);
    expect(groups.map((group) => group.key)).toEqual(["2026-08", "2026-07"]);
  });

  it("жоден реліз не губиться", () => {
    const input = [
      release("2026-08-06T10:00:00Z", [change()]),
      release("2026-08-01T10:00:00Z", [change()]),
      release("2026-07-30T10:00:00Z", [change()]),
    ];
    const total = groupByMonth(input).reduce((sum, group) => sum + group.releases.length, 0);
    expect(total).toBe(input.length);
  });
});
