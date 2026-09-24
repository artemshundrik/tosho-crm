import { describe, expect, it } from "vitest";

import {
  buildThreadNotificationRows,
  hasFreshOwnMessage,
  planThreadRecipients,
  toThreadTask,
  type ThreadQuote,
  type ThreadTask,
} from "./threadNotifications";

const MANAGER = "manager-daria";
const PM = "pm-illia";
const DESIGNER = "designer-angelina";
const HELPER = "designer-helper";
const CEO = "ceo";

const quote: ThreadQuote = { id: "q-1", number: "TS-0926-0041", assignedTo: MANAGER, createdBy: MANAGER };

const task = (over: Partial<ThreadTask> = {}): ThreadTask => ({
  id: "t-1",
  title: "Прапор з лого",
  assigneeUserId: DESIGNER,
  managerUserId: null,
  collaboratorUserIds: [],
  ...over,
});

const linkOf = (targets: ReturnType<typeof planThreadRecipients>, userId: string) => {
  const found = targets.find((target) => target.userId === userId);
  if (!found) return null;
  return found.link.kind === "quote" ? `quote:${found.link.quote.id}` : `design:${found.link.task.id}`;
};

describe("planThreadRecipients — кому дзвонити про повідомлення в обговоренні", () => {
  it("прорахунок без дизайн-задачі: менеджерка отримує коментар проджекта", () => {
    // 22.09.2026, TS-0926-0041: проджект спитав про метод нанесення, а сервер
    // шукав отримувачів лише в дизайн-задачі, якої не було, — і мовчав.
    const targets = planThreadRecipients({ authorId: PM, quote, tasks: [], participantIds: [PM] });
    expect(targets.map((t) => t.userId)).toEqual([MANAGER]);
    expect(linkOf(targets, MANAGER)).toBe("quote:q-1");
  });

  it("автор сам собі не дзвонить, навіть коли він менеджер прорахунку", () => {
    const targets = planThreadRecipients({ authorId: MANAGER, quote, tasks: [], participantIds: [PM, MANAGER] });
    expect(targets.map((t) => t.userId)).toEqual([PM]);
  });

  it("дизайнер отримує посилання на задачу, менеджер і проджект — на прорахунок", () => {
    const targets = planThreadRecipients({
      authorId: CEO,
      quote,
      tasks: [task({ collaboratorUserIds: [HELPER] })],
      participantIds: [PM],
    });
    expect(linkOf(targets, DESIGNER)).toBe("design:t-1");
    expect(linkOf(targets, HELPER)).toBe("design:t-1");
    expect(linkOf(targets, MANAGER)).toBe("quote:q-1");
    expect(linkOf(targets, PM)).toBe("quote:q-1");
  });

  it("менеджер задачі веде прорахунок — його посилання на прорахунок", () => {
    const targets = planThreadRecipients({
      authorId: DESIGNER,
      quote: { ...quote, assignedTo: null, createdBy: null },
      tasks: [task({ managerUserId: MANAGER })],
      participantIds: [],
    });
    expect(linkOf(targets, MANAGER)).toBe("quote:q-1");
  });

  it("самостійна задача без прорахунку: усім на задачу, як і було", () => {
    const targets = planThreadRecipients({
      authorId: DESIGNER,
      quote: null,
      tasks: [task({ managerUserId: MANAGER })],
      participantIds: [CEO],
    });
    expect(linkOf(targets, MANAGER)).toBe("design:t-1");
    expect(linkOf(targets, CEO)).toBe("design:t-1");
    expect(linkOf(targets, DESIGNER)).toBeNull();
  });

  it("дизайнер старшої з двох задач веде на СВОЮ задачу, а не на найновішу", () => {
    const newest = task({ id: "t-new", assigneeUserId: HELPER });
    const older = task({ id: "t-old", assigneeUserId: DESIGNER });
    const targets = planThreadRecipients({ authorId: MANAGER, quote, tasks: [newest, older], participantIds: [] });
    expect(linkOf(targets, HELPER)).toBe("design:t-new");
    expect(linkOf(targets, DESIGNER)).toBe("design:t-old");
  });

  it("одна людина в кількох ролях отримує одне сповіщення", () => {
    const targets = planThreadRecipients({
      authorId: PM,
      quote,
      tasks: [task({ managerUserId: MANAGER })],
      participantIds: [MANAGER, MANAGER, PM],
    });
    expect(targets.filter((t) => t.userId === MANAGER)).toHaveLength(1);
  });

  it("ні прорахунку, ні задачі — нікому", () => {
    expect(planThreadRecipients({ authorId: PM, quote: null, tasks: [], participantIds: [MANAGER] })).toEqual([]);
  });
});

