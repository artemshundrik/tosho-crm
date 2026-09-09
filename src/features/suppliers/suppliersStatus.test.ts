import { describe, expect, it } from "vitest";

import { supplierById } from "./suppliersCatalog";
import { isSupplierStale, supplierStatus, type SupplierPoolSummaryRow } from "./suppliersStatus";

const now = new Date("2026-09-09T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const totobi = supplierById("totobi")!;
const bergamo = supplierById("bergamo")!;
const avanprint = supplierById("avanprint")!;
const toptime = supplierById("toptime")!;

const row = (over: Partial<SupplierPoolSummaryRow> = {}): SupplierPoolSummaryRow => ({
  supplier_slug: "totobi.com.ua",
  contractor_id: null,
  rows_active: 3150,
  products: 679,
  with_price: 3074,
  with_photo: 3145,
  categories: 72,
  last_observed: hoursAgo(2),
  first_loaded: "2026-09-08T08:06:16Z",
  ...over,
});

describe("застарілість", () => {
  it("щоденне джерело старіє після 36 годин, щотижневе — після 8 днів, ручне — ніколи", () => {
    expect(isSupplierStale(totobi, hoursAgo(35), now)).toBe(false);
    expect(isSupplierStale(totobi, hoursAgo(37), now)).toBe(true);
    expect(isSupplierStale(bergamo, hoursAgo(7 * 24), now)).toBe(false);
    expect(isSupplierStale(bergamo, hoursAgo(8 * 24 + 1), now)).toBe(true);
    expect(isSupplierStale(toptime, hoursAgo(400), now)).toBe(false);
    expect(isSupplierStale(totobi, null, now)).toBe(false);
  });
});

describe("стан картки", () => {
  it("запланований — без чисел, повідомлення про те, що заважає", () => {
    const status = supplierStatus(toptime, null, now);
    expect(status.state).toBe("planned");
    expect(status.message).toBe(toptime.planned!.blocker);
    expect(status.metrics.map((m) => m.value)).toEqual([null, null, null]);
  });

  it("зведення не прочиталось — чесне «не вдалося», а не «немає даних»", () => {
    const status = supplierStatus(totobi, null, now, { unavailable: true });
    expect(status.state).toBe("unknown");
    expect(status.metrics.map((m) => m.value)).toEqual([null, null, null]);
  });

  it("немає рядків у пулі — «немає даних»", () => {
    expect(supplierStatus(totobi, null, now).state).toBe("empty");
    expect(supplierStatus(totobi, row({ rows_active: 0, products: 0 }), now).state).toBe("empty");
  });

  it("свіже й у пошуку — три числа й правило ціни з датою домовленості", () => {
    const status = supplierStatus(totobi, row(), now);
    expect(status.state).toBe("search");
    expect(status.metrics).toEqual([
      { label: "товарів", value: "679" },
      { label: "з нашою ціною", value: "98%" },
      { label: "оновлено", value: "2 години тому" },
    ]);
    expect(status.message).toContain("сувенірка −44%");
    expect(status.message).toContain("Домовлено 08.09.2026");
  });

  it("довідкова ціна — комірка «з нашою ціною» порожня, а не «0%»", () => {
    const status = supplierStatus(avanprint, row({ supplier_slug: "avanprint.ua", with_price: 0 }), now);
    expect(status.metrics[1]).toEqual({ label: "з нашою ціною", value: null });
  });

  it("застаріле б'є «у пошуку» і називає дату прогону й розклад", () => {
    const status = supplierStatus(totobi, row({ last_observed: "2026-09-07T10:00:00Z" }), now);
    expect(status.state).toBe("stale");
    expect(status.message).toContain("Останній прогін 07.09");
    expect(status.message).toContain("щодня о 06:00");
  });

  it("поза пошуком — повідомлення з реєстру", () => {
    const hidden = { ...totobi, inQuoteSearch: false, searchNote: "СЕО ще не вирішив." };
    const status = supplierStatus(hidden, row(), now);
    expect(status.state).toBe("hidden");
    expect(status.message).toBe("СЕО ще не вирішив.");
  });
});
