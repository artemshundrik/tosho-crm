import { describe, expect, it } from "vitest";
import {
  CUSTOM_OPTION_VALUE,
  PRINT_SPEC_DIARY,
  PRINT_SPEC_PRESETS,
  createEmptyPrintSpecValues,
  formatPrintSpecEntries,
  formatPrintSpecSummary,
  isPrintSpecFilled,
  parsePrintSpecValues,
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

      for (const field of preset.fields) {
        expect(preset.sections).toContain(field.section);

        const condition = field.showIf;
        if (!condition) continue;

        const source = preset.fields.find((entry) => entry.id === condition.field);
        expect(source, `${field.id}: умова на неіснуюче поле ${condition.field}`).toBeDefined();

        const target = condition.equals ?? condition.includes;
        const known = source?.options?.some((option) => option.value === target);
        expect(known, `${field.id}: умова на значення «${target}», якого немає в ${condition.field}`).toBe(true);
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
      "Виріб: щоденник",
      ...entries.map((entry) => `${entry.label}: ${entry.value}`),
    ]);
  });
});
