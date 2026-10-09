import { describe, expect, it } from "vitest";

import {
  announcementDetail,
  buildSiteListingAnnouncement,
  planAnnouncements,
  siteListingAnnouncePause,
  siteListingAnnouncementHref,
  type AnnounceCandidate,
} from "./siteListingAnnounce";

/** Рядки — справжні моделі з фіду Тотобі 09.10.2026. */
const model = (patch: Partial<AnnounceCandidate> = {}): AnnounceCandidate => ({
  model_name: "Термос Uma, ТМ Discover",
  articles: ["8095-01"],
  colors: 1,
  priced_colors: 1,
  supplier_price_min: 576.14,
  supplier_price_max: 576.14,
  decision: null,
  awaited_qty: null,
  awaited_at: null,
  ...patch,
});

const awaited = (patch: Partial<AnnounceCandidate> = {}) =>
  model({
    model_name: "Повербанк Plato 20000 mAh 22.5W, ТМ TEG",
    articles: ["8110-10"],
    priced_colors: 0,
    supplier_price_min: null,
    supplier_price_max: null,
    awaited_qty: 2000,
    awaited_at: "2026-11-15",
    ...patch,
  });

describe("коли перевіряти", () => {
  it("лише перший тік години в робочий час буднього дня", () => {
    // Четвер 09.10.2026, 11:00 за Києвом = 08:00 UTC.
    expect(siteListingAnnouncePause(new Date("2026-10-09T08:00:00Z"))).toBeNull();
    expect(siteListingAnnouncePause(new Date("2026-10-09T08:04:59Z"))).toBeNull();
    expect(siteListingAnnouncePause(new Date("2026-10-09T08:05:00Z"))).toBe("not-this-tick");
  });

  it("уночі й на вихідних — тиша", () => {
    expect(siteListingAnnouncePause(new Date("2026-10-09T02:00:00Z"))).toBe("quiet-hours");
    expect(siteListingAnnouncePause(new Date("2026-10-10T08:00:00Z"))).toBe("weekend");
  });
});

describe("що сказати", () => {
  it("модель, про яку ще не казали, — нова; відома — тиша", () => {
    const plan = planAnnouncements([model(), awaited()], [{ model_name: "Термос Uma, ТМ Discover", takeable: true }]);
    expect(plan.announce).toEqual([{ kind: "new", model: awaited() }]);
    expect(plan.upserts).toEqual([
      { supplier_slug: "totobi.com.ua", model_name: awaited().model_name, articles: ["8110-10"], takeable: false },
    ]);
  });

  it("очікувана модель отримала ціну — окрема новина", () => {
    const priced = awaited({ priced_colors: 1, supplier_price_min: 1199, supplier_price_max: 1199 });
    const plan = planAnnouncements([priced], [{ model_name: priced.model_name, takeable: false }]);
    expect(plan.announce).toEqual([{ kind: "priced", model: priced }]);
    expect(plan.upserts[0]?.takeable).toBe(true);
  });

  it("втрата ціни запам'ятовується мовчки, щоб наступна поява знову була новиною", () => {
    const plan = planAnnouncements([awaited()], [{ model_name: awaited().model_name, takeable: true }]);
    expect(plan.announce).toEqual([]);
    expect(plan.upserts[0]?.takeable).toBe(false);
  });

  it("моделі з рішенням не чіпаємо: про них людина вже знає", () => {
    const plan = planAnnouncements([model({ decision: "skip" }), awaited({ decision: "take" })], []);
    expect(plan).toEqual({ announce: [], upserts: [] });
  });

  it("частина кольорів без ціни — ще не «можна брати»", () => {
    const partial = model({ colors: 3, priced_colors: 2 });
    expect(planAnnouncements([partial], [{ model_name: partial.model_name, takeable: false }]).announce).toEqual([]);
  });
});

describe("текст", () => {
  it("ціна → наша, «очікується» або «без ціни» — як у черзі", () => {
    expect(announcementDetail(model())).toBe("576,14 → 570 грн");
    expect(announcementDetail(model({ supplier_price_max: 600 }))).toBe("від 576,14 → від 570 грн");
    expect(announcementDetail(awaited())).toBe("очікується 15.11");
    expect(announcementDetail(awaited({ awaited_qty: null, awaited_at: null }))).toBe("без ціни");
  });

  it("лише нові", () => {
    const text = buildSiteListingAnnouncement([
      { kind: "new", model: awaited() },
      { kind: "new", model: model() },
    ]);
    expect(text.title).toBe("Тотобі: 2 нові моделі для сайту");
    // Ту, що можна брати вже зараз, — першою.
    expect(text.body).toBe(
      "Термос Uma, ТМ Discover — 576,14 → 570 грн; Повербанк Plato 20000 mAh 22.5W, ТМ TEG — очікується 15.11. " +
        "Беремо чи ні — у блоці «На сайт» на сторінці постачальника."
    );
  });

  it("лише з'явилась ціна", () => {
    const priced = awaited({ priced_colors: 1, supplier_price_min: 1199, supplier_price_max: 1199 });
    expect(buildSiteListingAnnouncement([{ kind: "priced", model: priced }]).title).toBe(
      "Тотобі: з'явилась ціна на 1 очікувану модель"
    );
  });

  it("обидва приводи й довгий список", () => {
    const fresh = Array.from({ length: 6 }, (_, index) => ({
      kind: "new" as const,
      model: model({ model_name: `Модель ${index + 1}` }),
    }));
    const text = buildSiteListingAnnouncement([...fresh, { kind: "priced", model: model({ model_name: "Чайник Kufi" }) }]);
    expect(text.title).toBe("Тотобі: 6 нових моделей і ціна на 1 очікувану модель");
    expect(text.body.startsWith("Чайник Kufi — 576,14 → 570 грн; Модель 1")).toBe(true);
    expect(text.body).toContain("; і ще 2.");
  });
});

describe("посилання", () => {
  const now = new Date("2026-10-09T08:00:00Z");

  it("веде на сторінку Тотобі з ключем дня, без якого не спрацює дедуплікація", () => {
    const href = siteListingAnnouncementHref([{ kind: "new", model: model() }], now);
    expect(href.startsWith("/integrations/suppliers/totobi?reminder=site-listing-new%3A2026-10-09%3A")).toBe(true);
  });

  it("той самий набір — той самий ключ, у будь-якому порядку; інший набір — інший", () => {
    const a = { kind: "new" as const, model: model() };
    const b = { kind: "new" as const, model: awaited() };
    expect(siteListingAnnouncementHref([a, b], now)).toBe(siteListingAnnouncementHref([b, a], now));
    expect(siteListingAnnouncementHref([a], now)).not.toBe(siteListingAnnouncementHref([a, b], now));
  });
});
