import { describe, expect, it } from "vitest";

import {
  applyDesignOutputVersion,
  parseDesignOutputVersion,
  resolveDesignOutputVersion,
  stripVersionSuffix,
} from "./designOutputVersion";

const at = (iso: string) => iso;

describe("resolveDesignOutputVersion", () => {
  it("перше завантаження — перша версія", () => {
    expect(resolveDesignOutputVersion({})).toBe(1);
    expect(resolveDesignOutputVersion({ existingFiles: [], changeRequests: [] })).toBe(1);
  });

  it("перший макет після трьох правок по візуалах — це його ПЕРША версія", () => {
    // Правки живуть на задачі, але макета ще не було: рахунок ведеться
    // в межах свого виду файлів.
    expect(
      resolveDesignOutputVersion({
        existingFiles: [],
        changeRequests: [
          { status: "pending", requested_at: at("2026-08-01T10:00:00Z") },
          { status: "pending", requested_at: at("2026-08-02T10:00:00Z") },
          { status: "pending", requested_at: at("2026-08-03T10:00:00Z") },
        ],
      })
    ).toBe(1);
  });

  it("нова правка після завантаження піднімає номер на один", () => {
    expect(
      resolveDesignOutputVersion({
        existingFiles: [{ file_name: "банер.webp", created_at: at("2026-08-01T09:00:00Z") }],
        changeRequests: [{ status: "pending", requested_at: at("2026-08-01T12:00:00Z") }],
      })
    ).toBe(2);
  });

  it("кілька правок одним списком дають ОДНУ нову версію, а не три", () => {
    expect(
      resolveDesignOutputVersion({
        existingFiles: [{ file_name: "банер.webp", created_at: at("2026-08-01T09:00:00Z") }],
        changeRequests: [
          { status: "pending", requested_at: at("2026-08-01T12:00:00Z") },
          { status: "pending", requested_at: at("2026-08-01T12:05:00Z") },
          { status: "pending", requested_at: at("2026-08-01T12:09:00Z") },
        ],
      })
    ).toBe(2);
  });

  it("перезалив у тому самому раунді лишається тією ж версією", () => {
    expect(
      resolveDesignOutputVersion({
        existingFiles: [{ file_name: "банер_v2.webp", created_at: at("2026-08-02T09:00:00Z") }],
        changeRequests: [{ status: "pending", requested_at: at("2026-08-01T12:00:00Z") }],
      })
    ).toBe(2);
  });

  it("номер росте від найновішого наявного файлу, а не від першого", () => {
    expect(
      resolveDesignOutputVersion({
        existingFiles: [
          { file_name: "банер.webp", created_at: at("2026-08-01T09:00:00Z") },
          { file_name: "банер_v2.webp", created_at: at("2026-08-02T09:00:00Z") },
          { file_name: "банер_v3.webp", created_at: at("2026-08-03T09:00:00Z") },
        ],
        changeRequests: [
          { status: "pending", requested_at: at("2026-08-01T12:00:00Z") },
          { status: "pending", requested_at: at("2026-08-04T12:00:00Z") },
        ],
      })
    ).toBe(4);
  });

  it("відхилена правка нової версії не породжує", () => {
    expect(
      resolveDesignOutputVersion({
        existingFiles: [{ file_name: "банер.webp", created_at: at("2026-08-01T09:00:00Z") }],
        changeRequests: [{ status: "rejected", requested_at: at("2026-08-02T12:00:00Z") }],
      })
    ).toBe(1);
  });

  it("файли, залиті до цієї зміни, вважаються першою версією", () => {
    expect(
      resolveDesignOutputVersion({
        existingFiles: [{ file_name: "ToSho_футболка_Легія.webp", created_at: at("2026-07-01T09:00:00Z") }],
        changeRequests: [{ status: "pending", requested_at: at("2026-07-02T09:00:00Z") }],
      })
    ).toBe(2);
  });

  it("биті дати не валять розрахунок", () => {
    expect(
      resolveDesignOutputVersion({
        existingFiles: [{ file_name: "банер.webp", created_at: "не-дата" }],
        changeRequests: [{ status: "pending", requested_at: null }],
      })
    ).toBe(1);
  });
});

