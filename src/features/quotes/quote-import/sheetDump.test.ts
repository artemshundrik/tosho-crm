import { describe, expect, it } from "vitest";

import { buildSheetDump, type ParsedSheet } from "./sheetDump";

const sheet = (rows: ParsedSheet["rows"], links: ParsedSheet["links"] = [], name = "Лист1"): ParsedSheet => ({
  name,
  rows,
  links,
});

describe("дамп аркуша для розшифровки", () => {
  it("нумерує рядки за файлом, а не за тим, що лишилось після викидання порожніх", () => {
    const dump = buildSheetDump([
      sheet([
        ["№", "Найменування"],
        [null, null],
        [1, "Кухоль"],
      ]),
    ]);

    expect(dump.text.split("\n")).toEqual(["1\t№\tНайменування", "3\t1\tКухоль"]);
    expect(dump.rowCount).toBe(2);
  });

  it("прибирає хвіст подання числа й порожні колонки праворуч", () => {
    const dump = buildSheetDump([sheet([[1, 319.00000000000006, null, null]])]);

    expect(dump.text).toBe("1\t1\t319");
  });

  it("склеює переноси в комірці — рядок дампа мусить лишитись одним рядком", () => {
    const dump = buildSheetDump([sheet([["Кухоль\nчорний   матовий"]])]);

    expect(dump.text).toBe("1\tКухоль чорний матовий");
  });

  it("виносить посилання окремою секцією з номером рядка", () => {
    const dump = buildSheetDump([
      sheet(
        [
          ["Товар", "Посилання"],
          ["Кухоль", "див. сайт"],
        ],
        [{ row: 2, url: "https://example.com/mug" }]
      ),
    ]);

    expect(dump.text).toContain("=== Посилання (рядок → адреса)");
    expect(dump.text).toContain("2\thttps://example.com/mug");
    expect(dump.linkCount).toBe(1);
  });

  it("не тягне посилання з рядка, якого в дампі немає", () => {
    const dump = buildSheetDump([
      sheet([["Кухоль"], [null]], [{ row: 2, url: "https://example.com/ghost" }]),
    ]);

    expect(dump.text).not.toContain("example.com/ghost");
    expect(dump.linkCount).toBe(0);
  });

  it("підписує аркуші лише тоді, коли їх справді кілька", () => {
    const single = buildSheetDump([sheet([["Кухоль"]]), sheet([[null]], [], "Порожній")]);
    expect(single.text).not.toContain("=== Аркуш:");

    const many = buildSheetDump([sheet([["Кухоль"]]), sheet([["Ручка"]], [], "Лист2")]);
    expect(many.text).toContain("=== Аркуш: Лист1");
    expect(many.text).toContain("=== Аркуш: Лист2");
  });

  it("обрізає дамп на стелі й каже про це", () => {
    const rows = Array.from({ length: 200 }, (_, index) => [`Позиція ${index}`]);
    const dump = buildSheetDump([sheet(rows)], { maxChars: 100 });

    expect(dump.truncated).toBe(true);
    expect(dump.text.endsWith("… дамп обрізано")).toBe(true);
  });
});
