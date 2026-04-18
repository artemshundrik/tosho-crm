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
  new: "tone-neutral",
  estimating: "tone-info",
  estimated: "tone-accent",
  awaiting_approval: "tone-warning",
  approved: "tone-success",
  cancelled: "tone-danger",
};

export const statusColorClass: Record<string, string> = {
  new: "text-muted-foreground",
  estimating: "tone-text-info",
  estimated: "tone-text-accent",
  awaiting_approval: "tone-text-warning",
  approved: "tone-text-success",
  cancelled: "tone-text-danger",
};

export const KANBAN_COLUMNS = [
  { id: "new", label: statusLabels.new, dotClass: "bg-muted-foreground/60" },
  { id: "estimating", label: statusLabels.estimating, dotClass: "tone-dot-info" },
  { id: "estimated", label: statusLabels.estimated, dotClass: "tone-dot-accent" },
  { id: "awaiting_approval", label: statusLabels.awaiting_approval, dotClass: "tone-dot-warning" },
  { id: "approved", label: statusLabels.approved, dotClass: "tone-dot-success" },
  { id: "cancelled", label: statusLabels.cancelled, dotClass: "tone-dot-danger" },
];

export type OwnershipOption = {
  value: string;
  label: string;
  description?: string;
  group?: string;
};

export type VatOption = {
  value: string;
  label: string;
  rate: number | null;
};

export const OWNERSHIP_OPTIONS: OwnershipOption[] = [
  { value: "tov", label: "ТОВ", description: "Товариство з обмеженою відповідальністю", group: "Бізнес" },
  { value: "pp", label: "ПП", description: "Приватне підприємство", group: "Бізнес" },
  { value: "vp", label: "ВП", description: "Відокремлений підрозділ", group: "Бізнес" },
  { value: "go", label: "ГО", description: "Громадська організація", group: "Бізнес" },
  { value: "at", label: "АТ", description: "Акціонерне товариство", group: "Бізнес" },
  { value: "du", label: "ДУ", description: "Державна установа", group: "Державний сектор" },
  { value: "ku", label: "КУ", description: "Комунальна установа", group: "Державний сектор" },
  { value: "dp", label: "ДП", description: "Державне підприємство", group: "Державний сектор" },
  { value: "kp", label: "КП", description: "Комунальне підприємство", group: "Державний сектор" },
  { value: "odv", label: "ОДВ", description: "Орган державної влади", group: "Державний сектор" },
  { value: "oms", label: "ОМС", description: "Орган місцевого самоврядування", group: "Державний сектор" },
  { value: "fop", label: "ФОП", description: "Фізична особа-підприємець", group: "Фізичні особи" },
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
