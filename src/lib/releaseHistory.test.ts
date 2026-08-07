import { describe, expect, it } from "vitest";
import {
  buildThreads,
  daySessions,
  heatLevel,
  heatThresholds,
  punchMatrix,
  streaksOf,
  compareScopes,
  deltaPercent,
  groupByDay,
  groupByMonth,
  legendTotals,
  monthTotals,
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
  type ScopedChange,
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
    ...(patch.at ? { at: patch.at } : {}),
    ...(patch.plain ? { plain: patch.plain } : {}),
  };
}

function scoped(patch: Partial<ReleaseChange> = {}): ScopedChange {
  // buildThreads працює вже зі згрупованими змінами, де час розвʼязаний.
  return { ...change(patch), releasedAt: patch.at ?? "2026-08-07T12:00:00Z" };
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

describe("групування по днях", () => {
  it("кілька пушів одного дня — один день", () => {
    const days = groupByDay([
      release("2026-08-07T15:41:00Z", [change({ sha: "a" })]),
      release("2026-08-07T11:58:00Z", [change({ sha: "b" }), change({ sha: "c" })]),
      release("2026-08-06T20:00:00Z", [change({ sha: "d" })]),
    ]);
    expect(days.map((day) => day.day)).toEqual(["2026-08-07", "2026-08-06"]);
    expect(days[0].changes).toHaveLength(3);
  });

  it("час беремо з коміта, коли він є", () => {
    const days = groupByDay([
      release("2026-08-07T16:00:00Z", [
        change({ sha: "a", at: "2026-08-07T11:58:00Z" }),
        change({ sha: "b" }),
      ]),
    ]);
    // Перша — та, що з часом коміта; друга падає на час релізу.
    expect(days[0].changes[0].releasedAt).toBe("2026-08-07T11:58:00Z");
    expect(days[0].changes[1].releasedAt).toBe("2026-08-07T16:00:00Z");
  });
});

describe("склейка змін у сюжети", () => {
  const at = (time: string) => `2026-08-07T${time}:00Z`;

  it("фраза в лапках збирає розкидані коміти в одну справу", () => {
    // Реальний випадок: три коміти про «коли був» у двох різних розділах.
    const threads = buildThreads([
      scoped({
        sha: "1",
        type: "feat",
        scope: "team",
        subject: "точний «коли був» — дві одиниці часу",
        at: at("14:18"),
      }),
      scoped({
        sha: "2",
        type: "fix",
        scope: "team",
        subject: "«коли був» показує правду замість 30-хв вікна",
        at: at("14:33"),
      }),
      scoped({
        sha: "3",
        type: "feat",
        scope: "ui",
        subject: "«коли був» у картці людини на всіх поверхнях",
        at: at("14:41"),
      }),
    ]).map((thread) => ({ ...thread, lead: thread.lead.sha }));

    expect(threads).toHaveLength(1);
    expect(threads[0].count).toBe(3);
    // Розділи різні — склейка не має спиратись на скоуп.
    expect(threads[0].scopes.sort()).toEqual(["Інтерфейс", "Команда"]);
  });

  it("спільні основи слів теж склеюють", () => {
    // «версія в імені файлу» і «версій в іменах … файлів» — три спільні основи.
    const threads = buildThreads([
      scoped({ sha: "1", type: "feat", subject: "версія в імені файлу дизайнера", at: at("15:21") }),
      scoped({
        sha: "2",
        type: "chore",
        subject: "бекфіл версій в іменах уже завантажених файлів",
        at: at("15:41"),
      }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].count).toBe(2);
  });

  it("непов'язане не злипається", () => {
    const threads = buildThreads([
      scoped({ sha: "1", subject: "список прорахунків і замовлень у боті", at: at("14:08") }),
      scoped({ sha: "2", subject: "таблиця підрядників у три колонки", at: at("12:47") }),
    ]);
    expect(threads).toHaveLength(2);
  });

  it("одне спільне слово — ще не сюжет", () => {
    const threads = buildThreads([
      scoped({ sha: "1", subject: "селектор типів у модалці більше не пливе", at: at("12:06") }),
      scoped({ sha: "2", subject: "заявка власника більше не застрягає", at: at("13:39") }),
    ]);
    expect(threads).toHaveLength(2);
  });

  it("людський переказ стає заголовком, коли він є", () => {
    const threads = buildThreads([
      scoped({
        sha: "1",
        subject: "DateTimeInput і DateTimePicker на спільну панель",
        plain: "поля дати й часу тепер мають спільну панель вибору",
      }),
    ]);
    expect(threads[0].title).toBe("поля дати й часу тепер мають спільну панель вибору");
    // Технічний оригінал нікуди не дівається — інакше хибний переказ не спіймати.
    expect(threads[0].lead.subject).toBe("DateTimeInput і DateTimePicker на спільну панель");
  });

  it("заголовок — тема головної зміни, нове важливіше за виправлення", () => {
    const threads = buildThreads([
      scoped({ sha: "1", type: "fix", subject: "дровер шапка підвал не тримались", at: at("10:00") }),
      scoped({ sha: "2", type: "feat", subject: "дровер з нерухомими шапка підвал", at: at("11:00") }),
    ]);
    expect(threads[0].title).toBe("дровер з нерухомими шапка підвал");
    expect(threads[0].rest.map((item) => item.sha)).toEqual(["1"]);
  });

  it("жодна зміна не губиться і не дублюється", () => {
    const input = Array.from({ length: 7 }, (_, i) =>
      scoped({ sha: `s${i}`, subject: `тема ${i} слово${i} інше${i}`, at: at("12:00") })
    );
    const threads = buildThreads(input);
    const shas = threads.flatMap((thread) => [thread.lead.sha, ...thread.rest.map((r) => r.sha)]);
    expect(shas.sort()).toEqual(input.map((c) => c.sha).sort());
  });

  it("великі сюжети першими", () => {
    const threads = buildThreads([
      scoped({ sha: "1", subject: "самотня зміна про геть інше", at: at("09:00") }),
      scoped({ sha: "2", subject: "версія імені файлу", at: at("10:00") }),
      scoped({ sha: "3", subject: "версій іменах файлів", at: at("11:00") }),
    ]);
    expect(threads[0].count).toBe(2);
  });
});

describe("легенда", () => {
  it("два кольори й «решта» одним рядком", () => {
    const legend = legendTotals([
      { type: "feat", count: 147 },
      { type: "fix", count: 100 },
      { type: "perf", count: 3 },
      { type: "refactor", count: 14 },
      { type: "style", count: 3 },
      { type: "other", count: 6 },
    ]);
    expect(legend).toEqual([
      { type: "feat", label: "нове", count: 147 },
      { type: "fix", label: "виправлення", count: 100 },
      { type: "other", label: "решта", count: 26 },
    ]);
  });

  it("без дрібних типів «решти» немає", () => {
    const legend = legendTotals([{ type: "feat", count: 5 }]);
    expect(legend).toHaveLength(1);
  });

  it("сума легенди дорівнює сумі змін", () => {
    const byType = [
      { type: "feat", count: 9 },
      { type: "refactor", count: 4 },
      { type: "test", count: 2 },
    ];
    const legend = legendTotals(byType);
    expect(legend.reduce((sum, item) => sum + item.count, 0)).toBe(15);
  });
});

describe("зіставлення розділів", () => {
  const august = [
    release("2026-08-06T10:00:00Z", [
      change({ scope: "chat", sha: "a1" }),
      change({ scope: "chat", sha: "a2" }),
      change({ scope: "team", sha: "a3" }),
    ]),
  ];
  const july = [
    release("2026-07-30T10:00:00Z", [
      change({ scope: "chat", sha: "b1" }),
      change({ scope: "finances", sha: "b2" }),
      change({ scope: "finances", sha: "b3" }),
    ]),
  ];

  it("рахує приріст і спад по розділу", () => {
    const rows = compareScopes(august, july);
    const chat = rows.find((row) => row.scope === "Обговорення");
    expect(chat).toMatchObject({ current: 2, previous: 1, delta: 1 });
  });

  it("розділ без роботи цього місяця не губиться", () => {
    const rows = compareScopes(august, july);
    const finances = rows.find((row) => row.scope === "Фінанси");
    expect(finances).toMatchObject({ current: 0, previous: 2, delta: -2 });
  });

  it("спершу за поточним місяцем, торішнє — нижче", () => {
    const rows = compareScopes(august, july);
    expect(rows.map((row) => row.scope)).toEqual(["Обговорення", "Команда", "Фінанси"]);
  });

  it("зміни обох періодів, найновіші першими", () => {
    const chat = compareScopes(august, july).find((row) => row.scope === "Обговорення");
    expect(chat?.changes.map((item) => item.sha)).toEqual(["a1", "a2", "b1"]);
  });
});

describe("підсумки по місяцях", () => {
  it("рахує дні, темп і початок вибірки", () => {
    const totals = monthTotals([
      {
        key: "2026-07",
        releases: [
          release("2026-07-30T10:00:00Z", [change(), change()]),
          release("2026-07-23T10:00:00Z", [change()]),
        ],
      },
    ]);
    expect(totals[0]).toMatchObject({
      changes: 3,
      days: 2,
      perDay: 1.5,
      firstDay: "2026-07-23", // історія починається не з 1 липня — це треба показати
    });
  });
});

describe("сесії дня", () => {
  it("пауза понад дві години рве сесію", () => {
    const { blocks, hours } = daySessions([
      "2026-08-07T11:58:00+03:00",
      "2026-08-07T13:00:00+03:00",
      "2026-08-07T14:30:00+03:00",
      "2026-08-07T15:41:00+03:00",
      "2026-08-07T21:23:00+03:00",
      "2026-08-07T22:37:00+03:00",
    ]);
    expect(blocks).toEqual([
      [11 * 60 + 58, 15 * 60 + 41],
      [21 * 60 + 23, 22 * 60 + 37],
    ]);
    // (223 + 74 робочих хвилин) + 2×30 розігріву = 357 хв ≈ 6 год
    expect(hours).toBe(6);
  });

  it("час читається зі стіни, а не з UTC", () => {
    // 00:05 за Києвом — це 21:05 попередньої доби в UTC; беремо стіну.
    const { blocks } = daySessions(["2026-08-06T00:05:00+03:00"]);
    expect(blocks).toEqual([[5, 5]]);
  });

  it("один коміт — одна сесія з самого розігріву", () => {
    expect(daySessions(["2026-08-07T12:00:00+03:00"]).hours).toBe(0.5);
  });

  it("порожній день не падає", () => {
    expect(daySessions([])).toEqual({ blocks: [], hours: 0 });
  });
});

describe("серії днів", () => {
  it("рахує довжину і межі, найдовша перша", () => {
    const runs = streaksOf(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-05"]);
    expect(runs[0]).toEqual({ start: "2026-08-01", end: "2026-08-03", length: 3 });
    expect(runs[1].length).toBe(1);
  });

  it("дублікати днів не ламають серію", () => {
    expect(streaksOf(["2026-08-01", "2026-08-01", "2026-08-02"])[0].length).toBe(2);
  });
});

describe("карта годин", () => {
  it("кладе коміт у свій день тижня і годину", () => {
    // 7 серпня 2026 — пʼятниця (рядок 4), 14:18 → колонка 14.
    const matrix = punchMatrix([{ releasedAt: "2026-08-07T14:18:00+03:00" }]);
    expect(matrix[4][14]).toBe(1);
    expect(matrix.flat().reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("пороги теплокарти", () => {
  it("нуль — окремий рівень, решта за квантилями", () => {
    const th = heatThresholds([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 40]);
    expect(heatLevel(0, th)).toBe(0);
    expect(heatLevel(1, th)).toBe(1);
    expect(heatLevel(40, th)).toBe(4);
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
