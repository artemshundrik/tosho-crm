import { describe, expect, it } from "vitest";
import {
  CUSTOM_OPTION_VALUE,
  PRINT_SPEC_DIARY,
  PRINT_SPEC_PACKAGE,
  PRINT_SPEC_PRESETS,
  buildPrintSpecRounds,
  buildPrintSpecSave,
  createEmptyPrintSpecValues,
  diffPrintSpec,
  needsPriceSnapshot,
  parsePrintSpecMetadata,
  resolvePriceBaseline,
  type PrintSpecValues,
  type PrintSpecVersion,
  formatPrintSpecEntries,
  formatPrintSpecSummary,
  getPrintSpecColumns,
  isPrintSpecFilled,
  isPrintSpecFieldVisible,
  listPrintSpecOptions,
  parsePrintSpecValues,
  printSpecConditions,
  reconcilePrintSpecValues,
  splitPrintSpecEntries,
  type PrintSpecPreset,
} from "./printSpec";

/**
 * Вид поліграфії тут — ДАНІ, і саме тому його ніхто не компілює: одрук у
 * `showIf.field` чи секція, якої немає в `sections`, не ламають збірку — поле
 * просто тихо зникає з форми. Людина цього не помічає, бо не знає, що поле мало
 * бути. Тому структурні перевірки нижче йдуть по ВСІХ пресетах одразу: новий
 * вид отримує їх, нічого не дописуючи.
 */
describe("описи видів поліграфії", () => {
  const presets: PrintSpecPreset[] = PRINT_SPEC_PRESETS;

  it.each(presets.map((preset) => [preset.label, preset] as const))(
    "%s: id полів унікальні, секції оголошені, умови показу ведуть на наявні значення",
    (_label, preset) => {
      const ids = preset.fields.map((field) => field.id);
      expect(new Set(ids).size).toBe(ids.length);

      // Стрічка «головне» посилається на поля за id — одрук тут означав би
      // порожню стрічку на картці без жодної помилки.
      for (const id of preset.summary ?? []) {
        expect(ids, `${preset.key}: у стрічці поле ${id}, якого немає`).toContain(id);
      }

      // Умови стоять і на полях, і на варіантах (пакет: 120 г лише крафт) —
      // перевіряються однаково: поле існує, значення в ньому теж.
      const conditioned = preset.fields.flatMap((field) => [
        { owner: field.id, showIf: field.showIf },
        ...(field.options ?? []).map((option) => ({ owner: `${field.id}=${option.value}`, showIf: option.showIf })),
      ]);

      for (const field of preset.fields) expect(preset.sections).toContain(field.section);

      for (const { owner, showIf } of conditioned) {
        for (const condition of printSpecConditions(showIf)) {
          const source = preset.fields.find((entry) => entry.id === condition.field);
          expect(source, `${owner}: умова на неіснуюче поле ${condition.field}`).toBeDefined();

          const targets = [condition.equals, condition.includes, condition.notEquals, ...(condition.oneOf ?? [])].filter(
            (target): target is string => target !== undefined
          );
          expect(targets.length, `${owner}: умова без значення`).toBeGreaterThan(0);
          for (const target of targets) {
            const known = source?.options?.some((option) => option.value === target);
            expect(known, `${owner}: умова на значення «${target}», якого немає в ${condition.field}`).toBe(true);
          }
        }
      }
    }
  );
});

/**
 * Щоденник — перший вид, набір полів якого прийшов не з файлу специфікацій, а з
 * паперового чекліста плюс відповідей виробництва (REQ-36). Три рішення в ньому
 * коштували місяця листування, і саме їх легко втратити при наступній правці.
 */
