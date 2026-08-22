/**
 * Збірка дизайн-системи ToSho для Claude Design — зі справжніх компонентів.
 *
 * ЧОМУ НЕ РУКОПИСНИЙ HTML. Перший захід (scripts/design-system-export.mjs,
 * 22.08.2026) переписував компоненти класами руками — і картки брехали:
 * чекбокс був чорний замість бренд-синього, шрифту не було взагалі, сегмент
 * смикався, бо плашка була намальована, а не та, що в застосунку. Кожна така
 * розбіжність — наслідок копіювання. Тут нічого не копіюється: картка імпортує
 * `@/components/ui/*` і `src/index.css` дослівно, Vite збирає їх тим самим
 * конвеєром, що й застосунок, а Inter Variable вбудовується з того ж пакета.
 *
 * ЩО ВИХОДИТЬ. На кожну картку — один самодостатній HTML: React, компоненти,
 * CSS і шрифт усередині, жодного зовнішнього запиту. Скрипт класичний (iife),
 * а не модуль, бо після збірки картка ще проганяється через jsdom, і в HTML
 * вкладається вже відрендерений DOM: якщо полотно Claude Design не виконує
 * скриптів, картка однаково покаже компоненти — лише без інтерактивності.
 *
 * Запуск:   node scripts/design-system/build.mjs [--only buttons,inputs]
 * Результат: .design-system-export/<група>/<картка>.html
 * Далі:      DesignSync → finalize_plan → write_files
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, ".design-system-export");
const WORK = path.join(OUT, "work");
const GEN = path.join(HERE, ".gen");

const CARDS = [
  ["foundations/colors", "colors", "Основи"],
  ["foundations/typography", "typography", "Основи"],
  ["foundations/elevation", "elevation", "Основи"],
  ["components/buttons", "buttons", "Компоненти"],
  ["components/inputs", "inputs", "Компоненти"],
  ["components/status-tones", "status-tones", "Компоненти"],
  ["components/table", "table", "Компоненти"],
  ["components/overlays", "overlays", "Компоненти"],
  ["composites/kanban-card", "kanban-card", "Композити"],
];

const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(",")) : null;

// ─────────────── 1. app.css і tokens.json — з джерела правди ───────────────

mkdirSync(GEN, { recursive: true });
const indexCss = readFileSync(path.join(ROOT, "src/index.css"), "utf8");
// Перші два рядки — @import tailwind і @config застосунку; їх дає styles.css.
const appCss = indexCss.replace(/^@import\s+"tailwindcss";\s*\n/m, "").replace(/^@config\s+"[^"]+";\s*\n/m, "");
if (/^@import\s+"tailwindcss"|^@config/m.test(appCss)) throw new Error("index.css змінив шапку — онови build.mjs");
writeFileSync(path.join(GEN, "app.css"), appCss);

function block(selector) {
  const re = new RegExp(`\\n\\s*${selector.replace(".", "\\.")}\\s*\\{`);
  const m = re.exec(indexCss);
  if (!m) throw new Error(`Не знайшов блок ${selector}`);
  let i = m.index + m[0].length, depth = 1;
  const start = i;
  while (depth > 0 && i < indexCss.length) { if (indexCss[i] === "{") depth++; else if (indexCss[i] === "}") depth--; i++; }
  return indexCss.slice(start, i - 1);
}
const HSL = /^\s*[\d.]+\s+[\d.]+%\s+[\d.]+%\s*$/;
const colorTokens = (body) => {
  const out = [];
  for (const line of body.split("\n")) {
    const m = /^\s*(--[a-z0-9-]+):\s*([^;]+);/i.exec(line);
    if (m && (HSL.test(m[2]) || /^var\(--brand-/.test(m[2].trim()))) out.push({ name: m[1], value: m[2].trim() });
  }
  return out;
};
const light = colorTokens(block(":root"));
const dark = new Map(colorTokens(block(".dark")).map((t) => [t.name, t.value]));
const GROUPS = [
  ["Поверхні", ["--background", "--foreground", "--card", "--popover", "--muted", "--secondary", "--accent", "--border", "--input"]],
  ["Бренд і фокус", ["--primary", "--ring", "--brand"]],
  ["Тони: інформація", ["--info"]], ["Тони: успіх", ["--success"]], ["Тони: увага", ["--warning"]],
  ["Тони: небезпека", ["--danger", "--destructive"]],
  ["Тони: акцент і решта", ["--accent-tone", "--festive", "--teal", "--neutral"]],
  ["Контроли", ["--control"]], ["Канбан", ["--kanban"]], ["ToSho AI", ["--ai"]],
];
const groupOf = (n) => GROUPS.find(([, ps]) => ps.some((p) => n === p || n.startsWith(p + "-")))?.[0] ?? "Інше";
const grouped = [...GROUPS.map(([l]) => l), "Інше"]
  .map((label) => ({ label, items: light.filter((t) => groupOf(t.name) === label).map((t) => ({ name: t.name, light: t.value, dark: dark.get(t.name) })) }))
  .filter((g) => g.items.length);
writeFileSync(path.join(GEN, "tokens.json"), JSON.stringify(grouped));

// ─────────────────────────── 2. збірка карток ───────────────────────────

if (existsSync(WORK)) rmSync(WORK, { recursive: true });
const results = [];

for (const [rel, card, group] of CARDS) {
  if (only && !only.has(card)) continue;
  process.stdout.write(`${card.padEnd(14)} vite…`);
  execFileSync("npx", ["vite", "build", "--config", path.join(HERE, "vite.config.mts"), "--logLevel", "error"], {
    cwd: ROOT, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, VITE_DS_CARD: card },
  });

  const dir = path.join(WORK, card);
  let html = readFileSync(path.join(dir, "index.html"), "utf8");
  const js = readFileSync(path.join(dir, "card.js"), "utf8");
  const css = readFileSync(path.join(dir, "card.css"), "utf8");

  // Усе всередину: жодного src/href назовні. Скрипт — у КІНЕЦЬ body: Vite
  // кладе його в head як module (відкладений), а класичний скрипт у head
  // виконався б до того, як розібрано #root (React #299).
  html = html
    .replace(/<script[^>]*src="[^"]*card\.js"[^>]*><\/script>/, "")
    .replace(/<link[^>]*href="[^"]*card\.css"[^>]*>/, () => `<style>${css}</style>`)
    .replace(/<\/body>/, () => `<script>${js.replace(/<\/script/g, "<\\/script")}</script>\n</body>`);
  if (/src="\.|href="\./.test(html)) throw new Error(`${card}: лишилось зовнішнє посилання`);

  // Попередній рендер у jsdom — на випадок полотна без скриптів.
  process.stdout.write(" рендер…");
  const prerendered = await prerender(html, card);

  const final = `<!-- @dsCard group="${group}" -->\n${prerendered}`;
  const outPath = path.join(OUT, `${rel}.html`);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, final);
  const kb = Math.round(Buffer.byteLength(final) / 1024);
  results.push([rel, kb]);
  console.log(` ${kb} КіБ`);
}

rmSync(WORK, { recursive: true, force: true });
console.log(`\nГотово: ${OUT}`);
for (const [rel, kb] of results) console.log(`  ${rel.padEnd(32)} ${String(kb).padStart(5)} КіБ`);

// ───────────────────────────── jsdom-рендер ─────────────────────────────

async function prerender(html, card) {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on("jsdomError", (e) => errors.push(e.message));
  virtualConsole.on("error", (...a) => errors.push(a.join(" ")));

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      // Чого jsdom не має, а компоненти просять. Заглушки чесні: нічого не
      // міряють, лише не падають — справжні розміри дасть браузер.
      window.matchMedia = () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
      window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.HTMLElement.prototype.hasPointerCapture = () => false;
      window.HTMLElement.prototype.setPointerCapture = () => {};
      window.HTMLElement.prototype.releasePointerCapture = () => {};
    },
  });

  const { document } = dom.window;
  // Чекати треба асинхронно: React планує рендер через чергу подій jsdom, і
  // синхронний цикл (Atomics.wait) її блокує — тоді #root порожній довіку.
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && !document.getElementById("root")?.firstElementChild) {
    await new Promise((r) => setTimeout(r, 25));
  }
  // Дати відпрацювати ефектам після монтування (Radix, сегмент-плашка).
  await new Promise((r) => setTimeout(r, 150));
  const mounted = Boolean(document.getElementById("root")?.firstElementChild);
  const fatal = errors.filter((e) => !/not implemented|Could not parse CSS|css parsing/i.test(e));
  if (!mounted || fatal.length) {
    console.log(`\n  ! ${card}: попередній рендер ${mounted ? "з помилками" : "не змонтувався"} — картка піде без нього`);
    for (const e of (fatal.length ? fatal : errors).slice(0, 4)) console.log("    " + e.split("\n").slice(0, 2).join(" ").slice(0, 220));
    dom.window.close();
    return html;
  }
  const out = "<!doctype html>\n" + document.documentElement.outerHTML;
  dom.window.close();
  return out;
}
