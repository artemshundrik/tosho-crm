import { describe, expect, it } from "vitest";
import {
  buildMarkupReminder,
  isMarkupReminderDue,
  kyivDateKey,
  markupDaysWaiting,
  markupReminderHref,
  markupReminderPause,
} from "./quoteMarkupReminder";

// Жовтень 2026 — ще літній час, Київ = UTC+3. 09.10.2026 — п'ятниця.
const FRIDAY_0905_KYIV = new Date("2026-10-09T06:05:00Z");
// Справжній запит із TS-1026-0002: 01.10 о 16:34 за Києвом.
const REAL_REQUEST = "2026-10-01T13:34:56Z";

const plain = (value: string) => value.replace(/\s/g, " ");

describe("коли нагадувати", () => {
  it("робочий ранок — можна", () => {
    expect(markupReminderPause(FRIDAY_0905_KYIV)).toBeNull();
  });

  it("о 06:00 за Києвом — тихі години, хоч у UTC уже ранок", () => {
    expect(markupReminderPause(new Date("2026-10-09T03:00:00Z"))).toBe("quiet-hours");
  });

  it("субота й неділя — тиша навіть удень", () => {
    expect(markupReminderPause(new Date("2026-10-10T09:00:00Z"))).toBe("weekend");
    expect(markupReminderPause(new Date("2026-10-11T09:00:00Z"))).toBe("weekend");
  });

  it("понеділок зранку знову можна — запит із п'ятниці не губиться", () => {
    expect(markupReminderPause(new Date("2026-10-12T06:00:00Z"))).toBeNull();
    expect(isMarkupReminderDue("2026-10-09T14:00:00Z", new Date("2026-10-12T06:00:00Z"))).toBe(true);
  });
});

describe("який запит уже пора нагадати", () => {
  it("той, що висить вісім днів, — так", () => {
    expect(isMarkupReminderDue(REAL_REQUEST, FRIDAY_0905_KYIV)).toBe(true);
    expect(markupDaysWaiting(REAL_REQUEST, FRIDAY_0905_KYIV)).toBe(8);
  });

  it("поданий сьогодні — ні: перший пінг ще свіжий", () => {
    expect(isMarkupReminderDue("2026-10-09T06:00:00Z", new Date("2026-10-09T15:00:00Z"))).toBe(false);
  });

  it("межа доби — київська: 00:30 Києва це вже сьогодні, хоч у UTC ще вчора", () => {
    const afterKyivMidnight = "2026-10-08T21:30:00Z";
    expect(kyivDateKey(new Date(afterKyivMidnight))).toBe("2026-10-09");
    expect(isMarkupReminderDue(afterKyivMidnight, FRIDAY_0905_KYIV)).toBe(false);
  });

  it("23:30 Києва напередодні — уже вчорашній, нагадуємо", () => {
    expect(isMarkupReminderDue("2026-10-08T20:30:00Z", FRIDAY_0905_KYIV)).toBe(true);
    expect(markupDaysWaiting("2026-10-08T20:30:00Z", FRIDAY_0905_KYIV)).toBe(1);
  });

  it("зіпсована дата не нагадується", () => {
    expect(isMarkupReminderDue("not-a-date", FRIDAY_0905_KYIV)).toBe(false);
  });
});

describe("посилання", () => {
  it("несе reminder= і дату дня — інакше дедуплікація не спрацює", () => {
    const href = markupReminderHref("ef02f8fd-a461-4c55-ad7c-79614768b1cc", FRIDAY_0905_KYIV);
    expect(href.startsWith("/orders/estimates/ef02f8fd-a461-4c55-ad7c-79614768b1cc?reminder=quote-markup-pending")).toBe(
      true
    );
    expect(decodeURIComponent(href)).toContain(
      "reminder=quote-markup-pending:ef02f8fd-a461-4c55-ad7c-79614768b1cc:2026-10-09"
    );
  });

  it("наступного дня посилання інше — тобто й нагадування нове", () => {
    const today = markupReminderHref("q", FRIDAY_0905_KYIV);
    const monday = markupReminderHref("q", new Date("2026-10-12T06:00:00Z"));
    expect(today).not.toBe(monday);
  });
});

describe("текст", () => {
  const run = { label: "Мобільний стенд X-банер · 16 шт.", price: "16 323,84 грн (1 020,24 грн/шт., 16,9 %)" };

  it("заголовок каже, скільки днів висить, і яка картка", () => {
    const text = buildMarkupReminder({
      quoteNumber: "TS-1026-0002",
      requesterName: "Іван Савісько",
      runs: [run],
      floorRate: 20,
      requestedAt: REAL_REQUEST,
      now: FRIDAY_0905_KYIV,
    });
    expect(plain(text.title)).toBe("Ціна чекає рішення 8 днів — #TS-1026-0002");
    expect(text.body).toContain("Іван Савісько просить підтвердити ціну у #TS-1026-0002");
    expect(text.body).toContain(run.price);
    expect(text.body).toContain("з 01.10");
    expect(text.body).toContain("Дно — 20 %.");
    // Влад просив не підписувати «накрутку» (REQ-325).
    expect(text.title.toLowerCase()).not.toContain("накрутк");
  });

  it("один день — «1 день», без імені — «Менеджер»", () => {
    const text = buildMarkupReminder({
      quoteNumber: null,
      requesterName: "  ",
      runs: [run, run],
      floorRate: 20,
      requestedAt: "2026-10-08T12:00:00Z",
      now: FRIDAY_0905_KYIV,
    });
    expect(plain(text.title)).toBe("Ціна чекає рішення 1 день — прорахунку");
    expect(text.body.startsWith("Менеджер просить підтвердити ціни у прорахунку")).toBe(true);
  });
});
