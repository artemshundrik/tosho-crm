import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  cleanMethodName,
  findSimilarMethods,
  isSameMethodName,
  methodLookupKeys,
  normalizeMethodName,
} from "./catalogMethodName";

describe("normalizeMethodName", () => {
  it("зводить регістр, пробіли й дефіси до одного ключа", () => {
    const spellings = ["УФ-друк", "УФ - друк", "УФ -друк", "уф друк", "Уф- друк", "УФ- друк", "Уф-друк"];
    const keys = new Set(spellings.map(normalizeMethodName));
    expect(Array.from(keys)).toEqual(["уфдрук"]);
  });

  it("витягує одруківку з пробілом усередині слова", () => {
    expect(normalizeMethodName("т амподрук")).toBe(normalizeMethodName("Тамподрук"));
    expect(normalizeMethodName("ц ифровий друк")).toBe(normalizeMethodName("Цифровий друк"));
  });

  it("не плутає латиницю з кирилицею", () => {
    expect(normalizeMethodName("DTF")).not.toBe(normalizeMethodName("ДТФ"));
    expect(normalizeMethodName("УФ-DTF")).not.toBe(normalizeMethodName("УФ-ДТФ"));
  });

  it("не розкладає українську «й» (пастка NFKD)", () => {
    expect(normalizeMethodName("Йорж")).not.toBe(normalizeMethodName("Иорж"));
    expect(normalizeMethodName("Йорж")).toBe("йорж");
  });

  it("порожнє й лише розділові знаки дають порожній ключ", () => {
    expect(normalizeMethodName("   ")).toBe("");
    expect(normalizeMethodName("---")).toBe("");
    expect(normalizeMethodName(null)).toBe("");
  });

  it("зводить ё до е", () => {
    expect(normalizeMethodName("Тиснёние")).toBe(normalizeMethodName("Тиснение"));
  });
});

describe("дзеркальність із tosho.normalize_method_name", () => {
  // Пари «назва → ключ» зняті з проду тим самим виразом, що стоїть у
  // scripts/catalog-method-directory.sql. Якщо правила розійдуться, форма
  // вважатиме назву новою там, де база бачить дубль, і людина отримає сирий
  // текст помилки Postgres замість підказки — цей тест ловить саме це.
  const fixturePath = new URL("./__fixtures__/methodNormalization.tsv", import.meta.url);
  const rows = readFileSync(fixturePath, "utf8")
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((parts): parts is [string, string] => parts.length === 2 && parts[0].length > 0);

  it("має непорожній набір реальних назв", () => {
    expect(rows.length).toBeGreaterThan(40);
  });

  it.each(rows)("«%s» → %s", (name, expected) => {
    expect(normalizeMethodName(name)).toBe(expected);
  });
});

describe("cleanMethodName", () => {
  it("прибирає краї й здвоєні пробіли, але лишає слова роздільними", () => {
    expect(cleanMethodName("  УФ   друк ")).toBe("УФ друк");
  });
});

describe("methodLookupKeys", () => {
  it("знає синоніми термоперенесення", () => {
    const keys = methodLookupKeys("Термотрансфер");
    expect(keys.has(normalizeMethodName("термодрук"))).toBe(true);
    expect(keys.has(normalizeMethodName("FLEX плівка"))).toBe(true);
  });

  it("зводить будь-яку вишивку до вишивки", () => {
    expect(methodLookupKeys("3D-вишивка").has("вишивка")).toBe(true);
  });
});

describe("isSameMethodName", () => {
  it("порожнє не дорівнює порожньому", () => {
    expect(isSameMethodName("", "")).toBe(false);
    expect(isSameMethodName("УФ друк", "уф-друк")).toBe(true);
  });
});

describe("findSimilarMethods", () => {
  const directory = [
    { name: "УФ-друк" },
    { name: "УФ-ДТФ" },
    { name: "УФ" },
    { name: "Тамподрук" },
    { name: "Вишивка" },
  ];

  it("точний збіг іде першим", () => {
    expect(findSimilarMethods("уф друк", directory)[0]?.name).toBe("УФ-друк");
  });

  it("частковий ввід знаходить усе сімейство", () => {
    const names = findSimilarMethods("уф", directory).map((entry) => entry.name);
    expect(names).toContain("УФ");
    expect(names).toContain("УФ-друк");
    expect(names).toContain("УФ-ДТФ");
    expect(names).not.toContain("Вишивка");
  });

  it("порожній запит нічого не пропонує", () => {
    expect(findSimilarMethods("  ", directory)).toEqual([]);
  });
});
