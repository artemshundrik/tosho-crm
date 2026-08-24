import { describe, expect, it } from "vitest";

import { manualMarker, sqlFingerprint, triageSqlFiles } from "./sqlJournal.mjs";

/**
 * Перевірка, яка зупиняє пуш, мусить сама бути перевіреною (REQ-104): помилка
 * в один бік пропускає незастосований SQL на прод, у другий — блокує кожен пуш,
 * і тоді перевірку просто вимкнуть.
 */

const журнал = (...pairs) => new Set(pairs);
const файли = (map) => (name) => (name in map ? map[name] : null);

describe("відбиток редакції", () => {
  it("та сама редакція дає той самий відбиток", () => {
    expect(sqlFingerprint("select 1;")).toBe(sqlFingerprint("select 1;"));
  });

  it("змінений на один символ файл — уже інша редакція", () => {
    expect(sqlFingerprint("select 1;")).not.toBe(sqlFingerprint("select 1; "));
  });
});

describe("позначка «не застосовувати автоматом»", () => {
  it("бачить -- manual на початку рядка", () => {
    expect(manualMarker("-- manual: тільки у вікно обслуговування\nalter table ...")).toBe("manual");
  });

  it("бачить -- rollback", () => {
    expect(manualMarker("--rollback\ndrop index ...")).toBe("rollback");
  });

  it("НЕ реагує на слово всередині пояснення", () => {
    // Інакше будь-яка згадка в коментарі мовчки вимикала б перевірку для файлу.
    expect(manualMarker("-- цей індекс раніше створювали manual, тепер автоматом\ncreate index ...")).toBeNull();
  });

  it("НЕ реагує на слово в тілі запиту", () => {
    expect(manualMarker("insert into notes (text) values ('rollback заплановано');")).toBeNull();
  });
});

describe("розкладка змінених файлів", () => {
  it("застосована редакція проходить", () => {
    const body = "create table x();";
    const result = triageSqlFiles({
      changed: ["scripts/x.sql"],
      applied: журнал(`scripts/x.sql|${sqlFingerprint(body)}`),
      readFile: файли({ "scripts/x.sql": body }),
    });

    expect(result.journaled).toEqual(["scripts/x.sql"]);
    expect(result.missing).toEqual([]);
  });

  it("правлений після застосування файл вважається незастосованим", () => {
    // Найважливіший випадок: журнал не має підтверджувати те, чого на проді немає.
    const result = triageSqlFiles({
      changed: ["scripts/x.sql"],
      applied: журнал(`scripts/x.sql|${sqlFingerprint("стара редакція")}`),
      readFile: файли({ "scripts/x.sql": "нова редакція" }),
    });

    expect(result.missing).toEqual(["scripts/x.sql"]);
  });

  it("незастосований файл зупиняє пуш", () => {
    const result = triageSqlFiles({
      changed: ["scripts/new.sql"],
      applied: журнал(),
      readFile: файли({ "scripts/new.sql": "alter table y add column z int;" }),
    });

    expect(result.missing).toEqual(["scripts/new.sql"]);
  });

  it("позначений файл пропускається, але окремою купкою", () => {
    const result = triageSqlFiles({
      changed: ["scripts/heavy.sql"],
      applied: журнал(),
      readFile: файли({ "scripts/heavy.sql": "-- manual: годину тримає таблицю\nvacuum full ...;" }),
    });

    expect(result.missing).toEqual([]);
    expect(result.marked).toEqual([{ name: "scripts/heavy.sql", kind: "manual" }]);
  });

  it("видалений файл нічого не просить", () => {
    const result = triageSqlFiles({
      changed: ["scripts/gone.sql"],
      applied: журнал(),
      readFile: файли({}),
    });

    expect(result).toEqual({ journaled: [], marked: [], missing: [] });
  });

  it("розкладає кілька файлів одночасно", () => {
    const ok = "create table ok();";
    const result = triageSqlFiles({
      changed: ["scripts/ok.sql", "scripts/new.sql", "scripts/manual.sql"],
      applied: журнал(`scripts/ok.sql|${sqlFingerprint(ok)}`),
      readFile: файли({
        "scripts/ok.sql": ok,
        "scripts/new.sql": "select 1;",
        "scripts/manual.sql": "-- rollback\ndrop table ok;",
      }),
    });

    expect(result.journaled).toEqual(["scripts/ok.sql"]);
    expect(result.missing).toEqual(["scripts/new.sql"]);
    expect(result.marked).toEqual([{ name: "scripts/manual.sql", kind: "rollback" }]);
  });
});
