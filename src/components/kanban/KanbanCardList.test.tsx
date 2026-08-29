import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

import { KanbanCardList } from "./KanbanCardList";

/**
 * Прощання картки: вона мусить лишитись на екрані рівно ТОЙ САМИЙ кадр, у
 * якому зникла з даних (REQ-159).
 *
 * ЧОМУ ЦЕ ВАРТО ТЕСТУ. Це єдине місце компонента, де стан правиться ПІД ЧАС
 * рендеру, і зламати його можна непомітно: досить перенести порівняння в
 * `useEffect` або сховати попередній список у реф — і все далі «працює», лише
 * картка на один кадр зникає й аж тоді починає прощатись. Оком такий кадр не
 * ловиться, а `tsc` про нього не знає нічого.
 *
 * Рефи тут особливо підступні: у StrictMode рендер іде двічі, другий прохід
 * побачив би вже оновлений реф і не знайшов би зниклої картки взагалі — тобто
 * в розробці анімації не було б, а в проді була б.
 *
 * ПРО ANIMATE. jsdom не вміє Web Animations API, тож `Element.animate` тут
 * заглушка. Перевіряємо не анімацію (її перевіряють очима в браузері), а те, що
 * компонент ТРИМАЄ вузол доти, доки анімації є що програвати.
 */

const rows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-kanban-row]")).map((node) => ({
    key: node.dataset.kanbanRow,
    leaving: node.dataset.leaving === "true",
  }));

type Item = { id: string };

const list = (ids: string[]) => ids.map((id) => ({ id }));

function renderList(ids: string[]) {
  return render(
    <KanbanCardList
      items={list(ids)}
      getKey={(item: Item) => item.id}
      renderItem={(item: Item) => <div data-testid={`card-${item.id}`}>{item.id}</div>}
    />
  );
}

beforeEach(() => {
  // jsdom не реалізує Element.animate — без заглушки компонент падає на першому
  // ж русі. Повертаємо мінімум, якого від нього чекає код.
  if (!("animate" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "animate", {
      writable: true,
      configurable: true,
      value: () => ({ finished: Promise.resolve(), cancel: () => {}, finish: () => {} }),
    });
  }
});

