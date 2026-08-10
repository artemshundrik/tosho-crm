import { describe, expect, it } from "vitest";

import { NO_VALUE_ID, groupRequests } from "./grouping";
import type { DevRequest } from "./types";

function request(overrides: Partial<DevRequest> = {}): DevRequest {
  return {
    id: "1",
    number: 3,
    label: "REQ-3",
    teamId: "t",
    title: "Кнопка не відкриває картку",
    body: "",
    kind: "friction",
    status: "triage",
    moduleKey: "design",
    priority: null,
    zone: "polish",
    releasedAt: null,
    theme: null,
    checklist: [],
    autoClassified: false,
    isPrivate: false,
    authorUserId: null,
    tgUsername: null,
    displayName: null,
    askedByCount: 1,
    createdAt: "2026-08-09T10:00:00Z",
    ...overrides,
  };
}

const labels = (groups: ReturnType<typeof groupRequests>) => groups.map((group) => group.label);

describe("groupRequests", () => {
  it("«не групувати» віддає один кошик з усім", () => {
    const groups = groupRequests([request(), request({ id: "2" })], "none");
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  /**
   * Порядок — головне в цій функції. Абетка поставила б «Нову можливість»
   * поперед «Не працює», і найгірше опинилось би внизу колонки.
   */
  it("типи йдуть від зламаного до нового, а не за абеткою", () => {
    const groups = groupRequests(
      [request({ kind: "feature" }), request({ id: "2", kind: "bug" }), request({ id: "3", kind: "friction" })],
      "kind"
    );
    expect(labels(groups)).toEqual(["Не працює", "Незручно", "Нова можливість"]);
  });

  it("термінове вгорі, попри порядок реєстру пріоритетів", () => {
    const groups = groupRequests(
      [request({ priority: "low" }), request({ id: "2", priority: "high" })],
      "priority"
    );
    expect(labels(groups)).toEqual(["Терміново", "Не горить"]);
  });

  it("картка без пріоритету — «Звичайний», а не окрема група", () => {
    const groups = groupRequests([request({ priority: null })], "priority");
    expect(labels(groups)).toEqual(["Звичайний"]);
  });

  it("теми — за кількістю, часті вище", () => {
    const groups = groupRequests(
      [
        request({ theme: "документи" }),
        request({ id: "2", theme: "модалки" }),
        request({ id: "3", theme: "модалки" }),
      ],
      "theme"
    );
    expect(labels(groups)).toEqual(["модалки", "документи"]);
  });

  it("порожніх груп не буває", () => {
    // Зон шість, картка одна — груп теж одна.
    const groups = groupRequests([request({ zone: "logic" })], "zone");
    expect(groups).toHaveLength(1);
    expect(labels(groups)).toEqual(["правила"]);
  });

  it("«без значення» завжди останнє, хай навіть його найбільше", () => {
    const groups = groupRequests(
      [
        request({ theme: null }),
        request({ id: "2", theme: null }),
        request({ id: "3", theme: null }),
        request({ id: "4", theme: "модалки" }),
      ],
      "theme"
    );
    expect(labels(groups)).toEqual(["модалки", "без теми"]);
    expect(groups[1].id).toBe(NO_VALUE_ID);
    expect(groups[1].items).toHaveLength(3);
  });

  it("підпис «без значення» називає саме ту вісь, якої бракує", () => {
    expect(labels(groupRequests([request({ zone: null })], "zone"))).toEqual(["без зони"]);
    expect(labels(groupRequests([request({ theme: null })], "theme"))).toEqual(["без теми"]);
  });

  it("жодна картка не губиться", () => {
    const requests = [
      request({ zone: "logic" }),
      request({ id: "2", zone: null }),
      request({ id: "3", zone: "polish" }),
    ];
    const total = groupRequests(requests, "zone").reduce((sum, group) => sum + group.items.length, 0);
    expect(total).toBe(requests.length);
  });

  it("ключ групи — значення, а не підпис: його можна перекласти", () => {
    const groups = groupRequests([request({ kind: "bug" })], "kind");
    expect(groups[0].id).toBe("bug");
  });
});
