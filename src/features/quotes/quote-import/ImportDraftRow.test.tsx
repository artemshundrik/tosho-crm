import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ImportDraftRow } from "./ImportDraftRow";
import type { QuoteImportDraftItem } from "./types";

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
