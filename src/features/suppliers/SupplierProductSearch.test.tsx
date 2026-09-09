import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupplierPoolProduct } from "@/lib/supplierPoolRows";

import { SupplierProductSearch } from "./SupplierProductSearch";

// Мокаємо лише пошук: рядок товару бере з того ж модуля формат ціни й назви
// джерел, і вони мають лишитись справжніми.
vi.mock("@/lib/supplierPool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supplierPool")>()),
  searchSupplierPool: vi.fn(),
}));

import { searchSupplierPool } from "@/lib/supplierPool";

const mockedSearch = vi.mocked(searchSupplierPool);

const product = (key: string, slug: string, name: string): SupplierPoolProduct => ({
  key,
  supplierSlug: slug,
  article: "812-01",
  name,
  vendor: "Gildan",
  category: null,
  url: `https://${slug}/${key}`,
  imageUrl: null,
  currency: "UAH",
  priceKind: "wholesale",
  priceMin: 100,
  priceMax: 100,
  variantCount: 1,
  variants: [],
  variantsAreColors: true,
  sources: [{ supplierSlug: slug, name, url: `https://${slug}/${key}` }],
  priceRowId: key,
});

function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SupplierProductSearch debounceMs={0} />
    </QueryClientProvider>
  );
}

const typeTerm = (value: string) =>
  fireEvent.change(screen.getByRole("searchbox", { name: "Пошук у товарах постачальників" }), {
    target: { value },
  });

beforeEach(() => {
  mockedSearch.mockReset();
});

describe("SupplierProductSearch", () => {
  it("порожнє поле й один символ не шукають", async () => {
    renderSearch();
    typeTerm("ф");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockedSearch).not.toHaveBeenCalled();
    expect(screen.queryByText("Шукаю…")).not.toBeInTheDocument();
  });

  it("показує картки й дає звузити чипом до одного джерела", async () => {
    mockedSearch.mockResolvedValue([
      product("t1", "totobi.com.ua", "Футболка Stage"),
      product("b1", "bergamo.ua", "Футболка Printer"),
    ]);
    renderSearch();
    typeTerm("футболка");

    await waitFor(() => expect(screen.getByText("Футболка Stage")).toBeInTheDocument());
    expect(screen.getByText("Футболка Printer")).toBeInTheDocument();
    expect(screen.getByText("2 товари")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Bergamo/ }));
    expect(screen.queryByText("Футболка Stage")).not.toBeInTheDocument();
    expect(screen.getByText("Футболка Printer")).toBeInTheDocument();
  });

  it("порожній результат і помилка з повтором", async () => {
    mockedSearch.mockResolvedValueOnce([]);
    renderSearch();
    typeTerm("ручка");
    await waitFor(() => expect(screen.getByText("У постачальників такого не знайшлось.")).toBeInTheDocument());

    mockedSearch.mockRejectedValueOnce(new Error("мережа"));
    typeTerm("ручки");
    await waitFor(() => expect(screen.getByText("Не вдалося пошукати.")).toBeInTheDocument());

    mockedSearch.mockResolvedValueOnce([product("e1", "e-suvenir.com.ua", "Ручка Parker")]);
    fireEvent.click(screen.getByRole("button", { name: "Спробувати ще" }));
    await waitFor(() => expect(screen.getByText("Ручка Parker")).toBeInTheDocument());
  });
});
