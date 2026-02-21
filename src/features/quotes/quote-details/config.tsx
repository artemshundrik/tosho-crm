import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Hourglass,
  PlayCircle,
  PlusCircle,
  Send,
  XCircle,
} from "lucide-react";

export const ITEM_VISUAL_BUCKET =
  (import.meta.env.VITE_SUPABASE_ITEM_VISUAL_BUCKET as string | undefined) || "attachments";

export const MAX_QUOTE_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024;
export const ATTACHMENTS_ACCEPT =
  ".pdf,.ai,.svg,.eps,.cdr,.png,.jpg,.jpeg,.psd,.tiff,.zip,.rar,.doc,.docx,.xls,.xlsx";
export const MENTION_REGEX = /(^|[\s(])@([^\s@,;:!?()[\]{}<>]+)/gu;
const MENTION_TOKEN_REGEX = /(@[^\s@,;:!?()[\]{}<>]+)/g;

export const normalizeMentionKey = (value?: string | null) => (value ?? "").trim().toLowerCase();
export const isMentionTerminator = (char: string) => /[\s,;:!?()[\]{}<>]/u.test(char);

export const toEmailLocalPart = (value?: string | null) => {
  const text = (value ?? "").trim();
  if (!text.includes("@")) return "";
  return text.split("@")[0]?.trim() ?? "";
};

export const sanitizeMentionAlias = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^\p{L}\p{N}._-]+/gu, "");

export const buildMentionAlias = (label: string, userId: string) => {
  const base = toEmailLocalPart(label) || label;
  const alias = sanitizeMentionAlias(base);
  return alias || userId.slice(0, 8);
};

export const extractMentionKeys = (text: string) => {
  const keys = new Set<string>();
  for (const match of text.matchAll(MENTION_REGEX)) {
    const key = normalizeMentionKey(match[2]);
    if (key) keys.add(key);
  }
  return Array.from(keys);
};

export const renderTextWithMentions = (text: string) => {
  const parts = text.split(MENTION_TOKEN_REGEX);
  return parts.map((part, index) => {
    if (!part) return null;
    if (!part.startsWith("@")) return <span key={`text-${index}`}>{part}</span>;
    return (
      <span key={`mention-${index}`} className="font-semibold text-primary">
        {part}
      </span>
    );
  });
};

export const shouldUseCommentsFallback = (message?: string | null) => {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("stack depth limit exceeded") ||
    normalized.includes("statement timeout") ||
    normalized.includes("canceling statement due to statement timeout")
  );
};

export const formatFileSize = (bytes?: number | null) => {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** exp;
  return `${size.toFixed(size >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`;
};

export const getFileExtension = (name?: string | null) => {
  if (!name) return null;
  const parts = name.split(".");
  if (parts.length < 2) return null;
  return parts[parts.length - 1]?.toUpperCase() ?? null;
};

const IMAGE_PREVIEW_EXTENSIONS = new Set(["PNG", "JPG", "JPEG", "WEBP", "GIF", "SVG"]);

export const canPreviewImage = (extension?: string | null) =>
  !!extension && IMAGE_PREVIEW_EXTENSIONS.has(extension);

export const canPreviewPdf = (extension?: string | null) => extension === "PDF";

export const formatCurrencyCompact = (value: number, currency?: string | null) =>
  new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: currency ?? "UAH",
    maximumFractionDigits: 0,
  }).format(value || 0);

export const CANCEL_REASON_OPTIONS = [
  "Бюджет не підходить",
  "Обрали іншого підрядника",
  "Змінились вимоги/бриф",
  "Втрата актуальності",
  "Немає відповіді від клієнта",
];

export const normalizeStatus = (value?: string | null) => {
  if (!value) return "new";
  const legacy: Record<string, string> = {
    draft: "new",
    in_progress: "estimating",
    sent: "estimated",
    rejected: "cancelled",
    completed: "approved",
  };
  return legacy[value] ?? value;
};

export const STATUS_OPTIONS = [
  "new",
  "estimating",
  "estimated",
  "awaiting_approval",
  "approved",
  "cancelled",
];

export const statusLabels: Record<string, string> = {
  new: "Новий",
  estimating: "На прорахунку",
  estimated: "Пораховано",
  awaiting_approval: "На погодженні",
  approved: "Затверджено",
  cancelled: "Скасовано",
  draft: "Новий",
  in_progress: "На прорахунку",
  sent: "Пораховано",
  rejected: "Скасовано",
  completed: "Затверджено",
};

export const statusClasses: Record<string, string> = {
  new: "bg-muted/40 text-muted-foreground border-border",
  estimating:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/40",
  estimated:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/40",
  awaiting_approval:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:border-violet-500/40",
  approved:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/40",
  cancelled:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/40",
};

export const statusIcons: Record<string, LucideIcon> = {
  new: PlusCircle,
  estimating: PlayCircle,
  estimated: Send,
  awaiting_approval: Hourglass,
  approved: CheckCircle2,
  cancelled: XCircle,
};

export const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};

export const STATUS_FLOW: string[] = ["new", "estimating", "estimated", "awaiting_approval", "approved"];

export const STATUS_NEXT_ACTION: Record<
  string,
  {
    ctaLabel: string;
    title: string;
    description: string;
    nextStatus: string | null;
  }
> = {
  new: {
    ctaLabel: "Почати прорахунок",
    title: "Етап старту",
    description: "Підготуйте позиції та дедлайн, після чого переведіть у роботу.",
    nextStatus: "estimating",
  },
  estimating: {
    ctaLabel: "Позначити як пораховано",
    title: "Етап розрахунку",
    description: "Зафіксуйте ціну та підсумок, коли розрахунок готовий.",
    nextStatus: "estimated",
  },
  estimated: {
    ctaLabel: "Відправити на погодження",
    title: "Етап узгодження",
    description: "Після фінальної перевірки переведіть прорахунок у погодження.",
    nextStatus: "awaiting_approval",
  },
  awaiting_approval: {
    ctaLabel: "Підтвердити",
    title: "Етап погодження",
    description: "Зафіксуйте фінальне рішення клієнта.",
    nextStatus: "approved",
  },
  approved: {
    ctaLabel: "Змінити статус",
    title: "Прорахунок завершено",
    description: "Статус затверджено. За потреби можна змінити вручну.",
    nextStatus: null,
  },
  cancelled: {
    ctaLabel: "Змінити статус",
    title: "Прорахунок скасовано",
    description: "Прорахунок зупинено. За потреби можна перевести в інший статус.",
    nextStatus: null,
  },
};

export const QUOTE_TYPE_LABELS: Record<string, string> = {
  merch: "Мерч",
  print: "Поліграфія",
  other: "Інше",
};

export function formatStatusLabel(value: string | null | undefined) {
  return (value && statusLabels[value]) || value || "Не вказано";
}

export function formatQuoteType(value: string | null | undefined) {
  return (value && QUOTE_TYPE_LABELS[value]) || value || "Не вказано";
}

export function formatCurrency(value: number | null | undefined, currency?: string | null) {
  if (value === null || value === undefined) return "Не вказано";
  const label = currency ?? "UAH";
  return `${value.toLocaleString("uk-UA")} ${label}`;
}

export function getInitials(value?: string | null) {
  if (!value) return "Не вказано";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Не вказано";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function minutesAgo(value: string | null | undefined) {
  if (!value) return null;
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.floor(diff / 60000));
}

export function createLocalId() {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}
