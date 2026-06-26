import {
  CheckCircle2,
  Hourglass,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { DesignStatus } from "@/lib/designTaskStatus";

/** Іконка статусу дизайн-задачі — та сама, що в колонках канбану. */
export const DESIGN_STATUS_ICON_BY_STATUS: Record<DesignStatus, LucideIcon> = {
  new: Plus,
  changes: RefreshCw,
  in_progress: PlayCircle,
  pm_review: ShieldCheck,
  client_review: Hourglass,
  approved: CheckCircle2,
  cancelled: XCircle,
};

/** Колір іконки статусу (tone-токени) — той самий, що в канбані. */
export const DESIGN_STATUS_ICON_COLOR_BY_STATUS: Record<DesignStatus, string> = {
  new: "text-muted-foreground",
  changes: "text-warning-foreground",
  in_progress: "text-info-foreground",
  pm_review: "tone-text-accent",
  client_review: "text-warning-foreground",
  approved: "text-success-foreground",
  cancelled: "text-danger-foreground",
};
