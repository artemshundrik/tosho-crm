import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  markCardsReleased,
  pickCardsToRelease,
  RELEASABLE_STATUSES,
  releaseDevRequests,
  shaMatches,
} from "./devRequestReleases.mjs";

/**
 * Тут вирішується, що керівництво побачить у «Релізах» і що людина побачить на
 * дошці. Обидві помилки тихі: хибний збіг ставить «Викочено» тому, чого в проді
 * немає; пропущений — лишає готове висіти в «Готово локально» назавжди.
 */

function card(overrides = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    number: 4,
    title: "Дошка не оновлюється",
    status: "done_local",
    commit_shas: ["dfe481f"],
    ...overrides,
  };
}

describe("shaMatches", () => {
  /**
   * Головна пастка кроку. collect() ріже sha до 8 символів, хук шле 7, а в
   * картці може лежати повний 40-символьний. Дослівне порівняння означало б,
   * що збігів не буває ніколи — тихо, без жодної помилки в логах.
   */
  it("обрізаний реліз і повний sha картки — той самий коміт", () => {
    expect(shaMatches("dfe481f2c9a4b6e8d0a1c3e5f7089abcdef01234", "dfe481f2")).toBe(true);
    expect(shaMatches("dfe481f", "dfe481f2")).toBe(true);
    expect(shaMatches("DFE481F2", "dfe481f")).toBe(true);
  });

  it("різні коміти — не збіг", () => {
    expect(shaMatches("dfe481f", "dfe481a")).toBe(false);
    expect(shaMatches("dfe481f", "aaaaaaa")).toBe(false);
  });

  it("огризки й порожнє не збігаються ні з чим", () => {
    expect(shaMatches("dfe", "dfe481f")).toBe(false);
    expect(shaMatches("", "")).toBe(false);
    expect(shaMatches(null, "dfe481f")).toBe(false);
  });
});

describe("pickCardsToRelease", () => {
  it("картку з комітом цього релізу — беремо", () => {
    const cards = [card()];
    expect(pickCardsToRelease(cards, ["dfe481f2", "aaa12345"])).toEqual(cards);
  });

  it("реліз повним sha, картка коротким — усе одно збіг", () => {
    const cards = [card({ commit_shas: ["dfe481f"] })];
    const picked = pickCardsToRelease(cards, ["dfe481f2c9a4b6e8d0a1c3e5f7089abcdef01234"]);
    expect(picked).toHaveLength(1);
  });

  it("картка з кількома комітами — досить одного збігу", () => {
    const cards = [card({ commit_shas: ["aaa1234", "dfe481f"] })];
    expect(pickCardsToRelease(cards, ["dfe481f2"])).toHaveLength(1);
  });

  /**
   * Викочене не перевикочують: released_at має лишитись від ПЕРШОГО релізу.
   * Повторний деплой того самого діапазону — звичайна річ (фолбек `-30` при
   * неглибокому клоні), і він не повинен переписувати дати.
   */
  it("уже ВИКОЧЕНУ картку не чіпаємо — released_at лишається від першого релізу", () => {
    const cards = [card({ status: "released" })];
    expect(pickCardsToRelease(cards, ["dfe481f"])).toEqual([]);
  });

  it("«Не робимо» деплой НЕ воскрешає — рішення людини сильніше за збіг sha", () => {
    const cards = [card({ status: "wont_do" })];
    expect(pickCardsToRelease(cards, ["dfe481f"])).toEqual([]);
  });

  it("«Ідеї» теж поза автоматикою — перелік дозволених, а не заборонених", () => {
    expect(RELEASABLE_STATUSES).not.toContain("someday");
    expect(pickCardsToRelease([card({ status: "someday" })], ["dfe481f"])).toEqual([]);
  });

  it("картки без записаних комітів і релізи без sha — порожньо", () => {
    expect(pickCardsToRelease([card({ commit_shas: [] })], ["dfe481f"])).toEqual([]);
    expect(pickCardsToRelease([card({ commit_shas: null })], ["dfe481f"])).toEqual([]);
    expect(pickCardsToRelease([card()], [])).toEqual([]);
    expect(pickCardsToRelease([card()], ["", "abc"])).toEqual([]);
    expect(pickCardsToRelease(null, ["dfe481f"])).toEqual([]);
  });

  it("чужий коміт того самого релізу картку не зачіпає", () => {
    expect(pickCardsToRelease([card()], ["9999999", "8888888"])).toEqual([]);
  });
});

