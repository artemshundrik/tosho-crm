import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildDocsWidget, groupDocsItems, type DocsWidgetInput } from "./docsWidget";

/**
 * Усередині віджета Telegram нічого не скролить, тому список ділиться на
 * сторінки в самому шаблоні, а збирач відповідає за дві речі: код вліз у ліміт
 * і лічильники чесні — навіть коли частина рядків у віджет не потрапила.
 */

const zipped = (html: string) => deflateSync(Buffer.from(html), { level: 9 }).length;
const embedded = (html: string) => JSON.parse(/<script>DN=(.*?)<\/script>/.exec(html)![1]);

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
    const html = await buildDocsWidget(input("manager", items));
    expect(html).not.toBeNull();
    expect(zipped(html!)).toBeLessThan(4096);
    const data = embedded(html!);
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
    const html = await buildDocsWidget(input("head", items));
    expect(html).not.toBeNull();
    expect(zipped(html!)).toBeLessThan(4096);
    const data = embedded(html!);
    expect(data.g.map((g: unknown[]) => g[3])).toEqual(counts);
    expect(data.g[0][0]).toBe("Менеджер m0");
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
