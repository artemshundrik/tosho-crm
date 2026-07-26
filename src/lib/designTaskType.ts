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
