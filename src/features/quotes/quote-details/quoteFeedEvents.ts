import { Calculator, Calendar, Clock, MessageSquare, Package, Paperclip, type LucideIcon } from "lucide-react";

import type { ActivityRow } from "@/lib/activity";
import { getAttachmentDisplayFileName } from "@/lib/attachmentPreview";

import { formatStatusLabel, normalizeStatus, statusClasses, statusIcons } from "./config";
import { formatDeadlineLabel } from "./deadlineLabels";
import type { QuoteAttachment, QuoteComment } from "./queries";

/**
 * СТРІЧКА СПРАВИ — одна хронологія замість трьох підвкладок (REQ-155 p9).
 *
 * БУЛО: «Коментарі», «Вкладення», «Активність» — три списки, кожен зі своїм
 * порядком і своїм уявленням про те, що таке подія. Щоб зрозуміти, що сталося з
 * прорахунком у вівторок, доводилось читати три рази й зшивати час у голові.
 *
 * СТАЛО: один потік, у якому розмова, гроші, файли й події стоять поруч у тому
 * порядку, у якому вони відбувались. `kind` існує не для краси — на ньому
 * тримаються фільтри стрічки.
 *
 * ЩО ЗВІДКИ:
 *   talk  — коментарі справи (`quote_comments`);
 *   money — записи журналу про тиражі й ціни (`source = quote_runs`);
 *   file  — вкладення прорахунку (`quote_attachments`);
 *   event — статуси (окрема таблиця історії), дедлайни, позиції, решта журналу.
 *
 * ЧОМУ СТАТУСИ БЕРУТЬСЯ З ІСТОРІЇ, А НЕ З ЖУРНАЛУ. Обидва джерела пишуть про
 * той самий перехід, і поки історія непорожня, журнальні дублі відкидаються —
 * інакше кожна зміна статусу зʼявлялась би в стрічці двічі.
 */

export type QuoteFeedKind = "talk" | "money" | "file" | "event";

export type QuoteFeedEvent = {
  id: string;
  createdAt: string;
  kind: QuoteFeedKind;
  actorId: string | null;
  actorLabel: string;
  title: string;
  /** Текст коментаря — показується реплікою, а не підписом події. */
  body?: string;
  /** Другий рядок: розмір файлу, позиція, примітка до події. */
  meta?: string;
  /** «Було → стало». Порожнє `from` означає, що значення задали вперше. */
  from?: string;
  to?: string;
  icon: LucideIcon;
  accentClass?: string;
  /** Вкладення, з якого зроблена подія, — щоб рядок умів завантажити файл. */
  attachment?: QuoteAttachment;
  /**
   * Чи потрапляє подія у зріз «лише головне».
   *
   * Головне — це те, що змінює домовленість: розмова, гроші й статус. Файли,
   * дедлайни та правки позицій лишаються у стрічці, але у звуженому зрізі їх
   * немає: коли подій під сотню, «що сталось важливого» і «що сталось узагалі» —
   * різні питання.
   */
  important: boolean;
};

export /** Три дедлайни прорахунку — і три джерела, якими їх пише журнал. */
const DEADLINE_TITLES: Record<string, string | undefined> = {
  quote_deadline: "Дедлайн відповіді замовнику",
  design_deadline_at: "Дедлайн дизайну",
  customer_deadline_at: "Дедлайн замовника",
};

export const parseActivityMetadata = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object") return value as Record<string, unknown>;
  return {};
};

type StatusHistoryRow = {
  id: string;
  created_at?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  note?: string | null;
  changed_by?: string | null;
};

