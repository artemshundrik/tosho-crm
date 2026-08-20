import { describe, expect, it, vi } from "vitest";

import { forgetFlight, singleFlight } from "./singleFlight";

describe("singleFlight", () => {
  it("одночасні виклики з одним ключем ідуть у базу РАЗ", async () => {
    const run = vi.fn(async () => "ok");
    const [a, b, c] = await Promise.all([
      singleFlight("k1", run),
      singleFlight("k1", run),
      singleFlight("k1", run),
    ]);

    expect(run).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual(["ok", "ok", "ok"]);
  });

  it("це НЕ кеш: після відповіді наступний виклик іде заново", async () => {
    // Саме тому цим можна накривати перевірку блокування й взяття лока:
    // частота перевірок у часі не змінюється.
    const run = vi.fn(async () => "ok");
    await singleFlight("k2", run);
    await singleFlight("k2", run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("різні ключі не змішуються", async () => {
    const a = vi.fn(async () => "a");
    const b = vi.fn(async () => "b");
    const [ra, rb] = await Promise.all([singleFlight("x", a), singleFlight("y", b)]);
    expect([ra, rb]).toEqual(["a", "b"]);
  });

  it("помилка дістається всім, хто чекав, і не залипає на наступний виклик", async () => {
    const failing = vi.fn(async () => {
      throw new Error("впало");
    });
    const results = await Promise.allSettled([singleFlight("e", failing), singleFlight("e", failing)]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(failing).toHaveBeenCalledTimes(1);

    const ok = vi.fn(async () => "ok");
    await expect(singleFlight("e", ok)).resolves.toBe("ok");
  });

  it("forgetFlight змушує наступний виклик піти заново, не чекаючи попереднього", async () => {
    let release: (value: string) => void = () => {};
    const slow = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    const first = singleFlight("f", slow);
    forgetFlight("f");
    const second = singleFlight("f", async () => "свіже");

    expect(await second).toBe("свіже");
    release("старе");
    expect(await first).toBe("старе");
    expect(slow).toHaveBeenCalledTimes(1);
  });
});
