import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  appendChecklistItem,
  BOARD_LIST_LIMIT,
  buildBoardCommitResponse,
  buildBoardListResponse,
  buildBoardMoveResponse,
  boardCardMeta,
  buildMergedBody,
  cardNotFoundMessage,
  CHECKLIST_TEXT_MAX,
  COMMIT_NUMBERS_LIMIT,
  findCardByLabel,
  formatMergeDate,
  groupBoardCards,
  isMovableStatus,
  MERGEABLE_STATUSES,
  mergeIntoBoardCard,
  MOVABLE_STATUSES,
  moveBoardCard,
  OPEN_STATUSES,
  parseBoardBody,
  recordCommitOnCards,
  closeChecklistItemsOnCommit,
  kyivDay,
  releasedCardMessage,
  shaMatches,
  sortBoardCards,
  toBoardCard,
  TITLE_MAX_LENGTH,
  updateBoardCard,
  buildBoardUpdateResponse,
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
    isPrivate: false,
    createdAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("статуси черги", () => {
  it("відкрито рівно чотири стани — решта в черзі не рахується", () => {
    expect(OPEN_STATUSES).toEqual(["triage", "queued", "in_progress", "done_local"]);
    expect(OPEN_STATUSES).not.toContain("released");
    expect(OPEN_STATUSES).not.toContain("wont_do");
  });

  /**
   * Найважливіший тест «Ідей». Весь сенс статусу someday — у тому, що
   * відкладене НЕ лежить у черзі: інакше за її довжиною не видно, скільки
   * роботи справді попереду. Щойно someday опиниться у відкритих, затія
   * скасована — причому мовчки, бо нічого не зламається.
   */
  it("«Ідеї» до відкритої черги НЕ належать — інакше вони знову стають чергою", () => {
    expect(OPEN_STATUSES).not.toContain("someday");
  });

  it("з телефона ставляться рівно чотири статуси — ті, що ставить людина", () => {
    expect([...MOVABLE_STATUSES].sort()).toEqual(["in_progress", "queued", "someday", "wont_do"]);
  });

  it("«done_local» і «released» ставлять факти, тож руками їх не пересунути", () => {
    // Захист від найдорожчої помилки цієї фічі: «викочено» без деплою означає,
    // що в проді цього немає, а звіт керівництву скаже, що є.
    expect(isMovableStatus("done_local")).toBe(false);
    expect(isMovableStatus("released")).toBe(false);
    expect(isMovableStatus("triage")).toBe(false);
    expect(isMovableStatus("in_progress")).toBe(true);
    expect(isMovableStatus("someday")).toBe(true);
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

  it("«постав REQ-7 в ідеї» з телефона проходить", () => {
    expect(parseBoardBody(JSON.stringify({ action: "move", number: 7, status: "someday" }))).toEqual({
      ok: true,
      action: "move",
      number: 7,
      status: "someday",
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
      expect(result.error).toContain("someday");
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

  /**
   * Другий рубіж після OPEN_STATUSES: вибірка з бази й розкладка по групах —
   * різні місця, і картка з «Ідей» могла б доїхати сюди іншим шляхом (скажімо,
   * після move, коли відповідь збирають із уже прочитаного набору).
   */
  it("«Ідеї» й «Не робимо» групи не отримують — у черзі їх немає", () => {
    const groups = groupBoardCards([
      card({ number: 1, status: "queued" }),
      card({ number: 2, status: "someday" }),
      card({ number: 3, status: "wont_do" }),
    ]);
    expect(groups.map((group) => group.status)).toEqual(["queued"]);
    expect(groups.flatMap((group) => group.cards).map((item) => item.number)).toEqual([1]);
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

  it("«Звичайний» не пишемо — та сама причина, що й на дошці", () => {
    // Мітка стоїть на більшості карток, нічого не розрізняє і з'їдає місце в
    // рядку, який сканують очима. Підписуємо лише краї шкали.
    expect(boardCardMeta(card({ kind: "bug", moduleKey: "quotes", priority: "normal" }))).toBe(
      "Не працює · Прорахунки"
    );
    expect(boardCardMeta(card({ kind: "bug", moduleKey: "quotes", priority: "low" }))).toBe(
      "Не працює · Прорахунки · Не горить"
    );
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

describe("приватність картки", () => {
  it("приватна картка позначена замком — щоб її не переслали не глянувши", () => {
    const response = buildBoardListResponse({
      cards: [card({ number: 3, isPrivate: true, title: "Про зарплати" })],
      hasMore: false,
      url: URL,
    });
    expect(response.groups[0].cards[0].private).toBe(true);
    expect(response.message).toContain("🔒 REQ-3");
  });

  it("спільна картка замка не має — позначаємо лише виняток", () => {
    const response = buildBoardListResponse({ cards: [card({ number: 3 })], hasMore: false, url: URL });
    expect(response.groups[0].cards[0].private).toBe(false);
    expect(response.message).not.toContain("🔒");
  });

  it("колонки в рядку немає — вважаємо приватною, а не спільною", () => {
    // Fail-safe: зайвий замок на спільній картці дешевший за відсутній на
    // приватній, а забути колонку в новому select — легко.
    expect(toBoardCard({ number: 5, title: "Щось" })?.isPrivate).toBe(true);
    expect(toBoardCard({ number: 5, title: "Щось", is_private: false })?.isPrivate).toBe(false);
  });
});

/* ------------------------- moveBoardCard: запис ------------------------- */

type ChainStub = {
  select: () => ChainStub;
  eq: () => ChainStub;
  update: (patch: Record<string, unknown>) => ChainStub;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
};

/**
 * Найтонша заглушка supabase-js, якої вистачає для moveBoardCard: ланцюжок
 * select/eq/update/maybeSingle над одним рядком плюс журнал записів. Потрібна
 * саме щоб довести ВІДСУТНІСТЬ запису, а не лише текст відповіді.
 */
function fakeAdmin(initial: Record<string, unknown> | null) {
  const state = { row: initial, updates: [] as Array<Record<string, unknown>> };
  const chain: ChainStub = {
    select: () => chain,
    eq: () => chain,
    update: (patch) => {
      state.updates.push(patch);
      state.row = state.row ? { ...state.row, ...patch } : null;
      return chain;
    },
    maybeSingle: async () => ({ data: state.row, error: null }),
  };
  const admin = { schema: () => ({ from: () => chain }) } as unknown as SupabaseClient;
  return { admin, state };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    number: 4,
    title: "Дошка не оновлюється",
    body: "",
    kind: "bug",
    status: "triage",
    module_key: "quotes",
    priority: "normal",
    is_private: false,
    created_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("moveBoardCard", () => {
  it("відкриту картку рухає й повертає попередній стан", async () => {
    const { admin, state } = fakeAdmin(row());
    const result = await moveBoardCard(admin, "team-1", 4, "in_progress");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.previousStatus).toBe("triage");
      expect(result.card.status).toBe("in_progress");
    }
    expect(state.updates).toEqual([{ status: "in_progress" }]);
  });

  it("ВИКОЧЕНУ не чіпає — і в базу не пише жодного рядка", async () => {
    // Перелік дозволених статусів захищає лише те, КУДИ ставлять. Без цієї
    // перевірки викочену картку можна було б повернути «в роботу», лишивши їй
    // released_at і commit_shas, — і дошка почала б суперечити «Релізам».
    const { admin, state } = fakeAdmin(row({ status: "released" }));
    const result = await moveBoardCard(admin, "team-1", 4, "in_progress");
    expect(result).toEqual({ ok: false, reason: "released" });
    expect(state.updates).toEqual([]);
  });

  it("«Готово локально» рухати можна — це не суперечить жодному запису", async () => {
    const { admin } = fakeAdmin(row({ status: "done_local" }));
    const result = await moveBoardCard(admin, "team-1", 4, "in_progress");
    expect(result.ok).toBe(true);
  });

  it("картки немає — not_found без запису", async () => {
    const { admin, state } = fakeAdmin(null);
    const result = await moveBoardCard(admin, "team-1", 4, "queued");
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(state.updates).toEqual([]);
  });

  it("відмова пояснює, що робити далі", () => {
    const message = releasedCardMessage(4);
    expect(message).toContain("REQ-4");
    expect(message).toContain("нову картку");
  });
});

/* ------------------------------ Факт коміта ---------------------------- */

describe("розбір дії commit", () => {
  it("номери й sha", () => {
    expect(parseBoardBody(JSON.stringify({ action: "commit", numbers: [4, 7], sha: "dfe481f" }))).toEqual({
      ok: true,
      action: "commit",
      numbers: [4, 7],
      items: [],
      sha: "dfe481f",
    });
  });

  it("адресовані пункти розбираються окремим кошиком", () => {
    expect(
      parseBoardBody(JSON.stringify({ action: "commit", numbers: [], items: [{ number: 180, item: "P1" }], sha: "74ab615" }))
    ).toEqual({ ok: true, action: "commit", numbers: [], items: [{ number: 180, item: "p1" }], sha: "74ab615" });
  });

  it("літера в адресі не тільки «p» — на дошці є пункти на «t»", () => {
    // REQ-123 має пункти t1…t3. Поки схема приймала рівно `pN`, коміт із чесною
    // згадкою REQ-123#t3 отримував 400, а пункт лишався відкритим при зробленій
    // роботі (знайдено 27.08.2026).
    expect(
      parseBoardBody(JSON.stringify({ action: "commit", numbers: [], items: [{ number: 123, item: "t3" }], sha: "8fd0e7f" }))
    ).toEqual({ ok: true, action: "commit", numbers: [], items: [{ number: 123, item: "t3" }], sha: "8fd0e7f" });
  });

  it("самих пунктів досить — номери картки може й не бути", () => {
    const result = parseBoardBody(
      JSON.stringify({ action: "commit", items: [{ number: 180, item: "p1" }], sha: "74ab615" })
    );
    expect(result).toMatchObject({ ok: true, action: "commit" });
  });

  it("зіпсоване поле items — 400 з поясненням, а не тиха тиша", () => {
    // Мовчазне ігнорування означало б «коміт зафіксовано» на роботі, якої
    // ніхто не записав, — саме та брехня, від якої весь механізм і будували.
    for (const items of [[{ number: 180 }], [{ number: 180, item: "перший" }], [{ item: "p1" }], "p1", [null]]) {
      const result = parseBoardBody(JSON.stringify({ action: "commit", numbers: [4], items, sha: "dfe481f" }));
      expect(result.ok).toBe(false);
    }
  });

  it("ні номерів, ні пунктів — фіксувати нічого", () => {
    const result = parseBoardBody(JSON.stringify({ action: "commit", numbers: [], items: [], sha: "dfe481f" }));
    expect(result.ok).toBe(false);
  });

  it("sha зводимо до нижнього регістру — інакше той самий коміт запишеться двічі", () => {
    const result = parseBoardBody(JSON.stringify({ action: "commit", numbers: [4], sha: " DFE481F " }));
    expect(result).toMatchObject({ ok: true, sha: "dfe481f" });
  });

  it("повторений номер у темі коміта — не помилка, просто шум", () => {
    expect(parseBoardBody(JSON.stringify({ action: "commit", numbers: [4, 4, "7"], sha: "dfe481f" }))).toMatchObject({
      numbers: [4, 7],
    });
  });

  it("одиничний номер приймаємо в будь-якому з двох полів", () => {
    expect(parseBoardBody(JSON.stringify({ action: "commit", number: 4, sha: "dfe481f" }))).toMatchObject({
      numbers: [4],
    });
    expect(parseBoardBody(JSON.stringify({ action: "commit", numbers: 4, sha: "dfe481f" }))).toMatchObject({
      numbers: [4],
    });
  });

  it("без sha фіксувати нічого — 400", () => {
    const result = parseBoardBody(JSON.stringify({ action: "commit", numbers: [4] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("не-sha відхиляємо: статус має ставити перевіряний факт, а не будь-який рядок", () => {
    for (const sha of ["готово", "abc", "zzzzzzz", "dfe481f!", "", 42]) {
      const result = parseBoardBody(JSON.stringify({ action: "commit", numbers: [4], sha }));
      expect(result.ok).toBe(false);
    }
  });

  it("порожній список і забагато номерів — 400", () => {
    expect(parseBoardBody(JSON.stringify({ action: "commit", numbers: [], sha: "dfe481f" })).ok).toBe(false);
    const many = Array.from({ length: COMMIT_NUMBERS_LIMIT + 1 }, (_, index) => index + 1);
    expect(parseBoardBody(JSON.stringify({ action: "commit", numbers: many, sha: "dfe481f" })).ok).toBe(false);
  });

  /**
   * Ключове: у дії commit НЕМАЄ параметра «статус». Тобто покликати її й
   * попросити «Викочено» неможливо в принципі — не через перевірку, а через
   * відсутність такої ручки. Заборона ставити статус рішенням людини лишається
   * цілою: тут його ставить коміт.
   */
  it("статус у тілі ігнорується — його ставить факт коміта, а не той, хто просить", () => {
    const result = parseBoardBody(
      JSON.stringify({ action: "commit", numbers: [4], sha: "dfe481f", status: "released" })
    );
    expect(result).toEqual({ ok: true, action: "commit", numbers: [4], items: [], sha: "dfe481f" });
  });
});

describe("shaMatches", () => {
  it("короткий і повний sha того самого коміта — збіг", () => {
    expect(shaMatches("dfe481f", "dfe481f2c9a4b6e8d0a1c3e5f7089abcdef01234")).toBe(true);
    expect(shaMatches("DFE481F2", "dfe481f2c9a4")).toBe(true);
  });

  it("різні коміти — не збіг", () => {
    expect(shaMatches("dfe481f", "aaa1234")).toBe(false);
    expect(shaMatches("dfe481f", "dfe481a")).toBe(false);
  });

  it("огризки коротші за 7 символів не збігаються ні з чим", () => {
    expect(shaMatches("dfe", "dfe481f")).toBe(false);
    expect(shaMatches("", "dfe481f")).toBe(false);
  });
});

type CommitChainStub = {
  select: () => CommitChainStub;
  eq: (column: string, value: unknown) => CommitChainStub;
  in: (column: string, values: unknown[]) => CommitChainStub;
  update: (patch: Record<string, unknown>) => CommitChainStub;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  then: (
    resolve: (value: { data: Record<string, unknown>[] | null; error: { message: string } | null }) => unknown
  ) => Promise<unknown>;
};

/**
 * Заглушка під recordCommitOnCards: читання пачкою (`in`) і запис по одній
 * картці. Веде журнал записів — саме він доводить, що ВИКОЧЕНУ картку ми не
 * рухаємо, а не просто гарно про це відповідаємо.
 */
function fakeCommitAdmin(initial: Array<Record<string, unknown>>) {
  const state = {
    rows: initial.map((entry) => ({ ...entry })),
    updates: [] as Array<{ number: number; patch: Record<string, unknown> }>,
    updateFails: false,
  };

  function chain(): CommitChainStub {
    let patch: Record<string, unknown> | null = null;
    let wanted: number[] | null = null;
    let target: number | null = null;

    const run = () => {
      if (patch) {
        if (state.updateFails) return { data: null, error: { message: "запис не пройшов" } };
        const found = state.rows.find((entry) => Number(entry.number) === target);
        if (!found) return { data: null, error: null };
        state.updates.push({ number: target as number, patch });
        Object.assign(found, patch);
        return { data: { ...found }, error: null };
      }
      const rows = state.rows.filter((entry) => !wanted || wanted.includes(Number(entry.number)));
      return { data: rows.map((entry) => ({ ...entry })), error: null };
    };

    const stub: CommitChainStub = {
      select: () => stub,
      eq: (column, value) => {
        if (column === "number") target = Number(value);
        return stub;
      },
      in: (_column, values) => {
        wanted = values.map(Number);
        return stub;
      },
      update: (next) => {
        patch = next;
        return stub;
      },
      maybeSingle: async () => run() as { data: Record<string, unknown> | null; error: { message: string } | null },
      then: (resolve) =>
        Promise.resolve(
          run() as { data: Record<string, unknown>[] | null; error: { message: string } | null }
        ).then(resolve),
    };
    return stub;
  }

  const admin = { schema: () => ({ from: () => chain() }) } as unknown as SupabaseClient;
  return { admin, state };
}

function commitRow(overrides: Record<string, unknown> = {}) {
  return { ...row(), commit_shas: [], ...overrides };
}

describe("recordCommitOnCards", () => {
  it("відкриту картку коміт переводить у «Готово локально» й дописує sha", async () => {
    const { admin, state } = fakeCommitAdmin([commitRow({ number: 4, status: "queued" })]);
    const outcomes = await recordCommitOnCards(admin, "team-1", [4], "dfe481f");

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ number: 4, result: "moved", previousStatus: "queued", status: "done_local" });
    expect(state.updates).toEqual([{ number: 4, patch: { commit_shas: ["dfe481f"], status: "done_local" } }]);
  });

  it("кілька карток за один коміт — кожна отримує той самий sha", async () => {
    const { admin, state } = fakeCommitAdmin([
      commitRow({ number: 4, status: "triage" }),
      commitRow({ number: 7, status: "in_progress" }),
    ]);
    const outcomes = await recordCommitOnCards(admin, "team-1", [4, 7], "dfe481f");

    expect(outcomes.map((outcome) => outcome.result)).toEqual(["moved", "moved"]);
    expect(state.updates.map((entry) => entry.number)).toEqual([4, 7]);
  });

  /**
   * Найважливіше правило переходу. Викочене назад не відкочують — той самий
   * принцип, що в moveBoardCard (там 409). Коміт на вже викочену картку означає
   * НОВУ роботу, а не скасування релізу: released_at лишається на місці.
   */
  it("ВИКОЧЕНУ картку не воскрешає: статус лишається, released_at не чіпаємо", async () => {
    const { admin, state } = fakeCommitAdmin([commitRow({ number: 4, status: "released" })]);
    const outcomes = await recordCommitOnCards(admin, "team-1", [4], "dfe481f");

    expect(outcomes[0]).toMatchObject({ result: "released", status: "released", previousStatus: "released" });
    // Sha дописали (це факт), але статус у патчі не з'явився.
    expect(state.updates).toEqual([{ number: 4, patch: { commit_shas: ["dfe481f"] } }]);
    expect(state.rows[0].status).toBe("released");
  });

  it("«Не робимо» коміт НЕ воскрешає — але повертає ознаку, щоб це побачили", async () => {
    const { admin, state } = fakeCommitAdmin([commitRow({ number: 9, status: "wont_do" })]);
    const outcomes = await recordCommitOnCards(admin, "team-1", [9], "dfe481f");

    expect(outcomes[0]).toMatchObject({ result: "wont_do", status: "wont_do" });
    expect(state.updates).toEqual([{ number: 9, patch: { commit_shas: ["dfe481f"] } }]);
    expect(state.rows[0].status).toBe("wont_do");
  });

  it("повторний прогін по тій самій картці нічого не пише", async () => {
    const { admin, state } = fakeCommitAdmin([
      commitRow({ number: 4, status: "done_local", commit_shas: ["dfe481f"] }),
    ]);
    const outcomes = await recordCommitOnCards(admin, "team-1", [4], "dfe481f");

    expect(outcomes[0]).toMatchObject({ result: "already", shaKnown: true });
    expect(state.updates).toEqual([]);
  });

  it("той самий коміт повним sha дублем не лягає", async () => {
    const full = "dfe481f2c9a4b6e8d0a1c3e5f7089abcdef01234";
    const { admin, state } = fakeCommitAdmin([
      commitRow({ number: 4, status: "done_local", commit_shas: [full] }),
    ]);
    await recordCommitOnCards(admin, "team-1", [4], "dfe481f");
    expect(state.updates).toEqual([]);
    expect(state.rows[0].commit_shas).toEqual([full]);
  });

  it("картка вже «Готово локально», але коміт новий — дописуємо лише sha", async () => {
    const { admin, state } = fakeCommitAdmin([
      commitRow({ number: 4, status: "done_local", commit_shas: ["aaa1234"] }),
    ]);
    const outcomes = await recordCommitOnCards(admin, "team-1", [4], "dfe481f");

    expect(outcomes[0]).toMatchObject({ result: "already" });
    expect(state.updates).toEqual([{ number: 4, patch: { commit_shas: ["aaa1234", "dfe481f"] } }]);
  });

  it("номера немає на дошці — це не помилка, а рядок «такої картки немає»", async () => {
    const { admin, state } = fakeCommitAdmin([commitRow({ number: 4 })]);
    const outcomes = await recordCommitOnCards(admin, "team-1", [999], "dfe481f");

    expect(outcomes[0]).toMatchObject({ number: 999, label: "REQ-999", result: "missing" });
    expect(state.updates).toEqual([]);
  });

  it("зламаний запис не тягне за собою решту карток", async () => {
    const { admin, state } = fakeCommitAdmin([commitRow({ number: 4 })]);
    state.updateFails = true;
    const outcomes = await recordCommitOnCards(admin, "team-1", [4], "dfe481f");
    expect(outcomes[0]).toMatchObject({ result: "failed", status: "triage" });
  });
});

describe("buildBoardCommitResponse", () => {
  const url = URL;

  it("людський підсумок: що пересунуто, що пропущено й чому", async () => {
    const { admin } = fakeCommitAdmin([
      commitRow({ number: 4, status: "queued", title: "Дошка не оновлюється" }),
      commitRow({ number: 7, status: "released" }),
      commitRow({ number: 9, status: "wont_do" }),
    ]);
    const outcomes = await recordCommitOnCards(admin, "team-1", [4, 7, 9, 999], "dfe481f");
    const response = buildBoardCommitResponse({ sha: "dfe481f", outcomes, url });

    expect(response.moved).toEqual([4]);
    expect(response.skipped.map((entry) => entry.result)).toEqual(["released", "wont_do", "missing"]);

    expect(response.message).toContain("dfe481f");
    expect(response.message).toContain("REQ-4 → Готово локально");
    expect(response.message).toContain("Дошка не оновлюється");
    expect(response.message).toContain("REQ-7 уже «Викочено»");
    expect(response.message).toContain("REQ-9 у «Не робимо»");
    expect(response.message).toContain("REQ-999");
    expect(response.message).toContain(url);
  });

  it("жодної картки не зрушив — так і каже, а не вдає успіх", async () => {
    const { admin } = fakeCommitAdmin([]);
    const outcomes = await recordCommitOnCards(admin, "team-1", [999], "dfe481f");
    const response = buildBoardCommitResponse({ sha: "dfe481f", outcomes, url });

    expect(response.moved).toEqual([]);
    expect(response.message).toContain("жодної картки не зрушив");
  });
});

/**
 * Правка тексту картки ззовні. Помилка тут не падає — вона тихо переписує чужу
 * задачу або, гірше, пускає до статусу повз правила, на яких тримається вся
 * конструкція з sha.
 */
describe("parseBoardBody: update", () => {
  it("бере тільки дозволені поля", () => {
    const parsed = parseBoardBody(
      JSON.stringify({ action: "update", number: 35, title: " Нова тема ", body: "Опис", private: true })
    );
    expect(parsed).toEqual({
      ok: true,
      action: "update",
      number: 35,
      patch: { title: "Нова тема", body: "Опис", isPrivate: true },
    });
  });

  it("статус через update не проходить — на це є move", () => {
    const parsed = parseBoardBody(JSON.stringify({ action: "update", number: 35, status: "released" }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.status).toBe(400);
      expect(parsed.error).toContain("move");
    }
  });

  it("порожня тема — відмова, порожній опис — можна", () => {
    const empty = parseBoardBody(JSON.stringify({ action: "update", number: 1, title: "   " }));
    expect(empty.ok).toBe(false);

    const cleared = parseBoardBody(JSON.stringify({ action: "update", number: 1, body: "" }));
    expect(cleared).toEqual({ ok: true, action: "update", number: 1, patch: { body: "" } });
  });

  it("задовга тема не пролазить", () => {
    const parsed = parseBoardBody(
      JSON.stringify({ action: "update", number: 1, title: "я".repeat(TITLE_MAX_LENGTH + 1) })
    );
    expect(parsed.ok).toBe(false);
  });

  it("вигаданий тип чи пріоритет — відмова з переліком дозволених", () => {
    const parsed = parseBoardBody(JSON.stringify({ action: "update", number: 1, kind: "щось" }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("Дозволені");
  });

  it("виклик без жодного поля — не мовчазний успіх", () => {
    const parsed = parseBoardBody(JSON.stringify({ action: "update", number: 1 }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("Нічого міняти");
  });
});

describe("updateBoardCard", () => {
  it("пише лише змінені поля й перелічує, що саме змінив", async () => {
    const { admin, state } = fakeAdmin(row({ number: 35, title: "Стара тема", body: "Старий опис" }));
    const result = await updateBoardCard(admin, "team-1", 35, { title: "Нова тема", body: "Новий опис" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changed).toEqual(["тему", "опис"]);
    expect(state.updates).toEqual([{ title: "Нова тема", body: "Новий опис" }]);
  });

  it("те саме значення — у базу не лізе", async () => {
    const { admin, state } = fakeAdmin(row({ number: 35, title: "Стара тема" }));
    const result = await updateBoardCard(admin, "team-1", 35, { title: "Стара тема" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changed).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("викочену картку правити МОЖНА: опис уточнюють саме після роботи", async () => {
    const { admin, state } = fakeAdmin(row({ number: 35, status: "released" }));
    const result = await updateBoardCard(admin, "team-1", 35, { body: "що зробили насправді" });

    expect(result.ok).toBe(true);
    expect(state.updates).toEqual([{ body: "що зробили насправді" }]);
  });

  it("немає такої картки — так і кажемо", async () => {
    const { admin } = fakeAdmin(null);
    const result = await updateBoardCard(admin, "team-1", 999, { body: "інше" });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("buildBoardUpdateResponse", () => {
  const card = toBoardCard({
    number: 35,
    title: "Переробити вхід ToSho AI",
    kind: "bug",
    status: "in_progress",
    module_key: null,
    priority: "normal",
    is_private: false,
    created_at: "2026-08-11T09:00:00.000Z",
  })!;

  it("каже, що саме змінив", () => {
    const response = buildBoardUpdateResponse({ card, changed: ["тему", "опис"], url: "https://tosho.pro/dev/backlog" });
    expect(response.unchanged).toBe(false);
    expect(response.message).toContain("оновив тему, опис");
    expect(response.message).toContain("REQ-35");
  });

  it("нічого не змінилось — не вдає роботу", () => {
    const response = buildBoardUpdateResponse({ card, changed: [], url: "https://tosho.pro/dev/backlog" });
    expect(response.unchanged).toBe(true);
    expect(response.message).toContain("нічого не змінив");
  });
});

describe("MERGEABLE_STATUSES", () => {
  it("«Готово локально» відкрите, але долучати в нього не можна", () => {
    // Різниця між двома переліками — не дрібниця, а весь сенс MERGEABLE_STATUSES:
    // код такої картки вже написаний, і дописане в неї поїхало б у прод разом із
    // нею, жодного разу не побувавши в роботі.
    expect(OPEN_STATUSES).toContain("done_local");
    expect(MERGEABLE_STATUSES).not.toContain("done_local");
  });

  it("закриті стани в кандидатах не з'являються", () => {
    expect(MERGEABLE_STATUSES).not.toContain("released");
    expect(MERGEABLE_STATUSES).not.toContain("wont_do");
    expect(MERGEABLE_STATUSES).not.toContain("someday");
  });
});

describe("findCardByLabel", () => {
  const cards = [card({ number: 42 }), card({ number: 174 })];

  it("знаходить за підписом і не зважає на регістр та краї", () => {
    expect(findCardByLabel(cards, "REQ-174")?.number).toBe(174);
    expect(findCardByLabel(cards, "req-174")?.number).toBe(174);
    expect(findCardByLabel(cards, "  REQ-42 ")?.number).toBe(42);
  });

  it("вигаданої картки не існує — інакше долучали б у порожнечу", () => {
    expect(findCardByLabel(cards, "REQ-999")).toBeNull();
    expect(findCardByLabel(cards, "")).toBeNull();
    expect(findCardByLabel(cards, null)).toBeNull();
    expect(findCardByLabel([], "REQ-42")).toBeNull();
  });
});

describe("buildMergedBody", () => {
  it("дописує блок із датою знизу, лишаючи наявний опис недоторканим", () => {
    const merged = buildMergedBody("ЩО НЕ ТАК\n\nСтарий опис", "Те саме на вкладці Нанесення", "26.08.2026");
    expect(merged).toBe(
      "ЩО НЕ ТАК\n\nСтарий опис\n\nДОДАНО 26.08.2026 — просили ще раз\n\nТе саме на вкладці Нанесення"
    );
  });

  it("порожній опис не дає порожнього рядка зверху", () => {
    expect(buildMergedBody("", "Нове прохання", "26.08.2026")).toBe(
      "ДОДАНО 26.08.2026 — просили ще раз\n\nНове прохання"
    );
  });

  it("порожнє доповнення лишає опис як був — заголовок без тексту нічого не каже", () => {
    expect(buildMergedBody("Старий опис", "   ", "26.08.2026")).toBe("Старий опис");
  });
});

describe("formatMergeDate", () => {
  it("день київський, а не UTC", () => {
    // 21:30 UTC у серпні — це вже наступна доба в Києві (UTC+3). Дата в описі
    // має збігатись із тією, що людина побачить на дошці.
    expect(formatMergeDate(new Date("2026-08-26T21:30:00.000Z"))).toBe("27.08.2026");
    expect(formatMergeDate(new Date("2026-08-26T10:00:00.000Z"))).toBe("26.08.2026");
  });
});

/**
 * Заглушка під mergeIntoBoardCard: там update іде ДО .in(), тож фільтр статусу
 * відомий лише на maybeSingle. Тому запис відкладений — інакше стуб не міг би
 * показати головне: коли статус розійшовся, рядків не оновлюється жодного.
 */
type MergeChainStub = {
  select: () => MergeChainStub;
  eq: () => MergeChainStub;
  in: (column: string, values: string[]) => MergeChainStub;
  update: (patch: Record<string, unknown>) => MergeChainStub;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
};

function fakeMergeAdmin(initial: Record<string, unknown> | null) {
  const state = { row: initial, updates: [] as Array<Record<string, unknown>> };
  let pending: Record<string, unknown> | null = null;
  let statuses: string[] | null = null;

  const chain: MergeChainStub = {
    select: () => chain,
    eq: () => chain,
    in: (_column, values) => {
      statuses = values;
      return chain;
    },
    update: (patch) => {
      pending = patch;
      return chain;
    },
    maybeSingle: async () => {
      if (!pending) return { data: state.row, error: null };
      const patch = pending;
      const wanted = statuses;
      pending = null;
      statuses = null;

      const status = String((state.row as { status?: string } | null)?.status ?? "");
      if (!state.row || (wanted && !wanted.includes(status))) return { data: null, error: null };

      state.updates.push(patch);
      state.row = { ...state.row, ...patch };
      return { data: state.row, error: null };
    },
  };

  const admin = { schema: () => ({ from: () => chain }) } as unknown as SupabaseClient;
  return { admin, state };
}

describe("mergeIntoBoardCard", () => {
  it("дописує сказане й піднімає лічильник «скільки разів просили»", async () => {
    const { admin, state } = fakeMergeAdmin(row({ number: 174, body: "Старий опис", asked_by_count: 1 }));
    const result = await mergeIntoBoardCard(admin, "team-1", 174, "Нове прохання", "26.08.2026");

    expect(result.ok).toBe(true);
    expect(result.ok && result.askedByCount).toBe(2);
    expect(state.updates).toEqual([
      {
        body: "Старий опис\n\nДОДАНО 26.08.2026 — просили ще раз\n\nНове прохання",
        asked_by_count: 2,
      },
    ]);
  });

  it("зіпсований лічильник читається як «просили раз», а не як нуль", async () => {
    const { admin, state } = fakeMergeAdmin(row({ number: 174, asked_by_count: null }));
    await mergeIntoBoardCard(admin, "team-1", 174, "Нове", "26.08.2026");
    expect(state.updates[0]).toMatchObject({ asked_by_count: 2 });
  });

  it("картки немає — нічого не пишемо", async () => {
    const { admin, state } = fakeMergeAdmin(null);
    const result = await mergeIntoBoardCard(admin, "team-1", 999, "Нове", "26.08.2026");
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(state.updates).toEqual([]);
  });

  it("картку встигли закрити між читанням і записом — не дописуємо в неї нічого", async () => {
    // Кандидатів читали до виклику моделі; поки вона думала, деплой перевів
    // картку у «Викочено». Умова по статусу в самому UPDATE лишає нуль рядків,
    // і викличний код заведе нову картку замість тихого абзацу в закритій.
    const { admin, state } = fakeMergeAdmin(row({ number: 174, status: "released", body: "Опис" }));
    const result = await mergeIntoBoardCard(admin, "team-1", 174, "Нове", "26.08.2026");

    expect(result.ok).toBe(false);
    expect(state.updates).toEqual([]);
    expect(state.row).toMatchObject({ body: "Опис" });
  });
});

describe("дописування пункту чекліста", () => {
  it("розбирає запит і ріже краї тексту", () => {
    expect(parseBoardBody(JSON.stringify({ action: "checklist", number: 175, text: "  сірий текст  " }))).toEqual({
      ok: true,
      action: "checklist",
      number: 175,
      text: "сірий текст",
    });
  });

  it("без номера й без тексту не працює", () => {
    const noNumber = parseBoardBody(JSON.stringify({ action: "checklist", text: "щось" }));
    expect(noNumber.ok).toBe(false);
    const noText = parseBoardBody(JSON.stringify({ action: "checklist", number: 175, text: "   " }));
    expect(noText.ok).toBe(false);
    expect(noText.ok === false && noText.error).toContain("нічого дописувати");
  });

  it("довгий пункт відхиляється з поясненням, що це вже картка", () => {
    const long = parseBoardBody(
      JSON.stringify({ action: "checklist", number: 175, text: "х".repeat(CHECKLIST_TEXT_MAX + 1) })
    );
    expect(long.ok).toBe(false);
    expect(long.ok === false && long.error).toContain("окрема картка");
  });

  it("невідома дія перелічує п'ять доступних, включно з checklist", () => {
    const unknown = parseBoardBody(JSON.stringify({ action: "видалити" }));
    expect(unknown.ok).toBe(false);
    expect(unknown.ok === false && unknown.error).toContain("checklist");
  });

  it("дописує в кінець і рахує id від найбільшого, а не від довжини", async () => {
    // Після видалення пункту довжина повторила б уже зайнятий id — і два
    // пункти з однаковим ключем зламали б галочки в CRM.
    const { admin, state } = fakeAdmin(
      row({ number: 175, status: "queued", checklist: [{ id: "p1" }, { id: "p7" }] })
    );
    const result = await appendChecklistItem(admin, "team-1", 175, "нова дрібниця");

    expect(result.ok).toBe(true);
    expect(result.ok && result.total).toBe(3);
    const written = state.updates[0]?.checklist as Array<Record<string, unknown>>;
    expect(written).toHaveLength(3);
    expect(written[2]).toMatchObject({ id: "p8", text: "нова дрібниця", state: "todo", kind: "task" });
  });

  it("у викочену картку не дописуємо — це суперечило б розділу «Релізи»", async () => {
    const { admin, state } = fakeAdmin(row({ number: 51, status: "released", checklist: [] }));
    const result = await appendChecklistItem(admin, "team-1", 51, "щось");
    expect(result).toEqual({ ok: false, reason: "closed", status: "released" });
    expect(state.updates).toEqual([]);
  });

  it("у «Не робимо» теж не дописуємо — це тихе скасування рішення людини", async () => {
    const { admin, state } = fakeAdmin(row({ number: 29, status: "wont_do", checklist: [] }));
    const result = await appendChecklistItem(admin, "team-1", 29, "щось");
    expect(result.ok).toBe(false);
    expect(state.updates).toEqual([]);
  });

  it("картки немає — нічого не пишемо", async () => {
    const { admin, state } = fakeAdmin(null);
    expect(await appendChecklistItem(admin, "team-1", 999, "щось")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(state.updates).toEqual([]);
  });
});


/**
 * Заглушка під closeChecklistItemsOnCommit: читання ОДНІЄЇ картки, запис
 * одного `checklist`. Журнал записів тут — головний свідок: він доводить, що в
 * картку не поїхало нічого зайвого (ні статусу, ні `commit_shas`).
 */
function fakeChecklistAdmin(initial: Array<Record<string, unknown>>) {
  const state = {
    rows: initial.map((entry) => ({ ...entry })),
    updates: [] as Array<{ number: number; patch: Record<string, unknown> }>,
    readFails: false,
    updateFails: false,
  };

  function chain() {
    let patch: Record<string, unknown> | null = null;
    let target: number | null = null;

    const stub = {
      select: () => stub,
      eq: (column: string, value: unknown) => {
        if (column === "number") target = Number(value);
        return stub;
      },
      update: (next: Record<string, unknown>) => {
        patch = next;
        return stub;
      },
      maybeSingle: async () => {
        const found = state.rows.find((entry) => Number(entry.number) === target);
        if (patch) {
          if (state.updateFails) return { data: null, error: { message: "запис не пройшов" } };
          if (!found) return { data: null, error: null };
          state.updates.push({ number: target as number, patch });
          Object.assign(found, patch);
          return { data: { number: target }, error: null };
        }
        if (state.readFails) return { data: null, error: { message: "читання не пройшло" } };
        return { data: found ? { ...found } : null, error: null };
      },
    };
    return stub;
  }

  const admin = { schema: () => ({ from: () => chain() }) } as unknown as SupabaseClient;
  return { admin, state };
}

const NOW = new Date("2026-08-27T10:20:00.000Z");

const papercutRow = (overrides: Record<string, unknown> = {}) =>
  commitRow({ number: 180, title: "Дрібниці: картка прорахунку", status: "queued", ...overrides });

/**
 * НАЙДОРОЖЧЕ МІСЦЕ ВСЬОГО МЕХАНІЗМУ.
 *
 * Накопичувач дрібниць — це полиця напряму, а не задача. Один запис статусу
 * сюди запускає ланцюг: «Готово локально» → деплой бачить sha → «Викочено» →
 * картку не зрушити (409) → з черги зникає ВЕСЬ напрям разом із невирішеними
 * дрібницями. Тому тест дивиться не на текст відповіді, а на журнал записів:
 * доводити треба, що в базу не поїхало нічого.
 */
describe("накопичувач дрібниць і коміт", () => {
  it("статусу й sha накопичувачу не пишемо — у базу не йде НІЧОГО", async () => {
    const { admin, state } = fakeCommitAdmin([papercutRow()]);
    const outcomes = await recordCommitOnCards(admin, "team-1", [180], "74ab615");

    expect(outcomes[0]).toMatchObject({ number: 180, result: "papercut", status: "queued" });
    expect(state.updates).toEqual([]);
    expect(state.rows[0].status).toBe("queued");
    expect(state.rows[0].commit_shas).toEqual([]);
  });

  it("у підсумку — підказка з правильною адресою, а не мовчазна тиша", () => {
    const response = buildBoardCommitResponse({
      sha: "74ab615",
      outcomes: [
        {
          number: 180,
          label: "REQ-180",
          title: "Дрібниці: картка прорахунку",
          result: "papercut",
          status: "queued",
          previousStatus: "queued",
          shaKnown: false,
        },
      ],
      url: "https://tosho.pro/dev/backlog",
    });
    expect(response.message).toContain("REQ-180#p1");
    expect(response.message).toContain("накопичувач");
  });

  it("регістр і пробіли в назві не рятують від гвардії", async () => {
    const { admin, state } = fakeCommitAdmin([papercutRow({ title: "  дрібниці: гроші замовлення" })]);
    const outcomes = await recordCommitOnCards(admin, "team-1", [180], "74ab615");
    expect(outcomes[0].result).toBe("papercut");
    expect(state.updates).toEqual([]);
  });

  it("звичайну картку гвардія не чіпає — вона й далі їде в «Готово локально»", async () => {
    const { admin, state } = fakeCommitAdmin([commitRow({ number: 4, status: "queued" })]);
    const outcomes = await recordCommitOnCards(admin, "team-1", [4], "dfe481f");
    expect(outcomes[0].result).toBe("moved");
    expect(state.updates).toHaveLength(1);
  });
});

describe("closeChecklistItemsOnCommit", () => {
  const items = (...entries: Array<Record<string, unknown>>) => entries;

  it("закриває названий пункт і лишає слід коміта", async () => {
    const { admin, state } = fakeChecklistAdmin([
      papercutRow({ checklist: items({ id: "p1", text: "Причина скасування", state: "todo" }) }),
    ]);
    const outcomes = await closeChecklistItemsOnCommit(admin, "team-1", [{ number: 180, item: "p1" }], "74ab615", NOW);

    expect(outcomes[0]).toMatchObject({ result: "closed", item: "p1", text: "Причина скасування" });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].patch.checklist).toEqual([
      { id: "p1", text: "Причина скасування", state: "done", closed: "2026-08-27", sha: "74ab615" },
    ]);
  });

  it("у картку не пишеться НІ статусу, НІ commit_shas — тільки чекліст", async () => {
    // Саме це не дає деплою викотити накопичувач: плагін релізів шукає збіг
    // за commit_shas, і якщо їх немає, збігу не буде ніколи.
    const { admin, state } = fakeChecklistAdmin([
      papercutRow({ checklist: items({ id: "p1", text: "щось", state: "todo" }) }),
    ]);
    await closeChecklistItemsOnCommit(admin, "team-1", [{ number: 180, item: "p1" }], "74ab615", NOW);
    expect(Object.keys(state.updates[0].patch)).toEqual(["checklist"]);
  });

  it("сусідні пункти лишаються недоторканими", async () => {
    const { admin, state } = fakeChecklistAdmin([
      papercutRow({
        checklist: items(
          { id: "p1", text: "перший", state: "todo" },
          { id: "p2", text: "другий", state: "doing", who: "СЕО" }
        ),
      }),
    ]);
    await closeChecklistItemsOnCommit(admin, "team-1", [{ number: 180, item: "p1" }], "74ab615", NOW);
    const written = state.updates[0].patch.checklist as Array<Record<string, unknown>>;
    expect(written[1]).toEqual({ id: "p2", text: "другий", state: "doing", who: "СЕО" });
  });

  it("два пункти однієї картки закриваються ОДНИМ записом", async () => {
    // Два записи означали б, що другий читає стан ДО першого й затирає його.
    const { admin, state } = fakeChecklistAdmin([
      papercutRow({
        checklist: items({ id: "p1", text: "перший", state: "todo" }, { id: "p2", text: "другий", state: "todo" }),
      }),
    ]);
    const outcomes = await closeChecklistItemsOnCommit(
      admin,
      "team-1",
      [
        { number: 180, item: "p1" },
        { number: 180, item: "p2" },
      ],
      "74ab615",
      NOW
    );
    expect(outcomes.map((entry) => entry.result)).toEqual(["closed", "closed"]);
    expect(state.updates).toHaveLength(1);
    const written = state.updates[0].patch.checklist as Array<Record<string, unknown>>;
    expect(written.every((entry) => entry.state === "done")).toBe(true);
  });

  it("уже закритий пункт не переписується — і запису немає взагалі", async () => {
    const { admin, state } = fakeChecklistAdmin([
      papercutRow({ checklist: items({ id: "p1", text: "щось", state: "done", closed: "2026-08-20", sha: "aaaaaaa" }) }),
    ]);
    const outcomes = await closeChecklistItemsOnCommit(admin, "team-1", [{ number: 180, item: "p1" }], "74ab615", NOW);
    expect(outcomes[0].result).toBe("already");
    expect(state.updates).toEqual([]);
  });

  it("неіснуюча адреса — зрозуміла відповідь, а не тихий успіх", async () => {
    const { admin, state } = fakeChecklistAdmin([
      papercutRow({ checklist: items({ id: "p1", text: "щось", state: "todo" }) }),
    ]);
    const outcomes = await closeChecklistItemsOnCommit(admin, "team-1", [{ number: 180, item: "p9" }], "74ab615", NOW);
    expect(outcomes[0].result).toBe("no_item");
    expect(state.updates).toEqual([]);
  });

  it("картки немає — кажемо про це, а не падаємо", async () => {
    const { admin } = fakeChecklistAdmin([]);
    const outcomes = await closeChecklistItemsOnCommit(admin, "team-1", [{ number: 999, item: "p1" }], "74ab615", NOW);
    expect(outcomes[0]).toMatchObject({ result: "missing", label: "REQ-999" });
  });

  it("чекліст викоченої картки не чіпаємо", async () => {
    const { admin, state } = fakeChecklistAdmin([
      commitRow({ number: 15, status: "released", checklist: items({ id: "p1", text: "щось", state: "todo" }) }),
    ]);
    const outcomes = await closeChecklistItemsOnCommit(admin, "team-1", [{ number: 15, item: "p1" }], "74ab615", NOW);
    expect(outcomes[0].result).toBe("closed_card");
    expect(state.updates).toEqual([]);
  });

  it("адреса працює й на звичайній картці — у великої задачі та сама дірка", async () => {
    const { admin, state } = fakeChecklistAdmin([
      commitRow({ number: 15, status: "in_progress", checklist: items({ id: "p3", text: "Рахунок", state: "todo" }) }),
    ]);
    const outcomes = await closeChecklistItemsOnCommit(admin, "team-1", [{ number: 15, item: "p3" }], "dfe481f", NOW);
    expect(outcomes[0].result).toBe("closed");
    expect(state.updates).toHaveLength(1);
  });

  it("провал запису не вдає, що пункт закрито", async () => {
    const { admin, state } = fakeChecklistAdmin([
      papercutRow({ checklist: items({ id: "p1", text: "щось", state: "todo" }) }),
    ]);
    state.updateFails = true;
    const outcomes = await closeChecklistItemsOnCommit(admin, "team-1", [{ number: 180, item: "p1" }], "74ab615", NOW);
    expect(outcomes[0].result).toBe("failed");
  });

  it("порожній перелік — жодного запиту в базу", async () => {
    const { admin, state } = fakeChecklistAdmin([papercutRow()]);
    const outcomes = await closeChecklistItemsOnCommit(admin, "team-1", [], "74ab615", NOW);
    expect(outcomes).toEqual([]);
    expect(state.updates).toEqual([]);
  });
});

describe("kyivDay", () => {
  it("дата закриття — київський настінний день, а не UTC", () => {
    // 21:30 UTC — це вже наступна доба в Києві. Записати сюди UTC-день
    // означало б, що вечірній коміт лягає вчорашнім числом.
    expect(kyivDay(new Date("2026-08-27T21:30:00.000Z"))).toBe("2026-08-28");
    expect(kyivDay(new Date("2026-08-27T10:20:00.000Z"))).toBe("2026-08-27");
  });
});
