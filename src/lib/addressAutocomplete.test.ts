import { describe, expect, it } from "vitest";
import { getActiveSegment, replaceActiveSegment, startsWithSettlement } from "./addressAutocomplete";

describe("getActiveSegment", () => {
  it("без коми весь текст є активним сегментом", () => {
    expect(getActiveSegment("Київ")).toEqual({ before: "", segment: "Київ" });
  });

  it("бере текст після останньої коми", () => {
    expect(getActiveSegment("м. Київ, Хрещ")).toEqual({ before: "м. Київ,", segment: " Хрещ" });
  });

  it("порожній сегмент одразу після коми", () => {
    expect(getActiveSegment("м. Київ, ")).toEqual({ before: "м. Київ,", segment: " " });
  });
});

describe("replaceActiveSegment", () => {
  it("підставляє місто в порожнє поле", () => {
    expect(replaceActiveSegment("Киї", "м. Київ")).toBe("м. Київ, ");
  });

  it("підставляє вулицю після міста", () => {
    expect(replaceActiveSegment("м. Київ, Хрещ", "вул. Хрещатик")).toBe("м. Київ, вул. Хрещатик, ");
  });

  it("не плодить пробіли, якщо після коми вже є пробіл", () => {
    expect(replaceActiveSegment("м. Київ,  Хрещ", "вул. Хрещатик")).toBe("м. Київ, вул. Хрещатик, ");
  });
});

describe("startsWithSettlement", () => {
  it("місто на місці", () => {
    expect(startsWithSettlement("м. Київ, вул. Хрещатик, 1", "м. Київ")).toBe(true);
  });

  it("регістр не має значення", () => {
    expect(startsWithSettlement("М. КИЇВ, вул. Хрещатик", "м. Київ")).toBe(true);
  });

  it("місто стерли — вибір треба скинути", () => {
    expect(startsWithSettlement("м. Льв", "м. Київ")).toBe(false);
  });

  it("порожнє місто ніколи не збігається", () => {
    expect(startsWithSettlement("будь-що", "")).toBe(false);
  });
});
