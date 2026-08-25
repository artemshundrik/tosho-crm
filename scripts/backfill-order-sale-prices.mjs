// Замовлення, створені за СОБІВАРТІСТЮ, — переписати на продажну ціну.
//
// ЩО СТАЛОСЬ. `orderRecords.ts` рахував ціну позиції як
// `unit_price_model + unit_price_print + логістика/кількість` — це те, у що
// товар обходиться нам. Націнки (валовий прибуток, постійні витрати, ПДВ) там
// не було, тож `order_items.unit_price` і `orders.total` виходили вдвічі
// меншими за прорахунок. Заміряно на проді 25.08.2026: TS-0726-0013 —
// 74 300 ₴ замість 152 300 ₴. Код виправлено, лишились рядки в базі.
//
// ЧОГО ЦЕЙ СКРИПТ НЕ РОБИТЬ І ЧОМУ.
//
//   1. НЕ ЧІПАЄ ЗАКРИТІ Й ОПЛАЧЕНІ. Якщо гроші вже прийшли або замовлення
//      завершене/відвантажене, число погоджене з клієнтом — переписати його
//      заднім числом означало б розійтись із документами, які вже в нього на
//      руках. Рішення Артема 25.08.2026: «перерахувати незакриті».
//   2. НЕ ЧІПАЄ ПРАВЛЕНЕ РУКАМИ. Переписуємо рядок лише тоді, коли його ціна
//      з точністю до копійки дорівнює СТАРІЙ формулі собівартості. Будь-яке
//      інше число означає, що людина його вже виправила, — таке лишаємо й
//      показуємо окремим списком.
//   3. НЕ ВГАДУЄ ТИРАЖ. Коли в позиції кілька тиражів і жоден не позначений
//      як погоджений клієнтом (scripts/quote-run-approved.sql), скрипт не
//      обирає за менеджера — рядок іде в «потребує рішення».
//
// Запуск:
//   node scripts/backfill-order-sale-prices.mjs            # звіт, нічого не пише
//   node scripts/backfill-order-sale-prices.mjs --apply    # пише + бекап у JSON

import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const i = trimmed.indexOf("=");
      if (i <= 0) return;
      const key = trimmed.slice(0, i).trim();
      const value = trimmed.slice(i + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
  } catch {
    // немає файлу — працюємо на змінних оточення
  }
}

await loadEnvFile(path.resolve(".env.local"));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL) throw new Error("Немає VITE_SUPABASE_URL / SUPABASE_URL");
if (!SERVICE_ROLE_KEY) throw new Error("Немає SUPABASE_SERVICE_ROLE_KEY");

const APPLY = process.argv.includes("--apply");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "tosho" },
});

// Закриті стани: сюди не лізе ні цей скрипт, ні майбутні.
const CLOSED_ORDER_STATUSES = new Set(["completed", "shipped", "cancelled", "canceled"]);
// Будь-яка отримана оплата = число вже погоджене з клієнтом.
const PAID_STATUSES = new Set(["fully_paid", "partially_paid", "awaiting_balance"]);

const resolveRate = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Дзеркало computeRunSalePricing (src/lib/quoteRuns.ts). */
function runPricing(run) {
  const qty = Math.max(0, Number(run.quantity) || 0);
  const model = Number(run.unit_price_model) || 0;
  const print = Number(run.unit_price_print) || 0;
  const logistics = Number(run.logistics_cost) || 0;
  const costTotal = (model + print) * qty + logistics;
  const dmi = Math.max(0, Number(run.desired_manager_income) || 0);
  const managerRate = resolveRate(run.manager_rate, 10);
  const fixedCostRate = resolveRate(run.fixed_cost_rate, 30);
  const vatRate = resolveRate(run.vat_rate, 20);
  const grossProfit = managerRate > 0 ? dmi / (managerRate / 100) : 0;
  const fixedCosts = grossProfit * (fixedCostRate / 100);
  const vatAmount = (grossProfit + fixedCosts) * (vatRate / 100);
  const saleTotal = costTotal + grossProfit + fixedCosts + vatAmount;
  return {
    qty,
    costTotal,
    costUnit: qty > 0 ? model + print + logistics / qty : 0,
    saleTotal,
    saleUnit: qty > 0 ? saleTotal / qty : 0,
  };
}

