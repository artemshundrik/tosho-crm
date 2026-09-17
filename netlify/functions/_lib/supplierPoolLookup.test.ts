import { describe, expect, it } from "vitest";

import { buildUrlCandidates, pickPoolMatch, supplierSlugForUrl } from "./supplierPoolLookup";
import type { SupplierPoolRow } from "../../../src/lib/supplierPoolRows";

const row = (patch: Partial<SupplierPoolRow> = {}): SupplierPoolRow => ({
  id: "11111111-1111-1111-1111-111111111111",
  supplier_slug: "e-suvenir.com.ua",
  article: "16225008/1",
  name: "Записна книжка 'Туксон' А5 кольоровий зріз",
  vendor: null,
  category: null,
  price: 287.7,
  currency: "UAH",
  price_kind: "wholesale",
  url: "https://e-suvenir.com.ua/ua/zapisnaja-knizhka-tukson-a5-ivory-line-7642",
  image_url: "https://e-suvenir.com.ua/media/16225008_9.jpg",
  color: "Синій",
  size: null,
  ...patch,
});

describe("адреси-кандидати для пошуку в пулі (REQ-285#p2)", () => {
  it("віддає саму адресу першою", () => {
    const candidates = buildUrlCandidates("https://eney.com.ua/eney-florence_sing_mo256212/");

    expect(candidates[0]).toBe("https://eney.com.ua/eney-florence_sing_mo256212/");
  });

  it("пробує обидва написання кінцевого слеша", () => {
    const candidates = buildUrlCandidates("https://borsa.ua/eko-sumka");

    expect(candidates).toContain("https://borsa.ua/eko-sumka");
    expect(candidates).toContain("https://borsa.ua/eko-sumka/");
  });

  it("пробує з www і без нього — у Папірусі адреси збережено з www", () => {
    const candidates = buildUrlCandidates("https://papirus-opt.com/tovar-22001");

    expect(candidates).toContain("https://www.papirus-opt.com/tovar-22001");
  });

  it("зрізає мітки реклами, лишаючи змістовні параметри", () => {
    const candidates = buildUrlCandidates("https://shop.ua/p?id=7&utm_source=telegram&fbclid=abc");

    expect(candidates).toContain("https://shop.ua/p?id=7");
  });

  it("пробує й адресу зовсім без параметрів", () => {
    const candidates = buildUrlCandidates("https://shop.ua/p?id=7&color=red");

    expect(candidates).toContain("https://shop.ua/p");
  });

  it("відкидає якір — у пулі його немає в жодного джерела", () => {
    expect(buildUrlCandidates("https://shop.ua/p#gallery")).toContain("https://shop.ua/p");
  });

  it("http підмінює на https — у пулі всі адреси захищені", () => {
    expect(buildUrlCandidates("http://eney.com.ua/pen/")).toContain("https://eney.com.ua/pen/");
  });

  it("великі літери в домені зводить до малих, а в шляху лишає як є", () => {
    const candidates = buildUrlCandidates("https://ENEY.com.ua/lumina_51%D0%BA050s07/");

    expect(candidates).toContain("https://eney.com.ua/lumina_51%D0%BA050s07/");
  });

  it("сміття замість адреси не валить розбір", () => {
    expect(buildUrlCandidates("зовсім не адреса")).toEqual([]);
  });

  it("однакових кандидатів не повторює", () => {
    const candidates = buildUrlCandidates("https://eney.com.ua/pen/");

    expect(new Set(candidates).size).toBe(candidates.length);
  });
});

describe("постачальник за адресою (REQ-285#p2)", () => {
  it("домен і є ключем постачальника", () => {
    expect(supplierSlugForUrl("https://eney.com.ua/pen/")).toBe("eney.com.ua");
  });

  it("www до ключа не належить", () => {
    expect(supplierSlugForUrl("https://www.papirus-opt.com/x")).toBe("papirus-opt.com");
  });

  it("не адреса — немає постачальника", () => {
    expect(supplierSlugForUrl("абракадабра")).toBeNull();
  });
});

describe("вибір головного рядка з пулу (REQ-285#p2)", () => {
  it("порожній список — немає збігу", () => {
    expect(pickPoolMatch([], "url")).toBeNull();
  });

  it("бере рядок із фото, навіть якщо він не перший", () => {
    const match = pickPoolMatch([row({ id: "a", image_url: null }), row({ id: "b" })], "url");

    expect(match?.rowId).toBe("b");
    expect(match?.imageUrl).toBe("https://e-suvenir.com.ua/media/16225008_9.jpg");
  });

  it("ціна — найменша серед варіантів, бо в картці вона орієнтир", () => {
    const match = pickPoolMatch([row({ id: "a", price: 300 }), row({ id: "b", price: 287.7 })], "url");

    expect(match?.price).toBe(287.7);
  });

  it("повертає всі варіанти — з них збирається вибір кольору", () => {
    const match = pickPoolMatch(
      [row({ id: "a", color: "Синій" }), row({ id: "b", color: "Чорний" }), row({ id: "c", color: "Білий" })],
      "url"
    );

    expect(match?.rows).toHaveLength(3);
    expect(match?.rows.map((entry) => entry.color)).toEqual(["Синій", "Чорний", "Білий"]);
  });

  it("каже, яким саме ключем знайшлось", () => {
    expect(pickPoolMatch([row()], "article")?.matchedBy).toBe("article");
  });

  it("артикул один на всі варіанти — віддаємо його", () => {
    const match = pickPoolMatch([row({ id: "a", article: "ka911" }), row({ id: "b", article: "ka911" })], "url");

    expect(match?.article).toBe("ka911");
    expect(match?.ambiguousArticle).toBe(false);
  });

  it("артикули варіантів різні — не віддаємо жодного, поки колір не обрано", () => {
    const match = pickPoolMatch(
      [row({ id: "a", article: "16225008/1" }), row({ id: "b", article: "16225002/1" })],
      "url"
    );

    expect(match?.article).toBeNull();
    expect(match?.ambiguousArticle).toBe(true);
    // Назва й фото при цьому лишаються: вони спільні для всіх кольорів.
    expect(match?.name).toBe("Записна книжка 'Туксон' А5 кольоровий зріз");
    expect(match?.imageUrl).not.toBeNull();
  });

  it("рядки чужого постачальника до збігу не домішує", () => {
    const match = pickPoolMatch([row({ id: "a" }), row({ id: "b", supplier_slug: "avanprint.ua" })], "url");

    expect(match?.supplierSlug).toBe("e-suvenir.com.ua");
    expect(match?.rows).toHaveLength(1);
  });
});
