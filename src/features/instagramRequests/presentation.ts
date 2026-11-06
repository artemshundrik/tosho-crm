/**
 * Що показати про заявку: мітки, банер, поле відповіді, історія. Без React,
 * тож кожен стан із затвердженого дизайну перевіряється тестом.
 */
import type { Tone } from "@/lib/statusTones";

import type { EventRow, RequestRow } from "./queries";
import {
  closeReasonLabel,
  isReplyWindowOpen,
  isWorkingTime,
  workingMinutesBetween,
  canReply,
  type RequestActor,
  type WorkHours,
} from "./rules";

export type RequestTab = "active" | "lead" | "closed" | "other";

export const REQUEST_TABS: Array<{ key: RequestTab; label: string; reviewersOnly?: boolean }> = [
  { key: "active", label: "Активні" },
  { key: "lead", label: "Стали лідом" },
  { key: "closed", label: "Закриті" },
  { key: "other", label: "Інше", reviewersOnly: true },
];

export function matchesTab(request: Pick<RequestRow, "kind" | "status">, tab: RequestTab): boolean {
  if (tab === "other") return request.kind === "other";
  if (request.kind === "other") return false;
  if (tab === "active") return request.status === "new" || request.status === "in_progress";
  return request.status === tab;
}

export const clientName = (request: Pick<RequestRow, "handle" | "display_name">): string =>
  request.handle || request.display_name || "Клієнт";

type Label = { text: string; tone: Tone };

const roundWord = (round: number): string => {
  const words = ["", "Перше", "Друге", "Третє", "Четверте", "П'яте"];
  return words[round] ? `${words[round]} коло` : `Коло ${round}`;
};

/** Скільки лишилось до передачі. Поза робочим часом лічба стоїть, і про це прямо сказано. */
export function minutesLeft(request: Pick<RequestRow, "handover_due_at">, now: Date, hours: WorkHours): number | null {
  if (!request.handover_due_at) return null;
  return workingMinutesBetween(now, new Date(request.handover_due_at), hours);
}

const isTimerRunning = (request: RequestRow) => request.status === "new" && request.kind === "ad" && !request.first_response_at;

const windowClosed = (request: RequestRow, now: Date) =>
  Boolean(request.last_client_message_at) && !isReplyWindowOpen(request.last_client_message_at, now);

/** Коротка мітка в рядку списку. */
export function requestTag(request: RequestRow, now: Date, hours: WorkHours): Label {
  if (request.kind === "other") return request.status === "closed" ? { text: "Не клієнт", tone: "neutral" } : { text: "Інше", tone: "neutral" };
  if (request.status === "closed") return { text: request.close_reason ? closeReasonLabel(request.close_reason) : "Закрита", tone: "neutral" };
  if (request.status === "lead") return { text: "Лід", tone: "success" };
  if (windowClosed(request, now)) return { text: "7 днів минуло", tone: "danger" };
  if (isTimerRunning(request)) {
    if (!request.assigned_user_id) return { text: "Без менеджера", tone: "danger" };
    if (request.is_overdue) return { text: roundWord(request.round), tone: "danger" };
    if (!isWorkingTime(now, hours)) return { text: `З ${hours.startHour}:00`, tone: "neutral" };
    return { text: `${minutesLeft(request, now, hours) ?? 0} хв`, tone: "warning" };
  }
  return { text: "В роботі", tone: "info" };
}