async function fetchAll(table, columns) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

const round2 = (n) => Math.round(n * 100) / 100;
const sameMoney = (a, b) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) <= 0.01;

const orders = await fetchAll(
  "orders",
  "id,quote_id,quote_number,total,currency,order_status,payment_status,created_at"
);
const orderItems = await fetchAll("order_items", "id,order_id,quote_item_id,name,qty,unit_price,line_total");
const runs = await fetchAll(
  "quote_item_runs",
  "id,quote_id,quote_item_id,quantity,unit_price_model,unit_price_print,logistics_cost,desired_manager_income,manager_rate,fixed_cost_rate,vat_rate,is_approved"
);

const itemsByOrder = new Map();
for (const item of orderItems) {
  const list = itemsByOrder.get(item.order_id) ?? [];
  list.push(item);
  itemsByOrder.set(item.order_id, list);
}
const runsByQuote = new Map();
for (const run of runs) {
  const list = runsByQuote.get(run.quote_id) ?? [];
  list.push(run);
  runsByQuote.set(run.quote_id, list);
}

const planned = [];
const skippedClosed = [];
const skippedEdited = [];
const needsChoice = [];
// Замовлення, для яких перерахувати нема з чого (прорахунок видалено або в
// ньому немає тиражів). Мовчки їх ковтати не можна: інакше звіт «усе
// перераховано» приховає рядки, які лишились за старою ціною.
const noSource = [];

for (const order of orders) {
  if (!order.quote_id) continue;
  const items = itemsByOrder.get(order.id) ?? [];
  const quoteRuns = runsByQuote.get(order.quote_id) ?? [];
  const label = `${order.quote_number || order.id.slice(0, 8)}`;
  if (items.length === 0 || quoteRuns.length === 0) {
    noSource.push({
      label,
      total: Number(order.total ?? 0),
      why: items.length === 0 ? "у замовленні немає позицій" : "у прорахунку немає тиражів (можливо, його видалено)",
    });
    continue;
  }

  if (CLOSED_ORDER_STATUSES.has(order.order_status) || PAID_STATUSES.has(order.payment_status)) {
    // Рахуємо різницю все одно — щоб у звіті було видно, скільки саме
    // «застигло» в закритих замовленнях, навіть якщо ми їх не чіпаємо.
    skippedClosed.push({ label, order });
    continue;
  }

  const updates = [];
  let orderTouched = false;
  let blocked = false;

  for (const item of items) {
    const own = quoteRuns.filter((run) => run.quote_item_id === item.quote_item_id);
    const itemRuns = own.length > 0 ? own : items.length === 1 ? quoteRuns : [];
    if (itemRuns.length === 0) continue;

    const approved = itemRuns.filter((run) => run.is_approved === true);
    const run = approved[0] ?? (itemRuns.length === 1 ? itemRuns[0] : null);
    if (!run) {
      needsChoice.push({ label, item: item.name, runs: itemRuns.map((r) => r.quantity).join(" / ") });
      blocked = true;
      continue;
    }

    const pricing = runPricing(run);
    if (pricing.saleTotal <= 0) continue;

    // Правлене руками не чіпаємо: переписуємо лише те, що ДОСІ дорівнює старій
    // формулі собівартості.
    const looksLikeOldCostFormula =
      sameMoney(item.unit_price, pricing.costUnit) || sameMoney(item.line_total, pricing.costTotal);
    if (!looksLikeOldCostFormula) {
      if (!sameMoney(item.line_total, pricing.saleTotal)) {
        skippedEdited.push({
          label,
          item: item.name,
          stored: Number(item.line_total ?? 0),
          sale: round2(pricing.saleTotal),
        });
      }
      continue;
    }

    updates.push({
      id: item.id,
      name: item.name,
      oldUnit: Number(item.unit_price ?? 0),
      oldTotal: Number(item.line_total ?? 0),
      newUnit: round2(pricing.saleUnit),
      newTotal: round2(pricing.saleTotal),
    });
    orderTouched = true;
  }

  if (!orderTouched || blocked) {
    if (blocked && updates.length > 0) {
      console.warn(`  ${label}: частина позицій без вибраного тиражу — замовлення пропускаємо цілком`);
    }
    continue;
  }

  const newOrderTotal = round2(
    items.reduce((sum, item) => {
      const update = updates.find((entry) => entry.id === item.id);
      return sum + (update ? update.newTotal : Number(item.line_total ?? 0));
    }, 0)
  );

  planned.push({
    orderId: order.id,
    label,
    currency: order.currency || "UAH",
    oldOrderTotal: Number(order.total ?? 0),
    newOrderTotal,
    orderStatus: order.order_status,
    paymentStatus: order.payment_status,
    updates,
  });
}

