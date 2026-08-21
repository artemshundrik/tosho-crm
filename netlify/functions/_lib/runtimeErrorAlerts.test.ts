import { describe, expect, it } from "vitest";

import {
  alertsFingerprint,
  buildRuntimeErrorAlerts,
  formatRuntimeErrorAlert,
  signaturesOf,
} from "./runtimeErrorAlerts";

/**
 * Логіку тут перевіряємо тестами, а не спробою: щоб побачити алерт живцем,
 * потрібна СПРАВЖНЯ нова помилка в проді, а спеціально ламати CRM заради
 * перевірки сповіщення — надто дорогий спосіб.
 */

const row = (message: string, actor: string, at = "2026-08-21T10:00:00Z", route = "/design") => ({
  created_at: at,
  actor_name: actor,
  metadata: { message, route_pattern: route },
});

describe("алерти про помилки в браузері", () => {
  it("пише про помилку, якої раніше не було", () => {
    const alerts = buildRuntimeErrorAlerts({
      recent: [row("Cannot read properties of undefined (reading 'url')", "Артем")],
      knownSignatures: ["щось зовсім інше"],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("new");
    expect(alerts[0].group.count).toBe(1);
  });

  it("мовчить про помилку, яка вже траплялась і зачепила одну людину", () => {
    const message = "Cannot read properties of undefined (reading 'state')";
    const alerts = buildRuntimeErrorAlerts({
      recent: [row(message, "Артем"), row(message, "Артем")],
      knownSignatures: signaturesOf([row(message, "Артем", "2026-08-01T10:00:00Z")]),
    });
    expect(alerts).toEqual([]);
  });

  it("повертається до відомої помилки, коли вона зачепила трьох і більше", () => {
    const message = "Cannot read properties of undefined (reading 'state')";
    const alerts = buildRuntimeErrorAlerts({
      recent: [row(message, "Артем"), row(message, "Дар'я"), row(message, "Лєна")],
      knownSignatures: signaturesOf([row(message, "Артем", "2026-08-01T10:00:00Z")]),
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("mass");
    expect(alerts[0].group.people).toHaveLength(3);
  });

  it("не розпадається на різні помилки через номер чанка", () => {
    const alerts = buildRuntimeErrorAlerts({
      recent: [row("Loading chunk 42 failed", "Артем"), row("Loading chunk 77 failed", "Дар'я")],
      knownSignatures: [],
    });
    // Одна помилка, а не дві: номер у тексті — це не різниця по суті.
    expect(alerts).toHaveLength(1);
    expect(alerts[0].group.count).toBe(2);
  });

  it("НЕ склеює помилки, що відрізняються іменем поля", () => {
    const alerts = buildRuntimeErrorAlerts({
      recent: [
        row("Cannot read properties of undefined (reading 'url')", "Артем"),
        row("Cannot read properties of undefined (reading 'state')", "Артем"),
      ],
      knownSignatures: [],
    });
    // Різні поля — різні місця в коді, і склеювати їх означало б втратити
    // другу помилку назавжди.
    expect(alerts).toHaveLength(2);
  });

  it("відбиток не залежить від порядку, але залежить від складу", () => {
    const a = buildRuntimeErrorAlerts({
      recent: [row("Помилка A", "Артем"), row("Помилка B", "Дар'я")],
      knownSignatures: [],
    });
    const b = buildRuntimeErrorAlerts({
      recent: [row("Помилка B", "Дар'я"), row("Помилка A", "Артем")],
      knownSignatures: [],
    });
    expect(alertsFingerprint(a)).toBe(alertsFingerprint(b));

    const c = buildRuntimeErrorAlerts({ recent: [row("Помилка A", "Артем")], knownSignatures: [] });
    expect(alertsFingerprint(c)).not.toBe(alertsFingerprint(a));
  });

  it("у повідомленні є текст помилки, скільки разів, хто і де", () => {
    const alerts = buildRuntimeErrorAlerts({
      recent: [row("Щось поламалось", "Артем", "2026-08-21T10:00:00Z", "/design/:id")],
      knownSignatures: [],
    });
    const text = formatRuntimeErrorAlert(alerts, { appUrl: "https://tosho.pro", escape: (v) => v });
    expect(text).toContain("Нова помилка в браузері");
    expect(text).toContain("Щось поламалось");
    expect(text).toContain("1 раз");
    expect(text).toContain("Артем");
    expect(text).toContain("/design/:id");
    expect(text).toContain("https://tosho.pro/dev/health");
  });

  it("довгий список ріже й каже, скільки лишилось", () => {
    const recent = Array.from({ length: 8 }, (_, i) => row(`Помилка номер ${"x".repeat(i + 1)}`, "Артем"));
    const alerts = buildRuntimeErrorAlerts({ recent, knownSignatures: [] });
    const text = formatRuntimeErrorAlert(alerts, { appUrl: "https://tosho.pro", escape: (v) => v });
    expect(alerts).toHaveLength(8);
    expect(text).toContain("…і ще 3");
  });
});
