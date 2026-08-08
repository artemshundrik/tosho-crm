import { describe, expect, it } from "vitest";

import {
  buildCaptureResponse,
  CAPTURE_TOKEN_HEADER,
  isUuid,
  MIN_TEXT_CHARS,
  parseCaptureBody,
  readHeader,
  tokenMatches,
} from "./devRequestCapture";

describe("readHeader", () => {
  it("регістр не має значення — Netlify і локальний dev віддають ключі по-різному", () => {
    expect(readHeader({ "x-capture-token": "abc" }, CAPTURE_TOKEN_HEADER)).toBe("abc");
    expect(readHeader({ "X-Capture-Token": "abc" }, CAPTURE_TOKEN_HEADER)).toBe("abc");
    expect(readHeader({ "X-CAPTURE-TOKEN": "abc" }, CAPTURE_TOKEN_HEADER)).toBe("abc");
  });

  it("немає заголовка чи заголовків узагалі — null, а не падіння", () => {
    expect(readHeader({ authorization: "Bearer x" }, CAPTURE_TOKEN_HEADER)).toBeNull();
    expect(readHeader(undefined, CAPTURE_TOKEN_HEADER)).toBeNull();
    expect(readHeader({ "x-capture-token": undefined }, CAPTURE_TOKEN_HEADER)).toBeNull();
  });
});

describe("tokenMatches", () => {
  it("збіг — так, будь-яка відмінність — ні", () => {
    expect(tokenMatches("s3cret", "s3cret")).toBe(true);
    expect(tokenMatches("s3cret", "s3creT")).toBe(false);
    expect(tokenMatches("s3cret-longer", "s3cret")).toBe(false);
    expect(tokenMatches("s3c", "s3cret")).toBe(false);
  });

  it("порожній токен ніколи не збігається — інакше «не налаштовано» = «пускаємо всіх»", () => {
    expect(tokenMatches("", "")).toBe(false);
    expect(tokenMatches("", "s3cret")).toBe(false);
    expect(tokenMatches("s3cret", "")).toBe(false);
    expect(tokenMatches(null, "s3cret")).toBe(false);
    expect(tokenMatches(undefined, undefined)).toBe(false);
  });

  it("не-ASCII токен однакової довжини в символах не валить порівняння", () => {
    // Той самий випадок, на якому timingSafeEqual кидає: довжина в символах
    // збігається, у байтах — ні. Має бути спокійне false, а не виняток.
    expect(() => tokenMatches("абвгд", "abcde")).not.toThrow();
    expect(tokenMatches("абвгд", "abcde")).toBe(false);
    expect(tokenMatches("абвгд", "абвгд")).toBe(true);
  });
});

describe("isUuid", () => {
  it("справжній uuid проходить, сміття — ні", () => {
    expect(isUuid("389719a7-1f2e-4c3b-9a8d-0b1c2d3e4f5a")).toBe(true);
    expect(isUuid("  389719A7-1F2E-4C3B-9A8D-0B1C2D3E4F5A  ")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("389719a7-1f2e-4c3b-9a8d")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("parseCaptureBody", () => {
  it("нормальне тіло — текст без країв", () => {
    const result = parseCaptureBody(JSON.stringify({ text: "  Кнопка не працює  " }));
    expect(result).toEqual({ ok: true, text: "Кнопка не працює" });
  });

  it("не-JSON, не-об'єкт і масив — 400 з людською причиною", () => {
    for (const raw of ["{не json", "[1,2,3]", '"просто рядок"', "null"]) {
      const result = parseCaptureBody(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    }
  });

  it("немає поля text або воно не рядок — 400", () => {
    for (const raw of ["{}", JSON.stringify({ text: 42 }), JSON.stringify({ txt: "щось" })]) {
      const result = parseCaptureBody(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    }
  });

  it("порожній і закороткий текст — 400, поріг рахується після обрізання країв", () => {
    for (const text of ["", "   ", "ок", "  a  "]) {
      const result = parseCaptureBody(JSON.stringify({ text }));
      expect(result.ok).toBe(false);
    }
    // Рівно на порозі — вже приймаємо.
    const edge = parseCaptureBody(JSON.stringify({ text: "abc" }));
    expect(edge).toEqual({ ok: true, text: "abc" });
    expect(MIN_TEXT_CHARS).toBe(3);
  });

  it("«полотно» обрізається до межі розбору, а не відхиляється", () => {
    const result = parseCaptureBody(JSON.stringify({ text: "я".repeat(9000) }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text.length).toBe(6000);
  });
});

describe("buildCaptureResponse", () => {
  const base = {
    number: 42,
    title: "Кнопка «Зберегти» спрацьовує лише з другого разу",
    kind: "bug" as const,
    moduleKey: "quotes",
    priority: "high" as const,
    existingFeature: null,
    url: "https://tosho.pro/dev-requests",
    drafted: true,
  };

  it("поля розібрані окремо, підписи людські", () => {
    const response = buildCaptureResponse(base);
    expect(response.number).toBe("REQ-42");
    expect(response.title).toBe(base.title);
    expect(response.kind).toBe("Не працює");
    // Підпис напрямку — з реєстру модулів, а не з власного списку.
    expect(response.module).toBe("Прорахунки");
    expect(response.priority).toBe("Терміново");
    expect(response.url).toBe("https://tosho.pro/dev-requests");
  });

  it("message придатний до показу як є: номер, назва, рядок міток, посилання", () => {
    const message = buildCaptureResponse(base).message;
    expect(message).toContain("REQ-42");
    expect(message).toContain(base.title);
    expect(message).toContain("Не працює · Прорахунки · Терміново");
    expect(message).toContain("https://tosho.pro/dev-requests");
  });

  it("невідомий напрямок — null у полі й коротший рядок, без «null» у тексті", () => {
    const response = buildCaptureResponse({ ...base, moduleKey: null, priority: "normal" });
    expect(response.module).toBeNull();
    expect(response.message).toContain("Не працює · Звичайний");
    expect(response.message).not.toContain("null");
    expect(response.message).not.toContain("·  ·");
  });

  it("вигаданий моделлю ключ напрямку не потрапляє у відповідь", () => {
    const response = buildCaptureResponse({ ...base, moduleKey: "payments" });
    expect(response.module).toBeNull();
    expect(response.message).not.toContain("payments");
  });

  it("existingFeature є — окремим ключем і рядком ПІСЛЯ номера: картку однаково створено", () => {
    const response = buildCaptureResponse({
      ...base,
      existingFeature: "Диктування — кнопка мікрофона в полі ТЗ",
    });
    expect(response.existingFeature).toBe("Диктування — кнопка мікрофона в полі ТЗ");
    expect(response.message.indexOf("REQ-42")).toBeLessThan(
      response.message.indexOf("Схоже, це вже працює")
    );
  });

  it("existingFeature немає — ключа немає взагалі, а не порожнє поле", () => {
    const response = buildCaptureResponse(base);
    expect("existingFeature" in response).toBe(false);
    expect(buildCaptureResponse({ ...base, existingFeature: "   " })).not.toHaveProperty(
      "existingFeature"
    );
  });

  it("розбір не спрацював — про це сказано вголос, картка все одно є", () => {
    const response = buildCaptureResponse({ ...base, drafted: false });
    expect(response.ok).toBe(true);
    expect(response.number).toBe("REQ-42");
    expect(response.message).toContain("Розбір не спрацював");
  });

  it("розбір спрацював — жодних попереджень у тексті", () => {
    expect(buildCaptureResponse(base).message).not.toContain("Розбір не спрацював");
  });
});
