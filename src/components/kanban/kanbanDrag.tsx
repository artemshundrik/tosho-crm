import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { skipNextKanbanChoreography } from "./KanbanCardList";

/**
 * ПЕРЕТЯГУВАННЯ КАРТОК — НА ВКАЗІВНИКОВИХ ПОДІЯХ, А НЕ НА НАТИВНОМУ DND.
 *
 * ЧОМУ ПЕРЕПИСАНО. Нативний HTML5 drag-and-drop показує під курсором BITMAP —
 * знімок картки, зроблений у мить `dragstart`. Його не можна ні нахилити за
 * рухом, ні підняти, ні посадити пружиною: він намальований раз і назавжди, а
 * все, чим ним керуєш, — це `setDragImage` до початку руху. Тому «тактильне»
 * перетягування на ньому не робиться в принципі, і це не питання старань.
 *
 * Вказівникові події віддають повний контроль: під курсором їде ЖИВИЙ елемент,
 * сусіди розступаються трансформами, а на відпусканні картка сідає з
 * перельотом. Бонусом зникає давня морока з `dataTransfer`, без якого Firefox
 * узагалі не починав перетягування.
 *
 * ГОЛОВНЕ АРХІТЕКТУРНЕ РІШЕННЯ: РУХ ЖИВЕ В DOM, А НЕ В СТАНІ REACT.
 * Дошка прорахунків — сторінка на десять тисяч рядків, і будь-який стан у її
 * тілі перемальовує все дерево. Якби позиція курсора чи індекс вставки лежали в
 * `useState`, кожен піксель руху коштував би повного рендеру сторінки. Тому
 * трансформи ставляться елементам напряму, а в React потрапляють лише дві
 * події, яких за все перетягування буває кілька: «почали тягнути» і «змінилась
 * колонка під курсором».
 *
 * ЧОМУ СУСІДИ РОЗСУВАЮТЬСЯ ТРАНСФОРМОМ, А НЕ ЗМІНОЮ ВИСОТИ. Трансформ не чіпає
 * макет: виміряні прямокутники лишаються дійсними на весь час перетягування, і
 * рахувати індекс вставки можна за ними, а не переміряючи дерево щокадру.
 * Змінили б висоту — кожен кадр давав би повний перерахунок макета, і кожен
 * наступний замір показував би вже зсунуті координати.
 *
 * ДІРКА ОДНА, І ВОНА ПЕРЕЇЖДЖАЄ. Взята картка стає невидимою на своєму місці, а
 * картки нижче підтягуються вгору — початкова дірка стуляється. У колонці під
 * курсором картки від місця вставки й нижче з'їжджають униз — дірка
 * відкривається там. Тобто на екрані завжди рівно одне порожнє місце, і воно
 * там, куди картка справді впаде.
 */

/** Скільки треба протягнути, щоб це вважалось перетягуванням, а не кліком. */
const DRAG_THRESHOLD_PX = 5;

/** Нахил за рухом. Множник на швидкість і стеля, щоб картка не крутилась дзиґою. */
const TILT_PER_VELOCITY = 0.4;
const TILT_MAX_DEG = 5;

/** Посадка з невеликим перельотом — це і є «пружина». */
const DROP_MS = 260;
const DROP_EASING = "cubic-bezier(0.34, 1.42, 0.64, 1)";

/** Як швидко сусіди розступаються перед діркою. */
const GAP_MS = 180;
const GAP_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Смуга біля краю дошки, у якій вона починає їхати сама. */
const AUTOSCROLL_EDGE_PX = 72;
const AUTOSCROLL_MAX_STEP = 18;

type Rect = { top: number; left: number; width: number; height: number; bottom: number; right: number };

type RowMeasure = { key: string; node: HTMLElement; rect: Rect };
type ColumnMeasure = { id: string; node: HTMLElement; rect: Rect; rows: RowMeasure[] };

