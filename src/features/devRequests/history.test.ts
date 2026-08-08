import { describe, expect, it } from "vitest";
import {
  auditActionLabel,
  auditChangeLines,
  auditFieldLabel,
  auditValueLabel,
  toAuditEntries,
  type AuditEntry,
} from "./history";

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 1,
    actorUserId: null,
    actorName: "Артем",
    action: "update",
    changed: {},
    createdAt: "2026-08-08T10:00:00Z",
    ...overrides,
  };
}

describe("підписи полів історії", () => {
  it("відомі колонки називаються людською мовою", () => {
    expect(auditFieldLabel("module_key")).toBe("Напрямок");
    expect(auditFieldLabel("is_private")).toBe("Доступ");
  });

  it("невідому колонку показуємо як є, а не ховаємо", () => {
    // Мовчки з'їдена зміна гірша за некрасивий рядок: по історії з'ясовують,
    // хто що зробив.
    expect(auditFieldLabel("some_new_column")).toBe("some_new_column");
  });
});

describe("значення в історії", () => {
  it("коди перекладаються тими самими словами, що на дошці", () => {
    expect(auditValueLabel("status", "in_progress")).toBe("В роботі");
    expect(auditValueLabel("kind", "bug")).toBe("Не працює");
    expect(auditValueLabel("priority", "high")).toBe("Терміново");
    expect(auditValueLabel("module_key", "quotes")).toBe("Прорахунки");
  });

  /**
   * В історії «звичайний» показуємо: це відповідь на пряме питання «який був
   * пріоритет», а не мітка в ряду, який сканують очима. Правило «не
   * підписувати звичайний» стосується КАРТКИ.
   */
  it("«звичайний» пріоритет в історії підписаний", () => {
    expect(auditValueLabel("priority", "normal")).toBe("Звичайний");
  });

  it("порожнє значення так і зветься", () => {
    expect(auditValueLabel("body", null)).toBe("порожньо");
    expect(auditValueLabel("body", "")).toBe("порожньо");
  });

  it("прапорці читаються як стан, а не як true/false", () => {
    expect(auditValueLabel("is_private", true)).toBe("лише власник і СЕО");
    expect(auditValueLabel("is_private", false)).toBe("вся команда");
    // auto_classified у базі означає «поставив агент», людині ж цікаве
    // протилежне — чи вже підтвердили.
    expect(auditValueLabel("auto_classified", true)).toBe("ні, поставив агент");
    expect(auditValueLabel("auto_classified", false)).toBe("так, підтверджено людиною");
  });

  it("довгий текст обрізається, щоб не рвати стрічку", () => {
    const long = "а".repeat(200);
    const shown = auditValueLabel("body", long);
    expect(shown.length).toBeLessThanOrEqual(80);
    expect(shown.endsWith("…")).toBe(true);
  });
});

describe("рядки однієї зміни", () => {
  it("збирає «поле: було → стало»", () => {
    expect(
      auditChangeLines(entry({ changed: { priority: { from: "normal", to: "high" } } }))
    ).toEqual([{ field: "priority", label: "Пріоритет", from: "Звичайний", to: "Терміново" }]);
  });

  it("технічні колонки в стрічку не потрапляють", () => {
    const lines = auditChangeLines(
      entry({
        changed: {
          workspace_id: { from: null, to: "uuid" },
          team_id: { from: null, to: "uuid" },
          status: { from: "triage", to: "queued" },
        },
      })
    );
    expect(lines.map((line) => line.field)).toEqual(["status"]);
  });

  it("порожня зміна дає порожній список, а не падіння", () => {
    expect(auditChangeLines(entry())).toEqual([]);
  });
});

describe("дія без переліку полів", () => {
  it("створення й видалення підписані окремо", () => {
    expect(auditActionLabel("insert")).toBe("Картку створено");
    expect(auditActionLabel("delete")).toBe("Картку видалено");
    expect(auditActionLabel("update")).toBe("Оновлено");
  });
});

/**
 * RPC віддає jsonb, тобто для типів це просто `Json`. Усе, що прийшло, має
 * пережити розбір: історія — додаткова секція, і вона НЕ має права валити
 * дровер, якщо база відповіла не тим.
 */
describe("розбір відповіді аудиту", () => {
  it("нормальні записи проходять", () => {
    expect(
      toAuditEntries([
        {
          id: 7,
          actorUserId: "u1",
          actorName: "Артем",
          action: "update",
          changed: { status: { from: "triage", to: "queued" } },
          createdAt: "2026-08-08T10:00:00Z",
        },
      ])
    ).toEqual([
      {
        id: 7,
        actorUserId: "u1",
        actorName: "Артем",
        action: "update",
        changed: { status: { from: "triage", to: "queued" } },
        createdAt: "2026-08-08T10:00:00Z",
      },
    ]);
  });

  it("сміття не валить розбір", () => {
    expect(toAuditEntries(null)).toEqual([]);
    expect(toAuditEntries("не масив")).toEqual([]);
    expect(toAuditEntries([null, 5, "рядок"])).toEqual([]);
  });

  it("запис без дати пропускаємо — рядок «undefined» гірший за його відсутність", () => {
    expect(toAuditEntries([{ id: 1, action: "update" }])).toEqual([]);
  });

  it("відсутні необов'язкові поля стають безпечними значеннями", () => {
    expect(toAuditEntries([{ id: 2, createdAt: "2026-08-08T10:00:00Z" }])).toEqual([
      {
        id: 2,
        actorUserId: null,
        actorName: null,
        action: "update",
        changed: {},
        createdAt: "2026-08-08T10:00:00Z",
      },
    ]);
  });
});
