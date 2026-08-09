import { describe, expect, it } from "vitest";

import type { BoardCard } from "./devRequestBoard";
import {
  clampCardBody,
  escapeClamped,
  isOwnerOrSeo,
  isQueueCommand,
  moveToast,
  parseQueueCallback,
  queueCardCallback,
  queueCardGoneScreen,
  queueCardScreen,
  queueListCallback,
  queueListScreen,
  queueMoveCallback,
  QUEUE_BODY_CHARS,
  QUEUE_LIST_MAX,
  QUEUE_TITLE_CHARS,
} from "./devRequestQueue";

/** Ліміт повідомлення Telegram. Перевищення = мовчазна відмова, а не обрізання. */
const TELEGRAM_MESSAGE_LIMIT = 4096;

const BOARD_URL = "https://tosho.pro/dev-requests";

function card(overrides: Partial<BoardCard> = {}): BoardCard {
  const number = overrides.number ?? 1;
  return {
    number,
    label: `REQ-${number}`,
    title: "Дошка не оновлюється після зміни статусу",
    body: "",
    kind: "bug",
    status: "triage",
    moduleKey: "quotes",
    priority: "normal",
    isPrivate: false,
    createdAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

/** Кнопки з callback_data — плоским списком, як їх бачить Telegram. */
function callbacks(keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>) {
  return keyboard.flat().flatMap((button) => ("callback_data" in button && button.callback_data ? [button.callback_data] : []));
}

describe("isQueueCommand", () => {
  it("кирилична основна й латинський аліас", () => {
    expect(isQueueCommand("/черга")).toBe(true);
    expect(isQueueCommand("/queue")).toBe(true);
  });

  it("чуже — ні", () => {
    for (const command of ["/задача", "/settings", "черга", "", null, undefined]) {
      expect(isQueueCommand(command)).toBe(false);
    }
  });
});

describe("isOwnerOrSeo — головний гейт черги", () => {
  it("власник і SEO проходять", () => {
    expect(isOwnerOrSeo({ accessRole: "owner", jobRole: null })).toBe(true);
    expect(isOwnerOrSeo({ accessRole: "member", jobRole: "seo" })).toBe(true);
    // Регістр і краї з бази приходять як є.
    expect(isOwnerOrSeo({ accessRole: " OWNER ", jobRole: null })).toBe(true);
    expect(isOwnerOrSeo({ accessRole: null, jobRole: "SEO" })).toBe(true);
  });

  it("решта команди — ні: бот обходить RLS, і це єдиний захист приватних карток", () => {
    for (const role of [
      { accessRole: "member", jobRole: "designer" },
      { accessRole: "admin", jobRole: "manager" },
      { accessRole: "member", jobRole: "pm" },
      { accessRole: null, jobRole: null },
      { accessRole: "", jobRole: "" },
      // Схожі, але інші значення не мають «майже проходити».
      { accessRole: "owner_assistant", jobRole: null },
      { accessRole: null, jobRole: "seo_helper" },
    ]) {
      expect(isOwnerOrSeo(role)).toBe(false);
    }
  });
});

describe("callback_data", () => {
  it("туди-назад без втрат", () => {
    expect(parseQueueCallback(queueListCallback())).toEqual({ kind: "list" });
    expect(parseQueueCallback(queueCardCallback(42))).toEqual({ kind: "card", number: 42 });
    expect(parseQueueCallback(queueMoveCallback(42, "in_progress"))).toEqual({
      kind: "move",
      number: 42,
      status: "in_progress",
    });
  });

  it("вкладається в ліміт Telegram — 64 байти", () => {
    // Номер картки чотиризначний — це десятиліття роботи наперед.
    const longest = queueMoveCallback(9999, "in_progress");
    expect(Buffer.byteLength(longest, "utf8")).toBeLessThanOrEqual(64);
  });

  it("статус із підробленої кнопки звіряється з тим самим переліком", () => {
    // Найважливіше в розборі: «released» не має пройти навіть із власноруч
    // складеного callback_data — статус ставить деплой, а не палець.
    expect(parseQueueCallback("dq:m:42:released")).toBeNull();
    expect(parseQueueCallback("dq:m:42:done_local")).toBeNull();
    expect(parseQueueCallback("dq:m:42:triage")).toBeNull();
  });

  it("чужі й биті дані — null, а не здогадка", () => {
    for (const data of [
      "abs:k:sick_leave",
      "qa:help",
      "dq",
      "dq:x",
      "dq:c",
      "dq:c:0",
      "dq:c:-3",
      "dq:c:абв",
      "dq:m:42",
      "dq:m:42:",
      "",
      null,
      undefined,
    ]) {
      expect(parseQueueCallback(data)).toBeNull();
    }
  });
});

describe("queueListScreen", () => {
  const cards = [
    card({ number: 12, status: "in_progress", priority: "high", title: "Дошка не оновлюється" }),
    card({ number: 9, status: "triage", priority: "normal", title: "Не видно автора правки" }),
    card({ number: 7, status: "queued", priority: "low", title: "Додати фільтр за напрямком" }),
  ];

  it("групи за колонками дошки, номер і тема в рядку", () => {
    const screen = queueListScreen({ cards });
    expect(screen.text).toContain("Черга запитів");
    expect(screen.text).toContain("<b>Вхідні</b>");
    expect(screen.text).toContain("<b>У черзі</b>");
    expect(screen.text).toContain("<b>В роботі</b>");
    expect(screen.text).toContain("REQ-12 · Дошка не оновлюється");
    expect(screen.text).toContain("Не працює · Прорахунки");
  });

  it("термінові позначені", () => {
    const screen = queueListScreen({ cards });
    expect(screen.text).toContain("🔥 REQ-12");
    expect(screen.text).not.toContain("🔥 REQ-9");
  });

  it("кнопки — ЛИШЕ номери, а не по три дії на картку", () => {
    const screen = queueListScreen({ cards });
    expect(callbacks(screen.keyboard)).toEqual(["dq:c:12", "dq:c:9", "dq:c:7"]);
    expect(screen.keyboard.flat().map((button) => button.text)).toEqual(["REQ-12", "REQ-9", "REQ-7"]);
  });

  it("довга черга ріжеться, решта згадана рядком", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      card({ number: index + 1, createdAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z` })
    );
    const screen = queueListScreen({ cards: many });
    expect(screen.keyboard.flat()).toHaveLength(QUEUE_LIST_MAX);
    expect(screen.text).toContain(`…і ще ${20 - QUEUE_LIST_MAX}`);
  });

  it("обрізана вибірка з бази додає «+» до чисел, а не бреше точним числом", () => {
    const screen = queueListScreen({ cards: [card({ number: 3 })], hasMore: true });
    expect(screen.text).toContain("1+ відкритих");
  });

  it("порожня черга — стан без кнопок, а не помилка", () => {
    const screen = queueListScreen({ cards: [] });
    expect(screen.text).toContain("Порожньо");
    expect(screen.keyboard).toEqual([]);
  });

  it("розмітка від людини екранується — інакше «<» ламає HTML", () => {
    const screen = queueListScreen({ cards: [card({ number: 5, title: "Ціна < 0 у формі" })] });
    expect(screen.text).toContain("Ціна &lt; 0 у формі");
  });
});

describe("queueCardScreen", () => {
  it("тема, класифікація й посилання в CRM", () => {
    const screen = queueCardScreen(
      card({ number: 12, status: "triage", body: "Після зміни статусу картка лишається в старій колонці." }),
      BOARD_URL
    );
    expect(screen.text).toContain("REQ-12");
    expect(screen.text).toContain("Вхідні");
    expect(screen.text).toContain("Дошка не оновлюється після зміни статусу");
    expect(screen.text).toContain("Після зміни статусу картка лишається в старій колонці.");
    expect(screen.text).toContain("Не працює · Прорахунки");
    // «Звичайний» не пишемо: мітка стоїть на більшості карток і нічого не розрізняє.
    expect(screen.text).not.toContain("Звичайний");
    expect(screen.keyboard.flat().some((button) => "url" in button && button.url === BOARD_URL)).toBe(true);
  });

  it("чотири дії людини — і жодної, що ставлять факти", () => {
    const screen = queueCardScreen(card({ number: 12, status: "triage" }), BOARD_URL);
    const data = callbacks(screen.keyboard);
    expect(data).toContain("dq:m:12:in_progress");
    expect(data).toContain("dq:m:12:queued");
    expect(data).toContain("dq:m:12:someday");
    expect(data).toContain("dq:m:12:wont_do");
    expect(data.join(" ")).not.toContain("done_local");
    expect(data.join(" ")).not.toContain("released");
  });

  it("«В ідеї» підписана дієсловом, як і сусідні кнопки", () => {
    const screen = queueCardScreen(card({ number: 12, status: "queued" }), BOARD_URL);
    const idea = screen.keyboard.flat().find((button) => "callback_data" in button && button.callback_data === "dq:m:12:someday");
    expect(idea?.text).toBe("💡 В ідеї");
  });

  /**
   * Дорога назад із «Ідей» саме тут: у списку черги такої картки вже немає
   * (someday поза OPEN_STATUSES), а екран картки після переміщення показують
   * повторно — тож кнопка «У чергу» на ньому є єдиним способом передумати з
   * телефона.
   */
  it("картка з «Ідей» має чим повернутись у чергу", () => {
    const screen = queueCardScreen(card({ number: 12, status: "someday" }), BOARD_URL);
    const data = callbacks(screen.keyboard);
    expect(data).toContain("dq:m:12:queued");
    expect(data).not.toContain("dq:m:12:someday");
    expect(screen.text).toContain("Ідеї");
  });

  it("кнопки поточного стану немає — вона нічого не робить", () => {
    const screen = queueCardScreen(card({ number: 12, status: "in_progress" }), BOARD_URL);
    expect(callbacks(screen.keyboard)).not.toContain("dq:m:12:in_progress");
    expect(callbacks(screen.keyboard)).toContain("dq:m:12:queued");
  });

  it("є повернення до списку", () => {
    const screen = queueCardScreen(card({ number: 12 }), BOARD_URL);
    expect(callbacks(screen.keyboard)).toContain("dq:l");
  });

  it("порожній опис не вигадується", () => {
    const screen = queueCardScreen(card({ number: 12, body: "" }), BOARD_URL);
    expect(screen.text).not.toContain("Опис обрізано");
    expect(screen.text).toContain("Дошка не оновлюється після зміни статусу");
  });

  it("довгий опис обрізано, і про це сказано вголос", () => {
    const screen = queueCardScreen(card({ number: 12, body: "слово ".repeat(500) }), BOARD_URL);
    expect(screen.text).toContain("Опис обрізано");
  });
});

describe("clampCardBody", () => {
  it("короткий опис лишається як є", () => {
    expect(clampCardBody("Коротко")).toEqual({ text: "Коротко", truncated: false });
    expect(clampCardBody("  з краями  ").text).toBe("з краями");
    expect(clampCardBody(null)).toEqual({ text: "", truncated: false });
  });

  it("ріже по межі речення, коли вона поруч", () => {
    const body = `${"а".repeat(600)}. ${"б".repeat(300)}`;
    const result = clampCardBody(body);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith(".")).toBe(true);
    expect(result.text).not.toContain("б");
  });

  it("немає речення поруч — ріже по слову, а не посеред нього", () => {
    const body = `${"слово ".repeat(200)}`;
    const result = clampCardBody(body);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith("слово…")).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(QUEUE_BODY_CHARS + 1);
  });

  it("суцільне полотно без пробілів усе одно ріжеться", () => {
    const result = clampCardBody("я".repeat(2000));
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(QUEUE_BODY_CHARS + 1);
  });
});

describe("escapeClamped — межа рахується ПІСЛЯ екранування", () => {
  it("короткий текст лише екранується", () => {
    expect(escapeClamped("Ціна < 0", 100)).toBe("Ціна &lt; 0");
    expect(escapeClamped(null, 100)).toBe("");
  });

  it("довгий текст ріжеться до межі", () => {
    const result = escapeClamped("я".repeat(500), 100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith("…")).toBe(true);
  });

  it("полотно з амперсандів не роздувається вп'ятеро й не лишає голого «&»", () => {
    // «&» → «&amp;»: 200 символів стали б 1000. Саме через це межу міряють по
    // результату, а різати доводиться сирий рядок — зріз посеред «&amp;» лишив
    // би «&am», на якому розбір HTML у Telegram падає цілком.
    const result = escapeClamped("&".repeat(500), 100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.replace(/…$/, "").endsWith("&amp;")).toBe(true);
    expect(/&(?!amp;|lt;|gt;)/.test(result)).toBe(false);
  });
});

describe("довгі теми не кладуть повідомлення мовчки", () => {
  it("тема без обмежень у базі ріжеться в списку", () => {
    const screen = queueListScreen({ cards: [card({ number: 1, title: "я".repeat(5000) })] });
    expect(screen.text.length).toBeLessThan(TELEGRAM_MESSAGE_LIMIT);
    expect(screen.text).toContain("…");
  });

  it("вісім довгих тем разом теж влазять — інакше «/черга» мовчки не відповіла б", () => {
    // Реальний випадок без зловмисника: вісім карток із темами по 500 знаків.
    const many = Array.from({ length: 12 }, (_, index) =>
      card({ number: index + 1, title: "тема ".repeat(200), body: "опис ".repeat(500) })
    );
    expect(queueListScreen({ cards: many }).text.length).toBeLessThan(TELEGRAM_MESSAGE_LIMIT);
  });

  it("картка з полотном замість опису теж влазить", () => {
    const screen = queueCardScreen(
      card({ number: 1, title: "&".repeat(1000), body: "&".repeat(5000) }),
      BOARD_URL
    );
    expect(screen.text.length).toBeLessThan(TELEGRAM_MESSAGE_LIMIT);
    expect(screen.text).toContain("Опис обрізано");
    expect(QUEUE_TITLE_CHARS).toBeLessThanOrEqual(400);
  });
});

describe("приватні й викочені картки", () => {
  it("приватна позначена замком — і в списку, і на картці", () => {
    const priv = card({ number: 3, isPrivate: true, title: "Про зарплати" });
    expect(queueListScreen({ cards: [priv] }).text).toContain("🔒 REQ-3");
    expect(queueCardScreen(priv, BOARD_URL).text).toContain("🔒");
  });

  it("викочена картка не має кнопок дій — і пояснює чому", () => {
    const screen = queueCardScreen(card({ number: 3, status: "released" }), BOARD_URL);
    expect(callbacks(screen.keyboard)).toEqual(["dq:l"]);
    expect(screen.text).toContain("факт деплою");
  });
});

describe("moveToast і екран зниклої картки", () => {
  it("toast називає новий стан", () => {
    expect(moveToast("in_progress")).toContain("В роботі");
    expect(moveToast("wont_do")).toContain("Не робимо");
    expect(moveToast("someday")).toContain("Ідеї");
  });

  it("картка зникла — кажемо прямо й лишаємо шлях назад", () => {
    const screen = queueCardGoneScreen(12);
    expect(screen.text).toContain("REQ-12");
    expect(callbacks(screen.keyboard)).toEqual(["dq:l"]);
  });
});