/** Повна назва стану: таблиця керівника й панель заявки. */
export function requestStatus(request: RequestRow, now: Date, hours: WorkHours): Label {
  if (request.kind === "other") return request.status === "closed" ? { text: "Закрита: не клієнт", tone: "neutral" } : { text: "Інше", tone: "neutral" };
  if (request.status === "closed") {
    const reason = request.close_reason ? closeReasonLabel(request.close_reason).toLowerCase() : "";
    return { text: reason ? `Закрита: ${reason}` : "Закрита", tone: "neutral" };
  }
  if (request.status === "lead") return { text: "Стала лідом", tone: "success" };
  if (isTimerRunning(request)) {
    if (!request.assigned_user_id) return { text: "Нова, без менеджера", tone: "danger" };
    if (request.is_overdue) return { text: `Прострочена, ${roundWord(request.round).toLowerCase()}`, tone: "danger" };
    if (!isWorkingTime(now, hours)) return { text: `Нова, таймер з ${hours.startHour}:00`, tone: "warning" };
    return { text: `Нова, лишилось ${minutesLeft(request, now, hours) ?? 0} хв`, tone: "warning" };
  }
  return { text: "В роботі", tone: "info" };
}

export function firstResponseText(request: RequestRow): string {
  if (request.first_response_minutes !== null && request.first_response_minutes !== undefined) {
    return `${request.first_response_minutes} хв`;
  }
  if (request.kind === "other" || request.status === "closed" || request.status === "lead") return "—";
  return request.is_overdue ? "Ніхто не відповів" : "Ще немає відповіді";
}

export function lastMessageText(request: RequestRow, nameOf: (userId: string | null) => string | null): string {
  const text = request.last_message_preview ?? "";
  if (request.last_message_direction === "out") {
    const who = nameOf(request.last_message_sender_id) ?? "Із застосунку";
    return `${who}: ${text}`;
  }
  return `Клієнт: ${text}`;
}

export const hasContact = (request: Pick<RequestRow, "company_name" | "contact">): boolean =>
  Boolean(request.company_name?.trim() && request.contact?.trim());

export type BannerContext = {
  actor: RequestActor;
  now: Date;
  hours: WorkHours;
  handoverMinutes: number;
  assigneeName: string | null;
  /** Від кого прийшла заявка, якщо її передали. */
  previousName: string | null;
  /** Останнє наше повідомлення не дійшло до клієнта. */
  hasFailedMessage: boolean;
  /** Найсвіжіша відповідь прийшла із застосунку Instagram. */
  lastReplyFromApp: boolean;
};

