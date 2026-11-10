import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildEveningWidget, buildTeamWidget, fitCaption, plural } from "./telegramWidgets";

/**
 * Віджет, що не вліз у ліміти Telegram, не падає — звіт мовчки йде запасним
 * шляхом. Тому ліміти перевіряються тут, а не на проді.
 */

const zipped = (html: string) => deflateSync(Buffer.from(html), { level: 9 }).length;

describe("plural", () => {
  const forms: [string, string, string] = ["лід", "ліди", "лідів"];
  it("1, 2–4, 5+ і 11–14", () => {
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 111].map((n) => plural(n, forms))).toEqual([
      "лід", "ліди", "ліди", "лідів", "лідів", "лідів", "лідів", "лід", "ліди", "лідів", "лідів",
    ]);
  });
});

describe("fitCaption", () => {
  it("відкидає хвостові блоки, перший лишає", () => {
    const caption = fitCaption(["<b>головне</b>", "x".repeat(50), "y".repeat(50)], 70);
    expect(caption).toBe(`<b>головне</b>\n\n${"x".repeat(50)}`);
  });

  it("задовгий перший блок обрізається без розмітки", () => {
    const caption = fitCaption([`<b>${"z".repeat(30)}</b>`], 10);
    expect(caption).toBe(`${"z".repeat(9)}…`);
  });
});

describe("buildEveningWidget", () => {
  const period = {
    total: { min: 61000, max: 67000 },
    previousMax: 38500,
    current: [10000, 20000, 30000, 67000],
    previous: [5000, 9000, 20000],
    totalPoints: 7,
    label: "затверджено за 7 днів",
    against: "до попередніх 7 днів",
  };

  it("вміщується в обидва ліміти", () => {
    const widget = buildEveningWidget({
      title: "Підсумок дня",
      date: "10 листопада",
      month: { ...period, current: Array.from({ length: 31 }, (_, i) => i * 9000), totalPoints: 31 },
      week: period,
      tiles: [[2, "затверджено сьогодні"], [3, "нові ліди"]],
      caption: "c",
    });
    expect(widget).not.toBeNull();
    expect(Buffer.byteLength(widget!.chatData)).toBeLessThanOrEqual(1024);
    expect(zipped(widget!.html)).toBeLessThan(4096);
  });
});

describe("buildTeamWidget", () => {
  const person = (name: string, from: number, minutes: number) => ({
    name,
    minutes,
    spans: [{ from, to: from + minutes }],
    avatar: null,
  });

  it("короткі заходи — у підсумковий рядок, а не окремим рядком", async () => {
    const widget = await buildTeamWidget({
      date: "9 листопада",
      people: [person("Іван Сидоренко", 600, 99), person("Юлія Коваль", 700, 3)],
      absent: ["Олена К. (відпустка до 14.11)"],
      caption: "c",
    });
    const data = JSON.parse(widget!.chatData);
    expect(data.p).toHaveLength(1);
    expect(data.p[0][0]).toBe("Іван С.");
    expect(data.o).toBe("Заходили ненадовго: Юлія К.\nНе було: Олена К. (відпустка до 14.11)");
  });

  it("шкала: 72 слоти по три на символ, година вікна — від першого заходу", async () => {
    const widget = await buildTeamWidget({
      date: "d",
      people: [person("А Б", 9 * 60, 10)],
      absent: [],
      caption: "c",
    });
    const [, , slots] = JSON.parse(widget!.chatData).p[0];
    expect(JSON.parse(widget!.chatData).a).toBe(9);
    expect(slots).toHaveLength(24);
    // перший слот повний (рівень 3), решта порожні: 3<<4 = 48 → «w»
    expect(slots[0]).toBe("w");
    expect(slots.slice(1)).toBe("A".repeat(23));
  });

  it("забагато людей — дані все одно в межах 1024 байтів", async () => {
    const people = Array.from({ length: 30 }, (_, i) =>
      person(`Довгеімʼя${i} Прізвище`, 540 + i * 7, 30 + i)
    );
    const widget = await buildTeamWidget({ date: "d", people, absent: [], caption: "c" });
    expect(Buffer.byteLength(widget!.chatData)).toBeLessThanOrEqual(1024);
    expect(JSON.parse(widget!.chatData).o).toMatch(/^Ще: /);
  });

  it("нікого довше п'яти хвилин — віджета немає, лишається запасний звіт", async () => {
    const widget = await buildTeamWidget({ date: "d", people: [person("А", 600, 2)], absent: [], caption: "c" });
    expect(widget).toBeNull();
  });
});
