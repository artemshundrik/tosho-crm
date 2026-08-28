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

  it("розгребений накопичувач не показує нічого — нуль тут теж муляє", () => {
    const { container } = render(<ChecklistBar items={[item("p1", "done")]} papercut />);
    expect(container).toBeEmptyDOMElement();
  });

  it("порожня полиця мовчить", () => {
    const { container } = render(<ChecklistBar items={[]} papercut />);
    expect(container).toBeEmptyDOMElement();
  });

  it("але звичайна картка, де все зроблено, число показує", () => {
    // «5/5» на великій задачі — це стан роботи, а не шум: він каже, що хвоста
    // не лишилось. Правило про мовчання стосується САМЕ накопичувачів.
    render(<ChecklistBar items={[item("p1", "done")]} />);
    expect(screen.getByText("1/1")).toBeInTheDocument();
  });

  it("звичайна картка без пунктів і далі мовчить", () => {
    const { container } = render(<ChecklistBar items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
