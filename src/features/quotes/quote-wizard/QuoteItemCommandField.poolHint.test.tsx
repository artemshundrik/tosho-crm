import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuoteItemCommandField } from "./QuoteItemCommandField";

/**
 * ПОЛЕ ПОЗИЦІЇ ШУКАЄ У ДВОХ МІСЦЯХ ОДРАЗУ — у каталозі (одразу) і в пулі
 * постачальників (від трьох літер). Через це «порожньо» тут означає різні речі
 * залежно від довжини слова, і саме тому потрібен окремий рядок-пояснення:
 * інакше на двох літерах людина читає «ні в каталозі, ні в постачальників» як
 * відповідь про товари, хоч постачальників ще ніхто не питав (Артем,
 * 16.09.2026).
 *
 * Тест на компоненті, а не наскрізний: поле в живому вікні з'являється лише
 * при `kind === "merch"` і порожньому переліку моделей друку, тож наскрізний
 * сценарій перевіряв би радше умову показу вікна, ніж саму підказку.
 */
vi.mock("@/lib/supplierPool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supplierPool")>()),
  searchSupplierPool: vi.fn().mockResolvedValue([]),
}));
vi.mock("./catalogSkuSearch", () => ({ useCatalogSkuMatches: () => ({ matches: [], searching: false }) }));

import { searchSupplierPool } from "@/lib/supplierPool";

function renderField(value: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <QuoteItemCommandField
        teamId="team"
        value={value}
        onValueChange={() => {}}
        suggestions={[]}
        suggestionsLoading={false}
        hasDrafts={false}
        onPickCatalog={() => {}}
        onAddLinks={() => {}}
        onAddName={() => {}}
        onPickSupplier={() => {}}
        onInvalid={() => {}}
      />
    </QueryClientProvider>
  );
}

describe("поле позиції: поріг пошуку в постачальників", () => {
  it("на двох літерах каже, що постачальників шукають від трьох", async () => {
    renderField("фу");
    fireEvent.focus(screen.getByRole("combobox"));
    expect(await screen.findByText(/від трьох літер/)).toBeInTheDocument();
    // І не бреше, що постачальників уже питали.
    expect(screen.queryByText(/Ні в каталозі, ні в постачальників/)).not.toBeInTheDocument();
  });

  it("на двох літерах запит у пул навіть не летить", async () => {
    vi.mocked(searchSupplierPool).mockClear();
    renderField("фу");
    fireEvent.focus(screen.getByRole("combobox"));
    await screen.findByText(/від трьох літер/);
    expect(searchSupplierPool).not.toHaveBeenCalled();
  });

  it("на трьох літерах підказка зникає", async () => {
    renderField("фут");
    fireEvent.focus(screen.getByRole("combobox"));
    await waitFor(() => expect(screen.queryByText(/від трьох літер/)).not.toBeInTheDocument());
  });
});
