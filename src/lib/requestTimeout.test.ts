import { describe, expect, it, vi } from "vitest";

import { fetchWithReadTimeout, RequestTimeoutError } from "./requestTimeout";

const never = () => new Promise<Response>(() => {});

describe("fetchWithReadTimeout", () => {
  it("мовчазне читання обривається зрозумілою помилкою, а не висить вічно", async () => {
    const wrapped = fetchWithReadTimeout(never as unknown as typeof fetch, 20);
    await expect(wrapped("https://example.test/rows")).rejects.toBeInstanceOf(RequestTimeoutError);
  });

  it("завантаження файлу НЕ обривається: вкладення бувають на 50 МБ", async () => {
    // Обірваний на 25-й секунді аплоад — це зламаний сценарій, а не захист.
    const wrapped = fetchWithReadTimeout(never as unknown as typeof fetch, 20);
    const upload = wrapped("https://x.test/storage/v1/object/quotes/file.pdf", { method: "POST" });
    const settled = await Promise.race([
      upload.then(() => "resolved").catch(() => "rejected"),
      new Promise((resolve) => setTimeout(() => resolve("ще висить"), 60)),
    ]);
    expect(settled).toBe("ще висить");
  });

  it("оновлення сесії має дедлайн, хоч це і POST", async () => {
    // Саме на ньому застосунок висів на «Завантаження CRM» під час аварії 20.08.
    const wrapped = fetchWithReadTimeout(never as unknown as typeof fetch, 20);
    await expect(
      wrapped("https://x.test/auth/v1/token?grant_type=refresh_token", { method: "POST" })
    ).rejects.toBeInstanceOf(RequestTimeoutError);
  });

  it("успішне читання проходить як є", async () => {
    const ok = new Response("[]", { status: 200 });
    const wrapped = fetchWithReadTimeout(vi.fn(async () => ok) as unknown as typeof fetch, 50);
    await expect(wrapped("https://example.test/rows")).resolves.toBe(ok);
  });

  it("власний signal викликача поважаємо — свій тайм-аут не нав'язуємо", async () => {
    const seen: Array<AbortSignal | null | undefined> = [];
    const base = ((_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init?.signal);
      return Promise.resolve(new Response("ok"));
    }) as typeof fetch;
    const wrapped = fetchWithReadTimeout(base, 20);
    const ownController = new AbortController();
    await wrapped("https://example.test/rows", { signal: ownController.signal });
    expect(seen[0]).toBe(ownController.signal);
  });
});
