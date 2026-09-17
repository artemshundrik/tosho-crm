import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QuoteItemSupplierLinks } from "./QuoteItemSupplierLinks";
import type { CatalogType } from "./catalog-utils";

/**
 * Дві кнопки картки позиції. Перевіряти це в прев'ї дорого: щоб побачити всі
 * випадки, довелось би завести чотири позиції в живому прорахунку.
 */

const catalog = (metadata: CatalogType["kinds"][number]["models"][number]["metadata"]): CatalogType[] => [
  {
    id: "t1",
    name: "Одяг",
    kinds: [
      {
        id: "k1",
        name: "Кепка",
        modelCount: 1,
        models: [{ id: "m1", name: "Кепка «POLO»", metadata }],
        methods: [],
        printPositions: [],
      },
    ],
  },
];

const renderLinks = (props: Partial<React.ComponentProps<typeof QuoteItemSupplierLinks>> = {}) =>
  render(
    <QuoteItemSupplierLinks
      metadata={null}
      catalogTypes={[]}
      typeId="t1"
      kindId="k1"
      modelId="m1"
      {...props}
    />
  );

describe("QuoteItemSupplierLinks", () => {
  it("називає джерело за адресою, а не словом «Постачальник»", () => {
    renderLinks({ metadata: { supplierUrl: "https://totobi.com.ua/kepka-polo/" } });

    expect(screen.getByRole("link", { name: /Totobi/ })).toHaveAttribute(
      "href",
      "https://totobi.com.ua/kepka-polo/"
    );
  });

  it("бере посилання з ЖИВОЇ моделі, а знімок позиції лишає запасним", () => {
    // Модель відредагували після створення позиції — кнопка має вести на нову
    // адресу, інакше правка посилання не доїжджає до наявних прорахунків.
    renderLinks({
      metadata: { supplierUrl: "https://bergamo.ua/old" },
      catalogTypes: catalog({ supplierUrl: "https://totobi.com.ua/new" }),
    });

    expect(screen.getByRole("link", { name: /Totobi/ })).toHaveAttribute(
      "href",
      "https://totobi.com.ua/new"
    );
  });

  it("показує обидва джерела злитої картки — оптовика й наш магазин", () => {
    renderLinks({
      metadata: {
        supplierUrl: "https://totobi.com.ua/termos",
        avantprintUrl: "https://avanprint.ua/termos-calypso-15l/5678/",
      },
    });

    expect(screen.getByRole("link", { name: /Totobi/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Avanprint/ })).toHaveAttribute(
      "href",
      "https://avanprint.ua/termos-calypso-15l/5678/"
    );
  });

  it("без посилання лишає роль і не робить із кнопки посилання", () => {
    renderLinks();

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /у постачальника/ })).toBeDisabled();
  });

  it("незнайомий домен підписує назвою сайту, а не адресою й не роллю", () => {
    renderLinks({ metadata: { supplierUrl: "https://www.some-new-shop.com/item/1" } });

    // Назва, а не «some-new-shop.com»: поруч із «Totobi» адреса читалась як
    // недороблений підпис (Артем, 09.09.2026). Сама адреса лишилась у href.
    const link = screen.getByRole("link", { name: /Some-new-shop/ });
    expect(link).toHaveAttribute("href", "https://www.some-new-shop.com/item/1");
  });
});

/**
 * Живий випадок 17.09.2026 (REQ-285#p13). Модель у каталозі одна на всі
 * кольори: у TS-0926-0029 стоїть блакитна книжка (1291-12, `…-uk-9`), а модель
 * несе `…-uk-10` — фіолетову, артикул 1291-16. Картка показувала блакитну, а
 * кнопка «Totobi» відкривала фіолетову.
 */
describe("QuoteItemSupplierLinks — колір позиції проти парасольки моделі", () => {
  it("артикули розійшлись — веде посилання позиції, а не моделі", () => {
    renderLinks({
      metadata: { sku: "1291-12", supplierUrl: "https://totobi.com.ua/…-uk-9/" },
      catalogTypes: catalog({ sku: "1291-16", supplierUrl: "https://totobi.com.ua/…-uk-10/" }),
    });

    expect(screen.getByRole("link", { name: /Totobi/ })).toHaveAttribute(
      "href",
      "https://totobi.com.ua/…-uk-9/"
    );
  });

  it("артикул той самий — і далі веде жива модель", () => {
    renderLinks({
      metadata: { sku: "1291-16", supplierUrl: "https://totobi.com.ua/old/" },
      catalogTypes: catalog({ sku: "1291-16", supplierUrl: "https://totobi.com.ua/new/" }),
    });

    expect(screen.getByRole("link", { name: /Totobi/ })).toHaveAttribute(
      "href",
      "https://totobi.com.ua/new/"
    );
  });
});
