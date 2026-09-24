import { afterEach, describe, expect, it, vi } from "vitest";

import {
  describeRecentNetworkFailure,
  NETWORK_FAILURE_MATCH_WINDOW_MS,
  resetNetworkFailureTrail,
  trackNetworkFailures,
} from "./networkFailureTrail";
import { RequestTimeoutError } from "./requestTimeout";

const failing = (error: unknown) => (async () => {
  throw error;
}) as unknown as typeof fetch;

afterEach(() => {
  resetNetworkFailureTrail();
  vi.useRealTimers();
});

describe("trackNetworkFailures", () => {
  it("запам'ятовує метод і шлях обірваного запиту й кидає помилку далі", async () => {
    const wrapped = trackNetworkFailures(failing(new TypeError("Failed to fetch")));
    await expect(
      wrapped("https://x.supabase.co/rest/v1/rpc/acquire_entity_lock", { method: "post" })
    ).rejects.toBeInstanceOf(TypeError);
    expect(describeRecentNetworkFailure()).toBe("POST /rest/v1/rpc/acquire_entity_lock");
  });

  it("параметри запиту в журнал не йдуть — лише таблиця", async () => {
    // У параметрах бувають ідентифікатори й тексти пошуку; для діагнозу
    // досить знати, до якої таблиці був запит.
    const wrapped = trackNetworkFailures(failing(new TypeError("Failed to fetch")));
    await expect(
      wrapped("https://x.supabase.co/rest/v1/quote_items?select=id&quote_id=eq.1896959e")
    ).rejects.toThrow();
    expect(describeRecentNetworkFailure()).toBe("GET /rest/v1/quote_items");
  });

  it("довгий шлях сховища ріже до чотирьох сегментів: імена файлів не потрібні", async () => {
    const wrapped = trackNetworkFailures(failing(new TypeError("Failed to fetch")));
    await expect(
      wrapped("https://x.supabase.co/storage/v1/object/sign/attachments/team/ТОВ Клевер/макет.pdf")
    ).rejects.toThrow();
    expect(describeRecentNetworkFailure()).toBe("GET /storage/v1/object/sign");
  });

  it("скасування й наш тайм-аут обривом мережі не вважає", async () => {
    // Скасований запит — рішення коду, тайм-аут має свій зрозумілий текст;
    // жодне з них не каже, що в людини зник інтернет.
    const aborted = trackNetworkFailures(failing(new DOMException("aborted", "AbortError")));
    await expect(aborted("https://x.supabase.co/rest/v1/quotes")).rejects.toThrow();
    const timedOut = trackNetworkFailures(failing(new RequestTimeoutError()));
    await expect(timedOut("https://x.supabase.co/rest/v1/quotes")).rejects.toThrow();
    expect(describeRecentNetworkFailure()).toBeNull();
  });

  it("успішна відповідь проходить як є й нічого не записує", async () => {
    const ok = new Response("[]", { status: 200 });
    const wrapped = trackNetworkFailures(vi.fn(async () => ok) as unknown as typeof fetch);
    await expect(wrapped("https://x.supabase.co/rest/v1/quotes")).resolves.toBe(ok);
    expect(describeRecentNetworkFailure()).toBeNull();
  });

  it("давній обрив до свіжої помилки не приписує", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T06:56:20Z"));
    const wrapped = trackNetworkFailures(failing(new TypeError("Failed to fetch")));
    await expect(wrapped("https://x.supabase.co/rest/v1/user_presence", { method: "POST" })).rejects.toThrow();

    const later = Date.now() + NETWORK_FAILURE_MATCH_WINDOW_MS + 1;
    expect(describeRecentNetworkFailure(later)).toBeNull();
  });
});
