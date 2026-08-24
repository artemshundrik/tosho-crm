/**
 * РЕЄСТР КАНБАН-ДОШОК: що є колонкою, а що виведене з дошки в окремий список.
 *
 * НАВІЩО. Склад колонок описувався окремо в кожній дошці — KANBAN_COLUMNS у
 * прорахунках, DESIGN_COLUMNS у дизайні, ORDER_READINESS_COLUMNS у
 * замовленнях, BOARD_COLUMNS у запитах на доробку. Спільним був лише вигляд
 * картки, а відповідь на питання «які стани стоять стовпчиками» — ні. Тому
 * рішення «скасоване з дошки прибрати» доводилось приймати заново на кожній
 * дошці, і три з них могли розійтись мовчки.
 *
 * ЩО ПОКАЗАВ ЗАМІР (24.08.2026, прод). На дошці прорахунків скасованих 159 із
 * 285 — 56% дошки, з них 126 старші за місяць. На дизайні 71 із 569. Колонка
 * означає ЕТАП, який картка проходить і залишає; скасоване не рухається нікуди
 * і лежить у ряду з роботою, з'їдаючи ширину екрана й ламаючи відчуття обсягу:
 * очі рахують усі стовпчики разом.
 *
 * ЯК ЦЕ ВИРІШЕНО. `offBoard` — стани, які показуються ОКРЕМИМ СПИСКОМ за
 * перемикачем у тулбарі, а не шостим стовпчиком. Даних це не чіпає: жодного
 * `archived_at`, жодного крона — картка лишається в тому самому статусі, і
 * повернути її можна дією зі списку. Розглянуті й відхилені: «колонка з
 * ковзним вікном 30 днів» (дошка все одно лишається кладовищем, просто
 * молодшим) і «справжній архів у БД» (нове поле, яке хтось має вчасно
 * проставити, і крон, який колись тихо не спрацює).
 *
 * ПЕРЕЛІК ДОЗВОЛЕНИХ, А НЕ ЗАБОРОНЕНИХ. `onBoard` перелічує стани-колонки
 * повністю й у порядку зліва направо — саме так, як це зроблено для
 * OPEN_STATUSES у features/devRequests/types.ts. З відніманням («усе, крім
 * скасованого») кожен новий стан мовчки ставав би колонкою, поки хтось не
 * згадає дописати виняток. Тут навпаки: новий стан не потрапить на дошку, доки
 * його свідомо не додадуть сюди — і тест-сторож у kanbanBoards.test.ts падає,
 * якщо стан дошки не згаданий ні в `onBoard`, ні в `offBoard`.
 *
 * Підписи, іконки й тони колонок сюди НЕ переїжджають: вони різні за природою
 * (прорахунок має тон статусу, замовлення — крапку готовності) і живуть поруч
 * зі своєю дошкою. Реєстр відповідає рівно на одне питання — склад і порядок.
 */

export const KANBAN_BOARD_KEYS = ["quotes", "design", "orders", "devRequests"] as const;
export type KanbanBoardKey = (typeof KANBAN_BOARD_KEYS)[number];

type KanbanBoardPlan = {
  /** Стани-колонки, зліва направо. Порядок тут — джерело правди для дошки. */
  onBoard: readonly string[];
  /**
   * Стани поза дошкою: окремий список за перемикачем у тулбарі.
   * Порядок = порядок кнопок перемикача після «Дошки».
   */
  offBoard: readonly string[];
};

export const KANBAN_BOARDS: Record<KanbanBoardKey, KanbanBoardPlan> = {
  /** /orders/estimates — прорахунки. */
  quotes: {
    onBoard: ["new", "estimating", "estimated", "awaiting_approval", "approved"],
    offBoard: ["cancelled"],
  },
  /** /design — дизайн-задачі. */
  design: {
    onBoard: ["new", "changes", "in_progress", "pm_review", "client_review", "approved"],
    offBoard: ["cancelled"],
  },
  /**
   * /orders — готовність прорахунку стати замовленням.
   *
   * Тут `offBoard` порожній, і це не пропуск: колонки описують не статус
   * замовлення, а те, чого бракує, щоб його створити. Скасованого стану серед
   * них немає. Дошка все одно споживає реєстр — щоб наступний стан довелося
   * покласти в один із двох переліків свідомо, а не дописати стовпчик тихо.
   */
  orders: {
    onBoard: ["counterparty", "design", "ready"],
    offBoard: [],
  },
  /**
   * /dev/backlog — запити на доробку. Зразок, з якого знято решту:
   * «Ідеї» та «Не робимо» пішли зі стовпчиків у списки ще раніше.
   */
  devRequests: {
    onBoard: ["triage", "queued", "in_progress", "done_local", "released"],
    offBoard: ["someday", "wont_do"],
  },
};

export function boardColumnStatuses(board: KanbanBoardKey): readonly string[] {
  return KANBAN_BOARDS[board].onBoard;
}

export function offBoardStatuses(board: KanbanBoardKey): readonly string[] {
  return KANBAN_BOARDS[board].offBoard;
}

export function isOnBoardStatus(board: KanbanBoardKey, status: string | null | undefined): boolean {
  return !!status && KANBAN_BOARDS[board].onBoard.includes(status);
}

/**
 * Чи це стан, виведений із дошки. Саме за цим питанням сторінки вирішують,
 * показати дошку чи окремий список, — а не за порівнянням із рядком
 * «cancelled», розсипаним по коду.
 */
export function isOffBoardStatus(board: KanbanBoardKey, status: string | null | undefined): boolean {
  return !!status && KANBAN_BOARDS[board].offBoard.includes(status);
}

/**
 * Відсіює з опису колонок ті стани, які виведені з дошки.
 *
 * Порядок і підписи лишаються за дошкою — реєстр лише каже, що показувати.
 * Дошка передає власний масив колонок і спосіб дістати з нього стан, тож
 * форма запису («id», «status», що завгодно) лишається місцевою справою.
 */
export function onBoardColumns<T>(
  board: KanbanBoardKey,
  columns: readonly T[],
  statusOf: (column: T) => string
): T[] {
  const onBoard = KANBAN_BOARDS[board].onBoard;
  return columns.filter((column) => onBoard.includes(statusOf(column)));
}
