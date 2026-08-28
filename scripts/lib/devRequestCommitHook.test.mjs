import { describe, expect, it } from "vitest";
import {
  extractChecklistMentions,
  extractMentions,
  extractRequestNumbers,
  findProseMentions,
  localDay,
  looksLikePapercut,
  MAX_NUMBERS,
  readEnvValue,
  scanMentions,
  shouldRemind,
} from "./devRequestCommitHook.mjs";

/**
 * Ціна помилки тут несиметрична.
 *
 * Пропущена згадка — картка лишилась на місці, людина пересуне її руками й
 * побурчить. Хибна згадка — чужа картка поїхала в «Готово локально» без жодного
 * коду під нею, і дошка почала брехати мовчки. Тому «схожі, але не ті» рядки
 * перевіряємо прискіпливіше, ніж прямі влучання.
 */

describe("картку закриває трейлер, а не текст", () => {
  it("одна згадка", () => {
    expect(extractRequestNumbers("fix(запити): дошка не оновлюється\n\nЗакриває: REQ-4")).toEqual([4]);
  });

  it("кілька в одному рядку — усі, в порядку появи", () => {
    expect(extractRequestNumbers("feat: спільна панель дати\n\nЗакриває: REQ-7, REQ-4")).toEqual([7, 4]);
  });

  it("кілька трейлерів — теж усі", () => {
    const message = "feat: щось велике\n\nЗакриває: REQ-7\nЗакриває: REQ-4";
    expect(extractRequestNumbers(message)).toEqual([7, 4]);
  });

  it("регістр не має значення — ні в ключі, ні в номері", () => {
    expect(extractRequestNumbers("fix: щось\n\nзакриває: req-12")).toEqual([12]);
    expect(extractRequestNumbers("fix: щось\n\nЗАКРИВАЄ: Req-12")).toEqual([12]);
  });

  it("пробіли навколо двокрапки не заважають", () => {
    expect(extractRequestNumbers("fix: щось\n\nЗакриває  :   REQ-12")).toEqual([12]);
  });

  it("ВІДСТУП — уже не трейлер: з відступом це приклад формату в тексті", () => {
    // На цьому провалився найперший коміт із новим правилом: у тілі лежав
    // приклад блоком коду, і хук закрив по ньому справжню картку — саме ту, яку
    // годиною раніше повертали SQL-ом по проду.
    expect(extractRequestNumbers("fix: щось\n\n    Закриває: REQ-12")).toEqual([]);
    expect(extractRequestNumbers("fix: щось\n\n\tЗакриває: REQ-12")).toEqual([]);
  });

  it("приклад із `REQ-N` не збігається взагалі — так його й пишуть", () => {
    expect(extractRequestNumbers("fix: щось\n\nЗакриває: REQ-N")).toEqual([]);
  });

  it("жодного трейлера — порожньо, і хук просто вийде", () => {
    expect(extractRequestNumbers("chore: підняв залежності")).toEqual([]);
    expect(extractRequestNumbers("")).toEqual([]);
    expect(extractRequestNumbers(undefined)).toEqual([]);
    expect(extractRequestNumbers(null)).toEqual([]);
  });

  it("стеля на один коміт — щоб зіпсований трейлер не став пачкою записів", () => {
    const many = Array.from({ length: MAX_NUMBERS + 5 }, (_, index) => `REQ-${index + 1}`).join(", ");
    expect(extractRequestNumbers(`fix: щось\n\nЗакриває: ${many}`)).toHaveLength(MAX_NUMBERS);
  });

  it("повторний виклик дає той самий результат — регулярка не тягне за собою стан", () => {
    const message = "fix: щось\n\nЗакриває: REQ-4, REQ-5";
    expect(extractRequestNumbers(message)).toEqual([4, 5]);
    expect(extractRequestNumbers(message)).toEqual([4, 5]);
  });
});

/**
 * Головний опис файлу. Кожен рядок тут колись зрушив би чужу картку — і три
 * рази справді зрушив: REQ-62 (20.08), REQ-69 з REQ-133 (24.08), REQ-17
 * (28.08, з нього деплой устиг зробити «Викочено»).
 */
