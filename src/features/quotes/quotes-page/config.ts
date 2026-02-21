import type { ComponentType } from "react";
import {
  Check,
  CheckCircle2,
  Hourglass,
  Layers,
  PlayCircle,
  PlusCircle,
  Printer,
  Shirt,
  XCircle,
} from "lucide-react";

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

export const statusIcons: Record<string, ComponentType<{ className?: string }>> = {
  new: PlusCircle,
  estimating: PlayCircle,
  estimated: Check,
  awaiting_approval: Hourglass,
  approved: CheckCircle2,
  cancelled: XCircle,
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

export const statusColorClass: Record<string, string> = {
  new: "text-muted-foreground",
  estimating: "text-sky-400",
  estimated: "text-violet-400",
  awaiting_approval: "text-amber-400",
  approved: "text-emerald-400",
  cancelled: "text-rose-400",
};

export const KANBAN_COLUMNS = [
  { id: "new", label: statusLabels.new, dotClass: "bg-muted-foreground/60" },
  { id: "estimating", label: statusLabels.estimating, dotClass: "bg-sky-400" },
  { id: "estimated", label: statusLabels.estimated, dotClass: "bg-violet-400" },
  { id: "awaiting_approval", label: statusLabels.awaiting_approval, dotClass: "bg-amber-400" },
  { id: "approved", label: statusLabels.approved, dotClass: "bg-emerald-400" },
  { id: "cancelled", label: statusLabels.cancelled, dotClass: "bg-rose-400" },
];

export type OwnershipOption = {
  value: string;
  label: string;
};

export type VatOption = {
  value: string;
  label: string;
  rate: number | null;
};

export const OWNERSHIP_OPTIONS: OwnershipOption[] = [
  { value: "tov", label: "ТОВ" },
  { value: "pp", label: "ПП" },
  { value: "vp", label: "ВП" },
  { value: "at", label: "АТ" },
  { value: "dp", label: "ДП" },
  { value: "fop", label: "ФОП" },
];

export const VAT_OPTIONS: VatOption[] = [
  { value: "none", label: "немає", rate: null },
  { value: "0", label: "0%", rate: 0 },
  { value: "7", label: "7%", rate: 7 },
  { value: "14", label: "14%", rate: 14 },
  { value: "20", label: "20%", rate: 20 },
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

export type PrintConfig = {
  id: string;
  methodId: string;
  positionId: string;
  widthMm: string;
  heightMm: string;
};

export type DeliveryDetailsForm = {
  region: string;
  city: string;
  address: string;
  street: string;
  npDeliveryType: string;
  payer: string;
};

export const emptyDeliveryDetails = (): DeliveryDetailsForm => ({
  region: "",
  city: "",
  address: "",
  street: "",
  npDeliveryType: "",
  payer: "",
});

export const createPrintConfig = (): PrintConfig => ({
  id: crypto.randomUUID(),
  methodId: "",
  positionId: "",
  widthMm: "",
  heightMm: "",
});

export const QUOTE_TYPE_OPTIONS = [
  { id: "merch", label: "Мерч", icon: Shirt },
  { id: "print", label: "Поліграфія", icon: Printer },
  { id: "other", label: "Інше", icon: Layers },
];

export const DELIVERY_TYPE_OPTIONS = [
  { id: "nova_poshta", label: "Нова пошта" },
  { id: "pickup", label: "Самовивіз" },
  { id: "taxi", label: "Таксі / Uklon" },
  { id: "cargo", label: "Вантажне перевезення" },
];

export const quoteTypeLabel = (value?: string | null) =>
  QUOTE_TYPE_OPTIONS.find((item) => item.id === value)?.label ?? "Не вказано";

export const quoteTypeIcon = (value?: string | null) =>
  QUOTE_TYPE_OPTIONS.find((item) => item.id === value)?.icon;

export const QUOTE_ATTACHMENTS_BUCKET =
  (import.meta.env.VITE_SUPABASE_ITEM_VISUAL_BUCKET as string | undefined) || "attachments";
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024;

export const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};
