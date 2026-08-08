import type { ComponentType } from "react";
import { Bug, Hammer, Inbox, Info, ListTodo, PackageCheck, Plus, Rocket } from "lucide-react";

import { MODULE_DEFINITIONS } from "@/lib/moduleAccess";
import { isKnownModuleKey } from "@/lib/projectMap";
import type { Tone } from "@/lib/statusTones";

export const REQUEST_STATUSES = [
  "triage",
  "queued",
  "in_progress",
  "done_local",
  "released",
  "wont_do",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_KINDS = ["bug", "friction", "feature"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_PRIORITIES = ["low", "normal", "high"] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

export type DevRequest = {
  id: string;
  number: number;
  /** Готовий підпис «REQ-42» — щоб не збирати його в кожному компоненті. */
  label: string;
  teamId: string;
  title: string;
  body: string;
  kind: RequestKind;
  status: RequestStatus;
  /** Напрямок CRM — ключ модуля з реєстру. Невідомий ключ читаємо як «немає». */
  moduleKey: string | null;
  priority: RequestPriority | null;
  /** Напрямок і пріоритет проставив розбір, а не людина. */
  autoClassified: boolean;
  isPrivate: boolean;
  authorUserId: string | null;
  tgUsername: string | null;
  /** Ім'я автора з Telegram: username там необов'язковий. */
  displayName: string | null;
  askedByCount: number;
  createdAt: string;
};

/**
 * «Не робимо» на дошці окремою колонкою не стоїть: це тупик, а не етап.
 * Показуємо його окремим фільтром, щоб дошка лишалась про роботу в польоті.
 *
 * Форма запису підігнана під наявний KanbanColumnHeader — він приймає рівно
 * { icon, toneClassName, label, count } і поля «підказка» не має.
 *
 * toneClassName бере класи ТІЛЬКИ з реєстру src/lib/statusTones.ts
 * (tone-text-neutral/info/accent/success/warning/danger/festive) — інших
 * tone-text-* класів у проєкті немає. Тому «жовтий/синій/фіолетовий/зелений»
 * зі спеки лягли на найближчі канонічні тони: amber→warning, blue→info,
 * violet→accent (як і pm_review в дизайн-задачах), emerald→success.
 */
export const BOARD_COLUMNS: Array<{
  status: RequestStatus;
  label: string;
  icon: ComponentType<{ className?: string }>;
  toneClassName?: string;
}> = [
  // «Вхідні», а НЕ «Треба уточнити». Статус triage означає «щойно прилетіло,
  // ще не розбирали» — це кошик входу, а не діагноз картці. Старий підпис
  // читався як «в картці бракує інформації», тож зрозумілі задачі з Cowork і
  // Telegram виглядали браком, хоч із ними все гаразд. Не повертайте назад:
  // «уточнити» — це стан ОДНІЄЇ картки, а не колонки, і живе він у тексті
  // картки, а не в підписі стовпчика.
  { status: "triage", label: "Вхідні", icon: Inbox, toneClassName: "tone-text-warning" },
  { status: "queued", label: "У черзі", icon: ListTodo },
  { status: "in_progress", label: "В роботі", icon: Hammer, toneClassName: "tone-text-info" },
  { status: "done_local", label: "Готово локально", icon: PackageCheck, toneClassName: "tone-text-accent" },
  { status: "released", label: "Викочено", icon: Rocket, toneClassName: "tone-text-success" },
];

export const KIND_LABELS: Record<RequestKind, string> = {
  bug: "Не працює",
  friction: "Незручно",
  feature: "Нова можливість",
};

/**
 * Тон типу запиту. Береться з реєстру тонів (src/lib/statusTones.ts), свого
 * набору кольорів картка не заводить: «не працює» звучить як помилка (danger),
 * «незручно» — як попередження (warning), «нова можливість» — як щось нове
 * (accent, той самий тон, що й «Готово локально» на дошці).
 */
export const KIND_TONE: Record<RequestKind, Tone> = {
  bug: "danger",
  friction: "warning",
  feature: "accent",
};

/**
 * Іконка типу. Потрібна не для краси: тип у верхньому рядку картки позначений
 * кольором, а колір сам по собі не читається дальтоніком і не переживає
 * чорно-білий друк дошки. Слово + іконка + тон — три канали на одне значення.
 */
export const KIND_ICONS: Record<RequestKind, ComponentType<{ className?: string }>> = {
  bug: Bug,
  friction: Info,
  feature: Plus,
};

/**
 * Підписи пріоритету у ФОРМІ. Тут «Звичайний» потрібен: у списку вибору має
 * бути видно всі три значення, зокрема й те, що стоїть за замовчуванням.
 */
export const PRIORITY_LABELS: Record<RequestPriority, string> = {
  low: "Не горить",
  normal: "Звичайний",
  high: "Терміново",
};

/**
 * Підписи пріоритету НА КАРТЦІ. «Звичайного» тут немає навмисно.
 *
 * Мітка «Звичайний» — порожнє слово: вона стоїть на більшості карток, нічого
 * не розрізняє і з'їдає місце в ряду, який сканують очима. Підписуємо лише
 * два краї шкали — «Терміново» і «Не горить».
 *
 * Це саме ТИП, а не домовленість у коментарі: `Exclude<…, "normal">` не дасть
 * дописати «звичайний» назад, не переписавши сигнатуру, — а переписати її
 * випадково, «поки правив верстку», уже не вийде.
 */
export const CARD_PRIORITY_LABELS: Record<Exclude<RequestPriority, "normal">, string> = {
  low: PRIORITY_LABELS.low,
  high: PRIORITY_LABELS.high,
};

/**
 * Людський підпис напрямку. Рядки НЕ дублюються — вони з того самого реєстру
 * модулів, що й перемикачі доступів і карта для розбору. Доданий модуль
 * зʼявляється у списку сам.
 */
export const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  MODULE_DEFINITIONS.map((item) => [item.key, item.label])
);

export function formatRequestNumber(number: number): string {
  return `REQ-${number}`;
}

type DevRequestRow = {
  id: string;
  number: number;
  team_id: string;
  title: string;
  body: string | null;
  kind: string;
  status: string;
  module_key: string | null;
  priority: string | null;
  auto_classified: boolean | null;
  is_private: boolean;
  author_user_id: string | null;
  tg_username: string | null;
  display_name: string | null;
  asked_by_count: number;
  created_at: string;
};

function asStatus(raw: string): RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(raw)
    ? (raw as RequestStatus)
    : "triage";
}

