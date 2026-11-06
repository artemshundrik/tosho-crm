import { describe, expect, it } from "vitest";
import {
  assignmentPatch,
  checkReply,
  firstResponsePatch,
  notificationTargets,
  shouldAutoReply,
  timerStep,
  type InstagramRequestRow,
  type InstagramSettings,
} from "./instagramPlans";
import { sendTestMessage } from "./instagramTransport";

const kyiv = (text: string) => new Date(`${text}+02:00`);
const hours = { startHour: 9, endHour: 18 };

const settings: InstagramSettings = {
  team_id: "t",
  reminder_minutes: 15,
  handover_minutes: 30,
  work_start_hour: 9,
  work_end_hour: 18,
  auto_reply_text: "x",
  other_reviewer_user_id: null,
  round_excluded_user_ids: [],
  round_cursor_user_id: null,
};

const request = (patch: Partial<InstagramRequestRow> = {}): InstagramRequestRow => ({
  id: "r",
  team_id: "t",
  created_at: kyiv("2026-11-05T10:00:00").toISOString(),
  external_user_id: "e",
  handle: "olha",
  display_name: null,
  kind: "ad",
  status: "new",
  assigned_user_id: "me",
  assigned_at: kyiv("2026-11-05T10:00:00").toISOString(),
  reminder_due_at: kyiv("2026-11-05T10:15:00").toISOString(),
  handover_due_at: kyiv("2026-11-05T10:30:00").toISOString(),
  reminded_at: null,
  assignee_notified_at: kyiv("2026-11-05T10:00:00").toISOString(),
  unassigned_alerted_at: null,
  round: 1,
  round_user_ids: ["me"],
  is_overdue: false,
  awaiting_reply: true,
  first_response_at: null,
  last_client_message_at: kyiv("2026-11-05T10:00:00").toISOString(),
  last_message_preview: "hi",
  auto_replied_at: null,
  ad_id: null,
  ad_title: null,
  is_test: false,
  created_by: null,
  ...patch,
});

describe("призначення", () => {
  it("у робочий час ставить дедлайни й одразу вважає людину сповіщеною", () => {
    const patch = assignmentPatch(kyiv("2026-11-05T10:00:00"), "me", settings, { round: 1, roundUserIds: [], isOverdue: false });
    expect(patch.reminder_due_at).toBe(kyiv("2026-11-05T10:15:00").toISOString());
    expect(patch.handover_due_at).toBe(kyiv("2026-11-05T10:30:00").toISOString());
    expect(patch.assignee_notified_at).not.toBeNull();
    expect(patch.round_user_ids).toEqual(["me"]);
  });

  it("вночі лічба стартує о 9:00, а сповіщення чекає ранку", () => {
    const patch = assignmentPatch(kyiv("2026-11-04T22:10:00"), "me", settings, { round: 1, roundUserIds: [], isOverdue: false });
    expect(patch.handover_due_at).toBe(kyiv("2026-11-05T09:30:00").toISOString());
    expect(patch.assignee_notified_at).toBeNull();
  });

  it("враховує цифри з налаштувань", () => {
    const patch = assignmentPatch(kyiv("2026-11-05T10:00:00"), "me", { ...settings, handover_minutes: 60 }, { round: 1, roundUserIds: [], isOverdue: false });
    expect(patch.handover_due_at).toBe(kyiv("2026-11-05T11:00:00").toISOString());
  });
});

describe("перша відповідь", () => {
  it("зупиняє таймер і рахує робочі хвилини", () => {
    const patch = firstResponsePatch(request(), kyiv("2026-11-05T10:07:00"), "me", hours);
    expect(patch).toMatchObject({ status: "in_progress", first_response_minutes: 7, first_response_by: "me", handover_due_at: null, reminder_due_at: null });
  });

  it("ніч не входить у час відповіді", () => {
    const patch = firstResponsePatch(request({ created_at: kyiv("2026-11-04T22:10:00").toISOString() }), kyiv("2026-11-05T09:05:00"), "me", hours);
    expect(patch).toMatchObject({ first_response_minutes: 5 });
  });

  it("другу відповідь не рахує", () => {
    expect(firstResponsePatch(request({ first_response_at: "2026-11-05T08:00:00Z" }), kyiv("2026-11-05T12:00:00"), "me", hours)).toEqual({});
  });

  it("у заявці зі статусом лід статус не чіпає", () => {
    expect(firstResponsePatch(request({ status: "lead" }), kyiv("2026-11-05T10:07:00"), null, hours)).toMatchObject({ status: "lead" });
  });
});

