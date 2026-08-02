import { describe, expect, it } from "vitest";
import {
  buildThreadBlocks,
  countUnread,
  designTaskKpi,
  quoteRefFromThreadKey,
  threadKeyForOrder,
  threadKeyForQuote,
  type ThreadEntry,
} from "./taskThread";

const entry = (over: Partial<ThreadEntry> & { id: string; createdAt: string }): ThreadEntry => ({
  kind: "message",
  body: "текст",
  createdBy: "u1",
  visibility: "team",
  source: "crm",
  eventType: null,
  isPinned: false,
  ...over,
});

const NOW = new Date("2026-08-02T12:00:00Z");

describe("ключ нитки", () => {
  it("прорахунок дає нитку quote:", () => {
    expect(threadKeyForQuote("q1")).toBe("quote:q1");
  });

  it("ручне замовлення має власну нитку", () => {
    expect(threadKeyForOrder("o1")).toBe("order:o1");
  });

  it("самостійна задача зі standalone-id не ламає ключ", () => {
    const key = threadKeyForQuote("standalone-743c0115-8086-4c57-aad8-6e7f7630e49f");
    expect(quoteRefFromThreadKey(key)).toBe("standalone-743c0115-8086-4c57-aad8-6e7f7630e49f");
  });

  it("для нитки замовлення посилання на прорахунок відсутнє", () => {
    expect(quoteRefFromThreadKey(threadKeyForOrder("o1"))).toBeNull();
  });
});