describe("щоденник", () => {
  const fieldIds = PRINT_SPEC_DIARY.fields.map((field) => field.id);

  it("датування й розліновка — одне поле: пари «датований + клітинка» не існує", () => {
    expect(fieldIds).toContain("layout");
    expect(fieldIds).not.toContain("blockRuling");
    const layout = PRINT_SPEC_DIARY.fields.find((field) => field.id === "layout");
    expect(layout?.options?.map((option) => option.value)).toEqual([
      "dated",
      "semi_dated",
      "undated",
      "line",
      "grid",
    ]);
  });

  it("кольоровість блока питається лише для індивідуального — у стандартного вона з макета", () => {
    const print = PRINT_SPEC_DIARY.fields.find((field) => field.id === "blockPrint");
    expect(print?.showIf).toEqual({ field: "blockKind", equals: "individual" });
  });

  it("оздоблення чужого матеріалу не тече у специфікацію", () => {
    const values = createEmptyPrintSpecValues(PRINT_SPEC_DIARY);
    values.coverMaterial = "leatherette";
    values.leatheretteFinishing = ["embossing"];
    // Лишилось від попереднього вибору — «папір з друком» більше не вибраний.
    values.printedPaperFinishing = ["foil"];
    values.printedPaperBase = "4_0_matt";

    const summary = formatPrintSpecSummary(PRINT_SPEC_DIARY, values);

    expect(summary).toContain("Нанесення: Тиснення");
    expect(summary.join("\n")).not.toContain("Тиснення фольгою");
    expect(summary.join("\n")).not.toContain("матова ламінація");
  });

  it("обовʼязковий друк паперу з друком потрапляє у специфікацію, а не лишається знанням", () => {
    const values = createEmptyPrintSpecValues(PRINT_SPEC_DIARY);
    values.coverMaterial = "printed_paper";
    values.printedPaperBase = "4_0_matt";

    expect(formatPrintSpecSummary(PRINT_SPEC_DIARY, values)).toContain(
      "Друк і ламінація: 4+0 + матова ламінація 1+0"
    );
  });

  it("нестандартний формат пишеться текстом і читається назад", () => {
    const values = createEmptyPrintSpecValues(PRINT_SPEC_DIARY);
    values.format = CUSTOM_OPTION_VALUE;
    values.format__custom = "145 × 205 мм";

    expect(formatPrintSpecSummary(PRINT_SPEC_DIARY, values)).toContain("Формат: 145 × 205 мм");
    expect(isPrintSpecFilled(PRINT_SPEC_DIARY, values)).toBe(true);

    const restored = parsePrintSpecValues(PRINT_SPEC_DIARY, values);
    expect(restored.format__custom).toBe("145 × 205 мм");
  });

  it("порожня конфігурація — нормальний стан, а не заповнена", () => {
    expect(isPrintSpecFilled(PRINT_SPEC_DIARY, createEmptyPrintSpecValues(PRINT_SPEC_DIARY))).toBe(false);
  });
});

/**
 * Картка прорахунку малює стрічку «головне» й сітку решти з тих самих записів,
 * з яких складається рядкове зведення для списку й дизайн-задачі. Розійтись
 * вони не можуть за побудовою — але порядок стрічки й те, що порожнє головне
 * поле в неї не потрапляє, варто тримати перевіреним.
 */
describe("стрічка «головне» на картці", () => {
  const values = {
    ...createEmptyPrintSpecValues(PRINT_SPEC_DIARY),
    blockPages: "100",
    format: "a5",
    corners: "round",
  };

  it("іде в порядку опису виду, а не в порядку заповнення, і без порожніх", () => {
    const entries = formatPrintSpecEntries(PRINT_SPEC_DIARY, values);
    const { hero, rest } = splitPrintSpecEntries(PRINT_SPEC_DIARY, entries);
    expect(hero.map((entry) => entry.id)).toEqual(["format", "blockPages"]);
    expect(hero.map((entry) => entry.value)).toEqual(["А5", "100 стор"]);
    expect(rest.map((entry) => entry.id)).toEqual(["corners"]);
  });

  it("рядкове зведення — ті самі записи з «Виріб» попереду", () => {
    const entries = formatPrintSpecEntries(PRINT_SPEC_DIARY, values);
    expect(formatPrintSpecSummary(PRINT_SPEC_DIARY, values)).toEqual([
      "Виріб: Щоденник",
      ...entries.map((entry) => `${entry.label}: ${entry.value}`),
    ]);
  });
});

