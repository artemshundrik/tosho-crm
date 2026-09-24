import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import userEvent from "@testing-library/user-event";

import { groupSupplierPoolRows, type SupplierPoolProduct, type SupplierPoolRow } from "@/lib/supplierPoolRows";

import { ImportDraftRow } from "./ImportDraftRow";
import type { QuoteImportDraftItem, QuoteImportLinkPreview } from "./types";

/**
 * Рядок уже ДОДАНОЇ позиції. Чип «Дитяча» мусить стояти саме тут, а не лише в
 * підказці над полем (Артем, 16.09.2026: «у візарді воно має бути, бо відтіля
 * вибирає менеджер»). Тост при додаванні гасне за вісім секунд, а позиція
 * лишається на екрані до «Додати позиції» — і всі ті хвилини виглядала б
 * звичайною дорослою футболкою.
 */
const draft = (over: Partial<QuoteImportDraftItem> = {}): QuoteImportDraftItem => ({
  key: "d1",
  selected: true,
  name: "Футболка Beagle JN 155",
  comment: "",
  links: [],
  runs: [{ key: "d1-0", quantity: 0 }],
  flags: [],
  sourceRows: [],
  notes: null,
  variant: null,
  catalog: null,
  sku: "6554JN-57",
  imprints: [],
  ...over,
});

const noop = () => {};

describe("ImportDraftRow — дитяча позначка", () => {
  it("носить чип, коли позиція прийшла з дитячої картки пулу", () => {
    render(<ImportDraftRow draft={draft({ isKids: true })} preview={undefined} onPatch={noop} onPatchRun={noop} />);
    expect(screen.getByText("Дитяча")).toBeInTheDocument();
  });

  it("без ознаки чипа немає — файл і посилання пулу не бачили", () => {
    render(<ImportDraftRow draft={draft()} preview={undefined} onPatch={noop} onPatchRun={noop} />);
    expect(screen.queryByText("Дитяча")).toBeNull();
  });
});

/**
 * ВИБІР КОЛЬОРУ З ПОСИЛАННЯ (REQ-285#p7). Одне посилання часто веде не на
 * товар, а на картку з кольорами: у Берітекса на адресу припадає 28,4 рядка, у
 * Топтайма 11,0, у Е-Сувеніра 2,8. Поки колір не обрано, артикул порожній —
 * у Е-Сувеніра він у кожного кольору свій, і перший-ліпший означав би
 * замовлення не того кольору.
 */
const poolProduct = (over: Partial<SupplierPoolProduct> = {}): SupplierPoolProduct =>
  groupSupplierPoolRows(
    [
      poolRow({ id: "r1", article: "16225008/1", color: "Синій" }),
      poolRow({ id: "r2", article: "16225002/1", color: "Чорний" }),
    ],
    1
  ).map((product) => ({ ...product, ...over }))[0];

function poolRow(over: Partial<SupplierPoolRow>): SupplierPoolRow {
  return {
    id: "r",
    supplier_slug: "e-suvenir.com.ua",
    article: null,
    name: "Записна книжка 'Туксон' А5",
    vendor: null,
    category: null,
    price: 287.7,
    currency: "UAH",
    price_kind: "wholesale",
    url: "https://e-suvenir.com.ua/ua/tukson",
    image_url: "https://e-suvenir.com.ua/1.jpg",
    color: null,
    size: null,
    ...over,
  };
}

const poolPreview = (needsColor: boolean): QuoteImportLinkPreview => ({
  status: "done",
  imageUrl: "https://e-suvenir.com.ua/1.jpg",
  title: "Записна книжка 'Туксон' А5",
  sku: null,
  pool: { product: poolProduct(), needsColor },
});