export function buildQuoteFeed({
  history,
  comments,
  activityRows,
  attachments,
  memberById,
}: {
  history: StatusHistoryRow[];
  comments: QuoteComment[];
  activityRows: ActivityRow[];
  attachments: QuoteAttachment[];
  memberById: Map<string, string>;
}): QuoteFeedEvent[] {
  const nameOf = (userId?: string | null, fallback?: string | null) =>
    (userId ? memberById.get(userId) : null) ?? fallback ?? "Невідомий користувач";

  const statusEvents: QuoteFeedEvent[] = history.map((item) => {
    const toStatus = normalizeStatus(item.to_status);
    const fromStatus = normalizeStatus(item.from_status);
    return {
      id: `status-${item.id}`,
      createdAt: item.created_at ?? new Date().toISOString(),
      kind: "event",
      actorId: item.changed_by ?? null,
      actorLabel: item.changed_by ? nameOf(item.changed_by) : "Система",
      title: "Статус прорахунку",
      from: item.from_status ? formatStatusLabel(fromStatus) : undefined,
      to: formatStatusLabel(toStatus),
      meta: item.note ?? undefined,
      important: true,
      icon: statusIcons[toStatus] ?? Clock,
      accentClass: statusClasses[toStatus] ?? statusClasses.new,
    };
  });

  const commentEvents: QuoteFeedEvent[] = comments.map((comment) => ({
    id: `comment-${comment.id}`,
    createdAt: comment.created_at,
    kind: "talk",
    actorId: comment.created_by ?? null,
    actorLabel: nameOf(comment.created_by),
    title: "Написав у справі",
    body: comment.body,
    important: true,
    icon: MessageSquare,
    accentClass: "quote-activity-accent-comment",
  }));

  const fileEvents: QuoteFeedEvent[] = attachments.map((file) => ({
    id: `file-${file.id}`,
    createdAt: file.created_at,
    kind: "file",
    actorId: file.uploadedBy ?? null,
    actorLabel: nameOf(file.uploadedBy, file.uploadedByLabel),
    // Ім'я — те саме, що в реєстрі згори: `file.name` у половини вкладень
    // зберігає розширення оригіналу, а не того, що реально лежить у сховищі,
    // і той самий файл читався в стрічці як «.jpg», а в реєстрі як «.webp».
    title: getAttachmentDisplayFileName(file.name, file.storagePath, file.mimeType),
    meta: [file.size, file.audience === "design" ? "для дизайнера" : "по справі"]
      .filter(Boolean)
      .join(" · "),
    important: false,
    icon: Paperclip,
    accentClass: "quote-activity-accent-default",
    attachment: file,
  }));

  const hasHistory = history.length > 0;
  const activityEvents: QuoteFeedEvent[] = activityRows
    .filter((row) => {
      const metadata = parseActivityMetadata(row.metadata);
      const source = typeof metadata.source === "string" ? metadata.source : "";
      // Коментар уже прийшов зі своєї таблиці, статус — з історії переходів.
      if (source === "quote_comment") return false;
      if (source === "quote_status" && hasHistory) return false;
      return true;
    })
    .map((row) => {
      const metadata = parseActivityMetadata(row.metadata);
      const source = typeof metadata.source === "string" ? metadata.source : "";
      const actorLabel = nameOf(row.user_id, row.actor_name ?? "Користувач");
      const itemTitle = typeof metadata.item_title === "string" ? metadata.item_title : null;
      const fromValue = typeof metadata.from === "string" ? metadata.from : null;
      const toValue = typeof metadata.to === "string" ? metadata.to : null;

      // Назви трьох дедлайнів беруться з джерела запису: у метаданих
      // вторинних дедлайнів лежить сама колонка, у головного — «quote_deadline».
      const deadlineTitle = DEADLINE_TITLES[source];
      const title =
        source === "quote_status"
          ? "Статус прорахунку"
          : deadlineTitle ??
            (typeof metadata.label === "string" && metadata.label.trim()
              ? metadata.label.trim()
              : row.title?.trim() || `${actorLabel} ${row.action ?? "оновив"}`.trim());

      // «Було → стало» — окремим рядком, а не всередині підпису. Підпис
      // відповідає на «що змінилось», значення — на «з чого на що»; злиті в один
      // рядок, вони читались як довга назва події.
      const delta = deadlineTitle
        ? { from: fromValue ? formatDeadlineLabel(fromValue) : "не заданий", to: formatDeadlineLabel(toValue) }
        : source === "quote_status" && (fromValue || toValue)
          ? {
              from: fromValue ? formatStatusLabel(normalizeStatus(fromValue)) : undefined,
              to: toValue ? formatStatusLabel(normalizeStatus(toValue)) : undefined,
            }
          : fromValue || toValue
            ? { from: fromValue ?? undefined, to: toValue ?? undefined }
            : null;

      const meta =
        typeof metadata.note === "string"
          ? metadata.note
          : source === "quote_items" && itemTitle
            ? `Позиція: ${itemTitle}`
            : undefined;

      const kind: QuoteFeedKind = source === "quote_runs" ? "money" : "event";
      const icon: LucideIcon =
        source === "quote_runs"
          ? Calculator
          : source === "quote_items"
            ? Package
            : deadlineTitle
              ? Calendar
              : source === "quote_status" && toValue
                ? statusIcons[normalizeStatus(toValue)] ?? Clock
                : Clock;
      const accentClass =
        source === "quote_runs"
          ? "quote-activity-accent-runs"
          : source === "quote_items"
            ? "quote-activity-accent-items"
            : deadlineTitle
              ? "quote-activity-accent-deadline"
              : source === "quote_status" && toValue
                ? statusClasses[normalizeStatus(toValue)] ?? statusClasses.new
                : "quote-activity-accent-default";

      return {
        id: `activity-${row.id}`,
        createdAt: row.created_at,
        kind,
        actorId: row.user_id ?? null,
        actorLabel,
        title,
        meta,
        from: delta?.from,
        to: delta?.to,
        important: kind === "money" || source === "quote_status",
        icon,
        accentClass,
      } satisfies QuoteFeedEvent;
    });

  return [...statusEvents, ...commentEvents, ...fileEvents, ...activityEvents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
