import { describe, expect, it } from "vitest";
import {
  groupByMonth,
  scopeLabel,
  summarize,
  typeLabel,
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
    expect(scopeLabel("kanban")).toBe("kanban");
  });

  it("порожній скоуп стає «Інше»", () => {
    expect(scopeLabel(null)).toBe("Інше");
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
