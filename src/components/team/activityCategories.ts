// Shared categorization for CRM activity_log rows, used by the team Пульс tab
// and the per-person activity section.
//
// Palette is led by the app's brand blue (var(--brand-*), the same primary the
// rest of the UI uses) — the dominant "Дизайн" category takes the primary, the
// rest are a restrained blue→teal→warm ramp. Deliberately no purple/violet: it
// is not part of this product's palette.
export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  design: { label: "Дизайн", color: "hsl(var(--brand-h) var(--brand-s) var(--brand-l))" },
  quote: { label: "Прорахунки", color: "hsl(199 80% 46%)" },
  order: { label: "Замовлення", color: "hsl(160 50% 40%)" },
  crm: { label: "Клієнти / ліди", color: "hsl(28 78% 52%)" },
  status: { label: "Статуси", color: "hsl(48 68% 47%)" },
  comment: { label: "Коментарі", color: "hsl(215 16% 52%)" },
  other: { label: "Інше", color: "hsl(0 0% 55%)" },
};

export function categorizeAction(
  action: string | null,
  title: string | null,
  entityType?: string | null
): string {
  // entity_type is the most reliable signal (it is set on every real row), and
  // many quote actions are free-form Ukrainian phrases that the text heuristics
  // below would otherwise misfile (e.g. "змінив статус" on a quote → "Статуси").
  const e = (entityType ?? "").trim().toLowerCase();
  if (e.startsWith("design_task")) return "design";
  if (e.startsWith("quote")) return "quote";
  if (e.startsWith("order")) return "order";
  if (e.startsWith("customer") || e.startsWith("lead") || e.startsWith("client")) return "crm";

  const a = (action ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  if (a.includes("design") || t.includes("дизайн") || t.includes("макет")) return "design";
  if (a.includes("quote") || t.includes("прорахун") || t.includes("кошторис")) return "quote";
  if (a.includes("order") || t.includes("замовлен")) return "order";
  if (a.includes("comment") || t.includes("комент")) return "comment";
  if (a.includes("customer") || a.includes("lead") || a.includes("client") || t.includes("клієнт") || t.includes("лід")) return "crm";
  if (a.includes("status") || t.includes("статус")) return "status";
  return "other";
}

export function categoryColor(key: string) {
  return CATEGORY_META[key]?.color ?? CATEGORY_META.other.color;
}

export function categoryLabel(key: string) {
  return CATEGORY_META[key]?.label ?? key;
}

// Fine-grained readable label per specific activity_log `action`. Used to group
// a person's events into scannable buckets ("Статус дизайну ×5", "Коментарі ×8")
// instead of a flat "статус змінено" stream.
const ACTION_LABELS: Record<string, string> = {
  design_task_status: "Статус дизайну",
  design_task_estimate: "Оцінка дизайну",
  design_task_assignment: "Виконавець",
  design_task_collaborators: "Співвиконавці",
  design_task_manager: "Менеджер задачі",
  design_task_title: "Назва задачі",
  design_task_deadline: "Дедлайн",
  design_task_type: "Тип задачі",
  design_task_brief_version: "Версія ТЗ",
  design_task_brief_change_request: "Правка ТЗ",
  design_task_attachment: "Вкладення",
  design_task_duplicated: "Дублювання задачі",
  design_task_timer: "Таймер",
  design_output_upload: "Завантаження макета",
  design_output_selection: "Вибір макета",
  design_task: "Дизайн-задача",
  comment: "Коментар",
};

// System/noise rows that are not a meaningful person action (e.g. a promo banner
// impression with an empty title) — filtered out of activity views.
const NOISE_ACTIONS = new Set(["telegram_promo_shown"]);

export function isNoiseActivity(action: string | null, title: string | null): boolean {
  const a = (action ?? "").trim().toLowerCase();
  if (NOISE_ACTIONS.has(a)) return true;
  if (!a && !(title ?? "").trim()) return true;
  return false;
}

export function actionLabel(action: string | null): string {
  const raw = (action ?? "").trim();
  const a = raw.toLowerCase();
  if (!raw) return "Інше";
  if (ACTION_LABELS[a]) return ACTION_LABELS[a];
  if (a.startsWith("quote")) return "Прорахунок";
  if (a.startsWith("order")) return "Замовлення";
  if (a.includes("customer") || a.includes("lead") || a.includes("client")) return "Клієнт / лід";
  // Many actions are already human-readable Ukrainian phrases
  // ("змінив статус", "прорахував тиражі", "створив задачу") — use them directly.
  if (/[а-яіїєґ]/i.test(raw)) return raw.charAt(0).toUpperCase() + raw.slice(1);
  if (a.includes("status")) return "Зміна статусу";
  if (a.includes("comment")) return "Коментар";
  return "Дія в CRM";
}

// Human label for the entity an event touched (for a context chip / link).
export function entityLabel(entityType: string | null): string | null {
  // activity_log stores both singular and plural forms (e.g. entity_type
  // "design_task" but "quotes"), so match on prefix rather than exact value.
  const e = (entityType ?? "").trim().toLowerCase();
  if (!e) return null;
  if (e.startsWith("design_task")) return "Дизайн-задача";
  if (e.startsWith("quote")) return "Прорахунок";
  if (e.startsWith("order")) return "Замовлення";
  if (e.startsWith("customer") || e.startsWith("client")) return "Клієнт";
  if (e.startsWith("lead")) return "Лід";
  return null;
}
