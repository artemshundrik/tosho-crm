#!/usr/bin/env node
/**
 * Лінт + сторож боргу перед React Compiler.
 *
 * НАВІЩО ЦЕ ОКРЕМО ВІД `npm run lint`
 *
 * Три правила — `react-hooks/purity`, `react-hooks/immutability` і
 * `react-hooks/set-state-in-effect` — перевіряють не стиль, а те, як код
 * поводитиметься під компілятором. У головному конфігу вони вимкнені, бо 33
 * наявні порушення зробили б `npm run lint` червоним і він просто не давав би
 * працювати.
 *
 * УВАГА, ЗАМІРЯНО 2026-08-21 (REQ-90): `set-state-in-effect` компіляцію НЕ
 * ламає — усі 26 файлів із цим порушенням компілятор збирає нормально. Раніше
 * тут було написано протилежне, і це виявилось припущенням, а не фактом. Ратчет
 * лишається, але заради швидкості (кожне таке місце — зайвий прохід рендеру),
 * а не заради сумісності. Подробиці заміру — в `eslint.compiler.config.mjs`.
 *
 * Але поки вони вимкнені, ніщо не заважає завтра дописати 34-те. Тому тут
 * ратчет: борг може лише зменшуватись. Виріс — пуш не проходить.
 *
 * І ЗНАЙ МЕЖУ ЦЬОГО ЧИСЛА: у компонентах із `try/catch` у тілі лінт замовкає
 * повністю (facebook/react#35644). У чотирьох найбільших сторінках він тому
 * бачить 0 порушень — не бо там чисто, а бо він туди не дістає. «33» — це не
 * увесь борг, а лише його видима частина.
 *
 * Один запуск eslint замість двох: конфіг `eslint.compiler.config.mjs` —
 * надмножина основного, тож звідси видно і звичайні помилки лінту, і борг.
 * Робити два проходи означало б чекати вдвічі довше перед кожним пушем.
 *
 * КОЛИ БОРГ СТАНЕ НУЛЕМ: перенести три правила в eslint.config.js як "error",
 * видалити eslint.compiler.config.mjs і цей файл, а в pre-push повернути
 * звичайний `npm run lint`.
 */
import { execFileSync } from "node:child_process";

/**
 * Скільки порушень дозволено. Зменшувати — руками, разом із правками, які їх
 * прибрали: це і є ратчет. Збільшувати не можна ніколи; якщо здається, що
 * треба, — значить, у код заїхав зайвий прохід рендеру, і його треба прибрати,
 * а не легалізувати.
 *
 * 39 = 38 × set-state-in-effect + 1 × immutability (picker-input:90, канонічне
 * прокидання ref; зникне, коли приберемо forwardRef по-React-19).
 *
 * ЄДИНИЙ РАЗ, КОЛИ ЧИСЛО ВИРОСЛО (33 → 39, REQ-109) — і не тому, що код
 * погіршав. У QuoteDetailsPage.tsx стояло 9 eslint-disable, а від будь-якої
 * заглушки правила react-hooks компілятор відмовляється від ФАЙЛУ ЦІЛКОМ. Тому
 * лінт там не бачив нічого — і в цих 33 сторінка давала рівно нуль, ховаючи
 * власний борг. Заглушки знято, файл зібрався, борг став видимим: +6.
 *
 * Ті 6 — не недоробка. Це «почати завантаження» і «скинути стан при переході»:
 * кожен load* починається з setLoading(true), тобто одним зайвим проходом
 * рендеру перед мережею. Такий самий борг лежить ще у 24 файлах зі списку
 * вище. Робити з нього нуль означало б ламати штатний спосіб завантаження
 * даних заради тиші лінту — 10 інших знахідок того ж заходу прибрано по-справжньому
 * (похідні значення замість ефектів), а ці лишились свідомо.
 *
 * Далі число знову ЛИШЕ ВНИЗ. Наступний, хто робитиме зрячою ще одну сторінку-
 * гіганта, натрапить на те саме: спершу перевір, чи приріст — це знятий
 * бліндфолд, а не новий зайвий прохід.
 *
 * ═══ 23.08.2026: ОДНЕ ЧИСЛО РОЗПАЛОСЬ НА П'ЯТЬ ═══
 *
 * Плагін оновився з 7.0.1 до 7.1.1 і почав бачити ту саму проблему ВП'ЯТЕРО
 * частіше: `set-state-in-effect` стало 189 замість 38. Код не змінився —
 * змінилась гострота зору. Плюс з'явились два нові правила: `refs` (10) і
 * `preserve-manual-memoization` (34).
 *
 * Одне спільне число тут перестало працювати: у сумі 244 неможливо побачити,
 * що саме поповзло, а виправлення в одному правилі мовчки прикриває регресію в
 * іншому. Тому тепер межа СВОЯ НА КОЖНЕ ПРАВИЛО — і кожна зі своєю історією.
 *
 * `refs` варто читати першим. Саме там знайшлась справжня помилка: у панелі
 * «Пульс» обчислення фільтрувало події по складу команди, читаючи його з ref, і
 * НЕ перераховувалось, коли команда приїжджала. Якщо події встигали раніше за
 * список людей, панель показувала нуль і лишалась порожньою до перезавантаження.
 * Решта 10 — «свіже значення в ref», патерн відомий і поки лишений.
 *
 * ═══ 24.08.2026: `refs` 10 → 17 ═══
 *
 * Приїхав `useModalMount` (src/components/ui/modal-mount.tsx) — ручка до вікна,
 * яка тримає `open`/`close` стабільними між рендерами, щоб не перемальовувати
 * кнопки на кожен стан модалки. Правило бачить сім місць: сам хук, його тест і
 * по одному-два виклики на DesignPage та QuotesPage.
 *
 * Звірено з тим, що описано вище: це НЕ клас помилки «Пульсу». Там ref читався
 * ПІД ЧАС ОБЧИСЛЕННЯ і не перераховувався; тут `ref.current` читається в
 * обробнику кліку, коли значення вже точно на місці, а сам ref лише передається
 * у компонент пропсом. Тобто рівно той «патерн відомий і поки лишений», яким
 * пояснені попередні десять.
 *
 * Коли гігантів розріжуть (REQ-69) і хук перестане бути потрібним для
 * стабільності пропсів — межу опустити назад; ратчет нижче сам про це нагадає.
 *
 * Тим самим заходом опущено дві межі, які ратчет показав як завищені:
 * `set-state-in-effect` 189 → 188 і `purity` 5 → 4.
 */