/**
 * Стовпчики вікна: розділ, якого немає в жодному стовпчику, тихо зникає з форми
 * і з картки — помилку не видно ні збірці, ні типам.
 */
describe("стовпчики", () => {
  it.each(PRINT_SPEC_PRESETS.map((preset) => [preset.label, preset] as const))(
    "%s: кожен розділ стоїть рівно в одному стовпчику",
    (_label, preset) => {
      const columns = preset.columns ?? [{ title: preset.label, sections: preset.sections }];
      const used = columns.flatMap((column) => column.sections);
      expect(new Set(used).size).toBe(used.length);
      expect([...used].sort()).toEqual([...preset.sections].sort());
      for (const field of preset.fields) expect(preset.sections).toContain(field.section);
    }
  );

  it("формат щоденника — першим полем «Обкладинки»", () => {
    const format = PRINT_SPEC_DIARY.fields.find((field) => field.id === "format");
    expect(format?.section).toBe("Обкладинка");
    const columns = getPrintSpecColumns(PRINT_SPEC_DIARY, createEmptyPrintSpecValues(PRINT_SPEC_DIARY));
    expect(columns[0].title).toBe("Обкладинка");
    expect(columns[0].sections[0].fields[0].id).toBe("format");
  });

  it("у стовпчик потрапляють лише видимі поля, і порожній стовпчик зникає", () => {
    const values = createEmptyPrintSpecValues(PRINT_SPEC_DIARY);
    const before = getPrintSpecColumns(PRINT_SPEC_DIARY, values);
    expect(before.map((column) => column.title)).toEqual(["Обкладинка", "Блок", "Комплектуючі"]);
    const cover = before[0];
    const after = getPrintSpecColumns(PRINT_SPEC_DIARY, { ...values, coverMaterial: "leatherette" });
    expect(after[0].total).toBe(cover.total + 2);
    expect(after[0].filled).toBe(1);
  });
});

/** Зміни після ціни: що вважати зміною, а що — тим самим «порожньо» чи тим самим вибором. */
describe("diffPrintSpec", () => {
  const empty = () => createEmptyPrintSpecValues(PRINT_SPEC_DIARY);
  const diff = (from: PrintSpecValues, to: PrintSpecValues) => diffPrintSpec(PRINT_SPEC_DIARY, from, to);

  it("змінений вибір дає одну зміну зі старим і новим текстом", () => {
    const changes = diff({ ...empty(), coverType: "hard" }, { ...empty(), coverType: "flex" });
    expect(changes).toEqual([
      { fieldId: "coverType", label: "Тип", section: "Обкладинка", from: "Тверда", to: "Гнучка" },
    ]);
  });

  it("порожнє, null і порожній масив — те саме", () => {
    expect(diff({ ...empty(), coverType: null, leatheretteFinishing: [] }, empty())).toEqual([]);
  });

  it("«Інше» з іншим текстом — зміна, з тим самим — ні", () => {
    const a = { ...empty(), format: CUSTOM_OPTION_VALUE, format__custom: "150 × 200" };
    expect(diff(a, { ...a, format__custom: "150 × 210" }).map((change) => change.fieldId)).toEqual(["format"]);
    expect(diff(a, { ...a, format__custom: " 150 × 200 " })).toEqual([]);
  });

  it("кілька зі списку — множина: порядок не важить", () => {
    const base = { ...empty(), coverMaterial: "leatherette" };
    expect(
      diff(
        { ...base, leatheretteFinishing: ["varnish", "embossing"] },
        { ...base, leatheretteFinishing: ["embossing", "varnish"] }
      )
    ).toEqual([]);
    expect(
      diff({ ...base, leatheretteFinishing: ["varnish"] }, { ...base, leatheretteFinishing: ["varnish", "screen"] })
    ).toHaveLength(1);
  });

  it("поле, що стало невидимим, — зміна «було → порожньо»", () => {
    const from = { ...empty(), coverMaterial: "leatherette", leatheretteName: "Vienna" };
    const to = { ...empty(), coverMaterial: "printed_paper", leatheretteName: "Vienna" };
    const gone = diff(from, to).find((change) => change.fieldId === "leatheretteName");
    expect(gone).toMatchObject({ from: "Vienna", to: "" });
  });
});

