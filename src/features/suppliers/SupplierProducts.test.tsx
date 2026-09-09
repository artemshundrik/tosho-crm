import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupplierPoolProduct } from "@/lib/supplierPoolRows";

import { SupplierProducts } from "./SupplierProducts";
import { supplierById } from "./suppliersCatalog";

// Хуки мокаємо, решту модуля (searchTermsFor) лишаємо справжньою: тут
// перевіряється поведінка компонента, а не мережа.
vi.mock("./queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./queries")>()),
  useSupplierCategories: vi.fn(),
  useSupplierProducts: vi.fn(),
}));

import { useSupplierCategories, useSupplierProducts } from "./queries";

const mockedCategories = vi.mocked(useSupplierCategories);
const mockedProducts = vi.mocked(useSupplierProducts);
const totobi = supplierById("totobi")!;

const product = (key: string, name: string): SupplierPoolProduct => ({
  key,
  supplierSlug: "totobi.com.ua",
  article: "812-01",
  name,
  vendor: "Gildan",
  category: "Футболки",
  url: `https://totobi.com.ua/${key}`,
  imageUrl: null,
  currency: "UAH",
  priceKind: "wholesale",
  priceMin: 120,
  priceMax: 120,
  variantCount: 1,
  variants: [],
  variantsAreColors: true,
  variantsHaveSizes: false,
  sources: [{ supplierSlug: "totobi.com.ua", name, url: `https://totobi.com.ua/${key}` }],
  priceRowId: key,
});

type ProductsResult = ReturnType<typeof useSupplierProducts>;

const productsResult = (over: Partial<ProductsResult>): ProductsResult =>
  ({
    data: undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...over,
  }) as unknown as ProductsResult;

beforeEach(() => {
  mockedCategories.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useSupplierCategories>);
});

describe("SupplierProducts", () => {
  it("«Шукаю…» поки перша сторінка ще не приїхала", () => {
    mockedProducts.mockReturnValue(productsResult({ isPending: true }));
    render(<SupplierProducts definition={totobi} debounceMs={0} />);
    expect(screen.getByText("Шукаю…")).toBeInTheDocument();
  });

  it("помилка — текст і кнопка повтору, яка кличе refetch", () => {
    const refetch = vi.fn();
    mockedProducts.mockReturnValue(productsResult({ isError: true, refetch }));
    render(<SupplierProducts definition={totobi} debounceMs={0} />);
    expect(screen.getByText("Не вдалося завантажити товари.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Спробувати ще" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("порожньо — називає постачальника", () => {
    mockedProducts.mockReturnValue(
      productsResult({ data: { pages: [{ rows: [], names: 0, total: 0, products: [] }], pageParams: [0] } })
    );
    render(<SupplierProducts definition={totobi} debounceMs={0} />);
    expect(screen.getByText("У Totobi такого не знайшлось.")).toBeInTheDocument();
  });

  it("картки, лічильник і «Показати ще», яке дотягує наступну сторінку", () => {
    const fetchNextPage = vi.fn();
    mockedProducts.mockReturnValue(
      productsResult({
        data: {
          pages: [{ rows: [], names: 2, total: 55, products: [product("a", "Футболка Stage"), product("b", "Поло Star")] }],
          pageParams: [0],
        },
        hasNextPage: true,
        fetchNextPage,
      })
    );
    render(<SupplierProducts definition={totobi} debounceMs={0} />);
    expect(screen.getByText("Футболка Stage")).toBeInTheDocument();
    expect(screen.getByText("Знайдено 55 товарів")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Показати ще" }));
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it("селект розділів є лише коли джерело дає розділи", () => {
    mockedProducts.mockReturnValue(productsResult({ data: { pages: [], pageParams: [] } }));
    const { unmount } = render(<SupplierProducts definition={totobi} debounceMs={0} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    unmount();

    mockedCategories.mockReturnValue({
      data: [{ category: "Футболки", products: 120 }],
    } as unknown as ReturnType<typeof useSupplierCategories>);
    render(<SupplierProducts definition={totobi} debounceMs={0} />);
    expect(screen.getByRole("combobox", { name: "Розділ" })).toBeInTheDocument();
  });
});
