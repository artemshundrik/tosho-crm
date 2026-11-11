/**
 * Стенд віджетів Telegram-бота: усі шаблони з пробними даними поруч у світлій
 * і темній темі чату, у бульбашці 360 px, обрізаній по 600 px — як у Telegram.
 *
 *   npx tsx scripts/telegram-widgets-harness.mts      → http://localhost:5210
 *   (або preview_start name=widgets)                    ?only=team — один віджет
 *
 * Навіщо: справжній віджет видно лише в Telegram після розсилки, а там уже
 * пізно помічати, що список обрізало чи сірий текст зливається з плашкою.
 * Тут нічого не шлеться й база не читається: дані вигадані, але проходять
 * через ті самі збирачі, що й на проді, тож ліміти (1024 Б даних, 4096 Б коду)
 * перевіряються по-справжньому. Кожне оновлення сторінки перезбирає шаблони.
 *
 * Чого стенд НЕ доводить: рушій Telegram — не браузер (свій рендер, QuickJS).
 * Скролу всередині віджета там немає взагалі, opacity < 1 — не більше 16
 * елементів, color-mix() не працює. Стенд ловить верстку, кольори й висоту.
 */
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";

import sharp from "sharp";

const PORT = Number(process.env.PORT) || 5210;
const SELF = new URL(import.meta.url).pathname;

type Sample = { key: string; title: string; html: string; chatData: string } | { key: string; title: string; error: string };

// --- Пробні дані -------------------------------------------------------------

async function photo(seed: number): Promise<Buffer> {
  return sharp({ create: { width: 96, height: 96, channels: 3, noise: { type: "gaussian", mean: 90 + ((seed * 37) % 110), sigma: 45 } } })
    .blur(5)
    .tint({ r: 80 + ((seed * 53) % 170), g: 80 + ((seed * 91) % 170), b: 80 + ((seed * 29) % 170) })
    .jpeg()
    .toBuffer();
}

const NAMES = [
  "Олена Бондар", "Іван Сидоренко", "Юлія Кубенко", "Марина Коваль", "Ігор Петренко", "Дарина Мельник", "Тарас Шевчук",
  "Софія Ткаченко", "Андрій Лисенко", "Катерина Гнатюк", "Влад Романюк", "Наталя Олійник", "Максим Кравець", "Аліна Поліщук",
  "Роман Савчук", "Ірина Гончар", "Богдан Мороз",
];

