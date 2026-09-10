import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { groupSupplierPoolRows, type SupplierPoolRow as PoolRow } from "@/lib/supplierPoolRows";

import { SupplierPoolRow } from "./SupplierPoolRow";

/**
 * Картка склеєного товару — єдине місце, де рішення про ціну стає числом на
 * екрані. Правило «беремо дешевшу» живе в `groupSupplierPoolRows` і вкрите
 * там тестом, але саме тут видно, ЩО побачить менеджер: одну цифру й обидва
 * сайти. Тому тут не мок картки, а справжній згортач на справжніх рядках.
 *
 * Живий випадок 10.09.2026: вісім артикулів Fruit of the Loom є і в Trele, і в
 * Е-Сувеніра, причому Е-Сувенір дешевший на 40%.
 */
const row = (over: Partial<PoolRow>): PoolRow => ({
  id: "id-1",
  supplier_slug: "trele.com.ua",
  article: null,
  name: "Товар",
  vendor: null,
  category: null,
  price: null,
  currency: "UAH",
  price_kind: "wholesale",
  url: null,
  image_url: null,
  color: null,
  size: null,
  ...over,
});

describe("SupplierPoolRow", () => {
  it("на склеєній картці стоїть дешевша ціна, а посилання ведуть на обидва сайти", () => {
    const [product] = groupSupplierPoolRows(
      [
        row({
          id: "t1",
          supplier_slug: "trele.com.ua",
          name: "Футболка Valueweight",
          article: "061036040S",
          price: 161.7,
          color: "Білий",
          size: "S",
          url: "https://trele.com.ua/valueweight/",
        }),
        row({
          id: "e1",
          supplier_slug: "e-suvenir.com.ua",
          name: "Футболка 'Valueweight T'",
          article: "061036040S",
          price: 97.17,
          color: "Білий",
          url: "https://e-suvenir.com.ua/ua/valueweight",
        }),
      ],
      40
    );

    render(<SupplierPoolRow product={product} />);

    expect(screen.getByText("97,17 грн")).toBeInTheDocument();
    expect(screen.queryByText("161,70 грн")).not.toBeInTheDocument();
    // Підпис під числом лишається чесним: ціна наша, а не роздрібна.
    expect(screen.getByText("наша")).toBeInTheDocument();

    // Обидва сайти на місці, кожен веде на свій.
    expect(screen.getByRole("link", { name: "Trele" })).toHaveAttribute(
      "href",
      "https://trele.com.ua/valueweight/"
    );
    expect(screen.getByRole("link", { name: "E-Suvenir" })).toHaveAttribute(
      "href",
      "https://e-suvenir.com.ua/ua/valueweight"
    );
  });
});
