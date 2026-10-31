#!/usr/bin/env node
/**
 * Сторож таблиць (REQ-173#p13): у компонентах немає сирого `<table>` — лише
 * `ui/table` (Table, TableHeader, TableRow…) і клітинки з `app/table-kit`.
 *
 * НАВІЩО. До 01.11.2026 в CRM жило дев'ять сирих таблиць поруч із сімнадцятьма
 * на спільному компоненті: свої висоти рядків (32–109 px), свої шапки (10 px
 * великими літерами, 12 px звичайними, 14 px жирні), свої відступи. Одна таблиця
 * на двох сторінках виглядала по-різному. Їх переведено; сторож не дає новим
 * з'являтись по одній.
 *
 * ЩО ПЕРЕВІРЯЄ. У `src/**\/*.tsx` поза `components/ui/table.tsx` немає тегу
 * `<table`. HTML-рядки документів (`.ts`: рахунок, акт, КП) не перевіряються —
 * там таблиця друкується, а не рендериться в інтерфейсі.
 *
 * ЯК ВИПРАВИТИ. `<Table variant="list">` + `TableHeader`/`TableBody`/`TableRow`/
 * `TableHead`/`TableCell` з `@/components/ui/table`; назва з аватаркою —
 * `TableTitleCell`, номер — `TABLE_RECORD_NUMBER_TEXT`, сума — `TABLE_MONEY_TEXT`
 * з `@/components/app/table-kit`. Таблиця всередині вікна — `bare` і
 * `[&_thead]:sticky [&_thead]:top-0`.
 *
 * ВИНЯТКИ — у ALLOW, кожен із причиною й межею кількості. Не лічильник: видно,
 * ЩО саме дозволено й чому.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src");
const OWNER = "components/ui/table.tsx";
const TAG = /<table[\s>]/g;

const ALLOW = [
  { file: "components/design/DesignersDashboard.tsx", count: 2, why: "теплокарти — сітка кольорових клітинок, не список записів" },
  { file: "components/design/DesignersPrintReport.tsx", count: 6, why: "звіт для друку з власною типографікою аркуша" },
  { file: "components/team/AccessMatrix.tsx", count: 1, why: "матриця доступів із липкою першою колонкою й поворотом шапок" },
  { file: "features/finances/FinanceReconciliation.tsx", count: 1, why: "HTML-рядок для вивантаження, не інтерфейс" },
  { file: "features/siteListing/SiteListingRow.tsx", count: 1, why: "розмірна сітка всередині картки товару" },
  { file: "pages/OrdersProductionDetailsPage.tsx", count: 4, why: "HTML рахунку для друку" },
];

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

const allow = new Map(ALLOW.map((a) => [a.file, a]));
const problems = [];

for (const abs of walk(ROOT, [])) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  if (rel === OWNER) continue;
  const found = (fs.readFileSync(abs, "utf8").match(TAG) ?? []).length;
  if (!found) continue;
  const limit = allow.get(rel)?.count ?? 0;
  if (found > limit) problems.push(`  src/${rel}: сирих <table> ${found}, дозволено ${limit}`);
}

if (problems.length) {
  console.error("[сирі таблиці] таблиця поза ui/table:");
  console.error(problems.join("\n"));
  console.error("Перенеси на <Table> з @/components/ui/table (як — у шапці scripts/check-raw-tables.mjs).");
  process.exit(1);
}