describe("проза не закриває нічого", () => {
  it("той самий рядок, який коштував REQ-17", () => {
    const message = [
      "Черга запитів у Telegram і ззовні тепер показує, що взято на сьогодні",
      "",
      "Основна вибірка — 50 найсвіжіших, і стара картка (REQ-17 заведено в",
      "травні) у неї не потрапляє: полиця мовчки губила саме те, чим ти зараз",
      "зайнятий.",
    ].join("\n");
    expect(extractRequestNumbers(message)).toEqual([]);
    expect(extractMentions(message)).toEqual([]);
  });

  it("згадка НА ПОЧАТКУ рядка — так само проза", () => {
    // Саме тому правило не «на початку рядка»: тіло коміта загортається по 78
    // символів, і те, де опинилась згадка, вирішує ширина абзацу, а не автор.
    expect(extractRequestNumbers("fix: щось\n\nREQ-17 заведено в травні, і це важливо.")).toEqual([]);
  });

  it("слово «закриває» в тексті без двокрапки — теж проза", () => {
    expect(extractRequestNumbers("fix: щось\n\nЦей коміт закриває REQ-4 остаточно.")).toEqual([]);
  });

  it("трейлер у коментарі git не рахується — його не буде в коміті", () => {
    expect(extractRequestNumbers("fix: щось\n\n# Закриває: REQ-4")).toEqual([]);
  });

  it("проза видима окремо — гейт має показати місце", () => {
    const message = "fix: щось\n\nСтара картка REQ-17 сюди не потрапляє.\n\nЗакриває: REQ-4";
    expect(findProseMentions(message)).toEqual([
      { number: 17, item: null, line: 3, text: "Стара картка REQ-17 сюди не потрапляє." },
    ]);
    expect(extractRequestNumbers(message)).toEqual([4]);
  });
});

describe("сирий сканер — точність самої згадки", () => {
  it("розділові знаки поруч не заважають", () => {
    expect(scanMentions("(REQ-4), REQ-5. REQ-6; REQ-7/REQ-8").map((m) => m.number)).toEqual([
      4, 5, 6, 7, 8,
    ]);
  });

  /**
   * Ціна помилки тут несиметрична. Пропущена згадка — картка лишилась на
   * місці, людина пересуне її руками й побурчить. Хибна згадка — чужа картка
   * поїхала в «Готово локально» без жодного коду під нею.
   */
  it("схожі, але НЕ ті рядки — ігноруємо", () => {
    const notMentions = [
      "feat: REQUEST-4 від клієнта", // інше слово, що починається на REQ
      "fix: PREQ-4 у назві гілки", // літера перед REQ
      "fix: xREQ-4", // те саме, іншою літерою
      "fix: SEQ-4 у нумерації", // схожа абревіатура
      "fix: REQ4 без дефіса",
      "fix: REQ_4 з підкресленням",
      "fix: REQ - 4 з пробілами",
      "fix: REQ-abc",
      "fix: REQ-",
      "fix: REQ-42abc — номер злився зі словом",
      "fix: REQ-0 не буває", // нумерація починається з одиниці
      "fix: 7REQ-4", // цифра перед REQ
    ];
    for (const message of notMentions) {
      expect(scanMentions(message), message).toEqual([]);
      expect(extractRequestNumbers(`fix: щось\n\nЗакриває: ${message}`), message).toEqual([]);
    }
  });
});

