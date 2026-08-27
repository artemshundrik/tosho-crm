import { describe, expect, it } from "vitest";
import {
  extractChecklistMentions,
  extractMentions,
  extractRequestNumbers,
  MAX_NUMBERS,
  readEnvValue,
} from "./devRequestCommitHook.mjs";

/**
 * Ціна помилки тут несиметрична.
 *
 * Пропущена згадка — картка лишилась на місці, людина пересуне її руками й
 * побурчить. Хибна згадка — чужа картка поїхала в «Готово локально» без жодного
 * коду під нею, і дошка почала брехати мовчки. Тому «схожі, але не ті» рядки
 * перевіряємо прискіпливіше, ніж прямі влучання.
 */

describe("витягання REQ-номерів із теми коміта", () => {
  it("одна згадка", () => {
    expect(extractRequestNumbers("fix(запити): дошка не оновлюється REQ-4")).toEqual([4]);
  });

  it("кілька згадок — усі, в порядку появи, без дублів", () => {
    const message = "feat: спільна панель дати REQ-7 і REQ-4\n\nЗакриває REQ-7 остаточно.";
    expect(extractRequestNumbers(message)).toEqual([7, 4]);
  });

  it("регістр не має значення", () => {
    expect(extractRequestNumbers("fix: req-12")).toEqual([12]);
    expect(extractRequestNumbers("fix: Req-12")).toEqual([12]);
    expect(extractRequestNumbers("fix: REQ-12")).toEqual([12]);
  });

  it("номер у тілі коміта теж рахується — його часто дописують рядком нижче", () => {
    expect(extractRequestNumbers("docs: інструкція до хука\n\nПросили в REQ-9.")).toEqual([9]);
  });

  it("розділові знаки поруч не заважають", () => {
    expect(extractRequestNumbers("fix: (REQ-4), REQ-5. REQ-6; REQ-7/REQ-8")).toEqual([4, 5, 6, 7, 8]);
  });

  it("жодної згадки — порожньо, і хук просто вийде", () => {
    expect(extractRequestNumbers("chore: підняв залежності")).toEqual([]);
    expect(extractRequestNumbers("")).toEqual([]);
    expect(extractRequestNumbers(undefined)).toEqual([]);
    expect(extractRequestNumbers(null)).toEqual([]);
  });

  /**
   * Головний тест файлу. Кожен рядок тут колись зрушив би чужу картку.
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
      expect(extractRequestNumbers(message), message).toEqual([]);
    }
  });

  it("стеля на одну тему — щоб зіпсована тема не перетворилась на пачку записів", () => {
    const many = Array.from({ length: MAX_NUMBERS + 5 }, (_, index) => `REQ-${index + 1}`).join(" ");
    expect(extractRequestNumbers(many)).toHaveLength(MAX_NUMBERS);
  });

  it("повторний виклик дає той самий результат — регулярка не тягне за собою стан", () => {
    const message = "fix: REQ-4 і REQ-5";
    expect(extractRequestNumbers(message)).toEqual([4, 5]);
    expect(extractRequestNumbers(message)).toEqual([4, 5]);
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
describe("адреса пункта чекліста", () => {
  it("хвіст #p1 читається як пункт, а не як картка", () => {
    expect(extractMentions("fix: причина скасування REQ-180#p1")).toEqual([{ number: 180, item: "p1" }]);
    expect(extractRequestNumbers("fix: причина скасування REQ-180#p1")).toEqual([]);
  });

  it("без хвоста — як було: картка", () => {
    expect(extractMentions("fix: REQ-180")).toEqual([{ number: 180, item: null }]);
    expect(extractChecklistMentions("fix: REQ-180")).toEqual([]);
  });

  it("зіпсована адреса не відкочується до згадки картки", () => {
    // Найнебезпечніший випадок усього хука: одрук в адресі НЕ має ставати
    // згадкою накопичувача. Краще не спрацювати зовсім.
    expect(extractMentions("fix: REQ-180#p1abc")).toEqual([]);
    expect(extractMentions("fix: REQ-180#шось")).toEqual([]);
    expect(extractMentions("fix: REQ-180#")).toEqual([]);
  });

  it("два пункти однієї картки — це дві різні роботи, не дубль", () => {
    expect(extractMentions("fix: REQ-180#p1 і REQ-180#p2")).toEqual([
      { number: 180, item: "p1" },
      { number: 180, item: "p2" },
    ]);
  });

  it("той самий пункт двічі — один раз", () => {
    expect(extractMentions("fix: REQ-180#p1\n\nЗакриває REQ-180#p1.")).toEqual([
      { number: 180, item: "p1" },
    ]);
  });

  it("картка й пункт в одному коміті розходяться по різних кошиках", () => {
    const message = "feat: документи замовлення REQ-15\n\nПопутно REQ-180#p1.";
    expect(extractRequestNumbers(message)).toEqual([15]);
    expect(extractChecklistMentions(message)).toEqual([{ number: 180, item: "p1" }]);
  });

  it("регістр адреси не має значення", () => {
    expect(extractMentions("fix: req-180#P1")).toEqual([{ number: 180, item: "p1" }]);
  });
});
