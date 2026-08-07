import { describe, expect, it } from "vitest";

import { resolveTeamTab } from "./teamTabs";

const tabFor = (query: string) => resolveTeamTab(new URLSearchParams(query));

describe("resolveTeamTab", () => {
  it("без параметрів — «Люди», як і було", () => {
    expect(tabFor("")).toBe("people");
  });

  it("явна вкладка з посилання виграє", () => {
    expect(tabFor("tab=requests")).toBe("requests");
    expect(tabFor("tab=calendar")).toBe("calendar");
    expect(tabFor("tab=people")).toBe("people");
  });

  it("сміття у tab не ламає сторінку", () => {
    expect(tabFor("tab=нема-такої")).toBe("people");
  });

  it("СТАРІ сповіщення без tab: заявка без рішення веде в «Запити»", () => {
    // Такий href уже лежить у дзвіночках — переписати його в базі не можна.
    const href = `reminder=${encodeURIComponent("team-event:absence-pending:5f0d:2026-08-07")}`;
    expect(tabFor(href)).toBe("requests");
  });

  it("СТАРІ сповіщення про факт відсутності ведуть у календар", () => {
    for (const key of ["absence-start", "absence-end", "absence-single"]) {
      const href = `reminder=${encodeURIComponent(`team-event:${key}:5f0d:2026-08-07`)}`;
      expect(tabFor(href)).toBe("calendar");
    }
  });

  it("дні народження й річниці лишаються на «Людях» — картка подій там", () => {
    expect(tabFor(`reminder=${encodeURIComponent("team-event:birthday:5f0d:2026-08-07")}`)).toBe("people");
    expect(tabFor(`reminder=${encodeURIComponent("team-event:anniversary:5f0d:2026-08-07")}`)).toBe("people");
  });

  it("явний tab сильніший за здогад із reminder", () => {
    const query = `tab=calendar&reminder=${encodeURIComponent("team-event:absence-pending:5f0d:2026-08-07")}`;
    expect(tabFor(query)).toBe("calendar");
  });
});
