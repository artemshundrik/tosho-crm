/**
 * Разовий бекфіл: дописати версію в імена вже завантажених файлів дизайнера.
 *
 * НАВІЩО: правило версій (src/lib/designOutputVersion.ts) діє лише для нових
 * завантажень, а в проді вже лежать сотні файлів, де друга й третя версія
 * називаються так само, як перша. У теці клієнта з них не видно, що фінал.
 *
 * ЩО РОБИТЬ: для кожної дизайн-задачі окремо по візуалах і макетах прокручує
 * ТУ САМУ логіку, що й завантаження (раунд змінюється, коли між двома
 * завантаженнями зʼявилась нова правка), і перейменовує файли з версією ≥ 2.
 * Імена перших версій лишаються недоторканими — бекфіл не чистить чужі імена
 * «про всяк випадок». Синхронно оновлює копії імені: знімки обраних файлів у
 * метаданих і дзеркала в tosho.quote_attachments (звʼязані storage-шляхом).
 *
 * ЧОГО НЕ РОБИТЬ: не чіпає жодного обʼєкта в Storage, нічого не видаляє,
 * сам у базу не пише. storage_path лишається як був — міняється тільки імʼя,
 * яке бачить людина і яке лягає у файл при скачуванні.
 *
 * ЗАПУСК:
 *   node scripts/backfill-design-output-versions.mjs
 *     — сухий прогін: рахує, показує приклади і КЛАДЕ ГОТОВИЙ SQL поруч,
 *       щоб зміну можна було прочитати очима перед застосуванням;
 *   psql "$BACKUP_DB_URL" -v ON_ERROR_STOP=1 -1 -f <шлях, який надрукує скрипт>
 *     — власне запис, однією транзакцією.
 *
 * Логіка версій береться з src/lib/designOutputVersion.ts (транспілюється
 * есбілдом у тимчасовий файл), щоб бекфіл і застосунок не розійшлись.
 * Читання з бази — через psql: у пулера самопідписаний ланцюг сертифікатів,
 * і node-клієнт довелось би просити не перевіряти TLS.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STAMP = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

// Ті самі списки, що на сторінці задачі: у частини старих файлів output_kind
// порожній, і застосунок виводить вид із розширення.
const KIND_BY_EXTENSION = {
  visualization: ["webp", "png", "jpg", "jpeg"],
  layout: ["pdf", "ai", "cdr", "mp4", "mov"],
};

function kindOf(file) {
  if (file.output_kind === "visualization" || file.output_kind === "layout") return file.output_kind;
  const name = typeof file.file_name === "string" ? file.file_name : "";
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (KIND_BY_EXTENSION.visualization.includes(ext)) return "visualization";
  if (KIND_BY_EXTENSION.layout.includes(ext)) return "layout";
  return "unknown";
}

function timestampOf(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function readConnectionString() {
  const raw = readFileSync(path.join(ROOT, ".env.backup"), "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.replace(/^export\s+/, "");
    if (!trimmed.startsWith("BACKUP_DB_URL=")) continue;
    return trimmed.slice("BACKUP_DB_URL=".length).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("У .env.backup немає BACKUP_DB_URL");
}

function queryJsonLines(connectionString, sql) {
  const out = execFileSync("psql", [connectionString, "-Aqt", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function loadVersionLib() {
  const outDir = mkdtempSync(path.join(tmpdir(), "design-version-"));
  const outFile = path.join(outDir, "designOutputVersion.mjs");
  execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
    path.join(ROOT, "src/lib/designOutputVersion.ts"),
    "--format=esm",
    `--outfile=${outFile}`,
    "--log-level=warning",
  ]);
  return import(pathToFileURL(outFile).href);
}

/** Долар-лапки знімають будь-яке екранування; тег перевіряємо на збіг із вмістом. */
function dollarQuote(value, tag) {
  const text = String(value);
  if (text.includes(`$${tag}$`)) throw new Error(`Значення містить роздільник $${tag}$: ${text}`);
  return `$${tag}$${text}$${tag}$`;
}

