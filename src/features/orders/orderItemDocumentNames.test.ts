import { describe, expect, it } from "vitest";

import { itemDocumentName, withDocumentNames } from "./orderItemDocumentNames";

describe("назва позиції в документах", () => {
  it("друкує номенклатуру, коли її задано, інакше — назву позиції", () => {
    expect(itemDocumentName({ name: "Ніж Combo, TM Discover", documentName: "Ніж з логотипом" })).toBe("Ніж з логотипом");
    expect(itemDocumentName({ name: "Ніж Combo, TM Discover", documentName: "  " })).toBe("Ніж Combo, TM Discover");
    expect(itemDocumentName({ name: "Ніж Combo, TM Discover" })).toBe("Ніж Combo, TM Discover");
  });

  it("підставляє збережені назви лише в ті позиції, що змінились", () => {
    const record = { items: [{ id: "a", documentName: null }, { id: "b", documentName: "Старе" }] };
    const next = withDocumentNames(record, new Map([["a", "Ніж з логотипом"]]));
    expect(next.items).toEqual([
      { id: "a", documentName: "Ніж з логотипом" },
      { id: "b", documentName: "Старе" },
    ]);
  });
});
