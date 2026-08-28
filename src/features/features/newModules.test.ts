import { describe, expect, it } from "vitest";

import { newModuleKeys } from "./newModules";
import type { ModuleKey } from "@/lib/moduleAccess";

const available: ModuleKey[] = ["overview", "quotes", "finance"];

describe("нові розділи меню", () => {
  it("новий той, якого немає в памʼяті", () => {
    expect(newModuleKeys(available, new Set(["overview", "quotes"]))).toEqual(["finance"]);
  });

  it("усе бачене — нічого не світиться", () => {
    expect(newModuleKeys(available, new Set(available))).toEqual([]);
  });

  it("памʼять про розділ, якого людині вже не видно, нічого не додає", () => {
    // Доступ забрали — пункт зник із меню, і згадка про нього в памʼяті не
    // має вигадувати мітку на порожньому місці.
    expect(newModuleKeys(["overview"], new Set(["overview", "finance"]))).toEqual([]);
  });
});