async function samples(): Promise<Sample[]> {
  const L = "../netlify/functions/_lib/";
  const widgets = await import(L + "telegramWidgets.ts");
  const { buildDocsWidget } = await import(L + "docsWidget.ts");
  const { buildCardWidget } = await import(L + "cardWidget.ts");
  const { absenceResultCard } = await import(L + "absenceResultWidget.ts");
  const { celebrationCard } = await import(L + "teamCelebrationWidget.ts");
  const { fitApprovalWidget } = await import(L + "orderApprovalWidget.ts");
  const { buildDevNewsWidget } = await import(L + "devNewsWidget.ts");

  const out: Sample[] = [];
  const add = async (key: string, title: string, make: () => unknown) => {
    try {
      const w = (await make()) as { html: string; chatData?: string } | string | null;
      if (!w) out.push({ key, title, error: "збирач повернув null — на проді пішов би запасний текст" });
      else out.push({ key, title, html: typeof w === "string" ? w : w.html, chatData: typeof w === "string" ? "{}" : (w.chatData ?? "{}") });
    } catch (error) {
      out.push({ key, title, error: String(error instanceof Error ? error.stack : error) });
    }
  };

  const person = async (name: string, i: number) => {
    const from = 8 * 60 + 40 + ((i * 23) % 90);
    const minutes = Math.max(12, 400 - i * 24);
    const gap = 60 + ((i * 17) % 50);
    const first = Math.round(minutes * 0.55);
    return {
      name,
      minutes,
      spans: [{ from, to: from + first }, { from: from + first + gap, to: from + gap + minutes }],
      avatar: i % 4 === 3 ? null : await photo(i),
    };
  };
  const team = await Promise.all(NAMES.map(person));
  const absent = [
    { name: "Оксана Д.", reason: "відпустка до 14.11" },
    { name: "Петро Г.", reason: "лікарняний" },
    { name: "Лариса В.", reason: "не було в CRM" },
    { name: "Степан К.", reason: "не було в CRM" },
    { name: "Ганна Ю.", reason: "не було в CRM" },
  ];
  const visitor = { name: "Зоя Крук", minutes: 3, spans: [{ from: 700, to: 703 }], avatar: null };
  await add("team", "Команда вчора · 17 людей (сторінками)", () =>
    widgets.buildTeamWidget({ date: "10 листопада, вт", people: [...team, visitor], absent, caption: "c" })
  );
  await add("team-small", "Команда вчора · 6 людей", () =>
    widgets.buildTeamWidget({ date: "10 листопада, вт", people: team.slice(0, 6), absent: absent.slice(0, 1), caption: "c" })
  );

  const month = {
    total: { min: 1_180_000, max: 1_420_000 },
    previousMax: 1_050_000,
    current: Array.from({ length: 11 }, (_, i) => 90_000 * (i + 1) + (i % 3) * 60_000),
    previous: Array.from({ length: 30 }, (_, i) => 36_000 * (i + 1)),
    totalPoints: 30,
    label: "затверджено за листопад",
    against: "до жовтня",
  };
  await add("evening", "Підсумок дня", () =>
    widgets.buildEveningWidget({
      title: "Підсумок дня",
      date: "10 листопада",
      month,
      week: { ...month, total: { min: 310_000, max: 362_000 }, previousMax: 410_000, current: [40_000, 120_000, 362_000], previous: [60_000, 150_000, 240_000, 300_000, 380_000, 400_000, 410_000], totalPoints: 7, label: "затверджено за 7 днів", against: "до попередніх 7 днів" },
      tiles: [[4, "затверджено сьогодні"], [7, "нові прорахунки"], [3, "нові ліди"], [12, "макетів здано"]],
      caption: "c",
    })
  );

  await add("morning", "План на день", () =>
    widgets.buildMorningWidget({
      date: "вт, 10 листопада",
      dayKey: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" }),
      holiday: "",
      quoteDeadlines: [600, 600, 780, 1080],
      today: { quotesDue: 4, designDue: 5, quotesOverdue: 14, designOverdue: 3, revisions: 9 },
      funnel: { awaiting: 57, awaitingStale: 21, oldestDays: 48, estimated: 42, monthQuotes: 19, monthSum: "1,2–1,4 млн грн", staleLeads: 15, recentLeads: 22 },
      thresholds: { pipelineStaleDays: 30, leadStaleDays: 14 },
      out: [["Оксана Д.", "відпустка · до 14.11"], ["Петро Г.", "лікарняний"]],
      teamLines: ["🏠 З дому: Юлія К., Тарас Ш.", "📅 Завтра не буде: Марина К.", "📝 Заявки без рішення: 2"],
      footer: "Дані станом на 08:30",
      caption: "c",
    })
  );

  const kinds = ["contract", "specification", "invoice", "balance"] as const;
  const sections = ["unsent", "returned", "unsigned", "unpaid"] as const;
  const customers = ["Нова Пошта", "Епіцентр К", "Сільпо", "Monobank", "Rozetka", "ТОВ Агро-Південь Трейд", "Kyivstar", "Аврора", "Фокстрот", "АТБ-Маркет", "Comfy", "Укрзалізниця"];
  const managers = ["m1", "m2", "m3", "m4"];
  const managerNames: Record<string, string> = { m1: "Олена Бондар", m2: "Іван Сидоренко", m3: "Юлія Кубенко", m4: "Марина Коваль" };
  const item = (i: number, managerUserId: string) => ({
    orderId: `0f9c2a1e-${String(1000 + i).padStart(4, "0")}-4b7d-9e21-${(i * 7919 + 123456789012).toString(16).padStart(12, "0").slice(0, 12)}`,
    orderNumber: `TS-1126-${String(40 + i).padStart(4, "0")}`,
    customerName: customers[i % customers.length],
    document: kinds[i % 4],
    section: sections[(i * 3) % 4],
    detail: i % 3 === 0 ? `${6 + (i % 5)} р.д.` : `${1 + (i % 4)} р.д.`,
    escalate: i % 3 === 0,
    managerUserId,
    teamId: "t",
    customerLogoUrl: null,
  });
  const perManager = [9, 6, 3, 2];
  const headItems = managers.flatMap((m, mi) => Array.from({ length: perManager[mi] }, (_, i) => item(mi * 20 + i, m)));
  const avatars = new Map<string, Buffer | null>(await Promise.all(managers.map(async (m, i) => [m, i === 3 ? null : await photo(40 + i)] as const)));
  const logos = new Map<string, Buffer | null>(await Promise.all(headItems.slice(0, 6).map(async (it, i) => [it.orderId, await photo(60 + i)] as const)));
  const docs = { date: "10 листопада", orderUrlPrefix: "https://tosho.pro/orders/production/" };
  await add("docs-head", "Затримки з документами · керівнику, 4 менеджери", () =>
    buildDocsWidget({ ...docs, mode: "head", items: headItems as never, avatars, logos, managerName: (id: string | null) => managerNames[id ?? ""] ?? "Без менеджера" })
  );
  await add("docs-manager", "Документи замовникам · менеджеру, 14 документів", () =>
    buildDocsWidget({ ...docs, mode: "manager", items: Array.from({ length: 14 }, (_, i) => item(i, "m1")) as never, logos })
  );
  const many = [25, 12, 6, 2].flatMap((n, mi) => Array.from({ length: n }, (_, i) => item(mi * 30 + i, managers[mi])));
  await add("docs-head-many", "Затримки з документами · керівнику, 45 документів (частина — лише в CRM)", () =>
    buildDocsWidget({ ...docs, mode: "head", items: many as never, avatars, logos, managerName: (id: string | null) => managerNames[id ?? ""] ?? "Без менеджера" })
  );
  await add("docs-manager-many", "Документи замовникам · менеджеру, 60 документів (частина — лише в CRM)", () =>
    buildDocsWidget({ ...docs, mode: "manager", items: Array.from({ length: 60 }, (_, i) => item(i, "m1")) as never, logos })
  );
  await add("docs-short", "Документи замовникам · менеджеру, 3 документи", () =>
    buildDocsWidget({ ...docs, mode: "manager", items: Array.from({ length: 3 }, (_, i) => item(i, "m1")) as never, logos })
  );

  await add("absence", "Заявка на відсутність · керівнику", () =>
    widgets.buildAbsenceWidget({
      title: "Заявка · відпустка",
      urgent: "⏳ стартує завтра",
      name: "Юлія Кубенко",
      range: "17 лист. – 28 лист.",
      days: "12 кал. дн.",
      comment: "Їду до батьків",
      windowStart: "2026-11-16",
      length: 14,
      offDays: [5, 6, 12, 13],
      todayIndex: 0,
      requester: { from: 1, to: 12 },
      others: [
        { name: "Ліна Дорошенко", kind: "day-off", from: 5, to: 5, pending: true },
        { name: "Ян Одинець", kind: "відпустка", from: 8, to: 13, pending: false },
        { name: "Петро Гай", kind: "лікарняний", from: 0, to: 2, pending: false },
      ],
      caption: "c",
    })
  );

  const result = { kind: "vacation", start: "2026-11-17", end: "2026-11-28", deciderShort: "Артем Ш.", time: "10:42", todayKey: "2026-11-10" };
  await add("card-ok", "Співробітнику · погоджено", () =>
    buildCardWidget({ data: absenceResultCard({ ...result, approved: true, comment: null, quotaDays: 12, remaining: 6 }), caption: "c" })
  );
  await add("card-no", "Співробітнику · не погоджено", () =>
    buildCardWidget({
      data: absenceResultCard({ ...result, kind: "day_off", end: result.start, approved: false, comment: "Того дня здаємо великий тираж, потрібні всі", quotaDays: null, remaining: null }),
      caption: "c",
    })
  );
  await add("card-birthday", "День народження", async () =>
    buildCardWidget({ data: celebrationCard({ kind: "birthday", name: "Марина Коваль", jobRole: "manager", startDate: "2024-03-01" }), avatar: await photo(7), caption: "c" })
  );
  await add("card-anniversary", "Річниця · без фото", () =>
    buildCardWidget({ data: celebrationCard({ kind: "anniversary", name: "Ігор Петренко", years: 3, jobRole: "designer", startDate: "2023-11-10" }), caption: "c" })
  );

  await add("approval", "СП на погодження", () =>
    fitApprovalWidget(
      () => ({
        t: "Погодити СП №3",
        o: "TS-1126-0042",
        c: "Епіцентр К",
        e: "ТОВ «Епіцентр К» · ЄДРПОУ 32490244",
        s: 184_560,
        pp: 70,
        bt: "Доплата до відвантаження",
        p: [
          ["Футболка Fruit of the Loom Valueweight", 300, "шт.", 96_000, "Білий, шовкодрук 1+0 на грудях А4, пакування по 50"],
          ["Чашка керамічна 330 мл", 250, "шт.", 52_500, "Сублімація, повноколір"],
          ["Блокнот А5 на пружині", 400, "шт.", 36_060, ""],
        ],
        k: [["Виготовлення", "14 роб. днів"], ["Доставка", "FCA · склад НП, Київ"], ["Договір", "не підписано", "w"], ["Оплата", "безготівкові, грн"]],
        f: "Просить Олена Б. · сьогодні о 10:12",
      }),
      null
    )
  );

  const news = (source: string, title: string, note?: string) => ({ source, key: title, title, url: "https://example.com/x", note });
  await add("devnews", "Підбірка для розробки", () =>
    buildDevNewsWidget(
      [
        news("stack", "vite 7.1.2 → 7.2.0"),
        news("stack", "@supabase/* 2.80.0 → 3.0.0 · 4 пакети", "мажор — може зламати"),
        news("stack", "oxlint 1.90.0 → 1.93.0"),
        news("claude", "Claude Code 2.9.0", "Нові хуки для сесій\nШвидший старт у великих репозиторіях"),
        news("watch", "Postgres 19 beta: що нового в планувальнику", "Коротко про зміни, які зачеплять RLS-запити."),
        news("apply", "Як ми скоротили холодний старт функцій удвічі", "Розбір статті: що можна забрати собі. Перше — винести важкі імпорти. Друге — кеш з'єднань."),
      ] as never,
      "10 листопада",
      []
    )
  );
  return out;
}