describe("версії, яку рахували", () => {
  const values = (coverType: string): PrintSpecValues => ({ ...createEmptyPrintSpecValues(PRINT_SPEC_DIARY), coverType });
  const snap = (at: string, coverType: string, pricedAt: string | null = null): PrintSpecVersion => ({
    at,
    pricedAt,
    values: values(coverType),
  });

  it("до першої ціни знімка не треба", () => {
    expect(needsPriceSnapshot({ versions: [], lastPricedAt: null, quoteStatus: "estimating" })).toBe(false);
    expect(needsPriceSnapshot({ versions: [], lastPricedAt: null, quoteStatus: "new" })).toBe(false);
  });

  it("після ціни перша правка робить знімок, друга до перерахунку — ні", () => {
    const priced = "2026-09-24T10:00:00Z";
    expect(needsPriceSnapshot({ versions: [], lastPricedAt: priced, quoteStatus: "estimated" })).toBe(true);
    // Статус без історії: рахували, але дати невідомі.
    expect(needsPriceSnapshot({ versions: [], lastPricedAt: null, quoteStatus: "approved" })).toBe(true);

    const versions = [snap("2026-09-25T10:00:00Z", "hard", priced)];
    expect(needsPriceSnapshot({ versions, lastPricedAt: priced, quoteStatus: "estimating" })).toBe(false);
    expect(resolvePriceBaseline({ versions, lastPricedAt: priced })?.coverType).toBe("hard");
  });

  it("після перерахунку знімок застарів і потрібен новий", () => {
    const versions = [snap("2026-09-25T10:00:00Z", "hard", "2026-09-24T10:00:00Z")];
    const repriced = "2026-09-27T10:00:00Z";
    expect(resolvePriceBaseline({ versions, lastPricedAt: repriced })).toBeNull();
    expect(needsPriceSnapshot({ versions, lastPricedAt: repriced, quoteStatus: "estimated" })).toBe(true);
  });

  it("дата перерахунку невідома, а знімок є — він і є базою", () => {
    const versions = [snap("2026-09-25T10:00:00Z", "hard")];
    expect(resolvePriceBaseline({ versions, lastPricedAt: null })).not.toBeNull();
  });

  it("parse зберігає валідні versions, зокрема без pricedAt, і відкидає зіпсовані", () => {
    const parsed = parsePrintSpecMetadata({
      presetKey: "print_diary",
      values: { coverType: "flex" },
      versions: [
        { at: "2026-09-25T10:00:00Z", pricedAt: "2026-09-24T10:00:00Z", values: { coverType: "hard" } },
        { at: "2026-09-26T10:00:00Z", values: { coverType: "book" } },
        { at: "не дата", values: {} },
        "сміття",
      ],
    });
    expect(parsed?.versions).toHaveLength(2);
    expect(parsed?.versions?.[0].pricedAt).toBe("2026-09-24T10:00:00Z");
    expect(parsed?.versions?.[1].pricedAt).toBeNull();
    expect(parsed?.versions?.[1].values.coverType).toBe("book");
  });
});

