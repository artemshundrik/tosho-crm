import { describe, expect, it } from "vitest";

import type { SiteListingDraft } from "@/lib/siteListing/types";

import {
  canTake,
  candidateTab,
  countByTab,
  draftView,
  fileCategory,
  hasPendingDrafts,
  priceLabel,
  readyForFile,
  type SiteListingCandidate,
} from "./siteListingState";

const NOW = Date.parse("2026-10-07T12:00:00Z");

const candidate = (patch: Partial<SiteListingCandidate> = {}): SiteListingCandidate => ({
  model_name: "Термопляшка Guard, ТМ Discover",
  articles: ["2635-04", "2635-05"],
  colors: 2,
  priced_colors: 2,
  supplier_price_min: 336.4,
  supplier_price_max: 336.4,
  image_url: null,
  supplier_url: null,
  is_new: false,
  section: null,
  category: null,
  vendor: null,
  first_seen_at: null,
  item_id: null,
  decision: null,
  draft_status: null,
  draft_error: null,
  draft: null,
  category_override: null,
  batch_id: null,
  batch_created_at: null,
  item_updated_at: null,
  ...patch,
});

const draft = { category: "Сувенірна продукція/Термоси" } as SiteListingDraft;

describe("вкладки черги", () => {
  it("без рішення — «Нові»; беремо — «Беремо»; у партії — «У файлі»; відклали — «Не беремо»", () => {
    expect(candidateTab(candidate())).toBe("new");
    expect(candidateTab(candidate({ item_id: "i", decision: "take" }))).toBe("take");
    expect(candidateTab(candidate({ item_id: "i", decision: "take", batch_id: "b" }))).toBe("file");
    expect(candidateTab(candidate({ item_id: "i", decision: "skip" }))).toBe("skip");
    expect(
      countByTab([candidate(), candidate({ decision: "take" }), candidate({ decision: "take", batch_id: "b" })])
    ).toEqual({ new: 1, take: 1, file: 1, skip: 0 });
  });
});

describe("чернетка", () => {
  it("«готується» понад 10 хвилин — це вже невдача", () => {
    const fresh = candidate({ decision: "take", draft_status: "pending", item_updated_at: "2026-10-07T11:55:00Z" });
    const stale = candidate({ decision: "take", draft_status: "pending", item_updated_at: "2026-10-07T11:40:00Z" });
    expect(draftView(fresh, NOW)).toBe("pending");
    expect(draftView(stale, NOW)).toBe("failed");
    expect(hasPendingDrafts([fresh], NOW)).toBe(true);
    expect(hasPendingDrafts([stale], NOW)).toBe(false);
  });

  it("«running» — функція вже працює: для людини це теж «готується»", () => {
    const running = candidate({ decision: "take", draft_status: "running", item_updated_at: "2026-10-07T11:59:00Z" });
    expect(draftView(running, NOW)).toBe("pending");
    expect(hasPendingDrafts([running], NOW)).toBe(true);
    expect(draftView({ ...running, item_updated_at: "2026-10-07T11:00:00Z" }, NOW)).toBe("failed");
  });

  it("у файл іде лише готова чернетка з розділом; ручний розділ важливіший", () => {
    const ready = candidate({ decision: "take", draft_status: "ready", draft });
    expect(readyForFile(ready, NOW)).toBe(true);
    expect(readyForFile({ ...ready, draft: { ...draft, category: null } }, NOW)).toBe(false);
    expect(fileCategory({ ...ready, category_override: "Інший/Розділ" })).toBe("Інший/Розділ");
  });
});

describe("рядок моделі", () => {
  it("без ціни постачальника «Беремо» неактивне", () => {
    expect(canTake(candidate())).toBe(true);
    expect(canTake(candidate({ priced_colors: 0 }))).toBe(false);
  });

  it("ціна постачальника → наша", () => {
    expect(priceLabel(candidate())).toBe("336,40 → 333 грн");
    expect(priceLabel(candidate({ supplier_price_min: 134, supplier_price_max: 196.38 }))).toBe(
      "від 134,00 → від 132 грн"
    );
    expect(priceLabel(candidate({ supplier_price_min: null }))).toBeNull();
  });
});
