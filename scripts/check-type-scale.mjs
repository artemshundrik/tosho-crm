#!/usr/bin/env node
/**
 * Сторож шкали тексту (хвиля Б4, картка 173): розмір шрифту — лише токеном
 * шкали, а не `text-[Npx]`.
 *
 * НАВІЩО. До 01.11.2026 у шкалі не було 13 px, хоча саме він — основний розмір
 * інтерфейсу, і його 70 разів писали вручну як `text-[13px]`; поруч жили
 * `text-[13.5px]`, `[14px]`, `[15px]`. Один і той самий текст на двох сторінках
 * мав різний розмір, і жодна перевірка цього не бачила. Шкала тепер
 * 3xs/2xs/xs/md/sm/base/lg/xl/2xl (10/11/12/13/14/16/18/20/24), ручні 10–14 px
 * переведено на токени.
 *
 * ЩО ПЕРЕВІРЯЄ.
 *   1. `text-[Npx]` у `src/**\/*.{ts,tsx}` — не більше, ніж у ALLOW для файлу.
 *      Нових не з'являється, старі змітаються по ходу (зменшив — зменш і число).
 *   2. `text-3xs` (10 px) — лише для лічильників у бейджах; загальна кількість
 *      не росте вище MICRO_CEILING. Для робочого тексту 10 px замало.
 *
 * ЯК ВИПРАВИТИ. 11 → `text-2xs`, 12 → `text-xs`, 13 → `text-md`, 14 → `text-sm`.
 * Заголовок картки чи цифра-показник — `text-lg`/`text-xl`/`text-2xl`.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src");
const ARBITRARY = /text-\[[0-9.]+px\]/g;
const MICRO = /\btext-3xs\b/g;
const MICRO_CEILING = 433;

const ALLOW = new Map([
  ["components/app/CommandPalette.tsx", 1],
  ["components/app/DesignerTimerWidget.tsx", 4],
  ["components/app/NotificationsMenu.tsx", 1],
  ["components/app/bento.tsx", 1],
  ["components/customers/CompanyDuplicateHint.tsx", 1],
  ["components/team/AccessOverview.tsx", 1],
  ["components/team/PersonActivityHeatmap.tsx", 1],
  ["components/team/PersonFactRow.tsx", 1],
  ["components/team/TeamPulsePanel.tsx", 1],
  ["components/team/WorkScheduleCard.tsx", 1],
  ["components/ui/command.tsx", 1],
  ["components/ui/dialog.tsx", 1],
  ["components/ui/sheet.tsx", 1],
  ["features/devRequests/DevRequestQueue.tsx", 1],
  ["features/finances/FinanceBentoSummary.tsx", 1],
  ["features/orders/order-list/OrderStageStrip.tsx", 1],
  ["features/quotes/quote-details/QuotePriceSummary.tsx", 1],
  ["features/taskChat/ThreadEmojiPicker.tsx", 1],
  ["features/tosho-ai/ToShoAiConsole.tsx", 6],
  ["features/tosho-ai/ToShoAiWordmark.tsx", 2],
  ["layout/AppLayout.tsx", 2],
  ["pages/DesignTaskPage.tsx", 1],
  ["pages/NotificationsPage.tsx", 1],
  ["pages/PersonProfilePage.tsx", 1],
]);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

const problems = [];
let micro = 0;
for (const abs of walk(ROOT, [])) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  const text = fs.readFileSync(abs, "utf8");
  micro += (text.match(MICRO) ?? []).length;
  if (rel.endsWith(".css")) continue;
  const found = (text.match(ARBITRARY) ?? []).length;
  const limit = ALLOW.get(rel) ?? 0;
  if (found > limit) problems.push(`  src/${rel}: text-[Npx] ${found}, дозволено ${limit}`);
}
if (micro > MICRO_CEILING) {
  problems.push(`  text-3xs (10 px): ${micro}, стеля ${MICRO_CEILING} — 10 px лише для лічильників у бейджах`);
}

if (problems.length) {
  console.error("[шкала тексту] розмір поза шкалою:");
  console.error(problems.join("\n"));
  console.error("Візьми токен шкали (як — у шапці scripts/check-type-scale.mjs).");
  process.exit(1);
}
