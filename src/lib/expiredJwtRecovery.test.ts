import { describe, expect, it, vi } from "vitest";

import { recoverExpiredJwt } from "./expiredJwtRecovery";

const REST_URL = "https://x.supabase.co/rest/v1/design_tasks?select=id";

const expired = () =>
  new Response(JSON.stringify({ code: "PGRST303", details: null, hint: null, message: "JWT expired" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });

const ok = () => new Response("[]", { status: 200 });

const withToken = (token: string, extra: RequestInit = {}): RequestInit => ({
  ...extra,
  headers: new Headers({ Authorization: `Bearer ${token}`, apikey: "anon" }),
});

const tokenOf = (init: RequestInit | undefined) => new Headers(init?.headers).get("Authorization");

/** Підставний бекенд: приймає лише `valid`, усе інше — «JWT expired». */
const backendAccepting = (valid: string) =>
  vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    tokenOf(init) === `Bearer ${valid}` ? ok() : expired()
  );

describe("recoverExpiredJwt", () => {
  it("прострочений токен: оновлює сесію й повторює запит із новим", async () => {
    // Сценарій із 06.11.2026: годинник відстає, клієнт бази певен, що токен живий.
    const base = backendAccepting("fresh");
    const renew = vi.fn(async () => "fresh");
    const wrapped = recoverExpiredJwt(base as unknown as typeof fetch, renew);

    const response = await wrapped(REST_URL, withToken("stale"));

    expect(response.status).toBe(200);
    expect(renew).toHaveBeenCalledWith("stale");
    expect(base).toHaveBeenCalledTimes(2);
    expect(tokenOf(base.mock.calls[1][1])).toBe("Bearer fresh");
  });

  it("повтор зберігає решту заголовків, метод і тіло", async () => {
    const base = backendAccepting("fresh");
    const wrapped = recoverExpiredJwt(base as unknown as typeof fetch, async () => "fresh");

    await wrapped(REST_URL, withToken("stale", { method: "PATCH", body: '{"a":1}' }));

    const retry = base.mock.calls[1][1];
    expect(retry?.method).toBe("PATCH");
    expect(retry?.body).toBe('{"a":1}');
    expect(new Headers(retry?.headers).get("apikey")).toBe("anon");
  });

  it("пачка одночасних відмов оновлює сесію один раз", async () => {
    // Сторінка дизайну шле сотні запитів разом. Кожне оновлення ротує refresh-токен,
    // тож пачка оновлень — це гонка, а не просто зайві запити.
    const base = backendAccepting("fresh");
    let release: (token: string) => void = () => {};
    const renew = vi.fn(() => new Promise<string | null>((resolve) => (release = resolve)));
    const wrapped = recoverExpiredJwt(base as unknown as typeof fetch, renew);

    const all = Promise.all([1, 2, 3].map(() => wrapped(REST_URL, withToken("stale"))));
    await vi.waitFor(() => expect(renew).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 5));
    release("fresh");
    const responses = await all;

    expect(renew).toHaveBeenCalledTimes(1);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
  });

  it("сесію не вдалось оновити: викликач бачить початкову відмову", async () => {
    const base = backendAccepting("fresh");
    const wrapped = recoverExpiredJwt(base as unknown as typeof fetch, async () => null);

    const response = await wrapped(REST_URL, withToken("stale"));

    expect(response.status).toBe(401);
    expect((await response.json()).message).toBe("JWT expired");
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("помилка під час оновлення не підміняє відповідь бази", async () => {
    const base = backendAccepting("fresh");
    const wrapped = recoverExpiredJwt(base as unknown as typeof fetch, async () => {
      throw new Error("Failed to fetch");
    });

    const response = await wrapped(REST_URL, withToken("stale"));

    expect(response.status).toBe(401);
  });

  it("новий токен теж відхилено: другого повтору немає", async () => {
    const base = vi.fn(async () => expired());
    const renew = vi.fn(async () => "fresh");
    const wrapped = recoverExpiredJwt(base as unknown as typeof fetch, renew);

    const response = await wrapped(REST_URL, withToken("stale"));

    expect(response.status).toBe(401);
    expect(base).toHaveBeenCalledTimes(2);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it("інша 401 не чіпає сесію: це не прострочення, а відмова", async () => {
    const base = vi.fn(
      async () => new Response(JSON.stringify({ code: "PGRST301", message: "JWSError" }), { status: 401 })
    );
    const renew = vi.fn(async () => "fresh");
    const wrapped = recoverExpiredJwt(base as unknown as typeof fetch, renew);

    const response = await wrapped(REST_URL, withToken("stale"));

    expect(response.status).toBe(401);
    expect(renew).not.toHaveBeenCalled();
  });

  it("запит до самого входу не перехоплює: інакше оновлення токена оновлювало б себе", async () => {
    const base = vi.fn(async () => expired());
    const renew = vi.fn(async () => "fresh");
    const wrapped = recoverExpiredJwt(base as unknown as typeof fetch, renew);

    await wrapped("https://x.supabase.co/auth/v1/token?grant_type=refresh_token", withToken("stale"));

    expect(renew).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("запит без токена користувача не повторює", async () => {
    const base = vi.fn(async () => expired());
    const renew = vi.fn(async () => "fresh");
    const wrapped = recoverExpiredJwt(base as unknown as typeof fetch, renew);

    await wrapped(REST_URL, { headers: new Headers({ apikey: "anon" }) });

    expect(renew).not.toHaveBeenCalled();
  });

  it("тіло, яке не перечитати, не повторює: другий запит пішов би порожнім", async () => {
    const base = vi.fn(async () => expired());
    const renew = vi.fn(async () => "fresh");
    const wrapped = recoverExpiredJwt(base as unknown as typeof fetch, renew);
    const stream = new ReadableStream();

    const response = await wrapped(REST_URL, withToken("stale", { method: "POST", body: stream }));

    expect(response.status).toBe(401);
    expect(renew).not.toHaveBeenCalled();
  });

  it("звичайна відповідь проходить без зайвих запитів", async () => {
    const base = vi.fn(async () => ok());
    const renew = vi.fn(async () => "fresh");
    const wrapped = recoverExpiredJwt(base as unknown as typeof fetch, renew);

    const response = await wrapped(REST_URL, withToken("live"));

    expect(response.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(1);
    expect(renew).not.toHaveBeenCalled();
  });
});
