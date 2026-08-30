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
  icon: LucideIcon;
  accentClass?: string;
  /** Вкладення, з якого зроблена подія, — щоб рядок умів завантажити файл. */
  attachment?: QuoteAttachment;
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
      title: item.from_status
        ? `${formatStatusLabel(fromStatus)} → ${formatStatusLabel(toStatus)}`
        : `Статус: ${formatStatusLabel(toStatus)}`,
      meta: item.note ?? undefined,
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

      const title =
        source === "quote_status" && fromValue && toValue
          ? `${formatStatusLabel(normalizeStatus(fromValue))} → ${formatStatusLabel(normalizeStatus(toValue))}`
          : source === "quote_deadline"
            ? `Дедлайн: ${formatDeadlineLabel(fromValue)} → ${formatDeadlineLabel(toValue)}`
            : row.title?.trim() || `${actorLabel} ${row.action ?? "оновив"}`.trim();

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
            : source === "quote_deadline"
              ? Calendar
              : source === "quote_status" && toValue
                ? statusIcons[normalizeStatus(toValue)] ?? Clock
                : Clock;
      const accentClass =
        source === "quote_runs"
          ? "quote-activity-accent-runs"
          : source === "quote_items"
            ? "quote-activity-accent-items"
            : source === "quote_deadline"
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
        icon,
        accentClass,
      } satisfies QuoteFeedEvent;
    });

  return [...statusEvents, ...commentEvents, ...fileEvents, ...activityEvents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