describe("хто може надіслати", () => {
  const now = kyiv("2026-11-05T10:31:00");
  const me = { userId: "me", isOwnerOrCeo: false };

  it("свою заявку можна", () => {
    expect(checkReply(me, request(), now, null)).toEqual({ ok: true });
  });

  it("після передачі сервер відхиляє й каже, кому передано", () => {
    const result = checkReply(me, request({ assigned_user_id: "anna" }), now, "Анна П.");
    expect(result).toEqual({ ok: false, status: 409, error: expect.stringContaining("Анна П.") });
  });

  it("СЕО спершу забирає заявку", () => {
    expect(checkReply({ userId: "boss", isOwnerOrCeo: true }, request(), now, "Марія К.").ok).toBe(false);
  });

  it("після 7 днів відмова навіть у відповідального", () => {
    const old = request({ last_client_message_at: kyiv("2026-10-29T10:00:00").toISOString() });
    expect(checkReply(me, old, now, null)).toEqual({ ok: false, status: 409, error: expect.stringContaining("7 днів") });
  });
});

describe("автовідповідь", () => {
  it("удень не йде", () => {
    expect(shouldAutoReply({ kind: "ad", auto_replied_at: null }, kyiv("2026-11-05T10:00:00"), hours)).toBe(false);
  });
  it("уночі йде один раз", () => {
    const night = kyiv("2026-11-04T22:10:00");
    expect(shouldAutoReply({ kind: "ad", auto_replied_at: null }, night, hours)).toBe(true);
    expect(shouldAutoReply({ kind: "ad", auto_replied_at: night.toISOString() }, kyiv("2026-11-04T23:00:00"), hours)).toBe(false);
  });
  it("наступного вечора йде знову", () => {
    const yesterday = kyiv("2026-11-04T22:10:00").toISOString();
    expect(shouldAutoReply({ kind: "ad", auto_replied_at: yesterday }, kyiv("2026-11-05T22:00:00"), hours)).toBe(true);
  });
  it("розмові не з реклами не йде", () => {
    expect(shouldAutoReply({ kind: "other", auto_replied_at: null }, kyiv("2026-11-04T22:10:00"), hours)).toBe(false);
  });
});

describe("кому сповіщення", () => {
  it("справжня заявка: тим, кому адресовано", () => {
    expect(notificationTargets({ is_test: false, created_by: null }, ["a", "b", "a", null])).toEqual(["a", "b"]);
  });
  it("тестова: лише автору, менеджери не отримують нічого", () => {
    expect(notificationTargets({ is_test: true, created_by: "boss" }, ["a", "b"])).toEqual(["boss"]);
  });
  it("нікому адресовано: нікому й не йде", () => {
    expect(notificationTargets({ is_test: true, created_by: "boss" }, [])).toEqual([]);
  });
});

describe("таймер", () => {
  it("до нагадування нічого не робить", () => {
    expect(timerStep(request(), kyiv("2026-11-05T10:10:00"))).toBeNull();
  });
  it("на 15-й нагадує", () => {
    expect(timerStep(request(), kyiv("2026-11-05T10:15:00"))).toBe("remind");
  });
  it("вдруге не нагадує", () => {
    expect(timerStep(request({ reminded_at: kyiv("2026-11-05T10:15:00").toISOString() }), kyiv("2026-11-05T10:20:00"))).toBeNull();
  });
  it("на 30-й передає, навіть якщо нагадування проґавлено", () => {
    expect(timerStep(request(), kyiv("2026-11-05T10:31:00"))).toBe("handover");
  });
  it("зранку доносить нічне повідомлення і в заявці, що вже в роботі", () => {
    const night = request({ status: "in_progress", assignee_notified_at: null, awaiting_reply: true, first_response_at: "2026-11-04T10:00:00Z" });
    expect(timerStep(night, kyiv("2026-11-05T09:00:00"))).toBe("notify_morning");
    expect(timerStep({ ...night, awaiting_reply: false }, kyiv("2026-11-05T09:00:00"))).toBeNull();
    expect(timerStep({ ...night, assignee_notified_at: "2026-11-05T07:00:00Z" }, kyiv("2026-11-05T09:00:00"))).toBeNull();
  });
  it("зранку доносить нічне сповіщення", () => {
    expect(timerStep(request({ assignee_notified_at: null }), kyiv("2026-11-05T09:00:00"))).toBe("notify_morning");
  });
  it("без менеджера пробує призначити знову", () => {
    expect(timerStep(request({ assigned_user_id: null }), kyiv("2026-11-05T10:00:00"))).toBe("assign");
  });
  it("після відповіді, у «Іншому» й після закриття таймера немає", () => {
    const late = kyiv("2026-11-05T12:00:00");
    expect(timerStep(request({ first_response_at: "2026-11-05T08:10:00Z" }), late)).toBeNull();
    expect(timerStep(request({ kind: "other" }), late)).toBeNull();
    expect(timerStep(request({ status: "closed" }), late)).toBeNull();
  });
});

describe("імітація надсилання", () => {
  it("дає ідентифікатор і вміє вдати збій", () => {
    expect(sendTestMessage({ text: "привіт" }).ok).toBe(true);
    expect(sendTestMessage({ text: "привіт !fail" }).ok).toBe(false);
  });
});