describe("buildPrintSpecSave", () => {
  const base = createEmptyPrintSpecValues(PRINT_SPEC_DIARY);
  const now = new Date("2026-09-28T09:00:00Z");

  it("знімає знімок із pricedAt і просить повернути на перерахунок, коли рахували", () => {
    const result = buildPrintSpecSave({
      preset: PRINT_SPEC_DIARY,
      current: { presetKey: "print_diary", values: { ...base, coverType: "hard" } },
      draft: { ...base, coverType: "flex" },
      quoteStatus: "estimated",
      lastPricedAt: "2026-09-24T10:00:00Z",
      now,
    });
    expect(result.changedAfterPrice).toBe(true);
    expect(result.printSpec.values.coverType).toBe("flex");
    expect(result.printSpec.versions).toHaveLength(1);
    expect(result.printSpec.versions?.[0]).toMatchObject({
      at: now.toISOString(),
      pricedAt: "2026-09-24T10:00:00Z",
    });
    expect(result.printSpec.versions?.[0].values.coverType).toBe("hard");
  });

  it("не губить наявні versions і не дублює знімок до перерахунку", () => {
    const existing: PrintSpecVersion = { at: "2026-09-25T10:00:00Z", pricedAt: "2026-09-24T10:00:00Z", values: base };
    const result = buildPrintSpecSave({
      preset: PRINT_SPEC_DIARY,
      current: { presetKey: "print_diary", values: { ...base, coverType: "hard" }, versions: [existing] },
      draft: { ...base, coverType: "book" },
      quoteStatus: "estimating",
      lastPricedAt: "2026-09-24T10:00:00Z",
      now,
    });
    expect(result.printSpec.versions).toHaveLength(1);
    expect(result.printSpec.versions?.[0].at).toBe(existing.at);
    expect(result.changedAfterPrice).toBe(false);
  });

  it("перше заповнення після ціни — без знімка й без повернення; часткове заповнення рахується як зміна", () => {
    const common = { preset: PRINT_SPEC_DIARY, quoteStatus: "estimated", lastPricedAt: "2026-09-24T10:00:00Z", now };
    const first = buildPrintSpecSave({ ...common, current: { presetKey: "print_diary", values: base }, draft: { ...base, coverType: "flex" } });
    expect(first.printSpec.versions).toBeUndefined();
    expect(first.changedAfterPrice).toBe(false);

    const partial = buildPrintSpecSave({
      ...common,
      current: { presetKey: "print_diary", values: { ...base, coverType: "hard" } },
      draft: { ...base, coverType: "hard", coverFoam: "no" },
    });
    expect(partial.printSpec.versions).toHaveLength(1);
    expect(partial.changedAfterPrice).toBe(true);
  });

  it("без змін або до ціни — без знімка; approved не повертається", () => {
    const current = { presetKey: "print_diary", values: { ...base, coverType: "hard" } };
    const same = buildPrintSpecSave({ preset: PRINT_SPEC_DIARY, current, draft: { ...base, coverType: "hard" }, quoteStatus: "estimated" });
    expect(same.printSpec.versions).toBeUndefined();
    expect(same.changedAfterPrice).toBe(false);

    const early = buildPrintSpecSave({ preset: PRINT_SPEC_DIARY, current, draft: { ...base, coverType: "flex" }, quoteStatus: "estimating" });
    expect(early.printSpec.versions).toBeUndefined();

    const approved = buildPrintSpecSave({ preset: PRINT_SPEC_DIARY, current, draft: { ...base, coverType: "flex" }, quoteStatus: "approved" });
    expect(approved.printSpec.versions).toHaveLength(1);
    expect(approved.changedAfterPrice).toBe(false);
  });
});