// process.exit одразу після write обрізає вивід у трубу на 64 кБ — чекаємо, поки запишеться.
const JSON_MODE = process.argv.includes("--json");
if (JSON_MODE) process.stdout.write(JSON.stringify(await samples()), () => process.exit(0));

// --- Сторінка -----------------------------------------------------------------

const THEMES = {
  light: { chat: "#d7e3ec", bg: "#ffffff", text: "#000000", hint: "#8e8e93", second: "#efeff4" },
  dark: { chat: "#0e1621", bg: "#212d3b", text: "#ffffff", hint: "#7d8b99", second: "#151e27" },
} as const;

const attr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

function frame(sample: Extract<Sample, { html: string }>, scheme: keyof typeof THEMES): string {
  const t = THEMES[scheme];
  const id = `${sample.key}-${scheme}`;
  const prelude =
    `<!doctype html><meta charset=utf-8><style>:root{--tg-theme-bg-color:${t.bg};--tg-theme-text-color:${t.text};--tg-theme-hint-color:${t.hint};--tg-theme-secondary-bg-color:${t.second};--tg-color-scheme:${scheme}}html{background:${t.bg};overflow:hidden}</style>` +
    `<script>window.TelegramWidget={chatData:${JSON.stringify(sample.chatData).replace(/</g, "\\u003c")},colorScheme:"${scheme}",onEvent(){},ready(){},openLink(u){console.log("openLink",u)},HapticFeedback:{selectionChanged(){},impactOccurred(){}}};` +
    `addEventListener("DOMContentLoaded",()=>new ResizeObserver(()=>parent.postMessage({id:"${id}",h:document.body.offsetHeight},"*")).observe(document.body))</script>`;
  return `<div class="bubble ${scheme}" style="background:${t.chat}"><iframe id="${id}" style="color-scheme:${scheme}" srcdoc="${attr(prelude + sample.html)}"></iframe><div class=meta id="m-${id}"></div></div>`;
}

