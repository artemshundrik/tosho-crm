import { deflateSync } from "node:zlib";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { buildDocsWidget, groupDocsItems, type DocsWidgetInput } from "./docsWidget";

/**
 * Усередині віджета Telegram нічого не скролить, тому список ділиться на
 * сторінки в самому шаблоні, а збирач відповідає за дві речі: код вліз у ліміт
 * і лічильники чесні — навіть коли частина рядків у віджет не потрапила.
 */

const zipped = (html: string) => deflateSync(Buffer.from(html), { level: 9 }).length;
const embedded = (html: string) => JSON.parse(/<script>DN=(.*?)<\/script>/.exec(html)![1]);

/** Плавна картинка свого кольору — стискається, як справжнє фото чи лого, а не як шум. */
const picture = (i: number) =>
  sharp({ create: { width: 64, height: 64, channels: 3, background: { r: (i * 53) % 256, g: (i * 97) % 256, b: (i * 31) % 256 } } })
    .composite([{ input: Buffer.from(`<svg width="64" height="64"><circle cx="32" cy="24" r="14" fill="#fff"/></svg>`) }])
    .jpeg()
    .toBuffer();

const KINDS = ["contract", "specification", "invoice", "balance"] as const;
const SECTIONS = ["unsent", "returned", "unsigned", "unpaid"] as const;

const item = (i: number, managerUserId: string) => ({
  orderId: `0f9c2a1e-${String(1000 + i)}-4b7d-9e21-${String(100000000000 + i * 7919)}`,
  orderNumber: `TS-1126-${String(i).padStart(4, "0")}`,
  customerName: `ТОВ «Довга назва замовника ${i}»`,
  document: KINDS[i % 4],
  section: SECTIONS[(i * 3) % 4],
  detail: `${1 + (i % 9)} р.д.`,
  escalate: i % 3 === 0,
  managerUserId,
  teamId: "t",
  customerLogoUrl: null,
});

const input = (mode: DocsWidgetInput["mode"], items: ReturnType<typeof item>[]): DocsWidgetInput => ({
  mode,
  items: items as never,
  date: "10 листопада",
  orderUrlPrefix: "https://tosho.pro/orders/production/",
  managerName: (id) => `Менеджер ${id}`,
});

describe("buildDocsWidget", () => {
  it("менеджеру: 60 документів — код у межах ліміту, лічильники з усіх", async () => {
    const items = Array.from({ length: 60 }, (_, i) => item(i, "m1"));
    const widget = await buildDocsWidget(input("manager", items));
    expect(widget).not.toBeNull();
    expect(zipped(widget!.html)).toBeLessThan(4096);
    const data = embedded(widget!.html);
    const shown = data.g.reduce((sum: number, g: [string, unknown[]]) => sum + g[1].length, 0);
    const total = data.g.reduce((sum: number, g: [string, unknown[], number, number]) => sum + g[3], 0);
    expect(shown).toBeLessThan(60);
    // Розділ знає справжню кількість — шаблон допише «ще N — у CRM».
    expect(total).toBe(60);
    expect(data.s[0]).toBe(items.filter((it) => it.escalate).length);
  });

  it("керівнику: чотири менеджери — усі групи на місці, кожна зі своїм підсумком", async () => {
    const counts = [25, 12, 6, 2];
    const items = counts.flatMap((n, m) => Array.from({ length: n }, (_, i) => item(m * 100 + i, `m${m}`)));
    const widget = await buildDocsWidget(input("head", items));
    expect(widget).not.toBeNull();
    expect(zipped(widget!.html)).toBeLessThan(4096);
    const data = embedded(widget!.html);
    expect(data.g.map((g: unknown[]) => g[3])).toEqual(counts);
    expect(data.g[0][0]).toBe("Менеджер m0");
  });

  it("керівнику з фото: аватарки всіх менеджерів і лого — у chat_data, хвіст у коді", async () => {
    const counts = [9, 6, 3, 2];
    const items = counts.flatMap((n, m) => Array.from({ length: n }, (_, i) => item(m * 100 + i, `m${m}`)));
    const avatars = new Map(await Promise.all(counts.map(async (_, m) => [`m${m}`, await picture(m)] as const)));
    const logos = new Map(await Promise.all(items.slice(0, 6).map(async (it, i) => [it.orderId, await picture(10 + i)] as const)));
    const widget = await buildDocsWidget({ ...input("head", items), avatars, logos });
    expect(Buffer.byteLength(widget!.chatData)).toBeLessThanOrEqual(1024);
    expect(zipped(widget!.html)).toBeLessThan(4096);
    const data = { ...embedded(widget!.html), ...JSON.parse(widget!.chatData) };
    expect(data.k).toBe(4);
    expect(data.g.map((g: unknown[]) => g[2])).toEqual([0, 1, 2, 3]);
    // Потік ділиться за довжиною аватарок: обидві частини — справжні webp.
    const stream = (data.v ?? "") + (data.w ?? "");
    for (const part of [stream.slice(0, data.c), stream.slice(data.c)]) {
      const file = Buffer.from(part, "base64");
      expect(file.subarray(8, 12).toString()).toBe("WEBP");
    }
  });

  it("порожній список — віджета немає", async () => {
    expect(await buildDocsWidget(input("manager", []))).toBeNull();
  });
});

describe("groupDocsItems", () => {
  it("керівнику: група обрізається до стелі, але пам'ятає, скільки було", () => {
    const items = Array.from({ length: 9 }, (_, i) => item(i, "m1"));
    const [group] = groupDocsItems(input("head", items), 4);
    expect(group.items).toHaveLength(4);
    expect(group.total).toBe(9);
  });
});
