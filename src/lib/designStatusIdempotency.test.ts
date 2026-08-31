import { describe, expect, it } from "vitest";

import { isDesignStatusAlreadyApplied } from "./designStatusIdempotency";

describe("isDesignStatusAlreadyApplied", () => {
  it("статус у базі вже той, який просять — переходу немає", () => {
    expect(isDesignStatusAlreadyApplied({ status: "client_review" }, "client_review")).toBe(true);
  });

  it("статус інший — перехід справжній", () => {
    expect(isDesignStatusAlreadyApplied({ status: "pm_review" }, "client_review")).toBe(false);
  });

  it("другий кидок картки з тим самим застарілим знімком не проходить", () => {
    // Дошка тримає знімок задачі; після першого кидка він каже "pm_review", хоча
    // база вже "client_review". Вирішує база — інакше подія і сповіщення пишуться
    // вдруге (31.08.2026: п'ять повідомлень замість трьох).
    const staleSnapshotStatus = "pm_review";
    const liveMetadata = { status: "client_review" };
    expect(staleSnapshotStatus === "client_review").toBe(false);
    expect(isDesignStatusAlreadyApplied(liveMetadata, "client_review")).toBe(true);
  });

  it("metadata без статусу чи взагалі відсутня нічого не блокує", () => {
    expect(isDesignStatusAlreadyApplied({}, "approved")).toBe(false);
    expect(isDesignStatusAlreadyApplied(null, "approved")).toBe(false);
    expect(isDesignStatusAlreadyApplied(undefined, "approved")).toBe(false);
  });
});