describe("markCardsReleased", () => {
  // Підміну fetch повертаємо назад: тест, який лишає по собі зіпсований
  // глобальний об'єкт, ламає сусідів, а виглядає це як їхня власна помилка.
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = realFetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("нічого не знайшлось — жодного запиту в базу", async () => {
    const calls = [];
    globalThis.fetch = async (...args) => {
      calls.push(args);
      throw new Error("сюди не мали дійти");
    };
    await expect(markCardsReleased([], {})).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("у PATCH іде і статус, і released_at, і повторний фільтр по статусу", async () => {
    let captured = null;
    globalThis.fetch = async (url, options) => {
      captured = { url: String(url), options };
      return { ok: true, json: async () => [{ number: 4 }] };
    };

    const now = new Date("2026-08-09T10:00:00.000Z");
    const result = await markCardsReleased([card()], { SUPABASE_URL: "https://db", SUPABASE_SERVICE_ROLE_KEY: "key" }, now);

    expect(result).toEqual([{ number: 4 }]);
    expect(captured.options.method).toBe("PATCH");
    expect(JSON.parse(captured.options.body)).toEqual({
      status: "released",
      released_at: "2026-08-09T10:00:00.000Z",
    });
    // Фільтр по статусу повторюється в самому записі: між читанням і PATCH
    // картку могли зрушити руками, і зняти чуже «Не робимо» ми не маємо права.
    expect(decodeURIComponent(captured.url)).toContain("status=in.(triage,queued,in_progress,done_local)");
    expect(decodeURIComponent(captured.url)).toContain("11111111-1111-1111-1111-111111111111");
    // Схема tosho, а не public — інакше PostgREST пише не в ту таблицю.
    expect(captured.options.headers["content-profile"]).toBe("tosho");
  });

  it("база відповіла помилкою — кидаємо, щоб плагін це записав у лог деплою", async () => {
    globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => "нема такої колонки" });
    await expect(markCardsReleased([card()], { SUPABASE_URL: "https://db" })).rejects.toThrow("Supabase 400");
  });
});

describe("releaseDevRequests — крок цілком", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const env = { SUPABASE_URL: "https://db", SUPABASE_SERVICE_ROLE_KEY: "key" };

  function stubFetch(rows) {
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: decodeURIComponent(String(url)), method: options.method ?? "GET", options });
      if ((options.method ?? "GET") === "GET") return { ok: true, json: async () => rows };
      return { ok: true, json: async () => rows.map((row) => ({ ...row, status: "released" })) };
    };
    return calls;
  }

  it("читає відкриті картки й переводить збіги", async () => {
    const calls = stubFetch([card()]);
    const released = await releaseDevRequests(["dfe481f2"], env);

    expect(released).toEqual([{ ...card(), status: "released" }]);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("status=in.(triage,queued,in_progress,done_local)");
    expect(calls[0].options.headers["accept-profile"]).toBe("tosho");
    expect(calls[1].method).toBe("PATCH");
  });

  it("збігів немає — до запису не доходимо", async () => {
    const calls = stubFetch([card({ commit_shas: ["aaa1234"] })]);
    await expect(releaseDevRequests(["dfe481f2"], env)).resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("картки без комітів у звірку не потрапляють узагалі", async () => {
    const calls = stubFetch([card({ commit_shas: [] }), card({ commit_shas: null })]);
    await expect(releaseDevRequests(["dfe481f2"], env)).resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