describe("токен із файла скіла", () => {
  it("звичайний рядок", () => {
    expect(readEnvValue("TOSHO_CAPTURE_TOKEN=abc123\n", "TOSHO_CAPTURE_TOKEN")).toBe("abc123");
  });

  it("лапки, export і сусідні ключі", () => {
    const text = ["# коментар", "OTHER=ні", "export TOSHO_CAPTURE_TOKEN = 'abc123'", ""].join("\n");
    expect(readEnvValue(text, "TOSHO_CAPTURE_TOKEN")).toBe("abc123");
  });

  it("немає ключа або порожнє значення — null, і хук мовчки вийде", () => {
    expect(readEnvValue("OTHER=1", "TOSHO_CAPTURE_TOKEN")).toBe(null);
    expect(readEnvValue("TOSHO_CAPTURE_TOKEN=", "TOSHO_CAPTURE_TOKEN")).toBe(null);
    expect(readEnvValue("", "TOSHO_CAPTURE_TOKEN")).toBe(null);
  });

  it("ключ, який лише починається так само, за токен не сходить", () => {
    expect(readEnvValue("TOSHO_CAPTURE_TOKEN_OLD=abc", "TOSHO_CAPTURE_TOKEN")).toBe(null);
  });
});


/**
 * Адреса пункта — місце, де ціна помилки НАЙВИЩА за весь хук.
 *
 * Голий «REQ-180» на накопичувачі дрібниць ставить йому «Готово локально», а
 * наступний деплой — «Викочено». Викочену картку зрушити не можна (409), тож
 * зникає не задача, а ЦІЛА ПОЛИЦЯ НАПРЯМУ з усіма невирішеними дрібницями.
 * Тому одрук в адресі має провалюватись у «нічого не збіглось», а не
 * відкочуватись до згадки картки.
 */
/**
 * Голий «REQ-180» на накопичувачі дрібниць ставить йому «Готово локально», а
 * наступний деплой — «Викочено». Викочену картку зрушити не можна (409), тож
 * зникає не задача, а ЦІЛА ПОЛИЦЯ НАПРЯМУ з усіма невирішеними дрібницями.
 * Тому одрук в адресі має провалюватись у «нічого не збіглось», а не
 * відкочуватись до згадки картки.
 */
describe("адреса пункта чекліста", () => {
  const trailer = (value) => `fix: причина скасування\n\nЗакриває: ${value}`;

  it("хвіст #p1 читається як пункт, а не як картка", () => {
    expect(extractMentions(trailer("REQ-180#p1"))).toEqual([{ number: 180, item: "p1" }]);
    expect(extractRequestNumbers(trailer("REQ-180#p1"))).toEqual([]);
  });

  it("без хвоста — як було: картка", () => {
    expect(extractMentions(trailer("REQ-180"))).toEqual([{ number: 180, item: null }]);
    expect(extractChecklistMentions(trailer("REQ-180"))).toEqual([]);
  });

  it("зіпсована адреса не відкочується до згадки картки", () => {
    // Найнебезпечніший випадок усього хука: одрук в адресі НЕ має ставати
    // згадкою накопичувача. Краще не спрацювати зовсім — а на порожньому
    // трейлері коміт тепер і зовсім не створиться (devRequestCommitGate).
    expect(extractMentions(trailer("REQ-180#p1abc"))).toEqual([]);
    expect(extractMentions(trailer("REQ-180#шось"))).toEqual([]);
    expect(extractMentions(trailer("REQ-180#"))).toEqual([]);
  });

  it("два пункти однієї картки — це дві різні роботи, не дубль", () => {
    expect(extractMentions(trailer("REQ-180#p1, REQ-180#p2"))).toEqual([
      { number: 180, item: "p1" },
      { number: 180, item: "p2" },
    ]);
  });

  it("той самий пункт двічі — один раз", () => {
    expect(extractMentions("fix: щось\n\nЗакриває: REQ-180#p1\nЗакриває: REQ-180#p1")).toEqual([
      { number: 180, item: "p1" },
    ]);
  });

  it("картка й пункт в одному коміті розходяться по різних кошиках", () => {
    const message = trailer("REQ-15, REQ-180#p1");
    expect(extractRequestNumbers(message)).toEqual([15]);
    expect(extractChecklistMentions(message)).toEqual([{ number: 180, item: "p1" }]);
  });

  it("регістр адреси не має значення", () => {
    expect(extractMentions(trailer("req-180#P1"))).toEqual([{ number: 180, item: "p1" }]);
  });
});