const money = (value) => value.toFixed(2).padStart(12);

console.log(`Замовлень: ${orders.length} · позицій: ${orderItems.length} · тиражів: ${runs.length}\n`);
console.log(`ДО ПЕРЕРАХУНКУ: ${planned.length}`);
for (const entry of planned) {
  console.log(
    `  ${entry.label.padEnd(16)} ${money(entry.oldOrderTotal)} -> ${money(entry.newOrderTotal)} ${entry.currency}` +
      `   [${entry.orderStatus} / ${entry.paymentStatus}]`
  );
  for (const update of entry.updates) {
    console.log(
      `      ${update.name.slice(0, 40).padEnd(42)} ${money(update.oldTotal)} -> ${money(update.newTotal)}`
    );
  }
}

if (needsChoice.length > 0) {
  console.log(`\nПОТРЕБУЄ РІШЕННЯ (кілька тиражів, жоден не позначений): ${needsChoice.length}`);
  for (const entry of needsChoice) {
    console.log(`  ${entry.label.padEnd(16)} ${entry.item.slice(0, 40).padEnd(42)} тиражі: ${entry.runs}`);
  }
}

if (skippedEdited.length > 0) {
  console.log(`\nНЕ ЧІПАЄМО (ціна вже не за старою формулою): ${skippedEdited.length}`);
  for (const entry of skippedEdited) {
    console.log(`  ${entry.label.padEnd(16)} ${entry.item.slice(0, 40).padEnd(42)} ${money(entry.stored)} (продажна ${money(entry.sale)})`);
  }
}

if (noSource.length > 0) {
  console.log(`\nПЕРЕРАХУВАТИ НЕМА З ЧОГО: ${noSource.length}`);
  for (const entry of noSource) {
    console.log(`  ${entry.label.padEnd(16)} ${money(entry.total)} — ${entry.why}`);
  }
}

if (skippedClosed.length > 0) {
  console.log(`\nЗАКРИТІ / ОПЛАЧЕНІ — не чіпаємо: ${skippedClosed.length}`);
  for (const entry of skippedClosed) {
    console.log(
      `  ${entry.label.padEnd(16)} ${money(Number(entry.order.total ?? 0))} ${entry.order.currency || "UAH"}` +
        `   [${entry.order.order_status} / ${entry.order.payment_status}]`
    );
  }
}

if (!APPLY) {
  console.log("\nЗВІТ — у базу нічого не записано. Щоб застосувати: --apply");
  process.exit(0);
}

if (planned.length === 0) {
  console.log("\nНічого застосовувати.");
  process.exit(0);
}

const backupPath = path.resolve(`scripts/.backfill-order-sale-prices.backup.${Date.now()}.json`);
await fs.writeFile(backupPath, JSON.stringify(planned, null, 2), "utf8");
console.log(`\nБекап попередніх значень: ${backupPath}`);

let okItems = 0;
let okOrders = 0;
for (const entry of planned) {
  let failed = false;
  for (const update of entry.updates) {
    const { error } = await supabase
      .from("order_items")
      .update({ unit_price: update.newUnit, line_total: update.newTotal })
      .eq("id", update.id);
    if (error) {
      failed = true;
      console.error(`  ЗБІЙ ${entry.label} / ${update.name}: ${error.message}`);
    } else {
      okItems += 1;
    }
  }
  // Підсумок замовлення оновлюємо лише коли всі його позиції лягли: інакше
  // total розійшовся б із рядками, і це було б гірше за початкову помилку.
  if (failed) continue;
  const { error } = await supabase.from("orders").update({ total: entry.newOrderTotal }).eq("id", entry.orderId);
  if (error) {
    console.error(`  ЗБІЙ ${entry.label} (total): ${error.message}`);
  } else {
    okOrders += 1;
  }
}
console.log(`\nЗастосовано: позицій ${okItems}, замовлень ${okOrders}/${planned.length}`);