describe("applyDesignOutputVersion", () => {
  it("перша версія лишає ім'я як є", () => {
    expect(applyDesignOutputVersion("ToSho_футболка_Легія.webp", 1)).toBe("ToSho_футболка_Легія.webp");
  });

  it("суфікс іде ПЕРЕД розширенням, а не в кінець", () => {
    expect(applyDesignOutputVersion("ToSho_футболка_Легія.webp", 2)).toBe("ToSho_футболка_Легія_v2.webp");
    expect(applyDesignOutputVersion("макет.ai", 3)).toBe("макет_v3.ai");
  });

  it("складене розширення не ламається — версія до останньої крапки", () => {
    expect(applyDesignOutputVersion("банер.final.pdf", 2)).toBe("банер.final_v2.pdf");
  });

  it("файл без розширення теж отримує версію", () => {
    expect(applyDesignOutputVersion("Готово", 2)).toBe("Готово_v2");
  });

  it("ручна позначка не подвоюється — замінюється канонічною", () => {
    expect(applyDesignOutputVersion("логотип_v2.png", 3)).toBe("логотип_v3.png");
    expect(applyDesignOutputVersion("логотип v 2.png", 3)).toBe("логотип_v3.png");
    expect(applyDesignOutputVersion("логотип-в2.png", 3)).toBe("логотип_v3.png");
  });

  it("хвіст від повторного скачування «(1)» зрізається", () => {
    expect(applyDesignOutputVersion("банер (1).webp", 2)).toBe("банер_v2.webp");
    expect(applyDesignOutputVersion("банер_v2 (1).webp", 3)).toBe("банер_v3.webp");
  });

  it("голе число — це варіант, а не версія: не чіпаємо", () => {
    expect(applyDesignOutputVersion("Мокап 2.webp", 2)).toBe("Мокап 2_v2.webp");
  });

  it("ім'я, що складається лише з позначки, не перетворюється на порожнє", () => {
    expect(applyDesignOutputVersion("v2.webp", 3)).toBe("v2_v3.webp");
  });

  it("сміттєва версія падає на першу, а не на «_vNaN»", () => {
    expect(applyDesignOutputVersion("макет.ai", Number.NaN)).toBe("макет.ai");
    expect(applyDesignOutputVersion("макет.ai", 0)).toBe("макет.ai");
    expect(applyDesignOutputVersion("макет.ai", 2.7)).toBe("макет_v2.ai");
  });

  it("порожнє ім'я лишається порожнім", () => {
    expect(applyDesignOutputVersion("", 2)).toBe("");
  });
});

describe("parseDesignOutputVersion", () => {
  it("читає версію назад з імені", () => {
    expect(parseDesignOutputVersion("ToSho_футболка_v2.webp")).toBe(2);
    expect(parseDesignOutputVersion("макет_v12.ai")).toBe(12);
  });

  it("файл без версії — null (v1 або завантажений до цієї зміни)", () => {
    expect(parseDesignOutputVersion("ToSho_футболка.webp")).toBeNull();
    expect(parseDesignOutputVersion("Мокап 2.webp")).toBeNull();
    expect(parseDesignOutputVersion(null)).toBeNull();
    expect(parseDesignOutputVersion("")).toBeNull();
  });

  it("те, що записали, те й читаємо — обидві функції про одне", () => {
    const named = applyDesignOutputVersion("ToSho_футболка_Легія.webp", 4);
    expect(parseDesignOutputVersion(named)).toBe(4);
  });
});

describe("stripVersionSuffix", () => {
  it("зрізає лише хвіст, середину імені не чіпає", () => {
    expect(stripVersionSuffix("v2 банер для Легії")).toBe("v2 банер для Легії");
    expect(stripVersionSuffix("банер для Легії v2")).toBe("банер для Легії");
  });
});