type DragSession = {
  id: string;
  fromColumn: string;
  /** Клон, що їде під курсором. */
  ghost: HTMLElement;
  /** Пунктирна рамка місця, куди картка сяде. */
  slot: HTMLElement;
  /** Вихідний рядок — на час перетягування невидимий. */
  sourceRow: HTMLElement;
  sourceColumn: string;
  sourceIndex: number;
  /** Наскільки посунути сусідів: висота картки плюс проміжок. */
  step: number;
  /** Сам проміжок між картками — потрібен, щоб порахувати посадку в кінець колонки. */
  gapPx: number;
  /** Зсув курсора всередині картки — щоб картка не стрибала під ним. */
  grabDx: number;
  grabDy: number;
  columns: ColumnMeasure[];
  overColumn: string | null;
  overIndex: number;
  lastX: number;
  lastY: number;
  velocityX: number;
  frame: number | null;
  autoScroll: number | null;
  board: HTMLElement | null;
};

function toRect(node: HTMLElement): Rect {
  const r = node.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export type UseKanbanDragOptions = {
  /**
   * Картку відпустили над колонкою. Викликається ПІСЛЯ того, як вона туди
   * приземлилась, — щоб перемальовка не обірвала анімацію на півдорозі.
   */
  onDrop: (id: string, columnId: string) => void;
};

export type KanbanDragApi = {
  /** Яку картку зараз тягнуть. Міняється двічі за перетягування. */
  draggingId: string | null;
  /** Над якою колонкою курсор. Міняється рідко — лише на переході між колонками. */
  overColumnId: string | null;
  /** Властивості для картки. `enabled: false` — картка не тягнеться. */
  itemProps: (id: string, enabled?: boolean) => Record<string, unknown>;
  /** Властивості для колонки: нею позначаємо приймальню. */
  columnProps: (columnId: string) => Record<string, unknown>;
};

export function useKanbanDrag({ onDrop }: UseKanbanDragOptions): KanbanDragApi {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const session = useRef<DragSession | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  /**
   * Розкласти зсуви так, щоб єдина дірка стояла в потрібному місці.
   *
   * ІНДЕКС ВСТАВКИ — У СПИСКУ БЕЗ ВЗЯТОЇ КАРТКИ, і це принципово. Перший захід
   * порівнював його з ПОЧАТКОВИМИ індексами рядків, і у власній колонці зсуви
   * гасили один одного точно в нуль: рядок отримував −step за стуляння дірки і
   * +step за її відкриття, тобто не рухався взагалі. Перевірка в браузері
   * показала це відразу — картка їхала, а сусіди стояли як укопані.
   *
   * Тому для кожного рядка спершу рахуємо, яким за рахунком він лишається після
   * того, як взяту картку прибрали (`seat`), і вже його порівнюємо з місцем
   * вставки.
   */
  const applyGap = useCallback((drag: DragSession) => {
    drag.columns.forEach((column) => {
      const isSource = column.id === drag.sourceColumn;
      const isOver = column.id === drag.overColumn;
      column.rows.forEach((row, index) => {
        if (isSource && index === drag.sourceIndex) return; // сама взята картка
        let shift = 0;
        // Вихідна колонка: усе, що нижче взятої картки, підтягується вгору —
        // місце, з якого картку забрали, стуляється.
        if (isSource && index > drag.sourceIndex) shift -= drag.step;
        // Колонка під курсором: від місця вставки й нижче все з'їжджає вниз —
        // там відкривається дірка рівно під картку.
        const seat = isSource && index > drag.sourceIndex ? index - 1 : index;
        if (isOver && seat >= drag.overIndex) shift += drag.step;
        const next = shift === 0 ? "" : `translate3d(0, ${shift}px, 0)`;
        if (row.node.style.transform !== next) row.node.style.transform = next;
      });
    });

    // Пунктирна рамка місця — ОКРЕМИМ ШАРОМ поверх дошки, а не рядком у колонці.
    // Спокуса пересувати сам вихідний рядок велика, але колонка має
    // `overflow: hidden` (.kanban-column-surface): щойно місце переїхало б у
    // сусідню колонку, рамку обрізало б власною колонкою й вона зникла б.
    const landing = findLandingRect(drag);
    drag.slot.style.transform = `translate3d(${landing.left}px, ${landing.top}px, 0)`;
  }, []);

  const clearGap = useCallback((drag: DragSession) => {
    drag.columns.forEach((column) => {
      column.rows.forEach((row) => {
        row.node.style.transform = "";
        row.node.style.transition = "";
      });
    });
  }, []);

  /** Де саме опиниться картка, якщо відпустити просто зараз. */
  const resolveTarget = useCallback((drag: DragSession, x: number, y: number) => {
    const column = drag.columns.find(
      (candidate) => x >= candidate.rect.left && x <= candidate.rect.right
    );
    if (!column) return;

    // Індекс рахуємо за ВИМІРЯНИМИ (незсунутими) прямокутниками: трансформи
    // макет не міняли, тож ці числа й далі описують спокійний стан колонки.
    let index = column.rows.length;
    for (let i = 0; i < column.rows.length; i += 1) {
      const row = column.rows[i];
      if (y < row.rect.top + row.rect.height / 2) {
        index = i;
        break;
      }
    }

    // У власній колонці місце ПІСЛЯ взятої картки означає той самий стан:
    // прибираємо її з рахунку, інакше дірка стрибала б на одну позицію.
    if (column.id === drag.sourceColumn && index > drag.sourceIndex) index -= 1;

    if (drag.overColumn === column.id && drag.overIndex === index) return;
    drag.overColumn = column.id;
    drag.overIndex = index;
    applyGap(drag);
    setOverColumnId(column.id);
  }, [applyGap]);

  const finish = useCallback(
    (commit: boolean) => {
      const drag = session.current;
      if (!drag) return;
      session.current = null;

      if (drag.frame !== null) cancelAnimationFrame(drag.frame);
      if (drag.autoScroll !== null) cancelAnimationFrame(drag.autoScroll);
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");

      // Відпускання кнопки миші стріляє `click` по картці — тобто кожне
      // перетягування закінчувалось би відкриттям сторінки. Гасимо рівно
      // ОДИН наступний клік, і то лише якщо він прилетить одразу: тримати
      // прапорець довше означало б з'їсти справжній клік користувача.
      const swallowClick = (clickEvent: MouseEvent) => {
        clickEvent.stopPropagation();
        clickEvent.preventDefault();
      };
      window.addEventListener("click", swallowClick, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallowClick, true), 250);

      const targetColumn = commit ? drag.overColumn : null;
      const landing = findLandingRect(drag);

      const done = () => {
        drag.ghost.remove();
        drag.slot.remove();
        drag.sourceRow.style.removeProperty("opacity");
        clearGap(drag);
        setDraggingId(null);
        setOverColumnId(null);
        if (targetColumn && targetColumn !== drag.fromColumn) {
          // ДРУГА АНІМАЦІЯ ТУТ ЗАЙВА. Картка щойно приїхала на місце руками
          // цього рушія; далі зміняться дані, список перемалюється — і його
          // власна хореографія (KanbanCardList) програла б від'їзд зі старої
          // колонки та приїзд у нову ПОВЕРХ уже зробленого руху. Саме це
          // виглядало як подвійне перетворення. Одну зміну пропускаємо.
          skipNextKanbanChoreography();
          onDropRef.current(drag.id, targetColumn);
        }
      };

      if (prefersReducedMotion()) {
        done();
        return;
      }

      // Пружина: картка доїжджає в дірку з невеликим перельотом. Саме тут рух
      // читається як «сіла», а не «зникла».
      const animation = drag.ghost.animate(
        [
          { transform: drag.ghost.style.transform },
          { transform: `translate3d(${landing.left}px, ${landing.top}px, 0) rotate(0deg) scale(1)` },
        ],
        { duration: DROP_MS, easing: DROP_EASING, fill: "forwards" }
      );
      // Сусіди стуляються в тому ж темпі, що й посадка.
      drag.columns.forEach((column) =>
        column.rows.forEach((row) => {
          row.node.style.transition = `transform ${DROP_MS}ms ${DROP_EASING}`;
        })
      );
      animation.finished.then(done).catch(done);
    },
    [clearGap]
  );

  const handleMove = useCallback(
    (event: PointerEvent) => {
      const drag = session.current;
      if (!drag) return;
      drag.velocityX = event.clientX - drag.lastX;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      if (drag.frame !== null) return;
      drag.frame = requestAnimationFrame(() => {
        drag.frame = null;
        const current = session.current;
        if (!current) return;
        const tilt = Math.max(
          -TILT_MAX_DEG,
          Math.min(TILT_MAX_DEG, current.velocityX * TILT_PER_VELOCITY)
        );
        current.ghost.style.transform =
          `translate3d(${current.lastX - current.grabDx}px, ${current.lastY - current.grabDy}px, 0)` +
          ` rotate(${tilt.toFixed(2)}deg) scale(1.03)`;
        resolveTarget(current, current.lastX, current.lastY);
      });
    },
    [resolveTarget]
  );

  const handleUp = useCallback(() => finish(true), [finish]);
  const handleCancel = useCallback(() => finish(false), [finish]);

  useEffect(() => {
    if (!draggingId) return;
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
  }, [draggingId, handleMove, handleUp, handleCancel]);

  // Сторінка може піти з-під ніг (маршрут, розмонтування) просто посеред руху.
  useEffect(() => () => {
    const drag = session.current;
    if (!drag) return;
    session.current = null;
    drag.ghost.remove();
    drag.slot.remove();
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
  }, []);

  const startDrag = useCallback(
    (card: HTMLElement, id: string, event: PointerEvent) => {
      const sourceRow = card.closest<HTMLElement>("[data-kanban-row]");
      const sourceColumnNode = card.closest<HTMLElement>("[data-kanban-drop]");
      if (!sourceRow || !sourceColumnNode) return;
      const sourceColumn = sourceColumnNode.dataset.kanbanDrop ?? "";

      const columns: ColumnMeasure[] = Array.from(
        document.querySelectorAll<HTMLElement>("[data-kanban-drop]")
      ).map((node) => ({
        id: node.dataset.kanbanDrop ?? "",
        node,
        rect: toRect(node),
        rows: Array.from(node.querySelectorAll<HTMLElement>("[data-kanban-row]")).map((row) => ({
          key: row.dataset.kanbanRow ?? "",
          node: row,
          rect: toRect(row),
        })),
      }));

      const column = columns.find((candidate) => candidate.id === sourceColumn);
      const sourceIndex = column ? column.rows.findIndex((row) => row.node === sourceRow) : -1;
      if (!column || sourceIndex < 0) return;

      const rect = toRect(card);
      const ghost = card.cloneNode(true) as HTMLElement;
      ghost.style.cssText = [
        "position: fixed",
        "left: 0",
        "top: 0",
        `width: ${rect.width}px`,
        "margin: 0",
        "pointer-events: none",
        "z-index: 60",
        "will-change: transform",
        // Картка в руці — НЕПРОЗОРА і без пунктиру. Пунктир лишається там, звідки
        // її взяли: то місце, а не картка. Ставимо це явно, бо клон успадковує
        // класи оригіналу, а тому за мить React домалює вигляд «мене тягнуть».
        "opacity: 1",
        "border-style: solid",
        // Тінь — тим самим токеном, що й решта спливного в застосунку
        // (меню, поповери). Своя, жорсткіша тінь виглядала чужою поруч із ними.
        "box-shadow: var(--shadow-menu)",
        `transform: translate3d(${rect.left}px, ${rect.top}px, 0) scale(1.03)`,
      ].join(";");
      ghost.removeAttribute("data-kanban-card");
      ghost.removeAttribute("data-kanban-item");
      document.body.appendChild(ghost);

      // МІСЦЕ — ЦЕ ПРИГЛУШЕНА САМА КАРТКА, а не порожня рамка з сірою заливкою.
      // Перший захід малював абстрактний прямокутник, і він програвав одразу
      // двома способами: заокруглення доводилось вгадувати змінною (а картка
      // бере його з класу), і на дошці з'являлась фігура, якої в CRM більше
      // ніде немає. Клон вирішує обидва: радіус, розміри й начинка — рівно ті
      // самі, бо це буквально та сама картка, тільки притишена.
      const slot = card.cloneNode(true) as HTMLElement;
      slot.removeAttribute("data-kanban-card");
      slot.removeAttribute("data-kanban-item");
      slot.style.cssText = [
        "position: fixed",
        "left: 0",
        "top: 0",
        `width: ${rect.width}px`,
        `height: ${rect.height}px`,
        "margin: 0",
        "pointer-events: none",
        "z-index: 55",
        "opacity: 0.4",
        "border-style: dashed",
        "box-shadow: none",
        `transition: transform ${GAP_MS}ms ${GAP_EASING}`,
        `transform: translate3d(${rect.left}px, ${rect.top}px, 0)`,
      ].join(";");
      document.body.appendChild(slot);

      // Вихідний рядок лишається на місці НЕВИДИМИМ: він і далі тримає висоту,
      // яку стуляють сусіди, а показує місце тепер рамка вище.
      sourceRow.style.opacity = "0";
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";

      const gap = column.rows.length > 1
        ? Math.max(0, column.rows[1].rect.top - column.rows[0].rect.bottom)
        : 8;

      session.current = {
        id,
        fromColumn: sourceColumn,
        ghost,
        slot,
        sourceRow,
        sourceColumn,
        sourceIndex,
        step: rect.height + gap,
        gapPx: gap,
        grabDx: event.clientX - rect.left,
        grabDy: event.clientY - rect.top,
        columns,
        overColumn: sourceColumn,
        overIndex: sourceIndex,
        lastX: event.clientX,
        lastY: event.clientY,
        velocityX: 0,
        frame: null,
        autoScroll: null,
        board: sourceColumnNode.closest<HTMLElement>("[data-kanban-board]"),
      };

      const live = session.current;
      // Плавність розсування живе тут, а не в класах: рядки їдуть на нове місце
      // переходом, а привид під курсором мусить лишатись миттєвим — інакше він
      // тягнувся б за мишею з запізненням.
      columns.forEach((measure) =>
        measure.rows.forEach((row) => {
          row.node.style.transition = `transform ${GAP_MS}ms ${GAP_EASING}`;
        })
      );
      setDraggingId(id);
      setOverColumnId(sourceColumn);
      startAutoScroll(live, () => session.current === live);
    },
    []
  );

  const itemProps = useCallback(
    (id: string, enabled = true) => {
      if (!enabled) return {};
      return {
        "data-kanban-item": id,
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
          // Тільки основна кнопка миші й перо. Палець лишається за бортом
          // свідомо: на телефоні дошка й так інша (MobileStatusBoard), а
          // перехоплення дотику зламало б прокрутку колонки.
          if (event.button !== 0 || event.pointerType === "touch") return;
          // Кнопки, меню й посилання всередині картки тягнути не мають.
          if ((event.target as HTMLElement).closest("button, a, input, textarea, [role='menuitem']")) return;

          const card = event.currentTarget;
          const startX = event.clientX;
          const startY = event.clientY;

          const begin = (moveEvent: PointerEvent) => {
            if (
              Math.abs(moveEvent.clientX - startX) < DRAG_THRESHOLD_PX &&
              Math.abs(moveEvent.clientY - startY) < DRAG_THRESHOLD_PX
            ) {
              return;
            }
            window.removeEventListener("pointermove", begin);
            window.removeEventListener("pointerup", abort);
            startDrag(card, id, moveEvent);
          };
          const abort = () => {
            window.removeEventListener("pointermove", begin);
            window.removeEventListener("pointerup", abort);
          };
          window.addEventListener("pointermove", begin);
          window.addEventListener("pointerup", abort);
        },
      };
    },
    [startDrag]
  );

  const columnProps = useCallback((columnId: string) => ({ "data-kanban-drop": columnId }), []);

  return { draggingId, overColumnId, itemProps, columnProps };
}