export function requestBanner(request: RequestRow, context: BannerContext): Label {
  const { actor, now, hours, handoverMinutes, assigneeName, previousName } = context;
  const mine = request.assigned_user_id === actor.userId;

  if (request.kind === "other") {
    return request.status === "closed"
      ? { text: "Закрито: не клієнт. Якщо людина напише знову, розмова повернеться сюди.", tone: "neutral" }
      : { text: "Розмова не з реклами. Менеджери її не бачать. Вирішіть, чи це клієнт.", tone: "neutral" };
  }
  if (request.status === "closed") {
    const reason = request.close_reason ? closeReasonLabel(request.close_reason).toLowerCase() : "не вказана";
    return mine
      ? { text: `Ви закрили заявку без ліда, причина: ${reason}. Якщо людина напише знову, заявка повернеться до вас.`, tone: "neutral" }
      : { text: `Заявку закрито без ліда, причина: ${reason}.`, tone: "neutral" };
  }
  if (request.status === "lead") {
    return { text: "Заявка стала лідом. Нові повідомлення клієнта й далі падатимуть сюди.", tone: "success" };
  }
  if (windowClosed(request, now)) {
    return { text: "Минуло 7 днів від останнього повідомлення клієнта. Instagram більше не дає відповісти.", tone: "danger" };
  }
  if (context.hasFailedMessage && mine) {
    return { text: "Повідомлення не надіслано. Клієнт його не отримав.", tone: "danger" };
  }
  if (!request.assigned_user_id) {
    return { text: "Зараз немає доступного менеджера. Передайте заявку вручну.", tone: "danger" };
  }

  const timer = isTimerRunning(request);
  if (!mine) {
    const who = assigneeName ?? "колега";
    // Імена бувають скорочені: «Марія К.». Другої крапки в кінці речення не треба.
    const whoEnd = who.endsWith(".") ? who : `${who}.`;
    const claimHint = actor.isOwnerOrCeo ? "" : " Ви можете читати її, а щоб відповісти, заберіть собі.";
    if (timer) return { text: `Цією заявкою займається ${who}, відповіді ще немає.${claimHint}`, tone: "warning" };
    if (request.first_response_minutes !== null && actor.isOwnerOrCeo) {
      return { text: `Перша відповідь за ${request.first_response_minutes} хв. Займається ${whoEnd}`, tone: "info" };
    }
    return { text: `Цією заявкою займається ${whoEnd}${claimHint}`, tone: "neutral" };
  }

  if (timer) {
    if (request.is_overdue) {
      return { text: `Ніхто з менеджерів не відповів за повне коло. Заявка на вас, ${roundWord(request.round).toLowerCase()}.`, tone: "danger" };
    }
    if (!isWorkingTime(now, hours)) {
      const lead = request.auto_replied_at ? "Клієнт написав поза робочим часом і отримав автовідповідь." : "Зараз неробочий час.";
      return { text: `${lead} ${handoverMinutes} хв почнуть рахуватись о ${hours.startHour}:00.`, tone: "neutral" };
    }
    if (previousName) {
      return { text: `Заявку передано вам. Від ${previousName} не було відповіді. У вас є ${minutesLeft(request, now, hours) ?? handoverMinutes} хв.`, tone: "warning" };
    }
    return { text: `Нова заявка на вас. Лишилось ${minutesLeft(request, now, hours) ?? 0} хв на відповідь, потім вона перейде наступному менеджеру.`, tone: "warning" };
  }
  if (context.lastReplyFromApp) {
    return { text: "Клієнту відповіли із застосунку Instagram. Перегляньте відповідь, перш ніж писати самі.", tone: "info" };
  }
  if (hasContact(request)) return { text: "Дані є. Можна створювати ліда.", tone: "success" };
  return { text: "Ви відповіли. Тепер візьміть назву компанії й контакт, щоб створити ліда.", tone: "info" };
}

/** null означає, що писати можна. Інакше причина, чому поле вимкнене. */
export function composerBlockedReason(request: RequestRow, actor: RequestActor, now: Date, assigneeName: string | null): string | null {
  if (windowClosed(request, now)) return "Написати в Direct уже не можна. Якщо є контакт, зателефонуйте або напишіть у Telegram.";
  if (canReply(actor, request)) return null;
  if (actor.isOwnerOrCeo && assigneeName) return `Відповідає ${assigneeName}. Щоб написати клієнту самому, спершу заберіть заявку.`;
  return "Відповідати може лише той, хто займається заявкою.";
}

export function eventText(event: EventRow, nameOf: (userId: string | null) => string | null): string | null {
  const to = nameOf(event.to_user_id) ?? "колега";
  const from = nameOf(event.from_user_id);
  const actor = nameOf(event.actor_user_id);
  switch (event.kind) {
    case "received":
      return "Заявка прийшла";
    case "other_received":
      return "Нова розмова у вкладці «Інше»";
    case "assigned":
      return `Призначена: ${to}`;
    case "handed_over":
      return `Передана: ${to}, бо не було відповіді`;
    case "new_round":
      return `Нове коло, передана: ${to}`;
    case "passed":
      return `Передана вручну: ${to}${event.note ? `. ${event.note}` : ""}`;
    case "claimed":
      return `Забрано собі: ${to}${from ? `, раніше ${from}` : ""}`;
    case "reminded":
      return `Нагадування: ${to}`;
    case "first_response":
      return `Перша відповідь за ${event.note ?? "?"} хв`;
    case "app_reply":
      return "Відповідь із застосунку Instagram";
    case "send_failed":
      return "Помилка надсилання";
    case "closed":
      return `Закрито без ліда: ${(event.note ?? "").toLowerCase()}`;
    case "reopened":
      return actor ? `Повернуто в роботу: ${actor}` : "Клієнт написав знову";
    case "lead_linked":
      return `Лід: ${event.note ?? "картка"}`;
    case "converted":
      return "Переведено в заявку";
    case "no_manager":
      return "Немає доступного менеджера";
    case "ad_seen":
      return `Написали з іншого оголошення: ${event.note ?? ""}`;
    default:
      return null;
  }
}

