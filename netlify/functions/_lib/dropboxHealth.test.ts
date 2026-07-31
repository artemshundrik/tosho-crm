import { describe, expect, it } from "vitest";

import {
  hasDropboxProblems,
  hasMarkedFiles,
  normalizeFolderName,
  type DropboxHealth,
} from "./dropboxHealth";

function health(overrides: Partial<DropboxHealth> = {}): DropboxHealth {
  return {
    folders: 119,
    linkedCustomers: 89,
    linkedLeads: 25,
    brokenLinks: [],
    orphanFolders: [],
    duplicateFolders: [],
    drifted: [],
    approvedNotInDropbox: 0,
    approvedWithoutMarkedFiles: 0,
    approvedTotal: 238,
    taskStatsIncluded: true,
    ...overrides,
  };
}

describe("hasMarkedFiles", () => {
  it("не вважає відміченою задачу, де ключ є, а значення null", () => {
    // Саме ця плутанина ключа зі значенням дала 51% замість 18%.
    expect(hasMarkedFiles({ selected_design_output_file_id: null })).toBe(false);
  });

  it("не вважає відміченою задачу з порожніми списками", () => {
    expect(
      hasMarkedFiles({
        selected_visual_output_file_ids: [],
        selected_layout_output_file_ids: [],
        selected_design_output_file_ids: [],
      })
    ).toBe(false);
  });

  it("не вважає відміченою задачу без жодного з полів", () => {
    expect(hasMarkedFiles({})).toBe(false);
  });

  it("рахує відміткою непорожній список будь-якого типу", () => {
    expect(hasMarkedFiles({ selected_visual_output_file_ids: ["a"] })).toBe(true);
    expect(hasMarkedFiles({ selected_layout_output_file_ids: ["a"] })).toBe(true);
    expect(hasMarkedFiles({ selected_design_output_file_ids: ["a"] })).toBe(true);
  });

  it("рахує відміткою старе одиночне поле з непорожнім рядком", () => {
    expect(hasMarkedFiles({ selected_design_output_file_id: "file-1" })).toBe(true);
    expect(hasMarkedFiles({ selected_design_output_file_id: "   " })).toBe(false);
  });
});

describe("hasDropboxProblems", () => {
  it("мовчить, коли зв'язок цілий", () => {
    expect(hasDropboxProblems(health())).toBe(false);
  });

  it("НЕ вважає проблемою затверджені задачі поза Dropbox", () => {
    // Перенесення поки ручне: щойно затверджена задача законно висить без
    // копії. Якби це світило червоним, сигнал горів би завжди.
    expect(hasDropboxProblems(health({ approvedNotInDropbox: 17 }))).toBe(false);
  });

  it("НЕ вважає проблемою теки без власника й розбіжність назв", () => {
    expect(
      hasDropboxProblems(
        health({ orphanFolders: ["Спайс тім"], drifted: [{ crmName: "КОЛЬЧУГА (Kolchuga)", folderName: "Kolchuga" }] })
      )
    ).toBe(false);
  });

  it("бачить розірвану прив'язку", () => {
    expect(
      hasDropboxProblems(health({ brokenLinks: [{ name: "Belok.ua", path: "…/Belok.ua", kind: "customer" }] }))
    ).toBe(true);
  });

  it("бачить дубль тек", () => {
    expect(hasDropboxProblems(health({ duplicateFolders: [["LG", "LG (Limagrain)"]] }))).toBe(true);
  });
});

describe("normalizeFolderName", () => {
  it("зводить кириличні гомогліфи до латиниці", () => {
    // «Wookiе» з кириличною «е» і «Wookie» з латинською — один клієнт.
    expect(normalizeFolderName("Wookiе")).toBe(normalizeFolderName("Wookie"));
  });

  it("ігнорує регістр, пробіли й розділові", () => {
    expect(normalizeFolderName("ФОП Колосов М.А.")).toBe(normalizeFolderName("фоп  колосов, м-а"));
  });

  it("НЕ зводить кирилицю до транслітерації", () => {
    // «Норест Агро» і «Norest Agro» — різні рядки, і вгадувати тут не можна:
    // зіставлення за транслітерацією поклало б теку не тому клієнту.
    expect(normalizeFolderName("Норест Агро")).not.toBe(normalizeFolderName("Norest Agro"));
  });
});
