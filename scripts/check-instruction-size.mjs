#!/usr/bin/env node
/**
 * Ратчет розміру інструкцій: файли, які читаються на КОЖНОМУ кроці, можуть лише
 * худнути.
 *
 * НАВІЩО. `check-file-growth.mjs` стереже код, який читають люди. Цей стереже
 * текст, який читає модель — і читає його не раз на день, а перед кожною
 * відповіддю. CLAUDE.md і AGENTS.md заходять у контекст на старті сесії й
 * лишаються там до кінця, тож кожен зайвий кілобайт множиться на кількість
 * кроків.
 *
 * Замір 29.08.2026, з якого це виросло. За 47 хвилин роботи в чотирьох сесіях
 * пішло 5.8 млн ефективних токенів, і 26% з них — постійний префікс, який
 * перечитується щокроку: системний промпт, описи інструментів, CLAUDE.md та
 * індекс автопам'яті. Сам CLAUDE.md непомітно доріс до 16.2 кБ, індекс — до
 * 21.5 кБ. Обидва того ж дня зрізали руками (CLAUDE.md до 8.3 кБ, -49%), але
 * руками — це разова акція: файл росте по абзацу за раз, і кожен абзац окремо
 * виглядає доречним.
 *
 * ЯК ЛІКУВАТИ, КОЛИ ВПАЛО. Так само, як із гігантами коду: нове йде в ОКРЕМИЙ
 * файл, а не дописується в кінець. Правило лишається в CLAUDE.md одним рядком,
 * а історія, замір і випадок, з якого правило народилось, переїжджають у
 * `docs/CLAUDE_RULES_RATIONALE.md` — його читають на вимогу. Рідковживана
 * інструкція («як робити міграцію», «як ревʼю фінансів») — це взагалі не
 * CLAUDE.md, а скіл: скіли вантажаться тоді, коли потрібні.
 *
 * Офіційна рекомендація — тримати CLAUDE.md до 200 рядків і виносити вузьке в
 * скіли; стелі нижче з нею узгоджені.
 *
 * ПІДІЙМАТИ СТЕЛЮ МОЖНА, але це свідоме рішення, а не спосіб пропустити пуш.
 * Піднімаєш — напиши в коміті, яке правило не вмістилось у рядок і чому його
 * не можна було винести. Опускає стеля себе сама: `npm run docs:sync`.
 *
 * ЧОМУ ІНДЕКС ПАМʼЯТІ ТУТ ЛИШЕ ПОРАДОЮ. `MEMORY.md` живе поза репозиторієм
 * (`~/.claude/projects/<проєкт>/memory/`), тож у CI його немає взагалі. Робити
 * його частиною гейта означало б зелено на сервері й червоно на машині — гірше,
 * ніж не перевіряти. Тому локально він лише нагадує про себе рядком, а код
 * виходу від нього не залежить.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Стелі в БАЙТАХ на 29.08.2026, одразу після ручного зрізання.
 *
 * Байти, а не рядки: у цих файлах рядок буває і на три слова, і на абзац, а
 * в контекст їде саме обсяг тексту. Кирилиця важить два байти на символ —
 * число виглядає більшим за звичне, але порівнюється воно саме з собою.
 */
const CEILINGS = {
  "CLAUDE.md": 8312,
  "AGENTS.md": 8525,
};

/** Індекс автопамʼяті: порада, а не гейт (див. шапку). */
const MEMORY_INDEX = join(
  homedir(),
  ".claude/projects/-Users-artem-Projects-tosho-crm/memory/MEMORY.md"
);
const MEMORY_SOFT_LIMIT = 20_000;

/** Наскільки файл має схуднути, щоб стелю варто було опустити. */
const NOTABLE_SHRINK = 300;

const ЛАГОДИМО = process.argv.includes("--fix");

const grown = [];
const shrunk = [];
const missing = [];

for (const [file, ceiling] of Object.entries(CEILINGS)) {
  if (!existsSync(file)) {
    missing.push(file);
    continue;
  }
  const bytes = statSync(file).size;
  if (bytes > ceiling) grown.push({ file, bytes, ceiling });
  else if (ceiling - bytes >= NOTABLE_SHRINK) shrunk.push({ file, bytes, ceiling });
}

if (ЛАГОДИМО && shrunk.length > 0) {
  const self = new URL(import.meta.url).pathname;
  let source = readFileSync(self, "utf8");
  for (const { file, bytes, ceiling } of shrunk) {
    source = source.replace(new RegExp(`("${file}":\\s*)${ceiling}`), `$1${bytes}`);
    console.log(`[інструкції] стеля опущена: ${file} ${ceiling} → ${bytes}`);
  }
  writeFileSync(self, source, "utf8");
}

if (!ЛАГОДИМО) {
  for (const { file, bytes, ceiling } of shrunk) {
    console.log(
      `[інструкції] ${file} схуднув: ${bytes} Б замість ${ceiling}. Опусти стелю: npm run docs:sync.`
    );
  }
}

// Порада про індекс памʼяті. Мовчить, коли файлу немає (CI) або коли він у межах.
if (existsSync(MEMORY_INDEX)) {
  const bytes = statSync(MEMORY_INDEX).size;
  if (bytes > MEMORY_SOFT_LIMIT) {
    console.log(
      `[інструкції] індекс памʼяті ${bytes} Б (порада: до ${MEMORY_SOFT_LIMIT}). ` +
        `Він теж їде в кожен крок — час прибрати зайві рядки або злити сусідні записи.`
    );
  }
}

if (missing.length > 0) {
  for (const file of missing) {
    console.error(`[інструкції] ✖ ${file} зник, а він читається на старті кожної сесії.`);
  }
  process.exit(1);
}

if (grown.length === 0) {
  const under = Object.keys(CEILINGS).length;
  console.log(`[інструкції] під наглядом ${under} файли, жоден не виріс`);
  process.exit(0);
}

for (const { file, bytes, ceiling } of grown) {
  console.error(
    `[інструкції] ✖ ${file} виріс: ${bytes} Б замість ${ceiling} (+${bytes - ceiling}).`
  );
}
console.error(
  "[інструкції] Правило лишай рядком у CLAUDE.md, а історію винеси в " +
    "docs/CLAUDE_RULES_RATIONALE.md; рідковживану інструкцію — у скіл."
);
process.exit(1);
