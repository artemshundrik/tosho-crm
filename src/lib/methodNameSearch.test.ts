import { describe, expect, it } from "vitest";

import { matchesMethodQuery } from "./methodNameSearch";

/** Назви з довідника методів проду (знімок 18.09.2026, частина). */
const DIRECTORY = [
  "3D-вишивка",
  "FLEX (плівка)",
  "Вишивка",
  "ДТФ",
  "Лазерне гравіювання",
  "Сублімація 4+0",
  "Сублімація 4+4",
  "Термотрансфер (DTF)",
  "УФ-друк",
  "УФ-ДТФ",
  "Флекс",
  "Флексодрук",
  "Цифровий друк",
];

const search = (query: string) => DIRECTORY.filter((name) => matchesMethodQuery(name, query));

describe("matchesMethodQuery", () => {
  it("«DTF» латиницею знаходить «ДТФ» і «УФ-ДТФ», у будь-якому регістрі", () => {
    expect(search("DTF")).toEqual(["ДТФ", "Термотрансфер (DTF)", "УФ-ДТФ"]);
    expect(search("dtf")).toEqual(search("DTF"));
    expect(search("Dtf")).toEqual(search("DTF"));
  });

  it("«UV» знаходить «УФ»: скорочення читається як слово, а не побуквено («ув»)", () => {
    expect(search("UV")).toEqual(["УФ-друк", "УФ-ДТФ"]);
    expect(search("uv")).toEqual(["УФ-друк", "УФ-ДТФ"]);
  });

  it("кирилиця знаходить назву, записану латиницею", () => {
    expect(search("дтф")).toEqual(["ДТФ", "Термотрансфер (DTF)", "УФ-ДТФ"]);
    expect(search("флекс")).toEqual(["FLEX (плівка)", "Флекс", "Флексодрук"]);
    expect(search("flex")).toEqual(["FLEX (плівка)", "Флекс", "Флексодрук"]);
  });

  it("не зважає на регістр і розділові знаки", () => {
    expect(search("вишИВКА")).toEqual(["3D-вишивка", "Вишивка"]);
    expect(search("уф-дтф")).toEqual(["УФ-ДТФ"]);
    expect(search("уф дтф")).toEqual(["УФ-ДТФ"]);
    expect(search("УФДТФ")).toEqual(["УФ-ДТФ"]);
  });

  it("кожне слово шукається окремо, порядок байдужий", () => {
    expect(search("друк уф")).toEqual(["УФ-друк"]);
    expect(search("uv друк")).toEqual(["УФ-друк"]);
    expect(search("сублімація 0")).toEqual(["Сублімація 4+0"]);
  });

  it("латинська «i» посеред кириличного слова не заважає", () => {
    // Розкладку не перемкнули на одну літеру — типова помилка набору.
    expect(search("Сублiмацiя")).toEqual(["Сублімація 4+0", "Сублімація 4+4"]);
  });

  it("не розкладає «й» (пастка NFKD)", () => {
    expect(search("цифровий")).toEqual(["Цифровий друк"]);
    expect(search("цифрови")).toEqual(["Цифровий друк"]);
  });

  it("порожній запит підходить усім, а чужий — нікому", () => {
    expect(search("")).toEqual(DIRECTORY);
    expect(search("  -  ")).toEqual(DIRECTORY);
    expect(search("тамподрук")).toEqual([]);
  });
});