/** Хто вів заявку до поточного, якщо її передали. Ручне забирання сюди не входить. */
export function previousAssignee(events: EventRow[], assignedUserId: string | null): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if ((event.kind === "handed_over" || event.kind === "new_round" || event.kind === "passed") && event.to_user_id === assignedUserId) {
      return event.from_user_id;
    }
  }
  return null;
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

export const STATS_WINDOW_DAYS = 30;

export type TeamStats = { fresh: number; working: number; leads: number; closed: number; replyMinutes: number | null };

/** Цифри керівника: заявки з реклами за 30 днів. Тестові не рахуються. Медіана, бо одна нічна заявка не має псувати картину. */
export function teamStats(requests: RequestRow[], now: Date): TeamStats {
  const since = now.getTime() - STATS_WINDOW_DAYS * 24 * 60 * 60_000;
  const rows = requests.filter((request) => request.kind === "ad" && !request.is_test && new Date(request.created_at).getTime() >= since);
  return {
    fresh: rows.filter((request) => request.status === "new").length,
    working: rows.filter((request) => request.status === "in_progress").length,
    leads: rows.filter((request) => request.status === "lead").length,
    closed: rows.filter((request) => request.status === "closed").length,
    replyMinutes: median(rows.map((request) => request.first_response_minutes).filter((minutes): minutes is number => minutes !== null)),
  };
}

export type ManagerLoad = { userId: string; fresh: number; working: number; replyMinutes: number | null };

export function managerLoad(requests: RequestRow[], userId: string, now: Date): ManagerLoad {
  const since = now.getTime() - STATS_WINDOW_DAYS * 24 * 60 * 60_000;
  const mine = requests.filter((request) => request.kind === "ad" && !request.is_test && request.assigned_user_id === userId);
  const answered = requests.filter(
    (request) =>
      request.kind === "ad" &&
      !request.is_test &&
      request.first_response_by === userId &&
      request.first_response_minutes !== null &&
      new Date(request.created_at).getTime() >= since
  );
  return {
    userId,
    fresh: mine.filter((request) => request.status === "new").length,
    working: mine.filter((request) => request.status === "in_progress").length,
    replyMinutes: median(answered.map((request) => request.first_response_minutes as number)),
  };
}

/** Заповнює форму ліда тим, що менеджер уже дізнався. Телефон і Telegram живуть у різних полях. */
export function leadPrefill(request: Pick<RequestRow, "company_name" | "contact" | "display_name" | "handle">) {
  const contact = (request.contact ?? "").trim();
  const digits = contact.replace(/\D/g, "");
  const isPhone = digits.length >= 9 && /^[+\d\s()-]+$/.test(contact);
  const [firstName = "", ...rest] = (request.display_name ?? "").trim().split(/\s+/);
  return {
    companyName: request.company_name?.trim() ?? "",
    firstName,
    lastName: rest.join(" "),
    phones: [isPhone ? contact : ""],
    telegram: isPhone ? "" : contact,
    source: "Instagram",
  };
}

export type Attachment = { url: string; isImage: boolean; name: string };

/** Вміст вкладень прийшов іззовні: лише https-посилання, решту не показуємо. */
export function safeAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): Attachment[] => {
    const row = item as { url?: unknown; type?: unknown; name?: unknown } | null;
    if (typeof row?.url !== "string" || !row.url.startsWith("https://")) return [];
    return [{ url: row.url, isImage: row.type === "image", name: typeof row.name === "string" ? row.name : "Вкладення" }];
  });
}

export function messageTime(iso: string, now: Date): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  if (at.toDateString() === now.toDateString()) return time;
  return `${at.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}, ${time}`;
}
