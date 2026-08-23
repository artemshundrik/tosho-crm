import { describe, expect, it } from "vitest";
import {
  buildStackItems,
  classifyState,
  compareVersions,
  formatAgoCoarse,
  groupByLayer,
  groupByUrgency,
  layerLag,
  parseVersion,
  sortItems,
  stackSummaryText,
  stackTotals,
  urgencyOf,
  type StackItem,
  type StackSnapshot,
  type StackVersionRow,
} from "./stack";

// Логіка стеку живить три різні місця — сторінку, крон і нічний звіт, — і
// помилка тут не падає, а тихо дає неправильне число: «усе свіже» там, де
// відстали на мажор, або «дірок немає» там, де реєстр не відповів.

const snapshot = (packages: StackSnapshot["packages"]): StackSnapshot => ({
  generatedAt: "2026-08-23T00:00:00.000Z",
  packages,
  guards: ["типи застосунку"],
  tests: 1083,
  testFiles: 73,
  lintStubs: 29,
  node: "20",
  netlifyFunctions: 41,
  sourceLines: 229829,
});

const pkg = (name: string, version: string, layer: StackSnapshot["packages"][number]["layer"] = "screen") => ({
  name,
  version,
  layer,
  dev: false,
  bumpedAt: "2026-08-01T00:00:00.000Z",
});

/**
 * Помічник навмисно вимагає версію, ПРО ЯКУ питали дірки: без неї тест
 * повторив би ту саму помилку, що й код, — вважав би відповідь npm вічною.
 */
const row = (
  name: string,
  latest: string | null,
  advisories: StackVersionRow["advisories"] = [],
  advisoriesVersion: string | null = null
): StackVersionRow => ({
  name,
  latest_version: latest,
  latest_seen_at: "2026-08-20T00:00:00.000Z",
  checked_at: "2026-08-23T03:10:00.000Z",
  advisories,
  advisories_version: advisoriesVersion,
  latest_published_at: null,
});