/**
 * Прямокутник дірки — куди картка сяде, якщо відпустити зараз.
 *
 * Рахується в тій самій системі, що й applyGap: спершу список рядків БЕЗ взятої
 * картки, і вже в ньому шукається місце вставки. Інакше посадка й дірка
 * розходились би рівно на одну картку.
 */
function findLandingRect(drag: DragSession): { left: number; top: number } {
  const column = drag.columns.find((candidate) => candidate.id === drag.overColumn);
  if (!column) {
    // Відпустили повз усі колонки — повертаємо картку туди, звідки взяли.
    const source = drag.columns.find((candidate) => candidate.id === drag.sourceColumn);
    const home = source?.rows[drag.sourceIndex]?.rect;
    return { left: home?.left ?? 0, top: home?.top ?? 0 };
  }

  const isSource = column.id === drag.sourceColumn;
  const seats = column.rows
    .map((row, index) => ({ row, index }))
    .filter((seat) => !(isSource && seat.index === drag.sourceIndex));

  /** Наскільки рядок уже поїхав угору за стуляння дірки. */
  const compaction = (index: number) => (isSource && index > drag.sourceIndex ? -drag.step : 0);

  if (seats.length === 0) {
    const header = column.node.querySelector<HTMLElement>(".kanban-column-header");
    const top = header ? toRect(header).bottom + drag.gapPx : column.rect.top + drag.gapPx;
    return { left: column.rect.left + drag.gapPx, top };
  }

  const at = Math.min(Math.max(drag.overIndex, 0), seats.length);
  if (at < seats.length) {
    const seat = seats[at];
    return { left: seat.row.rect.left, top: seat.row.rect.top + compaction(seat.index) };
  }
  const last = seats[seats.length - 1];
  return {
    left: last.row.rect.left,
    top: last.row.rect.bottom + compaction(last.index) + drag.gapPx,
  };
}

