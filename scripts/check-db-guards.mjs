#!/usr/bin/env node
/**
 * П'ять перевірок безпеки бази — перед пушем, поки помилка ще безкоштовна (REQ-104).
 *
 * НАВІЩО. Схема їде на прод руками, через psql, і жоден автоматичний захист її
 * не дивиться. Ціна вже траплялась: у серпні 2026 таблиці `user_profiles` і
 * `team_member_*_events` жили БЕЗ RLS із грантом anon — кадрові дані команди
 * лежали відкритими, і знайшов це разовий аудит, а не перевірка. До того ж, у
 * липні через в'юху без `security_invoker` стався витік P0.
 *
 * ЩО ПЕРЕВІРЯЄМО:
 *
 *   1. Таблиці в tosho/public без RLS. Найгірше з чотирьох: право без політики
 *      = відкриті дані.
 *   2. Гранти anon на таблиці та в'юхи. Саме по собі не дірка (RLS усе одно
 *      віддасть нуль рядків), але в парі з пунктом 3 — саме той витік.
 *   3. В'юхи без security_invoker = true: читають правами власника, тобто повз
 *      RLS таблиць під ними.
 *   4. SECURITY DEFINER-функції без закріпленого search_path: викликач може
 *      підсунути свою схему й підмінити таблицю під функцією з правами власника.
 *   5. Політики, які вирішують доступ по членству, але не доходять до гейта
 *      заблокованих (REQ-257). Канонічний `is_team_member` тримає цей гейт
 *      усередині; хто розкладає хелпер на частини заради швидкості, легко
 *      забирає половину — і звільнений знову бачить дані.
 *
 * ЦЕ РАТЧЕТ, А НЕ ІДЕАЛ. На день заведення на проді вже було 69 таких місць —
 * якби перевірка падала на них, її б вимкнули першого ж дня. Тому знімок боргу
 * лежить у db-guards-baseline.mjs, і падаємо ми лише на НОВОМУ. Погашений борг
 * не валить пуш, але про нього голосно нагадується: рядок треба прибрати з
 * базового рівня, інакше дірка зможе повернутись мовчки.
 *
 * БЕЗ БАЗИ ПІД РУКОЮ (CI, свіжий клон, чужа машина) — мовчки пропускаємо. Та
 * сама угода, що в check-cron-endpoints.mjs: перевірка з даних, яких немає,
 * гірша за її відсутність.
 *
 * Запуск: node scripts/check-db-guards.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import {
  ANON_GRANTS,
  DEFINER_WITHOUT_SEARCH_PATH,
  POLICIES_WITHOUT_BLOCK_GATE,
  TABLES_WITHOUT_RLS,
  VIEWS_WITHOUT_INVOKER,
} from "./db-guards-baseline.mjs";

const psql = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";
const dbUrl = process.env.BACKUP_DB_URL || "";

if (!dbUrl || !existsSync(psql)) {
  console.log("Захист БД: бази під рукою немає — перевірку пропускаю.");
  process.exit(0);
}

const CHECKS = [
  {
    key: "rls",
    title: "таблиці без RLS",
    baseline: TABLES_WITHOUT_RLS,
    hint: "alter table <таблиця> enable row level security; і додайте політику — без неї таблиця стане порожньою для застосунку.",
    sql: `select n.nspname || '.' || c.relname
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where c.relkind = 'r'
             and n.nspname in ('tosho', 'public')
             and not c.relrowsecurity
           order by 1`,
  },
  {
    key: "anon",
    title: "гранти anon",
    baseline: ANON_GRANTS,
    hint: "revoke all on <об'єкт> from anon; — якщо анонімний доступ справді потрібен, поясніть це в коміті й допишіть у базовий рівень.",
    sql: `select distinct table_schema || '.' || table_name
            from information_schema.role_table_grants
           where grantee = 'anon'
             and table_schema in ('tosho', 'public')
           order by 1`,
  },
  {
    key: "views",
    title: "в'юхи без security_invoker",
    baseline: VIEWS_WITHOUT_INVOKER,
    hint: "alter view <в'юха> set (security_invoker = true); і перевірте, що застосунок не втратив рядків.",
    sql: `select n.nspname || '.' || c.relname
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where c.relkind in ('v', 'm')
             and n.nspname in ('tosho', 'public')
             and coalesce((select option_value from pg_options_to_table(c.reloptions)
                            where option_name = 'security_invoker'), 'false') <> 'true'
           order by 1`,
  },
  {
    key: "definer",
    title: "SECURITY DEFINER без search_path",
    baseline: DEFINER_WITHOUT_SEARCH_PATH,
    hint: "alter function <функція> set search_path = tosho, public, pg_temp;",
    sql: `select n.nspname || '.' || p.proname
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where p.prosecdef
             and n.nspname in ('tosho', 'public')
             and not exists (
                   select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                    where cfg like 'search_path=%')
           order by 1`,
  },
  {
    key: "block-gate",
    title: "політики без гейта заблокованих",
    baseline: POLICIES_WITHOUT_BLOCK_GATE,
    hint: "допишіть `and not tosho.is_user_blocked((select auth.uid()))` або поверніться на одноаргументний хелпер — див. «RLS: per-row check vs once-per-query» у docs/DB_MAP.md.",
    sql: `select p.schemaname || '.' || p.tablename || ': ' || p.policyname
            from pg_policies p
           where p.schemaname in ('tosho', 'public')
             and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) not like '%is_user_blocked%'
             and (
                   (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) like '%get_my_team_ids%'
                or (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ 'is_workspace_(admin|owner)\\([^()]*,'
                or (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ '(from|join)\\s+(public\\.)?team_members'
                or (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ '(from|join)\\s+tosho\\.memberships'
                 )
           order by 1`,
  },
];


const ask = (sql) =>
  execFileSync(psql, [dbUrl, "-X", "-A", "-t", "-c", sql], {
    encoding: "utf8",
    timeout: 20_000,
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const нове = [];
const погашене = [];

for (const check of CHECKS) {
  let rows;
  try {
    rows = ask(check.sql);
  } catch (error) {
    console.log(
      `Захист БД: база не відповіла (${String(error.message).split("\n")[0]}) — перевірку пропускаю.`
    );
    process.exit(0);
  }

  const found = new Set(rows);
  for (const item of found) {
    if (!check.baseline.has(item)) нове.push({ check, item });
  }
  for (const item of check.baseline) {
    if (!found.has(item)) погашене.push({ check, item });
  }
}

if (погашене.length > 0) {
  console.log("\nЗахист БД: борг погашено — приберіть ці рядки з db-guards-baseline.mjs:");
  for (const { check, item } of погашене) console.log(`  [${check.title}] ${item}`);
  console.log("  Поки вони там, та сама дірка зможе повернутись мовчки.");
}

if (нове.length > 0) {
  console.error("\nЗахист БД: у базі з'явилось нове, чого не було в базовому рівні:\n");
  const byCheck = new Map();
  for (const { check, item } of нове) {
    if (!byCheck.has(check)) byCheck.set(check, []);
    byCheck.get(check).push(item);
  }
  for (const [check, items] of byCheck) {
    console.error(`  ${check.title}:`);
    for (const item of items) console.error(`    ${item}`);
    console.error(`    → ${check.hint}\n`);
  }
  console.error("Якщо так і задумано — допишіть у scripts/db-guards-baseline.mjs і поясніть у коміті, чому інакше не можна.");
  process.exit(1);
}

const total = CHECKS.reduce((sum, check) => sum + check.baseline.size, 0);
console.log(`Захист БД: ${CHECKS.length} перевірок, нового немає (у базовому рівні ${total} відомих місць).`);
