import { describe, expect, it } from "vitest";
import {
  addWorkingMinutes,
  canClaim,
  canClose,
  canPass,
  canReply,
  isCloseReason,
  isReplyWindowOpen,
  isWorkingTime,
  pickNextManager,
  workingMinutesBetween,
} from "./rules";

// Листопад 2026 у Києві це UTC+2. 06.11.2026 п'ятниця.
const kyiv = (text: string) => new Date(`${text}+02:00`);
// У липні Київ UTC+3.
const kyivSummer = (text: string) => new Date(`${text}+03:00`);

describe("робочий час", () => {
  it("передача о 17:55 у п'ятницю припадає на понеділок 9:25", () => {
    expect(addWorkingMinutes(kyiv("2026-11-06T17:55:00"), 30)).toEqual(kyiv("2026-11-09T09:25:00"));
  });

  it("заявка в суботу чекає понеділкових 9:30", () => {
    expect(addWorkingMinutes(kyiv("2026-11-07T12:00:00"), 30)).toEqual(kyiv("2026-11-09T09:30:00"));
  });

  it("заявка о 22:10 у середу чекає четвергових 9:30", () => {
    expect(addWorkingMinutes(kyiv("2026-11-04T22:10:00"), 30)).toEqual(kyiv("2026-11-05T09:30:00"));
  });

  it("у робочий час просто додає хвилини", () => {
    expect(addWorkingMinutes(kyiv("2026-11-05T10:42:00"), 15)).toEqual(kyiv("2026-11-05T10:57:00"));
  });

  it("рівно на межі дня не переносить на завтра", () => {
    expect(addWorkingMinutes(kyiv("2026-11-05T17:30:00"), 30)).toEqual(kyiv("2026-11-05T18:00:00"));
  });

  it("влітку 9:00 лишається 9:00 за Києвом", () => {
    expect(addWorkingMinutes(kyivSummer("2026-07-04T12:00:00"), 0)).toEqual(kyivSummer("2026-07-06T09:00:00"));
  });

  it("перехід на зимовий час у вихідні не зсуває понеділок", () => {
    // 25.10.2026 годинники перевели. Субота ще UTC+3, понеділок уже UTC+2.
    expect(addWorkingMinutes(kyivSummer("2026-10-24T12:00:00"), 10)).toEqual(kyiv("2026-10-26T09:10:00"));
  });

  it("між вечором і ранком рахує лише робочі хвилини", () => {
    expect(workingMinutesBetween(kyiv("2026-11-05T17:50:00"), kyiv("2026-11-06T09:10:00"))).toBe(20);
  });

  it("через вихідні теж", () => {
    expect(workingMinutesBetween(kyiv("2026-11-06T17:50:00"), kyiv("2026-11-09T09:10:00"))).toBe(20);
  });

  it("повністю поза робочим часом дає нуль", () => {
    expect(workingMinutesBetween(kyiv("2026-11-07T10:00:00"), kyiv("2026-11-08T10:00:00"))).toBe(0);
  });

  it("відрізняє робочий час від неробочого", () => {
    expect(isWorkingTime(kyiv("2026-11-06T09:00:00"))).toBe(true);
    expect(isWorkingTime(kyiv("2026-11-06T18:00:00"))).toBe(false);
    expect(isWorkingTime(kyiv("2026-11-07T12:00:00"))).toBe(false);
  });
});

describe("коло", () => {
  const candidates = ["a", "b", "c"];

  it("бере наступного після курсора", () => {
    expect(pickNextManager({ candidates, cursor: "a", alreadyHad: [] })).toEqual({ userId: "b", newRound: false });
  });

  it("після останнього повертається на початок", () => {
    expect(pickNextManager({ candidates, cursor: "c", alreadyHad: [] })).toEqual({ userId: "a", newRound: false });
  });

  it("пропускає тих, у кого заявка вже була", () => {
    expect(pickNextManager({ candidates, cursor: "a", alreadyHad: ["a", "b"] })).toEqual({ userId: "c", newRound: false });
  });

  it("коли заявка була в усіх, починає нове коло не з поточного", () => {
    expect(pickNextManager({ candidates, cursor: "b", alreadyHad: candidates, current: "c" })).toEqual({
      userId: "a",
      newRound: true,
    });
  });

  it("єдиний менеджер лишається собі на новому колі", () => {
    expect(pickNextManager({ candidates: ["a"], cursor: "a", alreadyHad: ["a"], current: "a" })).toEqual({
      userId: "a",
      newRound: true,
    });
  });

  it("нікого немає: чесний null", () => {
    expect(pickNextManager({ candidates: [], cursor: "a", alreadyHad: [] })).toBeNull();
  });

  it("курсор на звільненому не ламає порядок", () => {
    expect(pickNextManager({ candidates: ["a", "c"], cursor: "b", alreadyHad: [] })).toEqual({ userId: "c", newRound: false });
  });
});

describe("вікно відповіді", () => {
  const now = kyiv("2026-11-08T12:00:00");
  it("відкрите менше ніж за 7 днів", () => {
    expect(isReplyWindowOpen(kyiv("2026-11-02T12:00:00"), now)).toBe(true);
  });
  it("закрите рівно через 7 днів", () => {
    expect(isReplyWindowOpen(kyiv("2026-11-01T12:00:00"), now)).toBe(false);
  });
  it("без повідомлення клієнта закрите", () => {
    expect(isReplyWindowOpen(null, now)).toBe(false);
  });
});

describe("хто що може", () => {
  const mine = { kind: "ad", status: "new", assigned_user_id: "me" } as const;
  const other = { kind: "ad", status: "in_progress", assigned_user_id: "them" } as const;
  const manager = { userId: "me", isOwnerOrCeo: false };
  const ceo = { userId: "boss", isOwnerOrCeo: true };

  it("пише лише той, хто займається, навіть СЕО спершу забирає", () => {
    expect(canReply(manager, mine)).toBe(true);
    expect(canReply(manager, other)).toBe(false);
    expect(canReply(ceo, other)).toBe(false);
  });

  it("у розмові не з реклами пише керівник, менеджер ні", () => {
    const talk = { kind: "other", status: "new", assigned_user_id: null } as const;
    expect(canReply(ceo, talk)).toBe(true);
    expect(canReply(manager, talk)).toBe(false);
  });

  it("передати чи закрити може відповідальний і керівник, колега лише забрати", () => {
    expect(canPass(manager, other)).toBe(false);
    expect(canClose(manager, other)).toBe(false);
    expect(canPass(ceo, other)).toBe(true);
    expect(canClaim(manager, other)).toBe(true);
    expect(canClaim(manager, mine)).toBe(false);
  });

  it("причина закриття лише з трьох", () => {
    expect(isCloseReason("not_client")).toBe(true);
    expect(isCloseReason("spam")).toBe(false);
  });
});
