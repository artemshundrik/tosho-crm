import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChecklistBar } from "./ChecklistBar";
import type { ChecklistItem } from "./checklist";

const item = (id: string, state: ChecklistItem["state"]): ChecklistItem => ({
  id,
  kind: "task",
  text: `пункт ${id}`,
  state,
  group: null,
  who: null,
  since: null,
  answer: null,
  note: null,
  closed: null,
  sha: null,
});

/**
 * Дошка й «Черга» рахували ту саму картку по-різному: «1/1» проти «0». Обидва
 * числа були праві — одне про зроблене, друге про залишок, — і поруч читались
 * як суперечність. Ці тести тримають накопичувач на мові залишку.
 */
describe("смуга пунктів", () => {
  it("звичайна картка каже, скільки зроблено", () => {
    render(<ChecklistBar items={[item("p1", "done"), item("p2", "todo")]} />);
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("накопичувач каже, скільки лишилось розгребти", () => {
    render(<ChecklistBar items={[item("p1", "done"), item("p2", "todo")]} papercut />);
    expect(screen.getByText("лишилось 1")).toBeInTheDocument();
  });

  it("розгребений накопичувач показує нуль — те саме, що в «Черзі»", () => {
    render(<ChecklistBar items={[item("p1", "done")]} papercut />);
    expect(screen.getByText("лишилось 0")).toBeInTheDocument();
  });

  it("порожня полиця так і каже, а не мовчить", () => {
    // Доти накопичувач без дрібниць рендерив null і на дошці виглядав як
    // недороблена задача без прогресу.
    render(<ChecklistBar items={[]} papercut />);
    expect(screen.getByText("полиця порожня")).toBeInTheDocument();
  });

  it("звичайна картка без пунктів і далі мовчить", () => {
    const { container } = render(<ChecklistBar items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
