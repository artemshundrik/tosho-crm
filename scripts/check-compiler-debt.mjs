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
 */
const ALLOWED_COMPILER_VIOLATIONS = 39;

const COMPILER_RULES = new Set([
  "react-hooks/purity",
  "react-hooks/immutability",
  "react-hooks/set-state-in-effect",
]);

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

if (compilerIssues.length > ALLOWED_COMPILER_VIOLATIONS) {
  console.error(
    `[компілятор] борг виріс: ${compilerIssues.length} замість дозволених ${ALLOWED_COMPILER_VIOLATIONS}.`
  );
  console.error("[компілятор] Кожне таке місце — зайвий прохід рендеру. Подробиці:");
  console.error("[компілятор]   npm run lint:compiler");
  console.error("[компілятор] Три відповіді залежно від випадку описані в картці REQ-90.");
  process.exit(1);
}

if (compilerIssues.length < ALLOWED_COMPILER_VIOLATIONS) {
  console.log(
    `[компілятор] борг зменшився: ${compilerIssues.length} замість ${ALLOWED_COMPILER_VIOLATIONS}.`
  );
  console.log(
    `[компілятор] Опусти ALLOWED_COMPILER_VIOLATIONS до ${compilerIssues.length} у scripts/check-compiler-debt.mjs, щоб зафіксувати результат.`
  );
} else {
  console.log(`[компілятор] борг на місці: ${compilerIssues.length}`);
}
