import { describe, expect, it } from "vitest";

import {
  applyDesignStatusWrite,
  isDesignStatusAlreadyApplied,
  readStatusWitness,
} from "./designStatusIdempotency";

/** Підробка PostgREST-білдера: запам'ятовує фільтри й віддає задані рядки. */
function fakeUpdate(rows: unknown[] | null, error: { message: string } | null = null) {
  const filters: Array<[string, unknown]> = [];
  const builder = {
    filters,
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return builder;
    },
    select() {
      return Promise.resolve({ data: rows, error });
    },
  };
  return builder;
}

describe("isDesignStatusAlreadyApplied", () => {
  it("статус у базі вже той, який просять — переходу немає", () => {
    expect(isDesignStatusAlreadyApplied({ status: "client_review" }, "client_review")).toBe(true);
  });

  it("статус інший — перехід справжній", () => {
    expect(isDesignStatusAlreadyApplied({ status: "pm_review" }, "client_review")).toBe(false);
  });

  it("другий кидок картки з тим самим застарілим знімком не проходить", () => {
    // Дошка тримає знімок задачі; після першого кидка він каже "pm_review", хоча
    // база вже "client_review". Старий гейт питав знімок і пропускав другий запис;
    // новий питає базу (31.08.2026: п'ять повідомлень замість трьох).
    const staleSnapshot: { status: string } = { status: "pm_review" };
    const liveMetadata = { status: "client_review" };
    expect(isDesignStatusAlreadyApplied(staleSnapshot, "client_review")).toBe(false);
    expect(isDesignStatusAlreadyApplied(liveMetadata, "client_review")).toBe(true);
  });

  it("metadata без статусу чи взагалі відсутня нічого не блокує", () => {
    expect(isDesignStatusAlreadyApplied({}, "approved")).toBe(false);
    expect(isDesignStatusAlreadyApplied(null, "approved")).toBe(false);
    expect(isDesignStatusAlreadyApplied(undefined, "approved")).toBe(false);
  });
});

describe("readStatusWitness", () => {
  it("бере статус із metadata, а порожнє й нерядкове віддає як null", () => {
    expect(readStatusWitness({ status: "pm_review" })).toBe("pm_review");
    expect(readStatusWitness({ status: "" })).toBeNull();
    expect(readStatusWitness({ status: 7 })).toBeNull();
    expect(readStatusWitness({})).toBeNull();
    expect(readStatusWitness(null)).toBeNull();
  });
});

describe("applyDesignStatusWrite", () => {
  it("умова «статус досі той, який я читав» їде в сам запис", async () => {
    const update = fakeUpdate([{ id: "task-1" }]);
    const result = await applyDesignStatusWrite(update, "pm_review");
    expect(result.applied).toBe(true);
    expect(update.filters).toContainEqual(["metadata->>status", "pm_review"]);
  });

  it("рядок перехопили — запис нічого не знайшов, і подій писати нема з чого", async () => {
    // Саме це станеться з другим із двох одночасних кліків: перший уже перевів
    // статус, тож фільтр `metadata->>status=pm_review` більше не збігається.
    const update = fakeUpdate([]);
    const result = await applyDesignStatusWrite(update, "pm_review");
    expect(result.applied).toBe(false);
  });

  it("без статусу в рядку звірятись нема з чим — фільтр не додається", async () => {
    const update = fakeUpdate([{ id: "task-1" }]);
    const result = await applyDesignStatusWrite(update, null);
    expect(result.applied).toBe(true);
    expect(update.filters.map(([column]) => column)).not.toContain("metadata->>status");
  });

  it("справжня помилка запису лишається помилкою, а не тихим «перехопили»", async () => {
    const update = fakeUpdate(null, { message: "permission denied" });
    await expect(applyDesignStatusWrite(update, "pm_review")).rejects.toThrow("permission denied");
  });
});