describe("розкладка стрічки", () => {
  it("два повідомлення одного автора підряд — одна група", () => {
    const blocks = buildThreadBlocks(
      [
        entry({ id: "a", createdAt: "2026-08-02T09:00:00Z" }),
        entry({ id: "b", createdAt: "2026-08-02T09:02:00Z" }),
      ],
      { userId: "u2", now: NOW }
    );
    const groups = blocks.filter((block) => block.type === "group");
    expect(groups).toHaveLength(1);
    expect(groups[0].type === "group" && groups[0].entries.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("пауза понад п'ять хвилин розриває групу", () => {
    const blocks = buildThreadBlocks(
      [
        entry({ id: "a", createdAt: "2026-08-02T09:00:00Z" }),
        entry({ id: "b", createdAt: "2026-08-02T09:30:00Z" }),
      ],
      { userId: "u2", now: NOW }
    );
    expect(blocks.filter((block) => block.type === "group")).toHaveLength(2);
  });

  it("подія розриває групу і стає службовим рядком", () => {
    const blocks = buildThreadBlocks(
      [
        entry({ id: "a", createdAt: "2026-08-02T09:00:00Z" }),
        entry({ id: "e", createdAt: "2026-08-02T09:01:00Z", kind: "event", eventType: "design_task_status" }),
        entry({ id: "b", createdAt: "2026-08-02T09:02:00Z" }),
      ],
      { userId: "u2", now: NOW }
    );
    expect(blocks.map((block) => block.type)).toEqual(["day", "group", "service", "group"]);
  });

  it("свої повідомлення позначені own", () => {
    const blocks = buildThreadBlocks([entry({ id: "a", createdAt: "2026-08-02T09:00:00Z" })], {
      userId: "u1",
      now: NOW,
    });
    const group = blocks.find((block) => block.type === "group");
    expect(group?.type === "group" && group.own).toBe(true);
  });

  it("без авторизації нічого не вважається своїм", () => {
    const blocks = buildThreadBlocks([entry({ id: "a", createdAt: "2026-08-02T09:00:00Z", createdBy: null })], {
      userId: null,
      now: NOW,
    });
    const group = blocks.find((block) => block.type === "group");
    expect(group?.type === "group" && group.own).toBe(false);
  });

  it("різні дні розділені пігулками з лічильником", () => {
    const blocks = buildThreadBlocks(
      [
        entry({ id: "a", createdAt: "2026-08-01T09:00:00Z" }),
        entry({ id: "b", createdAt: "2026-08-02T09:00:00Z" }),
        entry({ id: "c", createdAt: "2026-08-02T09:01:00Z" }),
      ],
      { userId: "u2", now: NOW }
    );
    const days = blocks.filter((block) => block.type === "day");
    expect(days).toHaveLength(2);
    expect(days[1].type === "day" && days[1].count).toBe(2);
  });

  it("порядок не залежить від того, як прийшли дані", () => {
    const blocks = buildThreadBlocks(
      [
        entry({ id: "b", createdAt: "2026-08-02T09:02:00Z" }),
        entry({ id: "a", createdAt: "2026-08-02T09:00:00Z" }),
      ],
      { userId: "u2", now: NOW }
    );
    const group = blocks.find((block) => block.type === "group");
    expect(group?.type === "group" && group.entries.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("внутрішня нотатка не зливається зі звичайною в одну групу", () => {
    const blocks = buildThreadBlocks(
      [
        entry({ id: "a", createdAt: "2026-08-02T09:00:00Z" }),
        entry({ id: "b", createdAt: "2026-08-02T09:01:00Z", visibility: "finance" }),
      ],
      { userId: "u2", now: NOW }
    );
    expect(blocks.filter((block) => block.type === "group")).toHaveLength(2);
  });
});

describe("лічильник непрочитаного", () => {
  const entries = [
    entry({ id: "a", createdAt: "2026-08-02T09:00:00Z", createdBy: "u2" }),
    entry({ id: "b", createdAt: "2026-08-02T10:00:00Z", createdBy: "u1" }),
    entry({ id: "c", createdAt: "2026-08-02T11:00:00Z", createdBy: "u2" }),
  ];

  it("рахує лише чужі повідомлення після позначки", () => {
    expect(countUnread(entries, "2026-08-02T09:30:00Z", "u1")).toBe(1);
  });

  it("без позначки все чуже вважається непрочитаним", () => {
    expect(countUnread(entries, null, "u1")).toBe(2);
  });

  it("події не потрапляють у лічильник", () => {
    const withEvent = [
      ...entries,
      entry({ id: "e", createdAt: "2026-08-02T11:30:00Z", createdBy: "u2", kind: "event" }),
    ];
    expect(countUnread(withEvent, "2026-08-02T09:30:00Z", "u1")).toBe(1);
  });
});

describe("показники дизайн-задачі", () => {
  it("правки в межах норми — нейтральний тон без підказки", () => {
    const [revisions] = designTaskKpi(
      { revisions: 2, revisionNorm: 3, previousRevisions: 1, assignedAt: null, deadline: null },
      NOW
    );
    expect(revisions.tone).toBe("flat");
    expect(revisions.hint).toBeUndefined();
  });

  it("перевищення норми позначається як погане з різницею", () => {
    const [revisions] = designTaskKpi(
      { revisions: 5, revisionNorm: 3, previousRevisions: null, assignedAt: null, deadline: null },
      NOW
    );
    expect(revisions.tone).toBe("bad");
    expect(revisions.hint).toBe("+2");
  });

  it("прострочений дедлайн дає від'ємні дні й позначку", () => {
    const cells = designTaskKpi(
      {
        revisions: 1,
        revisionNorm: 3,
        previousRevisions: null,
        assignedAt: "2026-07-22T09:00:00Z",
        deadline: "2026-07-31T09:00:00Z",
      },
      NOW
    );
    expect(cells[1].value).toBe("11");
    expect(cells[2].value).toBe("-2");
    expect(cells[2].hint).toBe("прострочено");
  });

  it("без дат показує прочерки, а не нулі", () => {
    const cells = designTaskKpi(
      { revisions: 0, revisionNorm: 3, previousRevisions: null, assignedAt: null, deadline: null },
      NOW
    );
    expect(cells[1].value).toBe("—");
    expect(cells[2].value).toBe("—");
  });
});
