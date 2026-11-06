import { describe, expect, it } from "vitest";

import {
  composerBlockedReason,
  eventText,
  firstResponseText,
  leadPrefill,
  managerLoad,
  matchesTab,
  previousAssignee,
  requestBanner,
  requestStatus,
  requestTag,
  safeAttachments,
  teamStats,
  type BannerContext,
} from "./presentation";
import type { EventRow, RequestRow } from "./queries";

const kyiv = (text: string) => new Date(`${text}+02:00`);
const hours = { startHour: 9, endHour: 18 };
const now = kyiv("2026-11-05T10:20:00");

const request = (patch: Partial<RequestRow> = {}): RequestRow => ({
  id: "r",
  team_id: "t",
  handle: "olha",
  display_name: null,
  avatar_url: null,
  kind: "ad",
  status: "new",
  assigned_user_id: "me",
  assigned_at: kyiv("2026-11-05T10:00:00").toISOString(),
  handover_due_at: kyiv("2026-11-05T10:30:00").toISOString(),
  reminder_due_at: null,
  round: 1,
  is_overdue: false,
  first_response_at: null,
  first_response_minutes: null,
  first_response_by: null,
  close_reason: null,
  closed_at: null,
  lead_id: null,
  customer_id: null,
  party_name: null,
  company_name: null,
  contact: null,
  ad_title: null,
  last_client_message_at: kyiv("2026-11-05T10:00:00").toISOString(),
  last_message_at: null,
  last_message_preview: "hi",
  last_message_direction: "in",
  last_message_sender_id: null,
  awaiting_reply: true,
  auto_replied_at: null,
  is_test: false,
  created_at: kyiv("2026-11-05T10:00:00").toISOString(),
  ...patch,
});

const context = (patch: Partial<BannerContext> = {}): BannerContext => ({
  actor: { userId: "me", isOwnerOrCeo: false },
  now,
  hours,
  handoverMinutes: 30,
  assigneeName: null,
  previousName: null,
  hasFailedMessage: false,
  lastReplyFromApp: false,
  ...patch,
});

describe("мітка заявки", () => {
  it("нова показує хвилини до передачі", () => {
    expect(requestTag(request(), now, hours)).toEqual({ text: "10 хв", tone: "warning" });
    expect(requestStatus(request(), now, hours).text).toBe("Нова, лишилось 10 хв");
  });
  it("вночі таймер стоїть", () => {
    expect(requestTag(request(), kyiv("2026-11-04T22:00:00"), hours)).toEqual({ text: "З 9:00", tone: "neutral" });
  });
  it("друге коло червоне", () => {
    expect(requestTag(request({ is_overdue: true, round: 2 }), now, hours)).toEqual({ text: "Друге коло", tone: "danger" });
  });
  it("без менеджера червона, а не «0 хв»", () => {
    expect(requestTag(request({ assigned_user_id: null }), now, hours).text).toBe("Без менеджера");
  });
  it("закрита показує причину", () => {
    expect(requestStatus(request({ status: "closed", close_reason: "cannot_do" }), now, hours).text).toBe("Закрита: не можемо зробити");
  });
  it("вікно 7 днів сильніше за «В роботі»", () => {
    const old = request({ status: "in_progress", last_client_message_at: kyiv("2026-10-28T10:00:00").toISOString() });
    expect(requestTag(old, now, hours)).toEqual({ text: "7 днів минуло", tone: "danger" });
  });
  it("перша відповідь у таблиці", () => {
    expect(firstResponseText(request({ first_response_minutes: 0 }))).toBe("0 хв");
    expect(firstResponseText(request())).toBe("Ще немає відповіді");
    expect(firstResponseText(request({ is_overdue: true }))).toBe("Ніхто не відповів");
  });
});

describe("банер", () => {
  it("своя нова", () => {
    expect(requestBanner(request(), context()).text).toContain("Лишилось 10 хв");
  });
  it("передана від колеги", () => {
    expect(requestBanner(request(), context({ previousName: "Олег Т." })).text).toContain("Від Олег Т. не було відповіді");
  });
  it("написали вночі", () => {
    const banner = requestBanner(request({ auto_replied_at: "2026-11-04T20:10:00Z" }), context({ now: kyiv("2026-11-04T22:10:00") }));
    expect(banner.text).toContain("автовідповідь");
    expect(banner.text).toContain("о 9:00");
  });
  it("відповіли, контакту немає, контакт є", () => {
    const answered = request({ status: "in_progress", first_response_at: "x", first_response_minutes: 3 });
    expect(requestBanner(answered, context()).text).toContain("візьміть назву компанії");
    expect(requestBanner({ ...answered, company_name: "Бренд", contact: "+380" }, context()).tone).toBe("success");
  });
  it("СЕО бачить час відповіді, менеджеру підказуємо забрати", () => {
    const answered = request({ status: "in_progress", assigned_user_id: "maria", first_response_minutes: 4 });
    expect(requestBanner(answered, context({ actor: { userId: "boss", isOwnerOrCeo: true }, assigneeName: "Марія К." })).text).toBe("Перша відповідь за 4 хв. Займається Марія К.");
    expect(requestBanner(answered, context({ assigneeName: "Марія К." })).text).toContain("заберіть собі");
  });
  it("не надіслано бачить лише автор", () => {
    expect(requestBanner(request(), context({ hasFailedMessage: true })).tone).toBe("danger");
    expect(requestBanner(request({ assigned_user_id: "x" }), context({ hasFailedMessage: true })).text).not.toContain("не надіслано");
  });
  it("із застосунку", () => {
    const answered = request({ status: "in_progress", first_response_at: "x" });
    expect(requestBanner(answered, context({ lastReplyFromApp: true })).text).toContain("із застосунку Instagram");
  });
});

