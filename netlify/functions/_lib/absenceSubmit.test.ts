import { describe, expect, it } from "vitest";

import { absenceFactBody } from "./absenceSubmit";

/**
 * Текст, який отримує ВСЯ команда, коли відсутність уже зафіксована.
 *
 * До 25.08.2026 тут стояло «26.08 — зафіксовано без погодження» жовтим тоном,
 * і читалось воно як протокол порушення: «чому без погодження?». Насправді
 * лікарняний погодження не потребує за задумом, а команді треба знати рівно
 * одне — кого й коли не буде.
 */
const TODAY = "2026-08-25";

const sick = (start: string, end = start) => ({ start_date: start, end_date: end, kind: "sick_leave" });

describe("absenceFactBody", () => {
  it("сьогоднішній день називає словом, без дати й тире", () => {
    expect(absenceFactBody(sick(TODAY), TODAY)).toBe("Сьогодні не на місці.");
  });

  it("завтрашній — словом І датою: інакше «26.08» доводиться перекладати в голові", () => {
    expect(absenceFactBody(sick("2026-08-26"), TODAY)).toBe("Завтра, 26.08 — не на місці.");
  });

  it("дальшу дату лишає датою", () => {
    expect(absenceFactBody(sick("2026-08-28"), TODAY)).toBe("28.08 — не на місці.");
  });

  it("кілька днів — діапазоном, навіть якщо перший день сьогодні", () => {
    expect(absenceFactBody(sick(TODAY, "2026-08-28"), TODAY)).toBe("25.08 – 28.08 — не на місці.");
    expect(absenceFactBody(sick("2026-08-26", "2026-08-28"), TODAY)).toBe("26.08 – 28.08 — не на місці.");
  });

  it("межа місяця не з'їдає «завтра»", () => {
    expect(absenceFactBody(sick("2026-09-01"), "2026-08-31")).toBe("Завтра, 01.09 — не на місці.");
  });

  it("«з дому» — не відсутність: людина працює, просто не в офісі", () => {
    expect(absenceFactBody({ start_date: TODAY, end_date: TODAY, kind: "wfh" }, TODAY)).toBe(
      "Сьогодні з дому. Задачі й дзвінки — як звичайно."
    );
    expect(absenceFactBody({ start_date: "2026-08-26", end_date: "2026-08-28", kind: "wfh" }, TODAY)).toBe(
      "26.08 – 28.08 — з дому. Задачі й дзвінки — як звичайно."
    );
  });

  it("без відомого «сьогодні» (RPC не відповів) не вигадує слів — лишає дату", () => {
    expect(absenceFactBody(sick(TODAY), "")).toBe("25.08 — не на місці.");
  });

  it("жодне формулювання більше не згадує погодження", () => {
    const bodies = [
      absenceFactBody(sick(TODAY), TODAY),
      absenceFactBody(sick("2026-08-26"), TODAY),
      absenceFactBody(sick("2026-08-26", "2026-08-28"), TODAY),
    ];
    bodies.forEach((body) => expect(body).not.toContain("погодж"));
  });
});
