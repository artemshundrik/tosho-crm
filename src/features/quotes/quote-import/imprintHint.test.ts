import { describe, expect, it } from "vitest";

import { toDraftItems } from "./mapping";
import { matchMethodId, withHintImprints } from "./imprintHint";

/**
 * Зіставлення методу нанесення з ТЗ на довідник виду (REQ-182#p28).
 *
 * УМОВНО, А НЕ НАЗАВЖДИ: «УФ-друк» не має стати «Друк» лише тому, що слово
 * входить у слово. Перевірка саме на це стоїть окремим кейсом нижче — вона
 * ловить регресію, яку легко внести, спростивши пошук до звичайного `includes`
 * в обидва боки.
 */
const methods = [
  { id: "m-emb", name: "Вишивка" },
  { id: "m-silk", name: "Шовкографія" },
  { id: "m-print", name: "Друк" },
];

describe("matchMethodId — метод з ТЗ на довідник виду", () => {
  it("вишивка → вишивка", () => {
    expect(matchMethodId("Вишивка логотипу", methods)).toBe("m-emb");
  });

  it("шовкодрук → шовкографія (синонім)", () => {
    expect(matchMethodId("шовкодрук", methods)).toBe("m-silk");
  });

  it("УФ-друк не чіпляється за загальний «Друк»", () => {
    expect(matchMethodId("УФ-друк", methods)).toBeNull();
  });

  it("невідоме — null, нічого не вигадуємо", () => {
    expect(matchMethodId("гальваніка", methods)).toBeNull();
  });
});

/**
 * Чернетка з файлу, мінімальна: `toDraftItems` дає їй усі поля, які реально
 * приходять з розбору (у т.ч. `catalog: null`, `imprints: []`), а тест лише
 * дописує те, що з'являється ПІСЛЯ прив'язки товару.
 */
const fileDraft = toDraftItems([
  { sourceRows: [9], name: "Флісова жилетка", comment: null, links: [], runs: [{ quantity: 650 }], flags: [], notes: null },
])[0];

describe("withHintImprints — нанесення з ТЗ у чіп (REQ-182#p28)", () => {
  it("є вид і методи → чип із місцем з ТЗ", () => {
    const draft = {
      ...fileDraft,
      catalog: { kindId: "k1", typeId: "t", kindName: "Жилетки", typeName: "Одяг", modelId: null, imageUrl: null },
      imprints: [],
      imprintHint: { method: "Вишивка", place: "груди ліворуч", size: null, colors: null },
    };
    expect(withHintImprints(draft, { k1: { methods } }).imprints).toEqual([
      { key: `${draft.key}-hint`, methodId: "m-emb", positionId: null, positionLabel: "груди ліворуч" },
    ]);
  });

  it("людина вже правила чипи (imprintHintApplied) — не підмішуємо", () => {
    const draft = {
      ...fileDraft,
      catalog: { kindId: "k1", typeId: "t", kindName: "", typeName: "", modelId: null, imageUrl: null },
      imprints: [],
      imprintHintApplied: true,
      imprintHint: { method: "Вишивка", place: null, size: null, colors: null },
    };
    expect(withHintImprints(draft, { k1: { methods } }).imprints).toEqual([]);
  });

  it("немає нанесення з ТЗ — чернетка не міняється", () => {
    const draft = {
      ...fileDraft,
      catalog: { kindId: "k1", typeId: "t", kindName: "", typeName: "", modelId: null, imageUrl: null },
      imprintHint: null,
    };
    expect(withHintImprints(draft, { k1: { methods } })).toBe(draft);
  });

  it("вид ще не відомий (посилання, назва руками) — чипа нема на що вішати", () => {
    const draft = {
      ...fileDraft,
      catalog: null,
      imprintHint: { method: "Вишивка", place: null, size: null, colors: null },
    };
    expect(withHintImprints(draft, {})).toBe(draft);
  });

  it("методи виду ще не доїхали — чекаємо, а не мовчки пропускаємо назавжди", () => {
    const draft = {
      ...fileDraft,
      catalog: { kindId: "k1", typeId: "t", kindName: "", typeName: "", modelId: null, imageUrl: null },
      imprintHint: { method: "Вишивка", place: null, size: null, colors: null },
    };
    expect(withHintImprints(draft, {})).toBe(draft);
  });

  it("метод із ТЗ не зіставився з довідником виду — підпис лишається, чипа нема", () => {
    const draft = {
      ...fileDraft,
      catalog: { kindId: "k1", typeId: "t", kindName: "", typeName: "", modelId: null, imageUrl: null },
      imprints: [],
      imprintHint: { method: "гальваніка", place: null, size: null, colors: null },
    };
    expect(withHintImprints(draft, { k1: { methods } }).imprints).toEqual([]);
  });

  it("чипи вже є — не додаємо ще один поверх обраного людиною", () => {
    const draft = {
      ...fileDraft,
      catalog: { kindId: "k1", typeId: "t", kindName: "", typeName: "", modelId: null, imageUrl: null },
      imprints: [{ key: "own", methodId: "m-print", positionId: null, positionLabel: null }],
      imprintHint: { method: "Вишивка", place: null, size: null, colors: null },
    };
    expect(withHintImprints(draft, { k1: { methods } }).imprints).toEqual([
      { key: "own", methodId: "m-print", positionId: null, positionLabel: null },
    ]);
  });
});
