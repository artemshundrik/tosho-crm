import { deflateSync } from "node:zlib";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { decidedAbsenceKeyboard } from "./absenceDecisionButtons";
import { absenceResultCard, bigRange } from "./absenceResultWidget";
import { buildCardWidget, initials } from "./cardWidget";
import { buildAbsenceWidget } from "./telegramWidgets";
import { celebrationCard } from "./teamCelebrationWidget";

const zipped = (html: string) => deflateSync(Buffer.from(html), { level: 9 }).length;

/** Шум, а не заливка: так webp не стиснеться до нічого й ліміт перевіряється чесно. */
async function noisyPhoto(): Promise<Buffer> {
  const size = 256;
  const raw = Buffer.alloc(size * size * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 2654435761) >>> 24;
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } }).jpeg().toBuffer();
}

describe("дати й ініціали", () => {
  it("великі дати без зайвого місяця", () => {
    expect(bigRange("2026-11-17", "2026-11-28")).toBe("17 – 28 листопада");
    expect(bigRange("2026-11-30", "2026-12-02")).toBe("30 листопада – 2 грудня");
    expect(bigRange("2026-12-05", "2026-12-05")).toBe("5 грудня");
  });
  it("ініціали без розмітки", () => {
    expect(initials("марина коваль")).toBe("МК");
    expect(initials("<b>")).toBe("B");
    expect(initials("")).toBe("•");
  });
});

describe("відповідь співробітнику", () => {
  const base = { kind: "vacation", start: "2026-11-17", end: "2026-11-28", deciderShort: "Артем Ш.", time: "10:42", comment: null, todayKey: "2026-11-10" };

  it("погоджено: зелений значок, плашки, хто вирішив", () => {
    const card = absenceResultCard({ ...base, approved: true, quotaDays: 12, remaining: 6 });
    expect(card).toMatchObject({ k: "ok", h: "Відпустку погоджено", b: "17 – 28 листопада", f: "Погоджено · Артем Ш., 10:42" });
    expect(card.p).toEqual(["12 кал. дн.", "до старту 7 днів", "лишиться 6 кал. дн."]);
  });

  it("відхилено: червоний значок і причина", () => {
    const card = absenceResultCard({ ...base, kind: "day_off", end: base.start, approved: false, comment: "Здача проєкту", quotaDays: null, remaining: null });
    expect(card).toMatchObject({ k: "no", h: "Відгул не погоджено", b: "17 листопада", q: "Здача проєкту", f: "Відхилено · Артем Ш., 10:42" });
  });

  it("кнопка після рішення каже, хто й коли", () => {
    const keyboard = decidedAbsenceKeyboard({ approved: true, deciderShort: "Артем Ш.", time: "10:42", crmUrl: "https://tosho.pro/team" });
    expect(keyboard[0][0]).toEqual({ text: "✅ Погоджено · Артем Ш., 10:42", callback_data: "absd:i" });
    expect(decidedAbsenceKeyboard({ approved: false, deciderShort: "", time: "", crmUrl: "u" })[0][0].text).toBe("✖️ Відхилено");
  });
});

describe("свята", () => {
  it("день народження: емодзі, аватарка, ім'я окремим рядком", () => {
    expect(celebrationCard({ kind: "birthday", name: "Марина Коваль", jobRole: "manager", startDate: "2024-03-01" })).toMatchObject({
      x: "🎈🎂🎉", a: true, i: "МК", b: "Марина Коваль", f: "Менеджер · у команді з березня 2024",
    });
  });
  it("річниця: велика цифра й «роки з нами», без смужок", () => {
    expect(celebrationCard({ kind: "anniversary", name: "Ігор Петренко", years: 3, jobRole: "designer", startDate: "2023-11-10" })).toMatchObject({
      n: "3", h: "роки з нами", b: "Ігор Петренко", f: "Дизайнер · з 10 листопада 2023",
    });
  });
});

describe("ліміти Telegram", () => {
  it("картка з аватаркою влазить, а без фото — ініціали", async () => {
    const photo = await noisyPhoto();
    const data = celebrationCard({ kind: "birthday", name: "Марина Коваль", jobRole: "manager", startDate: "2024-03-01" });
    const withPhoto = await buildCardWidget({ data, avatar: photo, caption: "c" });
    expect(withPhoto!.html).toContain("--av:url");
    expect(zipped(withPhoto!.html)).toBeLessThanOrEqual(3950);
    const without = await buildCardWidget({ data, caption: "c" });
    expect(without!.html).not.toContain("--av:url");
    expect(without!.html).toContain('"av":0');
  });

  it("дані в HTML не ламають тег script", async () => {
    const widget = await buildCardWidget({ data: { i: "x", h: "</script><b>" }, caption: "c" });
    expect(widget!.html).not.toContain("</script><b>");
  });

  it("аватарка в заявці: або влізла з прапорцем, або ініціали без нього", () => {
    const base = {
      title: "Заявка · відпустка", urgent: "", name: "Юлія Кубенко", range: "r", days: "", comment: "",
      windowStart: "2026-11-16", length: 14, offDays: [], todayIndex: -1, requester: { from: 1, to: 2 }, others: [], caption: "c",
    };
    const small = buildAbsenceWidget({ ...base, avatarStyle: "<style>:root{--av:url(x)}</style>" })!;
    expect(JSON.parse(small.chatData).a).toBe(1);
    const huge = buildAbsenceWidget({ ...base, avatarStyle: `<style>:root{--av:url(${"A".repeat(9000).replace(/A/g, () => String.fromCharCode(65 + Math.floor(Math.random() * 26)))})}</style>` })!;
    expect(JSON.parse(huge.chatData).a).toBeUndefined();
    expect(huge.html).not.toContain("--av:url");
  });
});
