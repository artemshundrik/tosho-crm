// Shared categorization for CRM activity_log rows, used by the team Пульс tab
// and the per-person activity section. Muted categorical palette (moderate
// saturation, no neon) so the breakdown stays readable in light and dark.

export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  design: { label: "Дизайн", color: "hsl(262 45% 58%)" },
  quote: { label: "Прорахунки", color: "hsl(219 80% 56%)" },
  order: { label: "Замовлення", color: "hsl(160 50% 42%)" },
  crm: { label: "Клієнти / ліди", color: "hsl(199 65% 46%)" },
  status: { label: "Статуси", color: "hsl(28 80% 52%)" },
  comment: { label: "Коментарі", color: "hsl(48 75% 50%)" },
  other: { label: "Інше", color: "hsl(0 0% 55%)" },
};

export function categorizeAction(action: string | null, title: string | null): string {
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
  const e = (entityType ?? "").toLowerCase();
  if (e === "design_task") return "Дизайн-задача";
  if (e === "quote") return "Прорахунок";
  if (e === "order") return "Замовлення";
  if (e === "customer") return "Клієнт";
  if (e === "lead") return "Лід";
  return null;
}
