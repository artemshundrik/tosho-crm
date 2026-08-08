import { describe, expect, it } from "vitest";

import {
  BOARD_LIST_LIMIT,
  buildBoardListResponse,
  buildBoardMoveResponse,
  boardCardMeta,
  cardNotFoundMessage,
  groupBoardCards,
  isMovableStatus,
  MOVABLE_STATUSES,
  OPEN_STATUSES,
  parseBoardBody,
  sortBoardCards,
  toBoardCard,
  type BoardCard,
} from "./devRequestBoard";

const URL = "https://tosho.pro/dev-requests";

function card(overrides: Partial<BoardCard> = {}): BoardCard {
  const number = overrides.number ?? 1;
  return {
    number,
    // Підпис виводимо з номера, а не беремо з overrides: тест, у якому REQ-4
    // підписаний «REQ-1», перевіряв би вигадану картку.
    label: `REQ-${number}`,
    title: "Кнопка «Зберегти» спрацьовує лише з другого разу",
    body: "",
    kind: "bug",
    status: "triage",
    moduleKey: "quotes",
    priority: "normal",
    createdAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("статуси черги", () => {
  it("відкрито все, крім тупиків «Викочено» і «Не робимо»", () => {
    expect(OPEN_STATUSES).toEqual(["triage", "queued", "in_progress", "done_local"]);
    expect(OPEN_STATUSES).not.toContain("released");
    expect(OPEN_STATUSES).not.toContain("wont_do");
  });

  it("з телефона ставляться рівно три статуси — ті, що ставить людина", () => {
    expect([...MOVABLE_STATUSES].sort()).toEqual(["in_progress", "queued", "wont_do"]);
  });

  it("«done_local» і «released» ставлять факти, тож руками їх не пересунути", () => {
    // Захист від найдорожчої помилки цієї фічі: «викочено» без деплою означає,
    // що в проді цього немає, а звіт керівництву скаже, що є.
    expect(isMovableStatus("done_local")).toBe(false);
    expect(isMovableStatus("released")).toBe(false);
    expect(isMovableStatus("triage")).toBe(false);
    expect(isMovableStatus("in_progress")).toBe(true);
    expect(isMovableStatus("")).toBe(false);
    expect(isMovableStatus(undefined)).toBe(false);
  });
});

describe("parseBoardBody", () => {
  it("list — найпростіша дія", () => {
    expect(parseBoardBody(JSON.stringify({ action: "list" }))).toEqual({ ok: true, action: "list" });
    // Регістр і краї не мають значення: це пише інший агент, не людина.
    expect(parseBoardBody(JSON.stringify({ action: " LIST " }))).toEqual({ ok: true, action: "list" });
  });

  it("move — номер і дозволений статус", () => {
    expect(parseBoardBody(JSON.stringify({ action: "move", number: 3, status: "in_progress" }))).toEqual({
      ok: true,
      action: "move",
      number: 3,
      status: "in_progress",
    });
    // Номер рядком теж приймаємо — «3» і 3 для людини те саме.
    expect(parseBoardBody(JSON.stringify({ action: "move", number: "7", status: "wont_do" }))).toEqual({
      ok: true,
      action: "move",
      number: 7,
      status: "wont_do",
    });
  });

  it("заборонений статус — 400 з ПЕРЕЛІКОМ дозволених, а не голе «ні»", () => {
    for (const status of ["released", "done_local", "triage", "готово"]) {
      const result = parseBoardBody(JSON.stringify({ action: "move", number: 3, status }));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.status).toBe(400);
      expect(result.error).toContain("in_progress");
      expect(result.error).toContain("queued");
      expect(result.error).toContain("wont_do");
    }
  });

  it("статусу немає взагалі — теж перелік дозволених", () => {
    const result = parseBoardBody(JSON.stringify({ action: "move", number: 3 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("in_progress");
    }
  });

  it("битий номер — 400", () => {
    for (const number of [0, -3, 1.5, "abc", null, undefined]) {
      const result = parseBoardBody(JSON.stringify({ action: "move", number, status: "queued" }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    }
  });

  it("невідома дія й порожнє тіло — 400 з переліком дій", () => {
    for (const raw of ["{}", JSON.stringify({ action: "delete" }), JSON.stringify({ action: "" })]) {
      const result = parseBoardBody(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toContain("list");
        expect(result.error).toContain("move");
      }
    }
  });

  it("не-JSON, масив і рядок — 400, а не падіння", () => {
    for (const raw of ["{не json", "[1,2,3]", '"list"', "null"]) {
      const result = parseBoardBody(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    }
  });
});

describe("toBoardCard", () => {
  it("рядок бази → картка з готовим підписом номера", () => {
    const result = toBoardCard({
      number: 42,
      title: "  Не видно, хто редагував  ",
      body: " опис ",
      kind: "friction",
      status: "queued",
      module_key: "quotes",
      priority: "high",
      created_at: "2026-08-01T10:00:00.000Z",
    });
    expect(result).toMatchObject({
      number: 42,
      label: "REQ-42",
      title: "Не видно, хто редагував",
      body: "опис",
      kind: "friction",
      status: "queued",
      moduleKey: "quotes",
      priority: "high",
    });
  });

  it("сміття в полях не валить картку: невідомий ключ = «немає»", () => {
    const result = toBoardCard({
      number: 7,
      title: "Щось",
      kind: "wat",
      status: "wat",
      module_key: "payments",
      priority: "urgent",
      created_at: "2026-08-01T10:00:00.000Z",
    });
    expect(result).toMatchObject({ kind: "friction", status: "triage", moduleKey: null, priority: null });
  });

  it("без номера картки немає — за ним її шукають і рухають", () => {
    expect(toBoardCard({ number: null, title: "Щось" })).toBeNull();
    expect(toBoardCard({ number: "не число", title: "Щось" })).toBeNull();
    // bigint із PostgREST приїжджає рядком — це нормальний номер.
    expect(toBoardCard({ number: "42", title: "Щось" })?.number).toBe(42);
  });
});

describe("sortBoardCards", () => {
  it("спершу термінові, далі свіжіші", () => {
    const cards = [
      card({ number: 1, priority: "normal", createdAt: "2026-08-01T10:00:00.000Z" }),
      card({ number: 2, priority: "high", createdAt: "2026-07-01T10:00:00.000Z" }),
      card({ number: 3, priority: "normal", createdAt: "2026-08-05T10:00:00.000Z" }),
      card({ number: 4, priority: "high", createdAt: "2026-08-04T10:00:00.000Z" }),
    ];
    expect(sortBoardCards(cards).map((item) => item.number)).toEqual([4, 2, 3, 1]);
  });

  it("не мутує вхідний масив", () => {
    const cards = [card({ number: 1, priority: "normal" }), card({ number: 2, priority: "high" })];
    sortBoardCards(cards);
    expect(cards.map((item) => item.number)).toEqual([1, 2]);
  });
});

describe("groupBoardCards", () => {
  it("порядок груп = порядок колонок дошки, порожні випадають", () => {
    const groups = groupBoardCards([
      card({ number: 1, status: "in_progress" }),
      card({ number: 2, status: "triage" }),
      card({ number: 3, status: "done_local" }),
    ]);
    expect(groups.map((group) => group.status)).toEqual(["triage", "in_progress", "done_local"]);
    expect(groups.map((group) => group.label)).toEqual(["Вхідні", "В роботі", "Готово локально"]);
  });

  it("усередині групи діє те саме сортування", () => {
    const groups = groupBoardCards([
      card({ number: 1, status: "queued", priority: "normal", createdAt: "2026-08-05T10:00:00.000Z" }),
      card({ number: 2, status: "queued", priority: "high", createdAt: "2026-07-01T10:00:00.000Z" }),
    ]);
    expect(groups[0].cards.map((item) => item.number)).toEqual([2, 1]);
  });
});

describe("boardCardMeta", () => {
  it("«тип · напрямок · пріоритет» людськими словами", () => {
    expect(boardCardMeta(card({ kind: "bug", moduleKey: "quotes", priority: "high" }))).toBe(
      "Не працює · Прорахунки · Терміново"
    );
  });

  it("порожні частини випадають разом із роздільником", () => {
    const meta = boardCardMeta(card({ kind: "feature", moduleKey: null, priority: null }));
    expect(meta).toBe("Нова можливість");
    expect(meta).not.toContain("null");
    expect(meta).not.toContain("·");
  });
});

describe("buildBoardListResponse", () => {
  const cards = [
    card({ number: 12, status: "in_progress", priority: "high", title: "Дошка не оновлюється" }),
    card({ number: 9, status: "triage", priority: "normal", title: "Не видно автора правки" }),
  ];

  it("групи розібрані, поля людські, число й підпис номера поруч", () => {
    const response = buildBoardListResponse({ cards, hasMore: false, url: URL });
    expect(response.total).toBe(2);
    expect(response.groups.map((group) => group.status)).toEqual(["triage", "in_progress"]);
    const first = response.groups[0].cards[0];
    expect(first.number).toBe(9);
    expect(first.label).toBe("REQ-9");
    expect(first.statusLabel).toBe("Вхідні");
    expect(first.kind).toBe("Не працює");
    expect(first.module).toBe("Прорахунки");
  });

  it("message придатний до показу як є: заголовок, назви колонок, номери, посилання", () => {
    const message = buildBoardListResponse({ cards, hasMore: false, url: URL }).message;
    expect(message).toContain("Черга запитів — 2 відкритих");
    expect(message).toContain("Вхідні (1)");
    expect(message).toContain("В роботі (1)");
    expect(message).toContain("REQ-12");
    expect(message).toContain("Дошка не оновлюється");
    expect(message).toContain(URL);
    expect(message).not.toContain("null");
  });

  it("термінова картка позначена, звичайна — ні", () => {
    const message = buildBoardListResponse({ cards, hasMore: false, url: URL }).message;
    expect(message).toContain("🔥 REQ-12");
    expect(message).toContain("REQ-9");
    expect(message).not.toContain("🔥 REQ-9");
  });

  it("порожня черга — це стан, а не помилка", () => {
    const response = buildBoardListResponse({ cards: [], hasMore: false, url: URL });
    expect(response.ok).toBe(true);
    expect(response.total).toBe(0);
    expect(response.groups).toEqual([]);
    expect(response.message).toContain("порожня");
    expect(response.message).toContain(URL);
  });

  it("обрізаний список каже про себе вголос", () => {
    const response = buildBoardListResponse({ cards, hasMore: true, url: URL });
    expect(response.hasMore).toBe(true);
    expect(response.message).toContain(String(BOARD_LIST_LIMIT));
    expect(response.message).toContain("2+ відкритих");
  });
});

describe("buildBoardMoveResponse", () => {
  it("показує, куди пересунули і звідки", () => {
    const response = buildBoardMoveResponse({
      card: card({ number: 4, status: "in_progress", title: "Дошка не оновлюється" }),
      previousStatus: "triage",
      url: URL,
    });
    expect(response.unchanged).toBe(false);
    expect(response.card.statusLabel).toBe("В роботі");
    expect(response.previousStatusLabel).toBe("Вхідні");
    expect(response.message).toContain("REQ-4 → В роботі");
    expect(response.message).toContain("Було: Вхідні");
    expect(response.message).toContain(URL);
  });

  it("картка вже була в цьому стані — кажемо прямо, а не вдаємо зміну", () => {
    const response = buildBoardMoveResponse({
      card: card({ number: 4, status: "queued" }),
      previousStatus: "queued",
      url: URL,
    });
    expect(response.unchanged).toBe(true);
    expect(response.message).toContain("і так «У черзі»");
    expect(response.message).not.toContain("Було:");
  });
});

describe("cardNotFoundMessage", () => {
  it("називає номер і підказує, як подивитись наявні", () => {
    const message = cardNotFoundMessage(404);
    expect(message).toContain("REQ-404");
    expect(message).toContain("list");
  });
});