const ALLOWED_PER_RULE = {
  "react-hooks/set-state-in-effect": 188,
  "react-hooks/preserve-manual-memoization": 34,
  "react-hooks/refs": 17,
  "react-hooks/immutability": 6,
  "react-hooks/purity": 4,
};

const COMPILER_RULES = new Set(Object.keys(ALLOWED_PER_RULE));

function runEslint() {
  try {
    return execFileSync(
      "npx",
      ["eslint", ".", "-c", "eslint.compiler.config.mjs", "-f", "json"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
  } catch (error) {
    // eslint виходить з кодом 1, коли є помилки, — це нормальний шлях, а не збій.
    if (error.stdout) return error.stdout;
    throw error;
  }
}

const results = JSON.parse(runEslint());
const compilerIssues = [];
const otherIssues = [];

for (const file of results) {
  for (const message of file.messages) {
    if (message.severity !== 2) continue;
    const where = `${file.filePath.replace(`${process.cwd()}/`, "")}:${message.line}`;
    const entry = { where, rule: message.ruleId, text: message.message.replace(/\s+/g, " ").slice(0, 120) };
    if (COMPILER_RULES.has(message.ruleId)) compilerIssues.push(entry);
    else otherIssues.push(entry);
  }
}

if (otherIssues.length > 0) {
  console.error(`[лінт] ${otherIssues.length} помилок — це звичайний лінт, не борг компілятора:`);
  for (const issue of otherIssues.slice(0, 20)) {
    console.error(`  ${issue.where}  ${issue.rule}  ${issue.text}`);
  }
  if (otherIssues.length > 20) console.error(`  …ще ${otherIssues.length - 20}`);
  process.exit(1);
}

const countByRule = {};
for (const issue of compilerIssues) countByRule[issue.rule] = (countByRule[issue.rule] ?? 0) + 1;

const grown = Object.entries(ALLOWED_PER_RULE)
  .map(([rule, allowed]) => ({ rule, allowed, actual: countByRule[rule] ?? 0 }))
  .filter((row) => row.actual > row.allowed);

if (grown.length > 0) {
  console.error("[компілятор] борг виріс:");
  for (const row of grown) {
    console.error(`[компілятор]   ${row.rule}: ${row.actual} замість дозволених ${row.allowed}`);
    for (const issue of compilerIssues.filter((i) => i.rule === row.rule).slice(0, 5)) {
      console.error(`[компілятор]     ${issue.where}`);
    }
  }
  console.error("[компілятор] Подробиці: npm run lint:compiler");
  console.error("[компілятор] Три відповіді залежно від випадку описані в картці REQ-90.");
  process.exit(1);
}

// Межа опустилась сама — значить її треба опустити й у файлі, інакше ратчет
// мовчки дозволить борг повернутись до старого числа.
const shrunk = Object.entries(ALLOWED_PER_RULE)
  .map(([rule, allowed]) => ({ rule, allowed, actual: countByRule[rule] ?? 0 }))
  .filter((row) => row.actual < row.allowed);
if (shrunk.length > 0) {
  console.log("[компілятор] борг зменшився — опусти межу в scripts/check-compiler-debt.mjs:");
  for (const row of shrunk) console.log(`[компілятор]   ${row.rule}: ${row.actual} (у файлі ${row.allowed})`);
}

console.log(
  `[компілятор] борг на місці: ${compilerIssues.length} — ` +
    Object.entries(ALLOWED_PER_RULE)
      .map(([rule, allowed]) => `${rule.replace("react-hooks/", "")} ${countByRule[rule] ?? 0}/${allowed}`)
      .join(", ")
);
