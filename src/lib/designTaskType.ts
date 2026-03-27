import {
  Copy,
  Image,
  Layers3,
  PanelsTopLeft,
  Presentation,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export const DESIGN_TASK_TYPE_OPTIONS = [
  { value: "visualization", label: "Візуалізація" },
  { value: "presentation", label: "Презентація" },
  { value: "layout_adaptation", label: "Адаптація макету" },
  { value: "visualization_layout_adaptation", label: "Візуал + адаптація макету" },
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
  visualization_layout_adaptation: Layers3,
  layout: PanelsTopLeft,
  creative: Sparkles,
};

export const parseDesignTaskType = (value: unknown): DesignTaskType | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as DesignTaskType;
  return normalized in DESIGN_TASK_TYPE_LABELS ? normalized : null;
};
