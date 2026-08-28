/**
 * Гейт `commit-msg`: не дати створити коміт, у якому REQ-номер стоїть повз
 * трейлер «Закриває:».
 *
 * НАВІЩО ОКРЕМИЙ ГЕЙТ, А НЕ САМОГО ЛИШЕ ТРЕЙЛЕРА. Читати тільки трейлер
 * (scripts/lib/devRequestCommitHook.mjs) досить, щоб хук перестав закривати
 * чужі картки. Але тоді з'являється дірка в інший бік: людина пише в тілі
 * «закриває REQ-17», трейлер забуває — і дошка мовчки не рухається. Одну тиху
 * брехню замінили б на іншу, а перевіряти довелось би знову очима.
 *
 * Тому рішення ухвалюється тут, до того як коміт існує: або намір заявлено
 * трейлером, або номер написано словами. Третього стану немає.
 *
 * ЧОМУ САМЕ `commit-msg`, А НЕ `post-commit`. Тут падіння безкоштовне: коміта
 * ще немає, git просто лишає повідомлення в редакторі. Виправляти після факту
 * довелось би через `--amend` або `reset --soft`, а обидва лишають сироту в
 * tosho.commits — зайву «зміну» в розділі «Релізи».
 *
 * Обійти разово: `git commit --no-verify` або `SKIP_CHECKS=1 git commit`.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { extractMentions, findProseMentions, TRAILER_KEY } from "./devRequestCommitHook.mjs";

/**
 * Межа, після якої йде не повідомлення, а показаний діф (`git commit --verbose`,
 * cleanup=scissors). Рядки дифа НЕ закоментовані, тож без цього різу гейт
 * спіткнувся б об `REQ-` у власному ж коді.
 */
const SCISSORS = /^#[ \t]*-+[ \t]*>8[ \t]*-+/m;

/** Трейлер, у якому не збіглась жодна адреса, — майже завжди одрук у ній. */
const TRAILER_LINE = /^[ \t]*закриває[ \t]*:[ \t]*(.*)$/i;

/** Повідомлення без хвоста з дифом. */
export function stripScissors(text) {
  if (typeof text !== "string") return "";
  const match = text.match(SCISSORS);
  return match ? text.slice(0, match.index) : text;
}

/**
 * Що не так із повідомленням: `[]` — усе гаразд.
 *
 * Два різні недогляди, і обидва раніше коштували мовчання:
 *   `prose`  — номер у тексті повз трейлер (закривав чужу картку);
 *   `empty`  — трейлер є, а розібраної адреси в ньому немає (не робив нічого).
 */
export function checkMessage(text) {
  const message = stripScissors(text);
  const problems = findProseMentions(message).map((mention) => ({ kind: "prose", ...mention }));

  message.split("\n").forEach((line, index) => {
    const match = line.match(TRAILER_LINE);
    if (!match) return;
    if (extractMentions(line).length > 0) return;
    problems.push({ kind: "empty", line: index + 1, text: line.trim() });
  });

  return problems;
}

/** Текст для людини — рівно те, що вона побачить замість створеного коміта. */
export function formatProblems(problems) {
  const prose = problems.filter((problem) => problem.kind === "prose");
  const empty = problems.filter((problem) => problem.kind === "empty");
  const out = [];

  if (prose.length > 0) {
    out.push("[запити] коміт не створено: REQ-номер стоїть повз трейлер.");
    out.push("");
    for (const problem of prose) {
      const label = problem.item ? `REQ-${problem.number}#${problem.item}` : `REQ-${problem.number}`;
      out.push(`  рядок ${problem.line}: ${problem.text}`);
      out.push(`             ↑ ${label}`);
    }
    out.push("");
    out.push("Згадка в прозі більше нічого не закриває. Заборонена вона тому, що інакше");
    out.push("ти написав би про картку, а дошка не зрушила б — і помітив би це очима.");
  }

  if (empty.length > 0) {
    if (out.length > 0) out.push("");
    out.push("[запити] коміт не створено: у трейлері немає жодної адреси.");
    out.push("");
    for (const problem of empty) {
      out.push(`  рядок ${problem.line}: ${problem.text}`);
    }
    out.push("");
    out.push("Найчастіше це одрук в адресі: «REQ-180#p1abc», «REQ-180#», «картку 180».");
  }

  out.push("");
  out.push("Що зробити:");
  out.push(`  • цей коміт справді закриває картку → окремим рядком у кінці:`);
  out.push(`        ${TRAILER_KEY}: REQ-17`);
  out.push(`    пункт чекліста — з адресою: ${TRAILER_KEY}: REQ-180#p1`);
  out.push(`    кілька за раз — через кому: ${TRAILER_KEY}: REQ-17, REQ-180#p1`);
  out.push("  • згадка довідкова → напиши словами: «картка 17», «задача про ТТН»");
  out.push("");
  out.push("Разовий обхід: git commit --no-verify");

  return out.join("\n");
}

function main() {
  if (process.env.SKIP_CHECKS === "1") return 0;

  const path = process.argv[2];
  if (!path) return 0;

  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    // Файла немає — це не наша справа й точно не привід валити коміт.
    return 0;
  }

  const problems = checkMessage(text);
  if (problems.length === 0) return 0;

  console.error(formatProblems(problems));
  return 1;
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entry === import.meta.url) {
  try {
    process.exit(main());
  } catch (error) {
    // Зламаний гейт не має ставати причиною незробленого коміта.
    console.warn(`[запити] гейт не спрацював: ${error?.message ?? error}`);
    process.exit(0);
  }
}