describe("ImportDraftRow — вибір кольору з посилання", () => {
  it("питає колір, коли артикули кольорів розійшлись", () => {
    render(
      <ImportDraftRow
        draft={draft({ sku: null })}
        preview={poolPreview(true)}
        onPatch={noop}
        onPatchRun={noop}
        onPickVariant={noop}
      />
    );
    expect(screen.getByText("Оберіть колір — його артикул поїде в замовлення")).toBeInTheDocument();
    expect(screen.getByText("16225008/1")).toBeInTheDocument();
  });

  it("клік по кольору віддає саме його варіант — з ним поїде артикул", async () => {
    const picked: string[] = [];
    render(
      <ImportDraftRow
        draft={draft({ sku: null })}
        preview={poolPreview(true)}
        onPatch={noop}
        onPatchRun={noop}
        onPickVariant={(variant) => picked.push(variant.article ?? "")}
      />
    );
    await userEvent.click(screen.getByText("16225002/1"));
    expect(picked).toEqual(["16225002/1"]);
  });

  it("щойно артикул з'явився, питання зникає — колір уже обрано", () => {
    render(
      <ImportDraftRow
        draft={draft({ sku: "16225008/1" })}
        preview={poolPreview(true)}
        onPatch={noop}
        onPatchRun={noop}
        onPickVariant={noop}
      />
    );
    expect(screen.queryByText("Оберіть колір — його артикул поїде в замовлення")).toBeNull();
  });

  it("артикул один на всі кольори — питати нема про що", () => {
    render(
      <ImportDraftRow
        draft={draft({ sku: null })}
        preview={poolPreview(false)}
        onPatch={noop}
        onPatchRun={noop}
        onPickVariant={noop}
      />
    );
    expect(screen.queryByText("Оберіть колір — його артикул поїде в замовлення")).toBeNull();
  });
});

/**
 * ВИМОГИ З ТЗ ЗГОРТКОМ (REQ-182#p29). Пункти не видно, поки менеджер не
 * розгорнув список: у щільному рядку прев'ю вони б забрали більше місця, ніж
 * сама позиція.
 */
describe("ImportDraftRow — вимоги з ТЗ", () => {
  const requirements = ["Фліс ≥ 260 г/м²", "Комір-стійка"];

  it("рахує пункти згорнутими, розгортає по кліку", async () => {
    render(<ImportDraftRow draft={draft({ requirements })} preview={undefined} onPatch={noop} onPatchRun={noop} />);
    expect(screen.getByText("Вимоги з ТЗ · 2")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Фліс ≥ 260 г/м²")).toBeNull();

    await userEvent.click(screen.getByText("Вимоги з ТЗ · 2"));
    expect(screen.getByDisplayValue("Фліс ≥ 260 г/м²")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Комір-стійка")).toBeInTheDocument();
  });

  it("правка вимоги йде через onPatch", async () => {
    const patches: Array<Partial<QuoteImportDraftItem>> = [];
    render(
      <ImportDraftRow
        draft={draft({ requirements })}
        preview={undefined}
        onPatch={(patch) => patches.push(patch)}
        onPatchRun={noop}
      />
    );
    await userEvent.click(screen.getByText("Вимоги з ТЗ · 2"));
    const field = screen.getByDisplayValue("Фліс ≥ 260 г/м²");
    fireEvent.change(field, { target: { value: "Фліс ≥ 280 г/м²" } });
    expect(patches.at(-1)).toEqual({ requirements: ["Фліс ≥ 280 г/м²", "Комір-стійка"] });
  });

  it("кнопка «Прибрати вимогу» знімає лише свій пункт", async () => {
    const patches: Array<Partial<QuoteImportDraftItem>> = [];
    render(
      <ImportDraftRow
        draft={draft({ requirements })}
        preview={undefined}
        onPatch={(patch) => patches.push(patch)}
        onPatchRun={noop}
      />
    );
    await userEvent.click(screen.getByText("Вимоги з ТЗ · 2"));
    const removeButtons = screen.getAllByLabelText("Прибрати вимогу");
    await userEvent.click(removeButtons[1]);
    expect(patches.at(-1)).toEqual({ requirements: ["Фліс ≥ 260 г/м²"] });
  });
});

/**
 * НАНЕСЕННЯ З ТЗ ПІДПИСОМ (REQ-182#p28), поки чипів ще немає: до вибору
 * товару прив'язати метод нема до чого.
 */
describe("ImportDraftRow — підпис нанесення з ТЗ", () => {
  const imprintHint = { method: "Вишивка", place: "груди ліворуч", size: null, colors: null };

  it("видно підпис, коли чипів немає", () => {
    render(
      <ImportDraftRow draft={draft({ imprintHint, imprints: [] })} preview={undefined} onPatch={noop} onPatchRun={noop} />
    );
    expect(screen.getByText("Нанесення з ТЗ: Вишивка · груди ліворуч")).toBeInTheDocument();
  });

  it("чипи вже є — підпису немає", () => {
    render(
      <ImportDraftRow
        draft={draft({ imprintHint, imprints: [{ key: "i1", methodId: "m1", positionId: null, positionLabel: null }] }) }
        preview={undefined}
        onPatch={noop}
        onPatchRun={noop}
      />
    );
    expect(screen.queryByText("Нанесення з ТЗ: Вишивка · груди ліворуч")).toBeNull();
  });
});
