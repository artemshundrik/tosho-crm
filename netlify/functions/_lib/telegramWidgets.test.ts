import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { mondayOf, windowLength } from "./absenceWidget";
import { buildDevNewsWidget, parseStackTitle } from "./devNewsWidget";
import {
  buildAbsenceWidget,
  buildEveningWidget,
  buildMorningWidget,
  buildTeamWidget,
  fitCaption,
  plural,
} from "./telegramWidgets";

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

describe("buildMorningWidget", () => {
  const base = {
    date: "10 листопада, вт",
    dayKey: "2026-11-10",
    holiday: "",
    quoteDeadlines: [600, 600, 1080],
    today: { quotesDue: 3, designDue: 5, quotesOverdue: 14, designOverdue: 13, revisions: 26 },
    funnel: { awaiting: 57, awaitingStale: 0, oldestDays: 13, estimated: 42, monthQuotes: 9, monthSum: "607 083 ₴", staleLeads: 15, recentLeads: 22 },
    thresholds: { pipelineStaleDays: 30, leadStaleDays: 14 },
    out: [] as Array<[string, string]>,
    teamLines: [],
    footer: "",
    caption: "c",
  };

  it("дедлайни на одну хвилину — одна кулька з числом", () => {
    const widget = buildMorningWidget(base);
    expect(JSON.parse(widget!.chatData).q).toEqual([[600, 2], [1080, 1]]);
    expect(zipped(widget!.html)).toBeLessThan(4096);
  });

  it("не влізло в 1024 байти — спершу ріжуться рядки команди, потім відсутні", () => {
    const out = Array.from({ length: 30 }, (_, i): [string, string] => [`Людина${i} Прізвище`, "відпустка · до 14.11"]);
    const widget = buildMorningWidget({ ...base, out, teamLines: ["🏠 З дому: усі"] });
    const data = JSON.parse(widget!.chatData);
    expect(Buffer.byteLength(widget!.chatData)).toBeLessThanOrEqual(1024);
    expect(data.t).toEqual([]);
    expect(data.o.length).toBeGreaterThan(0);
    expect(data.o.length).toBeLessThan(30);
  });
});

describe("календар заявки", () => {
  it("починається з понеділка того тижня", () => {
    expect(mondayOf("2026-11-17")).toBe("2026-11-16");
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
    expect(mondayOf("2026-11-22")).toBe("2026-11-16");
  });

  it("цілі тижні, не менше двох і не більше трьох", () => {
    expect(windowLength("2026-11-16", "2026-11-17")).toBe(14);
    expect(windowLength("2026-11-16", "2026-12-02")).toBe(21);
    expect(windowLength("2026-11-16", "2027-01-30")).toBe(21);
  });
});

describe("buildAbsenceWidget", () => {
  const base = {
    title: "Заявка · відпустка",
    urgent: "",
    name: "Юлія Кубенко",
    range: "17 лист. – 28 лист.",
    days: "12 кал. дн.",
    comment: "",
    windowStart: "2026-11-16",
    length: 14,
    offDays: [5, 6, 12, 13],
    todayIndex: -1,
    requester: { from: 1, to: 12 },
    caption: "c",
  };

  it("першим рядком заявник, далі ті, хто перетинається із заявкою", () => {
    const widget = buildAbsenceWidget({
      ...base,
      others: [
        { name: "Ян Один", kind: "відпустка", from: 13, to: 13, pending: false },
        { name: "Ліна Два", kind: "day-off", from: 5, to: 5, pending: true },
      ],
    });
    const rows = JSON.parse(widget!.chatData).p;
    expect(rows.map((r: unknown[]) => r[0])).toEqual(["Юлія К.", "Ліна Д.", "Ян О."]);
    expect(rows[1][4]).toBe(1);
  });

  it("більше семи людей — решта іменами в рядку «Ще»", () => {
    const others = Array.from({ length: 10 }, (_, i) => ({ name: `Колега${i} Прізвище`, kind: "відпустка", from: 2, to: 3, pending: false }));
    const data = JSON.parse(buildAbsenceWidget({ ...base, others })!.chatData);
    expect(data.p).toHaveLength(8);
    expect(data.z).toMatch(/^Ще: /);
  });
});

describe("buildDevNewsWidget", () => {
  const item = (source: "stack" | "claude" | "watch" | "apply", title: string, note?: string) => ({
    source,
    key: title,
    title,
    url: `https://example.com/${encodeURIComponent(title)}`,
    note,
  });

  it("версії стеку розбираються на назву, звідки, куди й вагу", () => {
    expect(parseStackTitle(item("stack", "@supabase/* 2.80.0 → 3.0.0 · 4 пакети", "мажор — може зламати"))).toEqual([
      "@supabase/* · 4 пакети", "2.80.0", "3.0.0", 2, "https://example.com/%40supabase%2F*%202.80.0%20%E2%86%92%203.0.0%20%C2%B7%204%20%D0%BF%D0%B0%D0%BA%D0%B5%D1%82%D0%B8",
    ]);
  });

  it("довгі розбори коротшають, доки віджет не влізе; чужий </script> не закриває наш", () => {
    const writeup = "Це речення про статтю, яке пояснює, що вона дасть нашій CRM. ".repeat(40);
    const widget = buildDevNewsWidget(
      [item("stack", "oxlint 1.90.0 → 1.93.0"), ...Array.from({ length: 4 }, (_, i) => item("apply", `Стаття ${i} </script>`, writeup))],
      "10 листопада",
      []
    );
    expect(widget).not.toBeNull();
    expect(zipped(widget!.html)).toBeLessThan(4096);
    expect(widget!.html.match(/<\/script>/g)).toHaveLength(2);
    expect(widget!.caption).toContain("4 статті з розбором");
  });
});