async function main() {
  const { applyDesignOutputVersion, resolveDesignOutputVersion } = await loadVersionLib();
  const connectionString = readConnectionString();

  const rows = queryJsonLines(
    connectionString,
    `select json_build_object('id', id, 'metadata', metadata)
       from public.activity_log
      where metadata ? 'design_output_files'
        and jsonb_array_length(metadata->'design_output_files') > 0`
  );

  const plans = [];
  for (const row of rows) {
    const metadata = row.metadata ?? {};
    const files = Array.isArray(metadata.design_output_files) ? metadata.design_output_files : [];
    const changeRequests = Array.isArray(metadata.design_brief_change_requests)
      ? metadata.design_brief_change_requests
      : [];

    // Порядок у масиві — від найновішого до найстарішого; для прокрутки
    // раундів потрібен хронологічний, тож сортуємо копію за датою.
    const byKind = new Map();
    files.forEach((file, index) => {
      const kind = kindOf(file);
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push({ file, index });
    });

    const renames = [];
    for (const entries of byKind.values()) {
      entries.sort((a, b) => {
        const diff = timestampOf(a.file.created_at) - timestampOf(b.file.created_at);
        // Однакова мітка часу — тримаємось вихідного порядку, читаючи його
        // навпаки (масив іде від найновішого).
        return diff !== 0 ? diff : b.index - a.index;
      });

      const processed = [];
      for (const entry of entries) {
        // Відтворюємо момент завантаження: тоді існували лише правки, подані
        // ДО нього. Без цього фільтра майбутні правки задачі рахувались би в
        // минуле і накручували версію (перший прогін дав v23 замість v10).
        const uploadedAt = timestampOf(entry.file.created_at);
        const knownRequests = changeRequests.filter((row) => timestampOf(row?.requested_at) <= uploadedAt);
        const version = resolveDesignOutputVersion({ changeRequests: knownRequests, existingFiles: processed });
        if (version > 1) {
          const nextName = applyDesignOutputVersion(entry.file.file_name, version);
          if (nextName && nextName !== entry.file.file_name) {
            renames.push({
              index: entry.index,
              fileId: typeof entry.file.id === "string" ? entry.file.id : null,
              storageBucket: entry.file.storage_bucket ?? null,
              storagePath: entry.file.storage_path ?? null,
              from: entry.file.file_name,
              to: nextName,
              version,
            });
          }
          processed.push({ ...entry.file, file_name: nextName });
        } else {
          processed.push(entry.file);
        }
      }
    }

    if (renames.length > 0) plans.push({ taskId: row.id, metadata, renames });
  }

  const totalRenames = plans.reduce((sum, plan) => sum + plan.renames.length, 0);
  const byVersion = new Map();
  for (const plan of plans) {
    for (const rename of plan.renames) byVersion.set(rename.version, (byVersion.get(rename.version) ?? 0) + 1);
  }

  console.log(`Задач із файлами результату: ${rows.length}`);
  console.log(`Задач до перейменування:     ${plans.length}`);
  console.log(`Файлів до перейменування:    ${totalRenames}`);
  console.log(
    `Розподіл версій:             ${[...byVersion.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([version, count]) => `v${version}: ${count}`)
      .join(", ")}`
  );
  console.log("\nПриклади:");
  for (const plan of plans.slice(0, 6)) {
    for (const rename of plan.renames.slice(0, 2)) {
      console.log(`  ${rename.from}\n    → ${rename.to}`);
    }
  }

  // Знімок «як було» — щоб відкат був механічним, а не археологією.
  const backupPath = path.join(ROOT, `backups/design-output-names-${STAMP}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      plans.map((plan) => ({ taskId: plan.taskId, design_output_files: plan.metadata.design_output_files })),
      null,
      2
    )
  );

  // Кожне перейменування — точковий апдейт ПО ID ФАЙЛУ, а не перезапис усього
  // блоку метаданих. Задачі живі: поки бекфіл виконується, хтось може додати
  // файл або правку, і перезапис блоку цілком затер би чужу зміну. Умова
  // «ім'я досі старе» робить скрипт безпечно повторюваним.
  const statements = [
    "-- Згенеровано scripts/backfill-design-output-versions.mjs",
    "-- Дописує версію в імена файлів дизайнера. Storage не чіпається.",
    `-- Задач: ${plans.length}, файлів: ${totalRenames}`,
    "-- Кожен апдейт адресний (по id файлу) і зістрибує, якщо ім'я вже інше.",
    "",
  ];
  for (const plan of plans) {
    const taskLiteral = `${dollarQuote(plan.taskId, "tid")}::uuid`;
    for (const rename of plan.renames) {
      const idLiteral = dollarQuote(rename.fileId, "fid");
      const oldLiteral = dollarQuote(rename.from, "old");
      const newLiteral = dollarQuote(rename.to, "new");
      const matches = `x->>'id' = ${idLiteral} and x->>'file_name' = ${oldLiteral}`;

      statements.push(
        `update public.activity_log al set metadata = jsonb_set(al.metadata, '{design_output_files}', (
  select jsonb_agg(case when x->>'id' = ${idLiteral} then jsonb_set(x, '{file_name}', to_jsonb(${newLiteral}::text)) else x end order by ord)
  from jsonb_array_elements(al.metadata->'design_output_files') with ordinality t(x, ord)
)) where al.id = ${taskLiteral}
  and exists (select 1 from jsonb_array_elements(al.metadata->'design_output_files') x where ${matches});`
      );

      // Знімки обраного файлу — це копії імені, а не окремі дані: лишити їх
      // старими означало б показувати два різні імені одного файлу.
      for (const key of [
        "selected_design_output_file_name",
        "selected_visual_output_file_name",
        "selected_layout_output_file_name",
      ]) {
        statements.push(
          `update public.activity_log set metadata = jsonb_set(metadata, '{${key}}', to_jsonb(${newLiteral}::text)) where id = ${taskLiteral} and metadata->>'${key.replace("_file_name", "_file_id")}' = ${idLiteral} and metadata->>'${key}' = ${oldLiteral};`
        );
      }

      if (rename.storageBucket && rename.storagePath) {
        statements.push(
          `update tosho.quote_attachments set file_name = ${newLiteral} where storage_bucket = ${dollarQuote(rename.storageBucket, "b")} and storage_path = ${dollarQuote(rename.storagePath, "p")} and file_name = ${oldLiteral};`
        );
      }
    }
  }

  const sqlPath = path.join(ROOT, `backups/design-output-versions-${STAMP}.sql`);
  writeFileSync(sqlPath, `${statements.join("\n")}\n`);

  console.log(`\nЗнімок «як було»: ${backupPath}`);
  console.log(`SQL до застосування: ${sqlPath}`);
  console.log(`Застосувати: psql "$BACKUP_DB_URL" -v ON_ERROR_STOP=1 -1 -f ${sqlPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