/**
 * Дошка їде сама, коли картку піднесли до краю: інакше далекі колонки недосяжні.
 *
 * `isLive` — не косметика, а сторож від вічного циклу. Кадр міг уже виконуватись
 * у мить, коли перетягування скінчилось: `finish` скасовує ЗБЕРЕЖЕНИЙ номер
 * кадру, а цей виклик після того спокійно замовляє наступний — і цикл лишається
 * крутитись до перезавантаження сторінки, смикаючи прокрутку дошки.
 */
function startAutoScroll(drag: DragSession, isLive: () => boolean) {
  const board = drag.board;
  if (!board) return;
  const step = () => {
    const current = drag;
    if (!current.board || !isLive()) return;
    const rect = toRect(current.board);
    let delta = 0;
    if (current.lastX < rect.left + AUTOSCROLL_EDGE_PX) {
      delta = -Math.round(((rect.left + AUTOSCROLL_EDGE_PX - current.lastX) / AUTOSCROLL_EDGE_PX) * AUTOSCROLL_MAX_STEP);
    } else if (current.lastX > rect.right - AUTOSCROLL_EDGE_PX) {
      delta = Math.round(((current.lastX - (rect.right - AUTOSCROLL_EDGE_PX)) / AUTOSCROLL_EDGE_PX) * AUTOSCROLL_MAX_STEP);
    }
    if (delta !== 0) {
      const before = current.board.scrollLeft;
      current.board.scrollLeft += delta;
      const moved = current.board.scrollLeft - before;
      if (moved !== 0) {
        // Прокрутка зсунула ВСІ виміряні прямокутники — інакше індекс вставки
        // рахувався б за координатами, яких на екрані вже немає.
        current.columns.forEach((column) => {
          column.rect.left -= moved;
          column.rect.right -= moved;
          column.rows.forEach((row) => {
            row.rect.left -= moved;
            row.rect.right -= moved;
          });
        });
      }
    }
    current.autoScroll = requestAnimationFrame(step);
  };
  drag.autoScroll = requestAnimationFrame(step);
}
