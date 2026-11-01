import { describe, expect, it } from "vitest";

import { quoteTypeLock } from "./quoteTypeConstraint";

const catalog = [
  { id: "cloth", quote_type: "merch" },
  { id: "agro", quote_type: "other" },
  { id: "paper", quote_type: "print" },
];

const allowed = (lock: ReturnType<typeof quoteTypeLock>) => [...lock.allowed].sort();

describe("quoteTypeLock", () => {
  it("без позицій з каталогу перемикає вільно", () => {
    expect(allowed(quoteTypeLock("merch", [], catalog))).toEqual(["merch", "other", "print"]);
    expect(allowed(quoteTypeLock("merch", [null, "unknown"], catalog))).toEqual(["merch", "other", "print"]);
  });

  it("товари не стають поліграфією, але Товар↔Інше вільно", () => {
    const lock = quoteTypeLock("merch", ["cloth", "agro"], catalog);
    expect(allowed(lock)).toEqual(["merch", "other"]);
    expect(lock.reason).toMatch(/поліграфією не позначити/);
  });

  it("поліграфія лишається поліграфією", () => {
    expect(allowed(quoteTypeLock("print", ["paper"], catalog))).toEqual(["print"]);
  });

  it("змішаний прорахунок тримає поточний вид", () => {
    expect(allowed(quoteTypeLock("other", ["paper", "cloth"], catalog))).toEqual(["other"]);
  });

  it("хибний поточний вид не зникає з меню — його можна виправити", () => {
    expect(allowed(quoteTypeLock("print", ["cloth"], catalog))).toEqual(["merch", "other", "print"]);
  });
});