describe("поле відповіді", () => {
  const me = { userId: "me", isOwnerOrCeo: false };
  it("своя: можна", () => {
    expect(composerBlockedReason(request(), me, now, null)).toBeNull();
  });
  it("чужа: пояснює, СЕО підказує забрати", () => {
    expect(composerBlockedReason(request({ assigned_user_id: "x" }), me, now, "Марія К.")).toContain("лише той");
    expect(composerBlockedReason(request({ assigned_user_id: "x" }), { userId: "b", isOwnerOrCeo: true }, now, "Марія К.")).toContain("заберіть");
  });
  it("після 7 днів вимкнено навіть своя", () => {
    expect(composerBlockedReason(request({ last_client_message_at: kyiv("2026-10-28T10:00:00").toISOString() }), me, now, null)).toContain("Telegram");
  });
});

describe("вкладки", () => {
  it("«Інше» окремо від решти", () => {
    expect(matchesTab(request({ kind: "other" }), "active")).toBe(false);
    expect(matchesTab(request({ kind: "other", status: "closed" }), "other")).toBe(true);
    expect(matchesTab(request({ status: "in_progress" }), "active")).toBe(true);
    expect(matchesTab(request({ status: "lead" }), "lead")).toBe(true);
    expect(matchesTab(request({ status: "closed" }), "closed")).toBe(true);
  });
});

describe("цифри керівника", () => {
  it("тестові й «Інше» не рахуються, час це медіана", () => {
    const rows = [
      request({ first_response_minutes: 2, status: "in_progress" }),
      request({ first_response_minutes: 4, status: "lead" }),
      request({ first_response_minutes: 120, status: "closed" }),
      request({ first_response_minutes: 999, is_test: true }),
      request({ kind: "other" }),
      request({}),
    ];
    expect(teamStats(rows, now)).toEqual({ fresh: 1, working: 1, leads: 1, closed: 1, replyMinutes: 4 });
  });
  it("завантаження менеджера", () => {
    const rows = [request(), request({ status: "in_progress", first_response_by: "me", first_response_minutes: 6 }), request({ assigned_user_id: "x" })];
    expect(managerLoad(rows, "me", now)).toEqual({ userId: "me", fresh: 1, working: 1, replyMinutes: 6 });
  });
});

describe("історія", () => {
  const event = (patch: Partial<EventRow>): EventRow => ({ id: "e", request_id: "r", kind: "assigned", from_user_id: null, to_user_id: null, actor_user_id: null, note: null, created_at: "", ...patch });
  const nameOf = (id: string | null) => (id === "o" ? "Олег Т." : id === "a" ? "Анна П." : null);
  it("пише по-людськи, а невідому подію пропускає", () => {
    expect(eventText(event({ kind: "handed_over", to_user_id: "a" }), nameOf)).toBe("Передана: Анна П., бо не було відповіді");
    expect(eventText(event({ kind: "first_response", note: "3" }), nameOf)).toBe("Перша відповідь за 3 хв");
    expect(eventText(event({ kind: "future" }), nameOf)).toBeNull();
  });
  it("попередній відповідальний лише від передачі", () => {
    expect(previousAssignee([event({ kind: "handed_over", from_user_id: "o", to_user_id: "me" })], "me")).toBe("o");
    expect(previousAssignee([event({ kind: "claimed", from_user_id: "o", to_user_id: "me" })], "me")).toBeNull();
    expect(previousAssignee([event({ kind: "handed_over", from_user_id: "o", to_user_id: "a" })], "me")).toBeNull();
  });
});

describe("форма ліда", () => {
  it("телефон і Telegram у свої поля", () => {
    expect(leadPrefill({ company_name: "Бренд", contact: "+380 67 000 00 00", display_name: "Ольга Коваль", handle: "o" })).toMatchObject({
      companyName: "Бренд",
      firstName: "Ольга",
      lastName: "Коваль",
      phones: ["+380 67 000 00 00"],
      telegram: "",
      source: "Instagram",
    });
    expect(leadPrefill({ company_name: null, contact: "@olha", display_name: null, handle: "o" })).toMatchObject({ phones: [""], telegram: "@olha", firstName: "" });
  });
});

describe("вкладення", () => {
  it("javascript: і чужі формати не проходять", () => {
    expect(safeAttachments([{ url: "javascript:alert(1)" }, { url: "https://x/a.jpg", type: "image" }, null, "x"])).toEqual([{ url: "https://x/a.jpg", isImage: true, name: "Вкладення" }]);
    expect(safeAttachments("nope")).toEqual([]);
  });
});
