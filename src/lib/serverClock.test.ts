import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { noteServerDate, observeServerClock, serverNow } from "./serverClock";

const REST_URL = "https://x.supabase.co/rest/v1/design_tasks?select=id";
const STORAGE_URL = "https://x.supabase.co/storage/v1/object/public/a/b.png";

const LOCAL = Date.UTC(2026, 10, 6, 10, 0, 0);
const MINUTES_45 = 45 * 60_000;

const httpDate = (ms: number) => new Date(ms).toUTCString();

const respondWith = (dateMs: number | null) =>
  vi.fn(
    async () =>
      new Response("[]", {
        status: 200,
        headers: dateMs === null ? {} : { date: httpDate(dateMs) },
      })
  ) as unknown as typeof fetch;

describe("serverNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(LOCAL);
    // Модуль тримає поправку між тестами: збіг годинників її знімає.
    noteServerDate(httpDate(LOCAL));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("поки сервер нічого не сказав, це звичайний годинник", async () => {
    noteServerDate(httpDate(LOCAL + MINUTES_45));
    vi.resetModules();
    const fresh = await import("./serverClock");
    expect(fresh.serverNow()).toBe(LOCAL);
  });

  it("годинник відстає на 45 хв: показує час сервера", () => {
    // Сценарій 06.11.2026: на комп'ютері 10:00, насправді 10:45.
    noteServerDate(httpDate(LOCAL + MINUTES_45));
    expect(serverNow()).toBe(LOCAL + MINUTES_45);
  });

  it("годинник спішить на 20 хв: теж показує час сервера", () => {
    noteServerDate(httpDate(LOCAL - 20 * 60_000));
    expect(serverNow()).toBe(LOCAL - 20 * 60_000);
  });

  it("поправка живе далі разом із ходом годинника", () => {
    noteServerDate(httpDate(LOCAL + MINUTES_45));
    vi.advanceTimersByTime(90_000);
    expect(serverNow()).toBe(LOCAL + MINUTES_45 + 90_000);
  });

  it("людина виправила годинник посеред сесії: поправка зникає з наступною відповіддю", () => {
    noteServerDate(httpDate(LOCAL + MINUTES_45));
    vi.setSystemTime(LOCAL + MINUTES_45);
    noteServerDate(httpDate(LOCAL + MINUTES_45));
    expect(serverNow()).toBe(LOCAL + MINUTES_45);
  });

  it("здоровий комп'ютер не отримує поправки: заголовок округлений до секунди й запізнюється", () => {
    noteServerDate(httpDate(LOCAL - 2_000));
    expect(serverNow()).toBe(LOCAL);
    noteServerDate(httpDate(LOCAL + 2_000));
    expect(serverNow()).toBe(LOCAL);
  });

  it("зсув рівно на допуск уже виправляється", () => {
    noteServerDate(httpDate(LOCAL + 3_000));
    expect(serverNow()).toBe(LOCAL + 3_000);
  });

  it("годинник близько межі: поправка не смикається з кожною відповіддю", () => {
    // Заголовок округлений до секунди, тож той самий зсув дає то 3 с, то 2 с.
    noteServerDate(httpDate(LOCAL + 3_000));
    noteServerDate(httpDate(LOCAL + 2_000));
    expect(serverNow()).toBe(LOCAL + 3_000);
    noteServerDate(httpDate(LOCAL + 3_000));
    expect(serverNow()).toBe(LOCAL + 3_000);
  });

  it("сміття в заголовку не чіпає наявну поправку", () => {
    noteServerDate(httpDate(LOCAL + MINUTES_45));
    noteServerDate("не дата");
    noteServerDate(null);
    noteServerDate("");
    expect(serverNow()).toBe(LOCAL + MINUTES_45);
  });
});

describe("observeServerClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(LOCAL);
    noteServerDate(httpDate(LOCAL));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("бере час із відповіді бази й віддає саму відповідь без змін", async () => {
    const wrapped = observeServerClock(respondWith(LOCAL + MINUTES_45));

    const response = await wrapped(REST_URL);

    expect(serverNow()).toBe(LOCAL + MINUTES_45);
    expect(await response.text()).toBe("[]");
  });

  it("відмова бази теж несе правильний час: саме тоді він найпотрібніший", async () => {
    const base = vi.fn(
      async () =>
        new Response("{}", { status: 401, headers: { date: httpDate(LOCAL + MINUTES_45) } })
    ) as unknown as typeof fetch;

    await observeServerClock(base)(REST_URL);

    expect(serverNow()).toBe(LOCAL + MINUTES_45);
  });

  it("файли зі сховища не слухає: їхня відповідь може лежати в кеші браузера зі старою датою", async () => {
    await observeServerClock(respondWith(LOCAL - 7 * 24 * 3_600_000))(STORAGE_URL);
    expect(serverNow()).toBe(LOCAL);
  });

  it("повільну відповідь не слухає: заморожена вкладка отримує її зі старою датою", async () => {
    // Сервер відповів вчасно, а вкладка спала 20 хв: «час сервера» в заголовку
    // застарів, хоч годинник правильний.
    const base = vi.fn(async () => {
      const sentAtServer = Date.now();
      vi.setSystemTime(sentAtServer + 20 * 60_000);
      return new Response("[]", { status: 200, headers: { date: httpDate(sentAtServer) } });
    }) as unknown as typeof fetch;

    await observeServerClock(base)(REST_URL);

    expect(serverNow()).toBe(LOCAL + 20 * 60_000);
  });

  it("відповідь без заголовка нічого не ламає", async () => {
    const response = await observeServerClock(respondWith(null))(REST_URL);
    expect(response.status).toBe(200);
    expect(serverNow()).toBe(LOCAL);
  });

  it("обрив мережі лишається обривом", async () => {
    const base = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    await expect(observeServerClock(base)(REST_URL)).rejects.toThrow("Failed to fetch");
  });
});
