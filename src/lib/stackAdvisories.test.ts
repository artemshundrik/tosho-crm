import { describe, expect, it } from "vitest";
import { advisoriesByPackage, advisoryRequestBodies, parseBulkAdvisories } from "./stackAdvisories";

// Помилка тут не падає, а тихо бреше: дірку однієї копії приписує іншій або
// транзитивну вішає не на той пакет. Саме так сторінка «Стек» і пропустила
// дві дірки в @tiptap/core, які бачив `npm audit --omit=dev`.

describe("advisoryRequestBodies", () => {
  it("кілька копій одного пакета розносить по різних запитах", () => {
    expect(
      advisoryRequestBodies([
        { name: "ms", version: "1.0.0" },
        { name: "react", version: "19.3.1" },
        { name: "ms", version: "2.1.3" },
      ])
    ).toEqual([{ ms: ["1.0.0"], react: ["19.3.1"] }, { ms: ["2.1.3"] }]);
  });

  it("однакову пару не питає двічі", () => {
    expect(
      advisoryRequestBodies([
        { name: "ms", version: "2.1.3" },
        { name: "ms", version: "2.1.3" },
      ])
    ).toEqual([{ ms: ["2.1.3"] }]);
  });
});

describe("parseBulkAdvisories", () => {
  it("кладе дірку на ту версію, про яку питали в цьому запиті", () => {
    const found = parseBulkAdvisories({ ms: ["2.1.3"] }, {
      ms: [{ title: "ReDoS", severity: "HIGH", url: "https://github.com/advisories/GHSA-1" }],
    });
    expect([...found.entries()]).toEqual([
      ["ms@2.1.3", [{ title: "ReDoS", severity: "high", url: "https://github.com/advisories/GHSA-1" }]],
    ]);
  });

  it("незнайому важкість не губить, а вважає середньою", () => {
    const found = parseBulkAdvisories({ a: ["1.0.0"] }, { a: [{ severity: "info" }] });
    expect(found.get("a@1.0.0")).toEqual([{ title: "Вразливість", severity: "moderate", url: null }]);
  });

  it("ім'я, про яке не питали, ігнорує", () => {
    expect(parseBulkAdvisories({ a: ["1.0.0"] }, { b: [{ title: "x" }] }).size).toBe(0);
  });
});

describe("advisoriesByPackage", () => {
  const tiptapHole = { title: "XSS", severity: "moderate" as const, url: "https://github.com/advisories/GHSA-cp6q" };

  it("транзитивна дірка висить на кожному нашому пакеті, що її тягне, з позначкою звідки", () => {
    const result = advisoriesByPackage(
      [
        { name: "@tiptap/react", version: "3.30.0" },
        { name: "@tiptap/starter-kit", version: "3.30.0" },
        { name: "react", version: "19.3.1" },
      ],
      [{ name: "@tiptap/core", version: "3.30.0", via: ["@tiptap/react", "@tiptap/starter-kit"] }],
      new Map([["@tiptap/core@3.30.0", [tiptapHole]]])
    );
    const tagged = [{ ...tiptapHole, dependency: { name: "@tiptap/core", version: "3.30.0" } }];
    expect(result.get("@tiptap/react")).toEqual(tagged);
    expect(result.get("@tiptap/starter-kit")).toEqual(tagged);
    expect(result.get("react")).toEqual([]);
  });

  it("власна дірка йде першою й без позначки", () => {
    const own = { title: "RCE", severity: "critical" as const, url: null };
    const result = advisoriesByPackage(
      [{ name: "a", version: "1.0.0" }],
      [{ name: "b", version: "2.0.0", via: ["a"] }],
      new Map([
        ["a@1.0.0", [own]],
        ["b@2.0.0", [tiptapHole]],
      ])
    );
    expect(result.get("a")).toEqual([own, { ...tiptapHole, dependency: { name: "b", version: "2.0.0" } }]);
  });

  it("дірка іншої копії транзитивної не чіпляється", () => {
    const result = advisoriesByPackage(
      [{ name: "a", version: "1.0.0" }],
      [{ name: "ms", version: "2.1.3", via: ["a"] }],
      new Map([["ms@1.0.0", [tiptapHole]]])
    );
    expect(result.get("a")).toEqual([]);
  });
});
