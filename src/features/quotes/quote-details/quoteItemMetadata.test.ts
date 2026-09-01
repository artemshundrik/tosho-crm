import { describe, expect, it } from "vitest";

import { parseQuoteItemMetadata } from "./quoteItemMetadata";

describe("читання metadata позиції прорахунку", () => {
  it("пропускає посилання постачальника — без них кнопка на картці сіра", () => {
    const metadata = parseQuoteItemMetadata({
      supplierUrl: "https://kmz.ua/mug",
      avantprintUrl: "https://avanprint.com/mug",
    });

    expect(metadata).toEqual({
      supplierUrl: "https://kmz.ua/mug",
      avantprintUrl: "https://avanprint.com/mug",
    });
  });

  it("не пропускає нічого, крім http(s): цей рядок їде прямо в href", () => {
    expect(parseQuoteItemMetadata({ supplierUrl: "javascript:alert(1)" })).toBeNull();
    expect(parseQuoteItemMetadata({ supplierUrl: "data:text/html,<script>" })).toBeNull();
    expect(parseQuoteItemMetadata({ supplierUrl: "не посилання" })).toBeNull();
  });

  it("тримає слід імпорту й стан дослідження", () => {
    const metadata = parseQuoteItemMetadata({
      import: { fileName: "kmz.xlsx", importedAt: "2026-09-01T10:00:00.000Z", sourceRows: [3, 4] },
      research: { status: "failed", fetchedAt: "2026-09-01T10:01:00.000Z", error: "403" },
      importLinks: ["https://kmz.ua/a", "javascript:alert(1)"],
    });

    expect(metadata?.import).toEqual({
      fileName: "kmz.xlsx",
      importedAt: "2026-09-01T10:00:00.000Z",
      sourceRows: [3, 4],
    });
    expect(metadata?.research?.status).toBe("failed");
    expect(metadata?.importLinks).toEqual(["https://kmz.ua/a"]);
  });

  it("невідомий статус дослідження не проходить", () => {
    expect(parseQuoteItemMetadata({ research: { status: "маємо надію", fetchedAt: "x" } })).toBeNull();
  });
});