function asKind(raw: string): RequestKind {
  return (REQUEST_KINDS as readonly string[]).includes(raw) ? (raw as RequestKind) : "friction";
}

function asPriority(raw: string | null): RequestPriority | null {
  return raw && (REQUEST_PRIORITIES as readonly string[]).includes(raw)
    ? (raw as RequestPriority)
    : null;
}

/**
 * Констрейнта на module_key в базі немає — напрямок звіряється застосунком.
 * Ключ, якого в реєстрі вже (чи ще) немає, читаємо як «напрямку немає»: пустий
 * чип чесніший за підпис «undefined» і одразу видно, що картку варто глянути.
 */
function asModuleKey(raw: string | null): string | null {
  return isKnownModuleKey(raw) ? raw : null;
}

export function toDevRequest(row: DevRequestRow): DevRequest {
  return {
    id: row.id,
    number: row.number,
    label: formatRequestNumber(row.number),
    teamId: row.team_id,
    title: row.title,
    body: row.body ?? "",
    kind: asKind(row.kind),
    status: asStatus(row.status),
    moduleKey: asModuleKey(row.module_key),
    priority: asPriority(row.priority),
    autoClassified: row.auto_classified ?? false,
    isPrivate: row.is_private,
    authorUserId: row.author_user_id,
    tgUsername: row.tg_username,
    displayName: row.display_name,
    askedByCount: row.asked_by_count,
    createdAt: row.created_at,
  };
}
