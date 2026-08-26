import { describe, expect, it } from "vitest";

import type { ChecklistItem } from "./checklist";
import { canTakeToday, pruneToday, splitQueue, TODAY_LIMIT } from "./queueShelves";
import type { DevRequest, RequestStatus } from "./types";

function make(
  id: string,
  status: RequestStatus,
  checklist: ChecklistItem[] = []
): DevRequest {
  return { id, number: Number(id), status, checklist } as unknown as DevRequest;
}

function waiting(who = "СЕО", since = "2026-07-30"): ChecklistItem {
  return {
    id: "w",
    kind: "task",
    text: "Чекаємо відповіді",
    state: "waiting",
    group: null,
    who,
    since,
    note: null,
    answer: null,
  };
}

describe("полиці черги", () => {
  it("картка потрапляє рівно на одну полицю", () => {
    const requests = [
      make("1", "queued"),
      make("2", "triage"),
      make("3", "done_local"),
      make("4", "in_progress", [waiting()]),
    ];
    const shelves = splitQueue(requests, []);
    const total = Object.values(shelves).reduce((sum, list) => sum + list.length, 0);
    expect(total).toBe(requests.length);
  });

  it("заблоковане не лежить у «можна брати»", () => {
    // Головне правило вигляду. Картка, яка чекає на СЕО 27 днів, у списку
    // доступного щодня марно претендувала б на увагу.
    const shelves = splitQueue([make("1", "in_progress", [waiting()])], []);
    expect(shelves.free).toHaveLength(0);
    expect(shelves.blocked).toHaveLength(1);
  });

  it("нерозібране не потрапляє ні в «можна брати», ні в «стоїть за людьми»", () => {
    // Про нерозібрану картку ще нічого не вирішено — вона не може претендувати
    // ні на «беру», ні на «чекаю».
    const shelves = splitQueue([make("1", "triage", [waiting()])], []);
    expect(shelves.triage).toHaveLength(1);
    expect(shelves.blocked).toHaveLength(0);
    expect(shelves.free).toHaveLength(0);
  });

  it("«взято на сьогодні» сильніше за все інше, навіть за блокування", () => {
    const blocked = make("1", "in_progress", [waiting()]);
    const shelves = splitQueue([blocked], ["1"]);
    expect(shelves.today.map((r) => r.id)).toEqual(["1"]);
    expect(shelves.blocked).toHaveLength(0);
  });

  it("готове локально стоїть окремо — воно чекає деплою, а не рішення", () => {
    const shelves = splitQueue([make("1", "done_local")], []);
    expect(shelves.shipped).toHaveLength(1);
    expect(shelves.free).toHaveLength(0);
  });
});

describe("вибране на сьогодні", () => {
  it("на день можна взяти три справи", () => {
    expect(TODAY_LIMIT).toBe(3);
  });

  it("брати можна лише те, про що рішення вже є", () => {
    expect(canTakeToday(make("1", "queued"))).toBe(true);
    expect(canTakeToday(make("2", "in_progress"))).toBe(true);
    // Нерозібране — ще не рішення; готове локально рішень уже не потребує.
    expect(canTakeToday(make("3", "triage"))).toBe(false);
    expect(canTakeToday(make("4", "done_local"))).toBe(false);
    expect(canTakeToday(make("5", "released"))).toBe(false);
  });

  it("заблоковане взяти МОЖНА — саме сьогодні й вибиваєш ту відповідь", () => {
    expect(canTakeToday(make("1", "in_progress", [waiting()]))).toBe(true);
  });

  it("викочене й відхилене йдуть із полиці самі", () => {
    const requests = [make("1", "queued"), make("2", "released"), make("3", "wont_do")];
    expect(pruneToday(["1", "2", "3"], requests)).toEqual(["1"]);
  });

  it("картка, якої більше немає в даних, теж зникає", () => {
    expect(pruneToday(["1", "404"], [make("1", "queued")])).toEqual(["1"]);
  });

  it("порядок збережених id не переставляється — це порядок, у якому їх клали", () => {
    const requests = [make("1", "queued"), make("2", "queued"), make("3", "queued")];
    expect(pruneToday(["3", "1", "2"], requests)).toEqual(["3", "1", "2"]);
  });
});