describe("buildPrintSpecRounds", () => {
  const vals = (coverType: string, blockPrint = ""): PrintSpecValues => ({
    ...createEmptyPrintSpecValues(PRINT_SPEC_DIARY),
    coverType,
    blockKind: "individual", // кольоровість блока видима лише для індивідуального
    blockPrint,
  });
  const v = (at: string, pricedAt: string | null, coverType: string): PrintSpecVersion => ({
    at,
    pricedAt,
    values: vals(coverType),
  });
  const rounds = (versions: PrintSpecVersion[], current: PrintSpecValues, lastPricedAt: string | null) =>
    buildPrintSpecRounds(PRINT_SPEC_DIARY, versions, current, lastPricedAt);

  it("без знімків історії немає", () => {
    expect(rounds([], vals("flex"), "2026-09-24T10:00:00Z")).toEqual([]);
  });

  it("непорахована правка — останній раунд «Зараз» з різницею від знімка", () => {
    const result = rounds([v("2026-09-25T10:00:00Z", "2026-09-24T10:00:00Z", "hard")], vals("flex"), "2026-09-24T10:00:00Z");
    expect(result.map((round) => round.label)).toEqual(["В1", "Зараз"]);
    expect(result[1].unpriced).toBe(true);
    expect(result[0].changes).toEqual([]);
    expect(result[1].changes.map((change) => [change.fieldId, change.from, change.to])).toEqual([
      ["coverType", "Тверда", "Гнучка"],
    ]);
  });

  it("після перерахунку відмінні поточні значення — ще одна порахована версія", () => {
    const repriced = "2026-09-27T10:00:00Z";
    const result = rounds([v("2026-09-25T10:00:00Z", "2026-09-24T10:00:00Z", "hard")], vals("flex"), repriced);
    expect(result.map((round) => round.label)).toEqual(["В1", "В2"]);
    expect(result[1]).toMatchObject({ unpriced: false, pricedAt: repriced });
    expect(result[1].changes).toHaveLength(1);
  });

  it("після перерахунку без відмінностей нового раунду немає", () => {
    const result = rounds([v("2026-09-25T10:00:00Z", "2026-09-24T10:00:00Z", "hard")], vals("hard"), "2026-09-27T10:00:00Z");
    expect(result.map((round) => round.label)).toEqual(["В1"]);
  });

  it("чотири підходи — В1…В3 і «Зараз», зміни від попереднього", () => {
    const versions = [
      v("2026-09-25T10:00:00Z", "2026-09-24T10:00:00Z", "hard"),
      v("2026-09-28T10:00:00Z", "2026-09-27T10:00:00Z", "flex"),
      v("2026-09-30T10:00:00Z", "2026-09-29T10:00:00Z", "book"),
    ];
    const result = rounds(versions, vals("book", "2_2"), "2026-09-29T10:00:00Z");
    expect(result.map((round) => round.label)).toEqual(["В1", "В2", "В3", "Зараз"]);
    expect(result[1].changes.map((change) => change.to)).toEqual(["Гнучка"]);
    expect(result[3].changes.map((change) => change.fieldId)).toEqual(["blockPrint"]);
  });
});

/**
 * Пакет — перший вид, у якого від іншого поля залежать не лише поля, а й
 * ВАРІАНТИ (REQ-323#p4). Правила прийшли з `printPackageRules.ts` старого
 * конфігуратора; там вони жили редюсером, тут — умовами в описі, і звіряє їх
 * `reconcilePrintSpecValues`.
 */
