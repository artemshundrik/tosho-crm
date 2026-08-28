import { describe, expect, it } from "vitest";

import { formatLastSeenAgo, formatLastSeenExact } from "./lastSeen";

// Фіксований «зараз», щоб тести не залежали від моменту запуску.
const NOW = new Date("2026-08-07T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatLastSeenAgo — дві суміжні одиниці", () => {
  it("порожнє і биті значення — «не заходив»", () => {
    expect(formatLastSeenAgo(null, NOW)).toBe("візитів не було");
    expect(formatLastSeenAgo(undefined, NOW)).toBe("візитів не було");
    expect(formatLastSeenAgo("не-дата", NOW)).toBe("візитів не було");
  });

  it("до хвилини — «щойно», далі хвилини без секунд", () => {
    expect(formatLastSeenAgo(ago(20_000), NOW)).toBe("щойно");
    expect(formatLastSeenAgo(ago(54 * MIN), NOW)).toBe("54 хв тому");
    expect(formatLastSeenAgo(ago(12 * MIN), NOW)).toBe("12 хв тому");
  });

  it("години йдуть із хвилинами, поки хвилини щось означають", () => {
    expect(formatLastSeenAgo(ago(HOUR + 12 * MIN), NOW)).toBe("1 год 12 хв тому");
    expect(formatLastSeenAgo(ago(5 * HOUR), NOW)).toBe("5 год тому");
    expect(formatLastSeenAgo(ago(5 * HOUR + 59 * MIN), NOW)).toBe("5 год 59 хв тому");
  });

  it("від шести годин хвилини зникають — вони не міняють жодного рішення", () => {
    // «21 год 21 хв тому» — 17 символів заради точності, якою ніхто не
    // користується. На картці людини це займало пів рядка.
    expect(formatLastSeenAgo(ago(21 * HOUR + 21 * MIN), NOW)).toBe("21 год тому");
    expect(formatLastSeenAgo(ago(6 * HOUR + 30 * MIN), NOW)).toBe("6 год тому");
    expect(formatLastSeenAgo(ago(15 * HOUR + 56 * MIN), NOW)).toBe("15 год тому");
  });

  it("дні йдуть із годинами, хвилини вже не мають сенсу", () => {
    // Дні лишаються словом (просив CEO), години поруч — скорочено.
    expect(formatLastSeenAgo(ago(3 * DAY + 4 * HOUR + 54 * MIN), NOW)).toBe("3 дні 4 год тому");
    expect(formatLastSeenAgo(ago(2 * DAY), NOW)).toBe("2 дні тому");
    expect(formatLastSeenAgo(ago(21 * DAY), NOW)).toBe("21 день тому");
  });

  it("рівно на межах не з'являється «0 хв» і «0 год»", () => {
    expect(formatLastSeenAgo(ago(HOUR), NOW)).toBe("1 год тому");
    expect(formatLastSeenAgo(ago(DAY), NOW)).toBe("1 день тому");
  });

  it("понад 30 днів — конкретна дата замість «43 дн тому»", () => {
    expect(formatLastSeenAgo(ago(43 * DAY), NOW)).toBe("25.06.2026");
  });

  it("майбутній час (розсинхрон годинників) не дає від'ємних значень", () => {
    expect(formatLastSeenAgo(ago(-5 * MIN), NOW)).toBe("щойно");
  });

  it("годинник, що спішить на години, не дає вічного «щойно» — тільки дату", () => {
    // REQ-184: позначку пише клієнт своїм годинником. При збої на добу підпис
    // казав «щойно» цілу добу відсутності — рівно те саме джерело, що й вічний
    // «онлайн» у крапці присутності.
    expect(formatLastSeenAgo(ago(-3 * HOUR), NOW)).toBe("07.08.2026");
    expect(formatLastSeenAgo(ago(-DAY), NOW)).toBe("08.08.2026");
  });
});

describe("formatLastSeenExact", () => {
  it("дає точний момент за Києвом для тултипа", () => {
    // 12:00 UTC влітку = 15:00 у Києві.
    expect(formatLastSeenExact(NOW.toISOString())).toBe("пт, 07.08, 15:00");
  });

  it("порожнє — порожній рядок, а не «Invalid Date»", () => {
    expect(formatLastSeenExact(null)).toBe("");
  });
});
