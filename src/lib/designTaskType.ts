import {
  Copy,
  Image,
  PanelsTopLeft,
  Presentation,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export const DESIGN_TASK_TYPE_OPTIONS = [
  { value: "visualization", label: "Візуалізація/адаптація" },
  { value: "presentation", label: "Презентація" },
  { value: "layout_adaptation", label: "Адаптація макету" },
  { value: "layout", label: "Верстка" },
  { value: "creative", label: "Креатив" },
] as const;

export type DesignTaskType = (typeof DESIGN_TASK_TYPE_OPTIONS)[number]["value"];

/**
 * Тип, який проставляється сам, коли задачу заводять із вкладки «Дизайн»
 * (REQ-157).
 *
 * ЧОМУ ВЗАГАЛІ ЗАМОВЧУВАННЯ. Вкладка питала тип п'ятьма плашками — і в 6 із 10
 * випадків відповідь була та сама. Заміри 04.09.2026: із 615 задач 392
 * «Візуалізація/адаптація», а за останні 30 днів 39 із 66.
 *
 * ЧОМУ ПОЛЕ ЛИШАЄТЬСЯ. Решта 27 задач за той самий місяць — креатив (12),
 * верстка (7), адаптація макету (5), презентація (3), і заводять їх далі.
 * Тип годує норми часу (`DESIGN_TASK_TYPE_NORM_MINUTES`) у дашборді дизайнерів
 * і у звіті для СЕО, тож прибрати його означало б зламати два звіти заради
 * одного кліка. Прибране саме ПИТАННЯ: значення стоїть, його видно, і воно
 * міняється одним рухом.
 */
export const DEFAULT_DESIGN_TASK_TYPE: DesignTaskType = "visualization";

export const DESIGN_TASK_TYPE_LABELS: Record<DesignTaskType, string> = DESIGN_TASK_TYPE_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label;
    return acc;
  },
  {} as Record<DesignTaskType, string>
);

export const DESIGN_TASK_TYPE_ICONS: Record<DesignTaskType, LucideIcon> = {
  visualization: Image,
  presentation: Presentation,
  layout_adaptation: Copy,
  layout: PanelsTopLeft,
  creative: Sparkles,
};

/**
 * Legacy stored values folded into a current canonical type. The old
 * "Візуал + адаптація макету" (visualization_layout_adaptation) is now merged
 * into the unified "Візуалізація/адаптація" (visualization), so existing tasks
 * render, filter and group identically with no data migration — the value is
 * normalized on read here.
 */
const LEGACY_DESIGN_TASK_TYPE_ALIASES: Record<string, DesignTaskType> = {
  visualization_layout_adaptation: "visualization",
};

/**
 * Норматив часу на ОДНУ задачу типу, у хвилинах.
 *
 * Домовленість із CEO: візуалізація — до 15 хв, адаптація макету — до 30 хв.
 * Типи без норми (презентація, верстка, креатив) свідомо не нормуються: там
 * розкид занадто великий, щоб одне число щось означало. `null` = «норми нема»,
 * і UI тоді просто не малює мітку — не вигадуй значення за замовчуванням.
 *
 * Норма міряється проти СЕРЕДНЬОГО часу задачі типу за таймером (той самий
 * показник, що в блоці «Середній час за типами»).
 */
export const DESIGN_TASK_TYPE_NORM_MINUTES: Record<DesignTaskType, number | null> = {
  visualization: 15,
  layout_adaptation: 30,
  presentation: null,
  layout: null,
  creative: null,
};

export const parseDesignTaskType = (value: unknown): DesignTaskType | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized in LEGACY_DESIGN_TASK_TYPE_ALIASES) return LEGACY_DESIGN_TASK_TYPE_ALIASES[normalized];
  return normalized in DESIGN_TASK_TYPE_LABELS ? (normalized as DesignTaskType) : null;
};
