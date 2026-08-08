import { moduleKeyLabel } from "@/lib/projectMap";
import { KIND_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "./types";

/**
 * Історія змін картки запиту: як прочитати те, що пише аудит-тригер.
 *
 * У базі це сирий рядок `{"priority": {"from": "normal", "to": "high"}}` — з
 * назвами колонок і значеннями як вони лежать у таблиці. Людині цього читати
 * не можна, тож весь переклад зібраний тут, окремо від верстки й під тестами:
 * саме такі мапи тихо розходяться з рештою застосунку, коли десь додається
 * новий статус чи тип.
 */

/** Запис аудиту, як його віддає tosho.get_audit_log. */
export type AuditEntry = {
  id: number;
  actorUserId: string | null;
  actorName: string | null;
  /** insert | update | delete */
  action: string;
  changed: Record<string, { from: unknown; to: unknown }>;
  createdAt: string;
};

export type AuditChangeLine = {
  field: string;
  label: string;
  from: string;
  to: string;
};

/**
 * Технічні колонки, які людині нічого не кажуть.
 *
 * Ховаємо чорним списком, а не білим: невідоме поле краще показати сирою
 * назвою, ніж мовчки з'їсти. Втрачена зміна в історії гірша за некрасивий
 * рядок — по історії з'ясовують, хто що зробив.
 */
const HIDDEN_FIELDS = new Set([
  "id",
  "number",
  "team_id",
  "workspace_id",
  "created_by",
  "author_user_id",
  "tg_user_id",
]);

const FIELD_LABELS: Record<string, string> = {
  title: "Тема",
  body: "Опис",
  kind: "Тип",
  status: "Стан на дошці",
  module_key: "Напрямок",
  priority: "Пріоритет",
  is_private: "Доступ",
  auto_classified: "Класифікацію підтверджено",
  asked_by_count: "Скільки просили",
  tg_username: "Нікнейм автора",
  display_name: "Ім'я автора",
};

/** Скільки символів тексту лишаємо в рядку історії. */
const VALUE_LIMIT = 80;

export function auditFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function truncate(value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > VALUE_LIMIT ? `${text.slice(0, VALUE_LIMIT - 1)}…` : text;
}

/**
 * Значення поля людською мовою.
 *
 * Підписи беруться з тих самих мап, що й решта розділу (KIND_LABELS,
 * STATUS_LABELS, PRIORITY_LABELS, реєстр модулів) — свого списку рядків тут
 * немає, інакше перейменований статус розійшовся б із дошкою.
 *
 * `auto_classified` навмисно читається навпаки: у базі це «класифікацію
 * поставив агент і ніхто не звіряв», а людині цікаве протилежне — чи вже
 * підтвердили.
 */
export function auditValueLabel(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "порожньо";

  switch (field) {
    case "kind":
      return KIND_LABELS[value as keyof typeof KIND_LABELS] ?? String(value);
    case "status":
      return STATUS_LABELS[value as keyof typeof STATUS_LABELS] ?? String(value);
    case "priority":
      return PRIORITY_LABELS[value as keyof typeof PRIORITY_LABELS] ?? String(value);
    case "module_key":
      return moduleKeyLabel(value) ?? String(value);
    case "is_private":
      return value ? "лише власник і СЕО" : "вся команда";
    case "auto_classified":
      return value ? "ні, поставив агент" : "так, підтверджено людиною";
    default:
      break;
  }

  if (typeof value === "boolean") return value ? "так" : "ні";
  if (typeof value === "object") return truncate(JSON.stringify(value));
  return truncate(String(value));
}

/** Рядки «поле: було → стало» для одного запису аудиту. */
export function auditChangeLines(entry: AuditEntry): AuditChangeLine[] {
  const changed = entry.changed ?? {};
  return Object.keys(changed)
    .filter((field) => !HIDDEN_FIELDS.has(field))
    .map((field) => ({
      field,
      label: auditFieldLabel(field),
      from: auditValueLabel(field, changed[field]?.from),
      to: auditValueLabel(field, changed[field]?.to),
    }));
}

/** Що сталося, коли переліку полів немає (створення, видалення). */
export function auditActionLabel(action: string): string {
  if (action === "insert") return "Картку створено";
  if (action === "delete") return "Картку видалено";
  return "Оновлено";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Розбір відповіді RPC.
 *
 * `get_audit_log` віддає jsonb, тобто для типів це просто `Json` — усе, що
 * прийшло, перевіряємо тут. Запис без id чи дати пропускаємо: краще коротша
 * історія, ніж рядок «undefined» у ній.
 */
export function toAuditEntries(raw: unknown): AuditEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: AuditEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "number" ? item.id : Number(item.id);
    const createdAt = typeof item.createdAt === "string" ? item.createdAt : "";
    if (!Number.isFinite(id) || !createdAt) continue;
    entries.push({
      id,
      actorUserId: typeof item.actorUserId === "string" ? item.actorUserId : null,
      actorName: typeof item.actorName === "string" ? item.actorName : null,
      action: typeof item.action === "string" ? item.action : "update",
      changed: isRecord(item.changed)
        ? (item.changed as Record<string, { from: unknown; to: unknown }>)
        : {},
      createdAt,
    });
  }
  return entries;
}
