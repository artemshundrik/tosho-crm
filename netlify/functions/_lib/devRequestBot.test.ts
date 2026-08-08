import { describe, expect, it } from "vitest";

import {
  buildDevRequestBody,
  buildDevRequestReply,
  formatRequestNumber,
  isTaskCommand,
} from "./devRequestBot";

describe("isTaskCommand", () => {
  it("обидва входи заводять картку", () => {
    expect(isTaskCommand("/задача")).toBe(true);
    expect(isTaskCommand("/task")).toBe(true);
  });

  it("інші команди не чіпаємо — стара поведінка має лишитись", () => {
    expect(isTaskCommand("/menu")).toBe(false);
    expect(isTaskCommand("/start")).toBe(false);
    expect(isTaskCommand("/absence")).toBe(false);
    expect(isTaskCommand(null)).toBe(false);
    expect(isTaskCommand(undefined)).toBe(false);
  });
});

describe("buildDevRequestBody", () => {
  it("власна думка — тіло як є, без приписок", () => {
    expect(buildDevRequestBody({ body: "Опис проблеми.", forwarded: false })).toBe("Опис проблеми.");
  });

  it("переслане з відомим автором — слід джерела лишається в тілі", () => {
    expect(
      buildDevRequestBody({ body: "Опис проблеми.", forwarded: true, forwardedFrom: "Наталя Петренко" })
    ).toBe("Опис проблеми.\n\nПереслано з Telegram, автор — Наталя Петренко.");
  });

  it("переслане з прихованим автором — приписка без імені, а не «автор — null»", () => {
    expect(buildDevRequestBody({ body: "Опис.", forwarded: true, forwardedFrom: null })).toBe(
      "Опис.\n\nПереслано з Telegram."
    );
    expect(buildDevRequestBody({ body: "Опис.", forwarded: true, forwardedFrom: "   " })).toBe(
      "Опис.\n\nПереслано з Telegram."
    );
  });

  it("порожній опис від моделі — лишається сама приписка, без порожніх рядків зверху", () => {
    expect(buildDevRequestBody({ body: "  ", forwarded: true, forwardedFrom: "Сергій" })).toBe(
      "Переслано з Telegram, автор — Сергій."
    );
    expect(buildDevRequestBody({ body: "  ", forwarded: false })).toBe("");
  });
});

describe("buildDevRequestReply", () => {
  const base = {
    number: 42,
    title: "Кнопка «Зберегти» спрацьовує лише з другого разу",
    kind: "bug" as const,
    moduleKey: "quotes",
    priority: "high" as const,
    existingFeature: null,
  };

  it("номер, назва й людський рядок «тип · напрямок · пріоритет»", () => {
    const text = buildDevRequestReply(base);
    expect(text).toContain("REQ-42");
    expect(text).toContain("Кнопка «Зберегти» спрацьовує лише з другого разу");
    // Підпис напрямку береться з реєстру модулів, а не з власного списку.
    expect(text).toContain("Не працює · Прорахунки · Терміново");
  });

  it("немає напрямку — рядок просто коротший, без «null» і зайвих роздільників", () => {
    const text = buildDevRequestReply({ ...base, moduleKey: null, priority: "normal" });
    expect(text).toContain("Не працює · Звичайний");
    expect(text).not.toContain("null");
    expect(text).not.toContain("·  ·");
  });

  it("вигаданий моделлю ключ напрямку не потрапляє в текст", () => {
    const text = buildDevRequestReply({ ...base, moduleKey: "payments" });
    expect(text).not.toContain("payments");
    expect(text).toContain("Не працює · Терміново");
  });

  it("«схоже, це вже працює» стоїть ПІСЛЯ номера — картку однаково створено", () => {
    const text = buildDevRequestReply({
      ...base,
      existingFeature: "Диктування — кнопка мікрофона в полі ТЗ",
    });
    expect(text.indexOf("REQ-42")).toBeLessThan(text.indexOf("Схоже, це вже працює"));
    expect(text).toContain("Схоже, це вже працює: Диктування — кнопка мікрофона в полі ТЗ");
  });

  it("HTML із назви екранується — parse_mode=HTML не має ламатись про <b> у тексті", () => {
    const text = buildDevRequestReply({ ...base, title: "Ціна <b>без</b> ПДВ & знижка" });
    expect(text).toContain("Ціна &lt;b&gt;без&lt;/b&gt; ПДВ &amp; знижка");
    // Власна розмітка при цьому лишається живою.
    expect(text).toContain("<b>REQ-42</b>");
  });

  it("екранується й підказка, яку склала модель", () => {
    const text = buildDevRequestReply({ ...base, existingFeature: "Фільтр <усі> замовлення" });
    expect(text).toContain("Фільтр &lt;усі&gt; замовлення");
  });
});

describe("formatRequestNumber", () => {
  it("той самий формат, що на дошці", () => {
    expect(formatRequestNumber(1)).toBe("REQ-1");
    expect(formatRequestNumber(326)).toBe("REQ-326");
  });
});
