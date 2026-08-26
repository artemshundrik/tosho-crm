import { describe, expect, it } from "vitest";

import {
  KANBAN_BOARDS,
  KANBAN_BOARD_KEYS,
  boardColumnStatuses,
  isOffBoardStatus,
  isOnBoardStatus,
  offBoardStatuses,
  onBoardColumns,
  type KanbanBoardKey,
} from "./kanbanBoards";
import { DESIGN_ALL_STATUSES, DESIGN_BOARD_COLUMNS } from "./designTaskStatus";
import { KANBAN_COLUMNS, STATUS_OPTIONS } from "@/features/quotes/quotes-page/config";
import { ORDER_READINESS_COLUMNS } from "@/features/orders/config";
import {
  BOARD_COLUMNS,
  OFF_BOARD_STATUSES,
  REQUEST_STATUSES,
} from "@/features/devRequests/types";

/**
 * ЦЕЙ ФАЙЛ — СТОРОЖ РІШЕННЯ, а не перевірка коду.
 *
 * Рішення: скасоване (і будь-який інший термінальний стан) із канбан-дошки
 * виводиться в окремий список за перемикачем у тулбарі. Замір на проді
 * 24.08.2026: на дошці прорахунків скасованих 159 із 285, на дизайні — 71 із
 * 569. Колонка означає етап, який картка проходить і залишає; скасоване не
 * рухається нікуди.
 *
 * До реєстру склад колонок описувався окремо в кожній дошці, тож це рішення
 * доводилось приймати заново на кожній — і три дошки могли розійтись мовчки.
 * Тести нижче падають саме тоді, коли вони починають розходитись.
 */

/** Дошки, у яких є канонічний перелік станів поза реєстром. */
const BOARDS_WITH_STATUS_ENUM: Array<{
  key: KanbanBoardKey;
  /** Усі стани дошки — джерело поза реєстром. */
  all: readonly string[];
  /** Стани, які дошка справді малює стовпчиками. */
  columns: readonly string[];
}> = [
  { key: "quotes", all: STATUS_OPTIONS, columns: KANBAN_COLUMNS.map((column) => column.id) },
  { key: "design", all: DESIGN_ALL_STATUSES, columns: DESIGN_BOARD_COLUMNS.map((column) => column.id) },
  { key: "devRequests", all: REQUEST_STATUSES, columns: BOARD_COLUMNS.map((column) => column.status) },
];

describe("реєстр канбан-дошок", () => {
  it.each(BOARDS_WITH_STATUS_ENUM)(
    "$key: колонки дошки — рівно те, що дозволив реєстр, і в тому ж порядку",
    ({ key, columns }) => {
      expect(columns).toEqual([...boardColumnStatuses(key)]);
    }
  );

  /**
   * ГОЛОВНИЙ ІНВАРІАНТ. Кожен стан дошки лежить рівно в одному з двох
   * переліків. Новий стан не «потрапляє на дошку сам собою» і не зникає
   * непоміченим — його доводиться покласти в `onBoard` або в `offBoard`
   * свідомо, інакше цей тест червоний.
   */
  it.each(BOARDS_WITH_STATUS_ENUM)("$key: жоден стан не загубився між дошкою і списком", ({ key, all }) => {
    const plan = [...boardColumnStatuses(key), ...offBoardStatuses(key)];
    expect([...plan].sort()).toEqual([...all].sort());
  });

  it.each(KANBAN_BOARD_KEYS)("%s: колонка й окремий список не перетинаються", (key) => {
    const overlap = boardColumnStatuses(key).filter((status) => offBoardStatuses(key).includes(status));
    expect(overlap).toEqual([]);
  });

  /**
   * Дошка готовності до замовлення переліку станів поза реєстром не має —
   * колонки описують не статус, а те, чого бракує. Звіряємо просто склад.
   */
  it("дошка замовлень споживає той самий реєстр", () => {
    expect(ORDER_READINESS_COLUMNS.map((column) => column.id)).toEqual([...boardColumnStatuses("orders")]);
    expect(offBoardStatuses("orders")).toEqual([]);
  });
});

describe("скасоване поза дошкою", () => {
  /**
   * Якщо ви прийшли сюди, бо тест «заважає повернути колонку», — перечитайте
   * коментар над KANBAN_BOARDS. Ковзне вікно на 30 днів і архів у базі вже
   * розглянуті й відхилені: перше лишає кладовище посеред роботи, просто
   * молодше, друге вимагає поля, яке хтось має вчасно проставити.
   */
  it.each(["quotes", "design"] as const)("%s: «Скасовано» стовпчиком не стає", (key) => {
    expect(boardColumnStatuses(key)).not.toContain("cancelled");
    expect(offBoardStatuses(key)).toEqual(["cancelled"]);
    expect(isOffBoardStatus(key, "cancelled")).toBe(true);
    expect(isOnBoardStatus(key, "cancelled")).toBe(false);
  });

  it("«Ідеї», «Не робимо» й «Викочено» лишаються поза дошкою запитів", () => {
    expect([...OFF_BOARD_STATUSES]).toEqual(["someday", "wont_do", "released"]);
    expect([...offBoardStatuses("devRequests")]).toEqual([...OFF_BOARD_STATUSES]);
  });

  it("порожній статус не читається як виведений з дошки", () => {
    expect(isOffBoardStatus("quotes", null)).toBe(false);
    expect(isOffBoardStatus("quotes", undefined)).toBe(false);
    expect(isOffBoardStatus("quotes", "")).toBe(false);
    expect(isOnBoardStatus("quotes", null)).toBe(false);
  });
});

describe("відсів колонок", () => {
  it("лишає порядок дошки й викидає виведені стани", () => {
    const columns = [
      { id: "new" },
      { id: "cancelled" },
      { id: "approved" },
    ];
    expect(onBoardColumns("quotes", columns, (column) => column.id)).toEqual([{ id: "new" }, { id: "approved" }]);
  });

  it("незнайомий стан на дошку не пробирається", () => {
    const columns = [{ id: "new" }, { id: "totally_new_status" }];
    expect(onBoardColumns("quotes", columns, (column) => column.id)).toEqual([{ id: "new" }]);
  });
});

describe("склад реєстру", () => {
  it("описані всі дошки застосунку — без пропусків і зайвого", () => {
    expect(Object.keys(KANBAN_BOARDS).sort()).toEqual([...KANBAN_BOARD_KEYS].sort());
  });
});