describe("buildThreadNotificationRows — що людина побачить", () => {
  it("прорахунок: заголовок про обговорення, номер у тексті, посилання на картку", () => {
    const targets = planThreadRecipients({ authorId: PM, quote, tasks: [], participantIds: [] });
    const rows = buildThreadNotificationRows(targets, { actorLabel: "Ілля Шлямін", text: "Кількість?" });
    expect(rows.design).toEqual([]);
    expect(rows.quote).toEqual([
      {
        user_id: MANAGER,
        title: "Ілля Шлямін написав(ла) в обговоренні прорахунку",
        body: "Прорахунок #TS-0926-0041: Кількість?",
        href: "/orders/estimates/q-1",
        type: "info",
      },
    ]);
  });

  it("задача: той самий вигляд, що й до зміни, — назва задачі й посилання на неї", () => {
    const targets = planThreadRecipients({ authorId: MANAGER, quote, tasks: [task()], participantIds: [] });
    const rows = buildThreadNotificationRows(targets, { actorLabel: "Дар'я", text: "Край підшити" });
    expect(rows.design).toEqual([
      {
        user_id: DESIGNER,
        title: "Дар'я написав(ла) в чаті задачі",
        body: "Прапор з лого: Край підшити",
        href: "/design/t-1",
        type: "info",
      },
    ]);
  });

  it("довгий текст ріже до 220 символів", () => {
    const targets = planThreadRecipients({ authorId: PM, quote, tasks: [], participantIds: [] });
    const rows = buildThreadNotificationRows(targets, { actorLabel: "Ілля", text: "я".repeat(400) });
    const body = rows.quote[0].body;
    expect(body.endsWith("...")).toBe(true);
    expect(body.length).toBe("Прорахунок #TS-0926-0041: ".length + 220);
  });
});

describe("hasFreshOwnMessage — сповіщення лише про справжнє повідомлення", () => {
  const now = Date.parse("2026-09-22T10:40:00Z");
  const row = (over: Record<string, unknown> = {}) => ({
    created_by: PM,
    kind: "message",
    body: "Кількість?\n",
    created_at: "2026-09-22T10:39:51Z",
    visibility: "team",
    deleted_at: null,
    ...over,
  });

  it("щойно записане повідомлення автора — так, навіть із хвостовим переносом", () => {
    expect(hasFreshOwnMessage([row()], { authorId: PM, text: "Кількість?", now })).toBe(true);
  });

  it("текст, якого автор у нитці не писав, — ні: вхід не розсилає довільне", () => {
    expect(hasFreshOwnMessage([row()], { authorId: PM, text: "Терміново зайди", now })).toBe(false);
  });

  it("чуже повідомлення з тим самим текстом — ні", () => {
    expect(hasFreshOwnMessage([row({ created_by: MANAGER })], { authorId: PM, text: "Кількість?", now })).toBe(false);
  });

  it("старе повідомлення — ні: повторний виклик через годину нікого не будить", () => {
    expect(
      hasFreshOwnMessage([row({ created_at: "2026-09-22T09:00:00Z" })], { authorId: PM, text: "Кількість?", now })
    ).toBe(false);
  });

  it("подія, а не повідомлення, — ні", () => {
    expect(hasFreshOwnMessage([row({ kind: "event" })], { authorId: PM, text: "Кількість?", now })).toBe(false);
  });

  it("«внутрішнє» повідомлення не розсилаємо: його бачать лише з доступом до Фінансів", () => {
    expect(
      hasFreshOwnMessage([row({ visibility: "finance" })], { authorId: PM, text: "Кількість?", now })
    ).toBe(false);
  });

  it("видалене — ні", () => {
    expect(
      hasFreshOwnMessage([row({ deleted_at: "2026-09-22T10:39:55Z" })], { authorId: PM, text: "Кількість?", now })
    ).toBe(false);
  });

  it("дата з майбутнього — ні: інакше повідомлення лишалося б «свіжим» вічно", () => {
    expect(
      hasFreshOwnMessage([row({ created_at: "2026-09-23T10:00:00Z" })], { authorId: PM, text: "Кількість?", now })
    ).toBe(false);
  });
});

describe("toThreadTask", () => {
  it("бере учасників із metadata й відкидає сміття", () => {
    expect(
      toThreadTask({
        id: "t-9",
        title: "  ",
        metadata: { assignee_user_id: DESIGNER, manager_user_id: " ", collaborator_user_ids: [HELPER, 7, ""] },
      })
    ).toEqual({
      id: "t-9",
      title: "дизайн-задача",
      assigneeUserId: DESIGNER,
      managerUserId: null,
      collaboratorUserIds: [HELPER],
    });
  });
});