describe("parseVersion", () => {
  it("розбирає звичайну версію", () => {
    expect(parseVersion("19.2.8")).toEqual({ parts: [19, 2, 8], pre: null, precision: 3 });
  });

  it("приймає версію, оголошену лише гілкою: у netlify.toml стоїть саме «24»", () => {
    expect(parseVersion("24")).toEqual({ parts: [24, 0, 0], pre: null, precision: 1 });
    expect(parseVersion("24.19")).toEqual({ parts: [24, 19, 0], pre: null, precision: 2 });
  });

  it("зрізає діапазонні префікси, бо в лок вони не потрапляють, а в package.json — так", () => {
    expect(parseVersion("^4.1.17")?.parts).toEqual([4, 1, 17]);
    expect(parseVersion("~0.560.0")?.parts).toEqual([0, 560, 0]);
    expect(parseVersion("v7.2.4")?.parts).toEqual([7, 2, 4]);
  });

  it("нерозбірливе — це null, а не нулі: нуль зробив би пакет «свіжим»", () => {
    expect(parseVersion("latest")).toBeNull();
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion("")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("порівнює числами, а не рядками (10 більше за 9)", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("1.9.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
  });

  it("передреліз молодший за таку саму фінальну", () => {
    expect(compareVersions("8.0.0-beta.1", "8.0.0")).toBe(-1);
    expect(compareVersions("8.0.0", "8.0.0-beta.1")).toBe(1);
  });
});

describe("classifyState", () => {
  it("розрізняє мажор, мінор і патч", () => {
    expect(classifyState("7.2.4", "8.0.1")).toBe("major");
    expect(classifyState("2.86.2", "2.91.0")).toBe("minor");
    expect(classifyState("4.1.17", "4.1.19")).toBe("patch");
  });

  it("однакова або новіша за реєстр версія — свіжа", () => {
    expect(classifyState("19.2.8", "19.2.8")).toBe("fresh");
    // Буває під час власного передрелізного пакета або поки npm ще не оновив
    // dist-tag: «попереду реєстру» — це не «відстали».
    expect(classifyState("19.3.0", "19.2.8")).toBe("fresh");
  });

  it("у нульовому мажорі стрибок мінора — це major, бо саме так читає його npm", () => {
    // ^0.560.0 не пускає 0.561.0: у 0.x semver дозволяє ламати сумісність у
    // мінорі. Назвати це «minor» означало б обіцяти безпечне оновлення.
    expect(classifyState("0.560.0", "0.561.0")).toBe("major");
    expect(classifyState("0.560.0", "0.560.3")).toBe("patch");
  });

  it("гілку порівнюємо з гілкою: Node «24» проти LTS 24.19.0 — це свіже, а не відставання", () => {
    // NODE_VERSION = "24" означає «тримаємось гілки 24», точний мінор обирає
    // Netlify. Без окремої гілки порівняння рантайм вічно виглядав би відсталим
    // від власної ж LTS — і на сторінці стояло б «оновись» там, де нічого
    // робити не треба.
    expect(classifyState("24", "24.19.0")).toBe("fresh");
    expect(classifyState("24", "26.7.0")).toBe("major");
    expect(classifyState("24", "24.0.0")).toBe("fresh");
  });

  it("без відповіді реєстру стан невідомий, а не свіжий", () => {
    expect(classifyState("1.0.0", null)).toBe("unknown");
    expect(classifyState(null, "1.0.0")).toBe("unknown");
  });
});

describe("buildStackItems", () => {
  it("зшиває знімок репозиторію з відповіддю npm", () => {
    const items = buildStackItems(snapshot([pkg("vite", "7.2.4")]), [row("vite", "8.0.1")]);
    expect(items).toHaveLength(1);
    expect(items[0].latest).toBe("8.0.1");
    expect(items[0].state).toBe("major");
  });

  it("пакет, про який крон ще не питав, лишається в списку зі станом unknown", () => {
    const items = buildStackItems(snapshot([pkg("vite", "7.2.4")]), []);
    expect(items[0].state).toBe("unknown");
    expect(items[0].checkedAt).toBeNull();
  });

  it("бере найгіршу з кількох дірок безпеки", () => {
    const items = buildStackItems(snapshot([pkg("lodash", "4.17.20")]), [
      row(
        "lodash",
        "4.17.21",
        [
          { title: "ReDoS", severity: "moderate" },
          { title: "Command injection", severity: "high" },
        ],
        "4.17.20"
      ),
    ]);
    expect(items[0].worstSeverity).toBe("high");
  });

  it("найважча дірка стає першою: чипс і підпис під ним мають описувати одну й ту саму", () => {
    const items = buildStackItems(snapshot([pkg("vite", "7.2.7")]), [
      row(
        "vite",
        "8.2.2",
        [
          { title: "NTLMv2 disclosure", severity: "moderate" },
          { title: "Arbitrary file read", severity: "high" },
          { title: "Minor leak", severity: "low" },
        ],
        "7.2.7"
      ),
    ]);
    expect(items[0].worstSeverity).toBe("high");
    expect(items[0].advisories[0].title).toBe("Arbitrary file read");
  });

  it("після оновлення пакета стара дірка ЗНИКАЄ, а не висить поруч із «свіже»", () => {
    // Саме це побачив Артем на скріншоті: pdfjs оновили до 6.2.108, чипс став
    // «свіже» — і поруч лишився червоний «діра безпеки · висока» з відповіді
    // npm про 5.6.205. Дві половини рядка суперечили одна одній, і червона
    // була неправдою.
    const items = buildStackItems(snapshot([pkg("pdfjs-dist", "6.2.108")]), [
      row("pdfjs-dist", "6.2.108", [{ title: "Arbitrary JS execution", severity: "high" }], "5.6.205"),
    ]);
    expect(items[0].state).toBe("fresh");
    expect(items[0].advisories).toEqual([]);
    expect(items[0].worstSeverity).toBeNull();
  });

  it("дірка про ПОТОЧНУ версію показується як була", () => {
    const items = buildStackItems(snapshot([pkg("pdfjs-dist", "5.6.205")]), [
      row("pdfjs-dist", "6.2.108", [{ title: "Arbitrary JS execution", severity: "high" }], "5.6.205"),
    ]);
    expect(items[0].worstSeverity).toBe("high");
  });

  it("рядок без позначки версії вважається застарілим — мовчимо, а не лякаємо", () => {
    const items = buildStackItems(snapshot([pkg("pdfjs-dist", "5.6.205")]), [
      row("pdfjs-dist", "6.2.108", [{ title: "Arbitrary JS execution", severity: "high" }]),
    ]);
    expect(items[0].worstSeverity).toBeNull();
  });

  it("сміття замість масиву дірок не валить сторінку", () => {
    const items = buildStackItems(snapshot([pkg("vite", "7.2.4")]), [
      { ...row("vite", "7.2.4"), advisories: null },
    ]);
    expect(items[0].advisories).toEqual([]);
    expect(items[0].worstSeverity).toBeNull();
  });
});

describe("рантайми й прив'язані пакети", () => {
  const withNode = (nodeVersion: string, typesVersion: string) => ({
    ...snapshot([{ ...pkg("@types/node", typesVersion, "platform"), dev: true, pinned: { to: "node", why: "мажор має збігатися з Node" } }]),
    runtimes: [
      { name: "node", label: "Node.js", version: nodeVersion, layer: "platform" as const, note: "з netlify.toml" },
    ],
  });

  it("Node показується рядком нарівні з пакетами — інакше мертвий рантайм не видно ніде", () => {
    const items = buildStackItems(withNode("24", "24.10.3"), [row("node", "24.19.0")]);
    const node = items.find((item) => item.name === "node");
    expect(node).toBeDefined();
    expect(node?.label).toBe("Node.js");
    expect(node?.state).toBe("fresh");
  });

  it("мертвий рантайм видно як major", () => {
    const items = buildStackItems(withNode("20", "20.1.0"), [row("node", "24.19.0")]);
    expect(items.find((item) => item.name === "node")?.state).toBe("major");
  });

  it("@types/node прив'язані до Node, а не до «найновішого в npm»", () => {
    // Взяти типи 26 на Node 24 означає описати API, якого в рантаймі немає:
    // збереться, а впаде в проді. Сторінка не має цього радити.
    const items = buildStackItems(withNode("24", "24.10.3"), [row("@types/node", "26.2.0"), row("node", "24.19.0")]);
    const types = items.find((item) => item.name === "@types/node");
    expect(types?.state).toBe("pinned");
    expect(urgencyOf(types!)).toBe("fresh");
  });

  it("прив'язаний пакет, що відстав ВІД NODE, знову стає відсталим", () => {
    const items = buildStackItems(withNode("24", "20.1.0"), [row("@types/node", "26.2.0"), row("node", "24.19.0")]);
    expect(items.find((item) => item.name === "@types/node")?.state).toBe("major");
  });
});

describe("групування", () => {
  const items = buildStackItems(
    snapshot([
      pkg("react", "19.2.8", "screen"),
      pkg("vite", "7.2.4", "build"),
      pkg("@supabase/supabase-js", "2.86.2", "data"),
    ]),
    [row("react", "19.2.8"), row("vite", "8.0.1"), row("@supabase/supabase-js", "2.91.0")]
  );

  it("шари йдуть у сталому порядку, а порожні не малюються", () => {
    expect(groupByLayer(items).map((group) => group.key)).toEqual(["screen", "data", "build"]);
  });

  it("терміновість розкладає за наслідком", () => {
    const groups = groupByUrgency(items);
    expect(groups.map((group) => group.key)).toEqual(["breaking", "available", "fresh"]);
    expect(groups[0].items[0].name).toBe("vite");
  });

  it("пакет із дірою безпеки піднімається над мажором", () => {
    const withHole = buildStackItems(
      snapshot([pkg("a-major", "1.0.0"), pkg("z-hole", "1.0.0")]),
      [row("a-major", "2.0.0"), row("z-hole", "1.0.1", [{ title: "RCE", severity: "critical" }], "1.0.0")]
    );
    expect(sortItems(withHole)[0].name).toBe("z-hole");
  });

  it("urgencyOf не плутає невідоме з відставанням", () => {
    const unknown = buildStackItems(snapshot([pkg("new-one", "1.0.0")]), [])[0];
    expect(urgencyOf(unknown)).toBe("fresh");
  });
});

describe("stackTotals", () => {
  const items = buildStackItems(
    snapshot([pkg("a", "1.0.0"), pkg("b", "1.0.0"), pkg("c", "1.0.0"), pkg("d", "1.0.0")]),
    [
      row("a", "2.0.0"),
      row("b", "1.1.0"),
      row("c", "1.0.0"),
      row("d", "1.0.1", [{ title: "XSS", severity: "high" }], "1.0.0"),
    ]
  );

  it("рахує стани й дірки окремо", () => {
    const totals = stackTotals(items);
    expect(totals.total).toBe(4);
    expect(totals.major).toBe(1);
    expect(totals.minor).toBe(1);
    expect(totals.patch).toBe(1);
    expect(totals.fresh).toBe(1);
    expect(totals.vulnerable).toBe(1);
    expect(totals.worstSeverity).toBe("high");
  });

  it("без жодної перевірки checkedAt лишається null — це «не питали», а не «щойно»", () => {
    expect(stackTotals(buildStackItems(snapshot([pkg("a", "1.0.0")]), [])).checkedAt).toBeNull();
  });
});

describe("layerLag", () => {
  it("рахує лише ті пакети, що справді відстали", () => {
    const items = buildStackItems(
      snapshot([pkg("a", "1.0.0", "data"), pkg("b", "1.0.0", "data"), pkg("c", "1.0.0", "build")]),
      [row("a", "2.0.0"), row("b", "1.0.0"), row("c", "1.0.0")]
    );
    expect(layerLag(items)).toEqual([
      { layer: "data", behind: 1, total: 2 },
      { layer: "build", behind: 0, total: 1 },
    ]);
  });
});

describe("stackSummaryText", () => {
  const totalsOf = (items: StackItem[]) => stackTotals(items);

  it("мовчання про дірки має бути ЯВНИМ, інакше воно двозначне", () => {
    const items = buildStackItems(snapshot([pkg("a", "1.0.0")]), [row("a", "1.0.0")]);
    expect(stackSummaryText(totalsOf(items))).toBe("Стек: усе свіже, дірок безпеки немає");
  });

  it("мажори називаються окремо від решти оновлень", () => {
    const items = buildStackItems(snapshot([pkg("a", "1.0.0"), pkg("b", "1.0.0")]), [
      row("a", "2.0.0"),
      row("b", "1.1.0"),
    ]);
    expect(stackSummaryText(totalsOf(items))).toBe("Стек: 2 оновлення (1 ламає код), дірок безпеки немає");
  });

  it("дірка безпеки називає найгіршу важкість", () => {
    const items = buildStackItems(snapshot([pkg("a", "1.0.0")]), [
      row("a", "1.0.1", [{ title: "RCE", severity: "critical" }], "1.0.0"),
    ]);
    expect(stackSummaryText(totalsOf(items))).toBe("Стек: 1 оновлення, 1 діра безпеки (критична)");
  });

  it("до першої перевірки не вдає, що знає стан", () => {
    const items = buildStackItems(snapshot([pkg("a", "1.0.0")]), []);
    expect(stackSummaryText(totalsOf(items))).toBe("Стек: 1 залежність, npm ще не питали");
  });
});

describe("formatAgoCoarse", () => {
  const now = new Date("2026-08-23T12:00:00.000Z");

  it("дні, місяці й роки — словом у правильному відмінку", () => {
    expect(formatAgoCoarse("2026-08-14T12:00:00.000Z", now)).toBe("9 днів тому");
    expect(formatAgoCoarse("2026-08-22T12:00:00.000Z", now)).toBe("вчора");
    expect(formatAgoCoarse("2026-06-23T12:00:00.000Z", now)).toBe("2 місяці тому");
    expect(formatAgoCoarse("2025-06-23T12:00:00.000Z", now)).toBe("торік");
  });

  it("порожня дата — порожня відповідь, а не «сьогодні»", () => {
    expect(formatAgoCoarse(null, now)).toBeNull();
    expect(formatAgoCoarse("не дата", now)).toBeNull();
  });
});