describe("пакет: варіанти, що залежать від матеріалу й типу", () => {
  const field = (id: string) => {
    const found = PRINT_SPEC_PACKAGE.fields.find((entry) => entry.id === id);
    if (!found) throw new Error(id);
    return found;
  };
  const values = (over: PrintSpecValues): PrintSpecValues => ({ ...createEmptyPrintSpecValues(PRINT_SPEC_PACKAGE), ...over });
  const optionValues = (id: string, over: PrintSpecValues) =>
    listPrintSpecOptions(field(id), values(over)).map((option) => option.value);

  it("120 г буває лише в крафта, 205 г — лише в картону", () => {
    expect(optionValues("density", { paperType: "kraft" })).toContain("120");
    expect(optionValues("density", { paperType: "kraft" })).not.toContain("205");
    expect(optionValues("density", { paperType: "cardboard" })).toContain("205");
    expect(optionValues("density", { paperType: "cardboard" })).not.toContain("120");
    expect(optionValues("density", { paperType: "paper" })).toEqual(["90", "110", "125", "200", "250"]);
  });

  it("крафт змінили на картон — 120 г і паперові ручки стираються, решта лишається", () => {
    const kraft = values({ paperType: "kraft", density: "120", handleType: "twisted_paper", orientation: "vertical" });
    const reconciled = reconcilePrintSpecValues(PRINT_SPEC_PACKAGE, { ...kraft, paperType: "cardboard" });

    expect(reconciled.density).toBe("");
    expect(reconciled.handleType).toBe("");
    expect(reconciled.orientation).toBe("vertical");
  });

  it("щільність, спільна для обох матеріалів, переживає зміну", () => {
    const kraft = values({ paperType: "kraft", density: "250" });
    expect(reconcilePrintSpecValues(PRINT_SPEC_PACKAGE, { ...kraft, paperType: "cardboard" }).density).toBe("250");
  });

  it("CMYK на готовий пакет не кладуть", () => {
    expect(optionValues("printType", { packageType: "ready" })).not.toContain("cmyk");
    expect(optionValues("printType", { packageType: "custom" })).toContain("cmyk");
    // Тип ще не вибрали — CMYK видно: заборона лише для готового.
    expect(optionValues("printType", {})).toContain("cmyk");

    const custom = values({ packageType: "custom", printType: "cmyk" });
    expect(reconcilePrintSpecValues(PRINT_SPEC_PACKAGE, { ...custom, packageType: "ready" }).printType).toBe("");
  });

  it("кількість пантонів питають і для Pantone, і для CMYK+Pantone", () => {
    expect(isPrintSpecFieldVisible(field("pantoneCount"), values({ printType: "pantone" }))).toBe(true);
    expect(isPrintSpecFieldVisible(field("pantoneCount"), values({ printType: "cmyk_pantone" }))).toBe(true);
    expect(isPrintSpecFieldVisible(field("pantoneCount"), values({ printType: "uv_print" }))).toBe(false);
  });

  it("люверси — лише в індивідуального пакета не з крафта", () => {
    const eyelets = field("eyelets");
    expect(isPrintSpecFieldVisible(eyelets, values({ packageType: "custom", paperType: "cardboard" }))).toBe(true);
    expect(isPrintSpecFieldVisible(eyelets, values({ packageType: "custom" }))).toBe(true);
    expect(isPrintSpecFieldVisible(eyelets, values({ packageType: "custom", paperType: "kraft" }))).toBe(false);
    expect(isPrintSpecFieldVisible(eyelets, values({ packageType: "ready", paperType: "cardboard" }))).toBe(false);
  });

  it("звірка повертає той самий обʼєкт, коли міняти нічого", () => {
    const fine = values({ paperType: "kraft", density: "120" });
    expect(reconcilePrintSpecValues(PRINT_SPEC_PACKAGE, fine)).toBe(fine);
  });

  it("збережене до правила значення стирається вже на читанні", () => {
    const parsed = parsePrintSpecValues(PRINT_SPEC_PACKAGE, { paperType: "paper", density: "205" });
    expect(parsed.density).toBe("");
  });
});

describe("розмір у три виміри", () => {
  const size = PRINT_SPEC_PACKAGE.fields.find((field) => field.id === "size");
  const withSize = (depth: string): PrintSpecValues => ({
    ...createEmptyPrintSpecValues(PRINT_SPEC_PACKAGE),
    packageType: "custom",
    size: [{ width: "290", height: "340", depth }],
  });

  it("глибина пишеться третьою і порівнюється як частина розміру", () => {
    expect(size?.withDepth).toBe(true);
    expect(formatPrintSpecEntries(PRINT_SPEC_PACKAGE, withSize("120"))).toContainEqual({
      id: "size",
      label: "Розмір (Ш × В × Г)",
      value: "290 × 340 × 120 мм",
    });
    expect(diffPrintSpec(PRINT_SPEC_PACKAGE, withSize("120"), withSize("100")).map((change) => change.fieldId)).toEqual([
      "size",
    ]);
  });

  it("порожній вид розміру з глибиною — один, а не два", () => {
    expect(createEmptyPrintSpecValues(PRINT_SPEC_PACKAGE).size).toEqual([{ width: "", height: "", depth: "" }]);
    expect(parsePrintSpecValues(PRINT_SPEC_PACKAGE, {}).size).toEqual([{ width: "", height: "", depth: "" }]);
  });
});
