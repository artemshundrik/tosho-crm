#!/usr/bin/env node
/**
 * Кладе eval-кейси під теку скіла, звідки їх бачить `claude plugin eval`.
 *
 * НАВІЩО КОПІЯ, А НЕ ПОСИЛАННЯ. Кейси живуть під git тут, а скіл — поза
 * репозиторієм (`~/.claude/skills/tosho-request/`). Перша редакція README
 * радила зшити їх символьним посиланням, і рецепт протримався рівно до
 * першого прогону: харнес відмовляється й читати, й писати в теку evals, яка
 * виявилась посиланням назовні («"evals" is an eval-directory link that
 * points outside the plugin — remove it»). Перевірити це раніше не було як —
 * команда була вимкнена.
 *
 * Тож копіюємо. Джерело правди лишається в репозиторії, а `results/` із
 * попередніх прогонів переживає синхронізацію: його ми не чіпаємо.
 */

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FROM = "evals/tosho-request";
const SKILL = join(homedir(), ".claude", "skills", "tosho-request");
const TO = join(SKILL, "evals");

if (!existsSync(SKILL)) {
  console.error(`Скіл не знайдено: ${SKILL}`);
  process.exit(1);
}

// Посилання від старого рецепта саме й ламає прогін — прибираємо мовчки.
if (existsSync(TO) && lstatSync(TO).isSymbolicLink()) {
  rmSync(TO);
  console.log("Прибрав старе символьне посилання evals → репозиторій.");
}

mkdirSync(TO, { recursive: true });

// Кейси знімаємо повністю: інакше перейменована тека лишиться другим кейсом.
for (const entry of readdirSync(TO)) {
  if (entry === "results") continue;
  rmSync(join(TO, entry), { recursive: true, force: true });
}

cpSync(FROM, TO, { recursive: true, filter: (src) => !src.endsWith("/results") });

const cases = readdirSync(TO).filter((e) => e !== "results" && !e.endsWith(".md")).length;
console.log(`Синхронізовано ${cases} кейсів у ${TO}`);
console.log("");
console.log("Прогін (з власного терміналу, не з сесії Claude Code):");
console.log(`  claude plugin eval ${SKILL} --runs 1 --ablation none`);
console.log("");
console.log("Якщо відповість «currently in early access» — бракує змінної:");
console.log("  CLAUDE_CODE_WALNUT_SPIRE=1 у ~/.claude/settings.json під env");