describe("KanbanCardList — прощання картки", () => {
  it("тримає зниклу картку в тому ж кадрі, у якому її не стало в даних", () => {
    const { container, rerender } = renderList(["a", "b", "c"]);
    expect(rows(container).map((row) => row.key)).toEqual(["a", "b", "c"]);

    rerender(
      <KanbanCardList
        items={list(["a", "c"])}
        getKey={(item: Item) => item.id}
        renderItem={(item: Item) => <div data-testid={`card-${item.id}`}>{item.id}</div>}
      />
    );

    // Ключова перевірка: «b» усе ще намальована, позначена як така, що йде,
    // і стоїть НА СВОЄМУ МІСЦІ — інакше колонка стулялась би не там, звідки
    // картку забрали.
    expect(rows(container)).toEqual([
      { key: "a", leaving: false },
      { key: "b", leaving: true },
      { key: "c", leaving: false },
    ]);
  });

  it("прибирає картку, коли прощання скінчилось", () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = renderList(["a", "b"]);
      rerender(
        <KanbanCardList
          items={list(["a"])}
          getKey={(item: Item) => item.id}
          renderItem={(item: Item) => <div data-testid={`card-${item.id}`}>{item.id}</div>}
        />
      );
      expect(rows(container).map((row) => row.key)).toEqual(["a", "b"]);

      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(rows(container).map((row) => row.key)).toEqual(["a"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("не прощається з картками, коли список перебудували цілком", () => {
    // Замір у браузері 26.08.2026: пошук на дошці прорахунків прибрав 44 картки
    // зі 101, і всі 44 почали одночасно анімувати `height` — властивість
    // макета. Це не «картку прибрали», а «список перебудували»: там правильна
    // поведінка миттєва, інакше дошка гальмує на кожному натисканні в пошуку.
    const { container, rerender } = renderList(["a", "b", "c", "d", "e", "f", "g"]);
    rerender(
      <KanbanCardList
        items={list(["a"])}
        getKey={(item: Item) => item.id}
        renderItem={(item: Item) => <div data-testid={`card-${item.id}`}>{item.id}</div>}
      />
    );

    expect(rows(container).map((row) => row.key)).toEqual(["a"]);
    expect(rows(container).some((row) => row.leaving)).toBe(false);
  });

  it("показує порожній стан лише після того, як остання картка договорила", () => {
    vi.useFakeTimers();
    try {
      const empty = <p data-testid="empty">Порожньо</p>;
      const render2 = (ids: string[]) =>
        rerender(
          <KanbanCardList
            items={list(ids)}
            getKey={(item: Item) => item.id}
            renderItem={(item: Item) => <div data-testid={`card-${item.id}`}>{item.id}</div>}
            emptyState={empty}
          />
        );
      const { container, queryByTestId, rerender } = render(
        <KanbanCardList
          items={list(["a"])}
          getKey={(item: Item) => item.id}
          renderItem={(item: Item) => <div data-testid={`card-${item.id}`}>{item.id}</div>}
          emptyState={empty}
        />
      );

      render2([]);
      // Поки картка прощається, «Порожньо» показувати рано — інакше напис
      // з'явиться поверх картки, яка ще на екрані.
      expect(queryByTestId("empty")).toBeNull();
      expect(rows(container).map((row) => row.leaving)).toEqual([true]);

      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(queryByTestId("empty")).not.toBeNull();
      expect(rows(container)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Перемикання дошки — це НЕ дія над карткою.
   *
   * ЗАМІРЯНО 29.08.2026 на дошці дизайну: вкладка «Всі» (125 задач) → «З
   * прорахунку» (16) давала 15 анімацій — 7 згортань висоти й 8 появ. Жодна
   * колонка при цьому не перевищила свою четвірку: перемикання міняє ВСІ
   * колонки потроху, і кожна окремо чесно вважала це дією людини.
   *
   * Тому тут навмисно кілька списків поруч: у ОДНОМУ списку цю ваду не видно —
   * вона тільки між ними.
   */
  it("не анімує перемикання дошки, хоч у кожній колонці змінилось мало", () => {
    const columns = (ids: string[][]) => (
      <>
        {ids.map((column, index) => (
          <KanbanCardList
            key={`col-${index}`}
            items={list(column)}
            getKey={(item: Item) => item.id}
            renderItem={(item: Item) => <div>{item.id}</div>}
          />
        ))}
      </>
    );

    const { container, rerender } = render(
      columns([
        ["a1", "a2", "a3"],
        ["b1", "b2", "b3"],
        ["c1", "c2", "c3"],
      ])
    );
    expect(rows(container)).toHaveLength(9);

    const animate = vi.spyOn(Element.prototype, "animate");
    try {
      // Кожна колонка втрачає по дві картки — під власною межею. Але на дошці
      // це шість, тобто перебудова, а не переїзд однієї картки.
      rerender(
        columns([
          ["a1"],
          ["b1"],
          ["c1"],
        ])
      );

      expect(rows(container).map((row) => row.key)).toEqual(["a1", "b1", "c1"]);
      expect(rows(container).some((row) => row.leaving)).toBe(false);
      expect(animate).not.toHaveBeenCalled();
    } finally {
      animate.mockRestore();
    }
  });

  /**
   * Зворотний бік тієї ж межі: полагодивши перемикання, легко вбити рух, заради
   * якого все й робилось. Перетягування чіпає дошку рівно на дві картки —
   * пішла з однієї колонки, прийшла в іншу, — і воно мусить лишитись живим.
   */
  it("лишає прощання картці, яка переїхала в сусідню колонку", () => {
    const board = (left: string[], right: string[]) => (
      <>
        <KanbanCardList
          items={list(left)}
          getKey={(item: Item) => item.id}
          renderItem={(item: Item) => <div>{item.id}</div>}
        />
        <KanbanCardList
          items={list(right)}
          getKey={(item: Item) => item.id}
          renderItem={(item: Item) => <div>{item.id}</div>}
        />
      </>
    );

    const { container, rerender } = render(board(["a", "b"], ["c"]));

    const animate = vi.spyOn(Element.prototype, "animate");
    try {
      rerender(board(["a"], ["b", "c"]));

      // «b» ще стоїть у лівій колонці й прощається — саме те, заради чого
      // хореографія існує.
      const leaving = rows(container).filter((row) => row.leaving).map((row) => row.key);
      expect(leaving).toEqual(["b"]);
      expect(animate).toHaveBeenCalled();
    } finally {
      animate.mockRestore();
    }
  });

  it("не лишає привида, якщо картка повернулась у дані", () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = renderList(["a", "b"]);
      const render2 = (ids: string[]) =>
        rerender(
          <KanbanCardList
            items={list(ids)}
            getKey={(item: Item) => item.id}
            renderItem={(item: Item) => <div data-testid={`card-${item.id}`}>{item.id}</div>}
          />
        );

      render2(["a"]);
      // Скасування: картка повернулась, поки прощання ще тривало. Без фільтра
      // за живими ключами вона малювалась би двічі — привидом і собою.
      render2(["a", "b"]);

      const keys = rows(container).map((row) => row.key);
      expect(keys).toEqual(["a", "b"]);
      expect(rows(container).some((row) => row.leaving)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
