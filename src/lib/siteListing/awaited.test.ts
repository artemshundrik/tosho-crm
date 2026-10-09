import { describe, expect, it } from "vitest";

import { awaitedHint, awaitedShort } from "./awaited";

describe("очікуване надходження замість «немає ціни»", () => {
  it("коротко — день і місяць", () => {
    expect(awaitedShort({ awaited_qty: 2000, awaited_at: "2026-11-15" })).toBe("очікується 15.11");
  });

  it("без дати — просто «очікується»", () => {
    expect(awaitedShort({ awaited_qty: 3000, awaited_at: null })).toBe("очікується");
    expect(awaitedShort({ awaited_qty: 3000, awaited_at: "15-11-2026" })).toBe("очікується");
  });

  it("нічого не їде — сказати нічого", () => {
    expect(awaitedShort({ awaited_qty: null, awaited_at: "2026-11-15" })).toBeNull();
    expect(awaitedShort({ awaited_qty: 0, awaited_at: null })).toBeNull();
    expect(awaitedHint({ awaited_qty: null, awaited_at: null })).toBeNull();
  });

  it("підказка каже кількість, повну дату й що буде далі", () => {
    const hint = awaitedHint({ awaited_qty: 2000, awaited_at: "2026-11-15" }) ?? "";
    expect(hint).toMatch(/очікується 2\s000 шт на 15\.11\.2026/);
    expect(hint).toContain("«Беремо» ввімкнеться саме");
  });
});