describe("літера в адресі пункта", () => {
  it("читає не тільки «p», а й «t» — на дошці є обидва", () => {
    // REQ-123 має пункти t1…t3. До 27.08.2026 регулярка знала лише `p`, тож
    // «REQ-123#t3» не збігався НІ як пункт, ні як картка: гак мовчки нічого не
    // робив — ні помилки, ні рядка в консолі, а робота лишалась незакритою.
    const message = "Перевірка типів пришвидшилась\n\nЗакриває: REQ-123#t3";
    expect(extractMentions(message)).toEqual([{ number: 123, item: "t3" }]);
    expect(extractRequestNumbers(message)).toEqual([]);
  });
});


/**
 * Нагадування про полицю дрібниць. Пороги тісні навмисно: зайвий рядок на
 * великому коміті — це шум, який починаєш гортати повз, і тоді нагадування не
 * спрацює й там, де воно потрібне.
 */
describe("чи схоже на дрібницю", () => {
  it("один файл і кілька рядків — так", () => {
    expect(looksLikePapercut("7\t4\tsrc/components/ui/sheet.tsx")).toBe(true);
  });

  it("тести з підрахунку виключені — дрібниця з тестом лишається дрібницею", () => {
    // Рівно те, на чому спіткнулась перша редакція: власний тест лягав у той
    // самий коміт і роздував його вдесятеро, тож нагадування мовчало саме там,
    // де робота була зроблена ретельно.
    const commit = ["109\t0\tsrc/components/app/NotificationsMenu.test.tsx", "22\t2\tsrc/components/app/NotificationsMenu.tsx"].join("\n");
    expect(looksLikePapercut(commit)).toBe(true);
  });

  it("чотири файли свого коду — вже ні", () => {
    const commit = ["1\t1\ta.ts", "1\t1\tb.ts", "1\t1\tc.ts", "1\t1\td.ts"].join("\n");
    expect(looksLikePapercut(commit)).toBe(false);
  });

  it("один файл, переписаний цілком — ні", () => {
    expect(looksLikePapercut("400\t120\tsrc/pages/QuotesPage.tsx")).toBe(false);
  });

  it("двійковий файл рахується як файл без рядків", () => {
    expect(looksLikePapercut("-\t-\tpublic/logo.png")).toBe(true);
  });

  it("нічого не розібралось — мовчимо", () => {
    expect(looksLikePapercut("")).toBe(false);
    expect(looksLikePapercut(undefined)).toBe(false);
    expect(looksLikePapercut(null)).toBe(false);
    expect(looksLikePapercut("Merge branch 'main'")).toBe(false);
  });

  it("коміт із самих тестів — не дрібниця, там нема чого записувати", () => {
    expect(looksLikePapercut("40\t2\tsrc/lib/foo.test.ts")).toBe(false);
  });
});

/**
 * Частота — головне в цьому механізмі. Заміряно на власній історії: під
 * «дрібний і без трейлера» підпадає 22 коміти з 40. Рядок, що з'являється в
 * половині випадків, перестає читатись за день.
 */
describe("не частіше ніж раз на день", () => {
  it("першого разу за день — нагадуємо", () => {
    expect(shouldRemind("2026-08-29", null)).toBe(true);
    expect(shouldRemind("2026-08-29", "")).toBe(true);
    expect(shouldRemind("2026-08-29", "2026-08-28")).toBe(true);
  });

  it("другого разу того ж дня — мовчимо", () => {
    expect(shouldRemind("2026-08-29", "2026-08-29")).toBe(false);
    expect(shouldRemind("2026-08-29", "2026-08-29\n")).toBe(false);
  });

  it("день — місцевий, а не UTC: інакше він мінявся б о третій ночі", () => {
    // 22:30 у Києві 29-го — це вже 19:30 UTC того ж дня, але 00:30 UTC 30-го
    // настане, коли людина ще працює над «сьогоднішнім» днем.
    expect(localDay(new Date("2026-08-29T23:30:00+03:00"))).toBe("2026-08-29");
  });
});