function page(list: Sample[], only: string | null): string {
  const shown = only ? list.filter((s) => s.key.startsWith(only)) : list;
  const blocks = shown
    .map((s) => {
      if ("error" in s) return `<section><h2>${s.title}</h2><pre class=err>${s.error.replace(/</g, "&lt;")}</pre></section>`;
      const size = deflateSync(Buffer.from(s.html), { level: 9 }).length;
      return `<section id="${s.key}"><h2>${s.title} <small>код ${size} / 4096 Б · дані ${Buffer.byteLength(s.chatData)} / 1024 Б</small></h2><div class=pair>${frame(s, "light")}${frame(s, "dark")}</div></section>`;
    })
    .join("");
  return `<!doctype html><meta charset=utf-8><title>Віджети бота</title>
<style>body{margin:0;padding:20px;font:14px system-ui,sans-serif;background:#f4f4f5;color:#111}h1{margin:0 0 4px;font-size:20px}p{margin:0 0 16px;color:#666}
section{margin-bottom:28px}h2{font-size:15px;margin:0 0 8px}h2 small{font-weight:400;color:#777;margin-left:8px}
.pair{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}.bubble{padding:14px;border-radius:14px}
iframe{display:block;width:360px;height:120px;border:0;border-radius:14px}.meta{margin-top:6px;font-size:12px;color:#555}.dark .meta{color:#9fb0c0}.meta.over{color:#e5484d;font-weight:600}
.err{background:#fff0f0;color:#a00;padding:12px;border-radius:8px;white-space:pre-wrap}</style>
<h1>Віджети Telegram-бота</h1><p>Бульбашка 360 px, усе нижче 600 px обрізається — як у Telegram. Ліворуч світла тема чату, праворуч темна.</p>${blocks}
<script>addEventListener("message",e=>{const d=e.data||{},f=document.getElementById(d.id),m=document.getElementById("m-"+d.id);if(!f)return;
f.style.height=Math.min(600,Math.max(50,d.h))+"px";m.textContent="висота "+d.h+" px"+(d.h>600?" — ОБРІЗАНО на 600":"");m.classList.toggle("over",d.h>600)})</script>`;
}

if (!JSON_MODE) createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/") {
    response.writeHead(404).end();
    return;
  }
  try {
    execFileSync("node", ["scripts/build-telegram-widgets.mjs"], { stdio: "ignore" });
    const json = execFileSync("npx", ["tsx", SELF, "--json"], { maxBuffer: 32 * 1024 * 1024 }).toString();
    const html = page(JSON.parse(json), url.searchParams.get("only"));
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(html);
  } catch (error) {
    if (!response.headersSent) response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(String(error instanceof Error ? error.stack : error));
  }
}).listen(PORT, () => console.log(`Стенд віджетів: http://localhost:${PORT}`));
