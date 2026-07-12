import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { POSITION_OPTIONS } from "@/components/customers/positionOptions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { Calendar } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { SourceSelect } from "./customerSources";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";
import { normalizeCustomerLogoUrl } from "@/lib/customerLogo";
import type { ImageUploadMode } from "@/types/catalog";
import { SurfaceSkeleton } from "@/components/app/loading-primitives";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { statusLabels as quoteStatusLabels, statusClasses as quoteStatusClasses } from "@/features/quotes/quotes-page/config";
import { DESIGN_STATUS_LABELS } from "@/lib/designTaskStatus";
import { DESIGN_TASK_TYPE_ICONS, DESIGN_TASK_TYPE_LABELS, parseDesignTaskType } from "@/lib/designTaskType";
import { Building2, CalendarIcon, Check, Image as ImageIcon, PlusCircle, Trash2, User, UserPlus } from "lucide-react";
import { PackageCheck, ReceiptText } from "lucide-react";
import { createEmptyCustomerDeliveryPoint, type CustomerDeliveryPoint } from "@/lib/customerDeliveryPoints";
import { DeliveryPointsSection } from "@/components/customers/DeliveryPointsSection";
import { IbanInput } from "@/components/customers/IbanInput";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { DigitsInput } from "@/components/ui/digits-input";
import { normalizeSiteUrl } from "@/lib/inputFormat";

export type LeadFormState = {
  companyName: string;
  paymentType: "invoice" | "cash";
  legalName: string;
  ownershipType: string;
  firstName: string;
  lastName: string;
  email: string;
  phones: string[];
  source: string;
  website: string;
  logoUrl: string;
  logoFile: File | null;
  logoUploadMode: ImageUploadMode;
  manager: string;
  managerId: string;
  taxId: string;
  legalAddress: string;
  iban: string;
  signatoryName: string;
  signatoryPosition: string;
  reminderDate: string;
  reminderTime: string;
  reminderComment: string;
  eventName: string;
  eventDate: string;
  eventComment: string;
  notes: string;
  deliveryPoints: CustomerDeliveryPoint[];
};

export type LeadLinkedItem = {
  id: string;
  number?: string | null;
  title?: string | null;
  status?: string | null;
  total?: number | null;
  subtitle?: string | null;
  created_at?: string | null;
};

export type LeadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: LeadFormState;
  setForm: React.Dispatch<React.SetStateAction<LeadFormState>>;
  ownershipOptions?: Array<{
    value: string;
    label: string;
    description?: string;
    group?: string;
  }>;
  teamMembers?: Array<{
    id: string;
    label: string;
    avatarUrl?: string | null;
  }>;
  saving?: boolean;
  error?: string | null;
  title?: string;
  description?: string;
  submitLabel?: string;
  secondarySubmitLabel?: string;
  onSecondarySubmit?: () => void;
  onSubmit: () => void;
  calculations?: LeadLinkedItem[];
  orders?: LeadLinkedItem[];
  designTasks?: LeadLinkedItem[];
  linkedLoading?: boolean;
  onOpenCalculation?: (id: string) => void;
  onOpenOrder?: (id: string) => void;
  onOpenDesignTask?: (id: string) => void;
};

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h4>
);

/** Elevated section surface: a titled card on the dark canvas for depth + grouping. */
const SectionCard = ({
  title,
  action,
  children,
  className,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={cn("rounded-xl border border-border/50 bg-card/40 p-4 shadow-sm", className)}>
    {title ? (
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-border/40 pb-2.5">
        <SectionHeader>{title}</SectionHeader>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    ) : null}
    {children}
  </section>
);

const UNDERLINE_TAB =
  "h-auto shrink-0 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-2.5 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:ring-0";

const getInitials = (value?: string) => {
  if (!value) return "ЛД";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ЛД";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
};

const normalizeTime = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (!digits) return "";

  let hour = 0;
  let minute = 0;
  if (digits.length <= 2) {
    hour = Number(digits);
  } else if (digits.length === 3) {
    hour = Number(digits.slice(0, 1));
    minute = Number(digits.slice(1));
  } else {
    hour = Number(digits.slice(0, 2));
    minute = Number(digits.slice(2));
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  hour = Math.max(0, Math.min(23, hour));
  minute = Math.max(0, Math.min(59, minute));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const formatLinkedMoney = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(value);
};

const orderStatusLabels: Record<string, string> = {
  new: "Нове",
  awaiting_payment: "Очікує оплату",
  paid: "Оплачено",
  not_shipped: "Не відвантажено",
  shipped: "Відвантажено",
};

export const LeadDialog: React.FC<LeadDialogProps> = ({
  open,
  onOpenChange,
  form,
  setForm,
  ownershipOptions = [],
  teamMembers = [],
  saving = false,
  error,
  title = "Новий лід",
  description = "Додайте контакт ліда для подальшої роботи.",
  submitLabel = "Створити ліда",
  secondarySubmitLabel,
  onSecondarySubmit,
  onSubmit,
  calculations = [],
  orders = [],
  designTasks = [],
  linkedLoading = false,
  onOpenCalculation,
  onOpenOrder,
  onOpenDesignTask,
}) => {
  const relatedTotalCount = calculations.length + orders.length + designTasks.length;
  const [ownershipOpen, setOwnershipOpen] = React.useState(false);
  const [logoOpen, setLogoOpen] = React.useState(false);
  const [managerOpen, setManagerOpen] = React.useState(false);
  const [reminderDateOpen, setReminderDateOpen] = React.useState(false);
  const [eventDateOpen, setEventDateOpen] = React.useState(false);
  const [quickMode, setQuickMode] = React.useState(true);
  const [section, setSection] = React.useState<"basic" | "requisites" | "communication" | "logistics" | "related">(
    "basic"
  );
  const normalizedLogoUrl = React.useMemo(() => normalizeCustomerLogoUrl(form.logoUrl), [form.logoUrl]);
  const [logoPreviewUrl, setLogoPreviewUrl] = React.useState<string | null>(null);
  const hasInvalidLogoUrl = React.useMemo(
    () => form.logoUploadMode === "url" && Boolean(form.logoUrl.trim()) && !normalizedLogoUrl,
    [form.logoUploadMode, form.logoUrl, normalizedLogoUrl]
  );
  const displayedLogoUrl = form.logoUploadMode === "file" ? logoPreviewUrl : normalizedLogoUrl;
  const currentYear = React.useMemo(() => new Date().getFullYear(), []);
  const currentOwnership = ownershipOptions.find((option) => option.value === form.ownershipType);
  const isFopOwnership = form.ownershipType === "fop";
  const groupedOwnershipOptions = React.useMemo(() => {
    const groups = new Map<string, NonNullable<LeadDialogProps["ownershipOptions"]>>();
    ownershipOptions.forEach((option) => {
      const groupName = option.group ?? "Інше";
      const next = groups.get(groupName) ?? [];
      next.push(option);
      groups.set(groupName, next);
    });
    return Array.from(groups.entries());
  }, [ownershipOptions]);

  const hasManagerInList = teamMembers.some((member) => member.id === form.managerId || member.label === form.manager);
  const selectedManager =
    teamMembers.find((member) => member.id === form.managerId) ??
    teamMembers.find((member) => member.label === form.manager);
  const reminderDateValue = React.useMemo(
    () => (form.reminderDate ? new Date(`${form.reminderDate}T00:00:00`) : undefined),
    [form.reminderDate]
  );
  const eventDateValue = React.useMemo(
    () => (form.eventDate ? new Date(`${form.eventDate}T00:00:00`) : undefined),
    [form.eventDate]
  );

  React.useEffect(() => {
    if (!open) {
      setOwnershipOpen(false);
      setLogoOpen(false);
      setManagerOpen(false);
      setReminderDateOpen(false);
      setEventDateOpen(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!form.logoFile) {
      setLogoPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(form.logoFile);
    setLogoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [form.logoFile]);

  const updatePhone = (index: number, value: string) => {
    setForm((prev) => ({
      ...prev,
      phones: prev.phones.map((phone, i) => (i === index ? value : phone)),
    }));
  };

  const addPhone = () => {
    setForm((prev) => ({ ...prev, phones: [...prev.phones, ""] }));
  };

  const removePhone = (index: number) => {
    setForm((prev) => {
      if (prev.phones.length <= 1) return prev;
      return { ...prev, phones: prev.phones.filter((_, i) => i !== index) };
    });
  };

  const addDeliveryPoint = () => {
    setForm((prev) => ({
      ...prev,
      deliveryPoints: [
        ...prev.deliveryPoints,
        { ...createEmptyCustomerDeliveryPoint(), isDefault: prev.deliveryPoints.length === 0 },
      ],
    }));
  };

  const removeDeliveryPoint = (index: number) => {
    setForm((prev) => {
      const next = prev.deliveryPoints.filter((_, i) => i !== index);
      if (next.length > 0 && !next.some((point) => point.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return { ...prev, deliveryPoints: next };
    });
  };

  const updateDeliveryPoint = (index: number, patch: Partial<CustomerDeliveryPoint>) => {
    setForm((prev) => ({
      ...prev,
      deliveryPoints: prev.deliveryPoints.map((point, i) => (i === index ? { ...point, ...patch } : point)),
    }));
  };

  const setDefaultDeliveryPoint = (index: number) => {
    setForm((prev) => ({
      ...prev,
      deliveryPoints: prev.deliveryPoints.map((point, i) => ({ ...point, isDefault: i === index })),
    }));
  };

  const handleReminderTimeChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    const masked = digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
    setForm((prev) => ({ ...prev, reminderTime: masked }));
  };

  const handleReminderTimeBlur = () => {
    setForm((prev) => ({ ...prev, reminderTime: normalizeTime(prev.reminderTime) }));
  };

  const formatOwnershipOptionText = (option: NonNullable<LeadDialogProps["ownershipOptions"]>[number]) =>
    option.description ? `${option.label} (${option.description})` : option.label;

  const renderLinkedCard = React.useCallback(
    (
      row: LeadLinkedItem,
      kind: "quote" | "order" | "design",
      onOpen?: (id: string) => void
    ) => {
      const quoteStatusKey = (row.status ?? "new").toLowerCase();
      const designType = parseDesignTaskType(row.subtitle?.replace(/^Тип:\s*/i, "") ?? null);
      const DesignTypeIcon = designType ? DESIGN_TASK_TYPE_ICONS[designType] : null;
      const title = row.number ?? row.title ?? "Без номера";
      const dateLabel = row.created_at ? new Date(row.created_at).toLocaleDateString("uk-UA") : "без дати";
      const amountLabel = formatLinkedMoney(row.total);
      const statusLabel =
        kind === "quote"
          ? quoteStatusLabels[quoteStatusKey] ?? row.status ?? "Новий"
          : kind === "design"
            ? DESIGN_STATUS_LABELS[(quoteStatusKey as keyof typeof DESIGN_STATUS_LABELS) ?? "new"] ?? row.status ?? "Новий"
            : orderStatusLabels[quoteStatusKey] ?? row.status ?? "Нове";

      return (
        <button
          key={row.id}
          type="button"
          onClick={() => onOpen?.(row.id)}
          className="w-full rounded-xl border border-border/50 bg-card px-3 py-3 text-left transition-colors hover:bg-muted/30"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {kind === "quote" ? <ReceiptText className="h-4 w-4 text-muted-foreground" /> : null}
                {kind === "order" ? <PackageCheck className="h-4 w-4 text-muted-foreground" /> : null}
                {kind === "design" && DesignTypeIcon ? <DesignTypeIcon className="h-4 w-4 text-muted-foreground" /> : null}
                <div className="truncate font-medium">{title}</div>
              </div>
              {row.title && row.number ? <div className="mt-1 truncate text-xs text-muted-foreground">{row.title}</div> : null}
            </div>
            <div
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                kind === "quote" ? (quoteStatusClasses[quoteStatusKey] ?? "border-border bg-muted/30 text-muted-foreground") : "border-border bg-muted/30 text-muted-foreground"
              )}
            >
              {statusLabel}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {kind === "design" && designType ? (
              <span className="rounded-full border border-border/60 px-2 py-0.5">
                {DESIGN_TASK_TYPE_LABELS[designType]}
              </span>
            ) : null}
            {amountLabel ? <span className="rounded-full border border-border/60 px-2 py-0.5">{amountLabel}</span> : null}
            <span className="rounded-full border border-border/60 px-2 py-0.5">{dateLabel}</span>
          </div>
        </button>
      );
    },
    []
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[820px] overflow-y-auto p-0 flex flex-col">
        <div className="px-6 py-4 border-b shrink-0 bg-muted/20">
          <SheetHeader>
            <SheetTitle className="text-base font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              {title}
            </SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </SheetHeader>
        </div>
        
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

        {/* Identity header — logo + name + payment + manager hub */}
        <div className="flex items-start gap-4 rounded-xl border border-border/50 bg-card/40 p-4 shadow-sm">
          <Popover open={logoOpen} onOpenChange={setLogoOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Змінити лого"
                className="group relative shrink-0 rounded-full ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {displayedLogoUrl || form.logoUrl.trim() ? (
                  <EntityAvatar
                    src={displayedLogoUrl ?? form.logoUrl ?? null}
                    name={form.companyName || "Лід"}
                    fallback={getInitials(form.companyName || `${form.firstName} ${form.lastName}`.trim())}
                    size={56}
                    fallbackClassName="text-sm font-semibold"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border/50 bg-muted/40 text-muted-foreground/70">
                    <Building2 className="h-6 w-6" />
                  </div>
                )}
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                  <ImageIcon className="h-4 w-4 text-white" />
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-3" align="start">
              <div className="flex items-center gap-3">
                {displayedLogoUrl ? (
                  <img
                    src={displayedLogoUrl}
                    alt={form.companyName || "logo"}
                    className="h-12 w-12 rounded-full object-cover border border-border/60 bg-muted/20"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full border border-border/60 bg-muted/20 text-xs font-semibold text-muted-foreground flex items-center justify-center">
                    {getInitials(form.companyName || `${form.firstName} ${form.lastName}`.trim())}
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="inline-flex items-center gap-1 rounded-md bg-muted p-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={form.logoUploadMode === "url" ? "secondary" : "ghost"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setForm((prev) => ({ ...prev, logoUploadMode: "url", logoFile: null }))}
                    >
                      URL
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={form.logoUploadMode === "file" ? "secondary" : "ghost"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setForm((prev) => ({ ...prev, logoUploadMode: "file", logoUrl: "" }))}
                    >
                      Файл
                    </Button>
                  </div>
                  {form.logoUploadMode === "url" ? (
                    <Input
                      value={form.logoUrl}
                      onChange={(e) => setForm((prev) => ({ ...prev, logoUrl: e.target.value, logoFile: null }))}
                      placeholder="Посилання на логотип"
                      className="h-9"
                    />
                  ) : (
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setForm((prev) => ({ ...prev, logoFile: file, logoUrl: "" }));
                          e.currentTarget.value = "";
                        }}
                      />
                      <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                        {form.logoFile ? form.logoFile.name : "Оберіть файл логотипа"}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {hasInvalidLogoUrl ? (
                <div className="mt-2 text-xs text-destructive">
                  Вкажіть звичайний URL. `data:image/...;base64,...` більше не підтримується.
                </div>
              ) : null}
              {form.logoUploadMode === "url" && normalizedLogoUrl ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  При збереженні CRM спробує завантажити картинку, конвертує її у WebP `128x128` і збереже у storage.
                </div>
              ) : null}
              {form.logoUploadMode === "file" ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  Файл буде конвертовано у WebP `128x128` і збережено у storage.
                </div>
              ) : null}
              {(form.logoUrl.trim() || form.logoFile) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 px-2 text-xs"
                  onClick={() => setForm((prev) => ({ ...prev, logoUrl: "", logoFile: null }))}
                >
                  Очистити
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-lg font-semibold tracking-tight text-foreground">
                {form.companyName.trim() || "Новий лід"}
              </div>
              <div className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border/50 bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, paymentType: "invoice" }))}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                    form.paymentType === "invoice"
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Рахунок
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, paymentType: "cash" }))}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                    form.paymentType === "cash"
                      ? "bg-[hsl(var(--accent-tone-foreground)/0.15)] text-[hsl(var(--accent-tone-foreground))]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Готівка
                </button>
              </div>
            </div>
            {form.paymentType === "cash" ? (
              <div className="mt-1 text-[11px] text-[hsl(var(--accent-tone-foreground))]">
                Готівка — реквізити необовʼязкові
              </div>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Popover open={managerOpen} onOpenChange={setManagerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground"
                    title="Змінити менеджера"
                  >
                    {selectedManager ? (
                      <AvatarBase
                        src={selectedManager.avatarUrl ?? null}
                        name={selectedManager.label}
                        fallback={selectedManager.label.slice(0, 2).toUpperCase()}
                        size={18}
                        className="border-border/60 shrink-0"
                        fallbackClassName="text-[9px] font-semibold"
                      />
                    ) : (
                      <User className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">
                      {form.manager.trim() ? `Менеджер: ${form.manager.trim()}` : "Додати менеджера"}
                    </span>
                  </button>
                </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="space-y-1">
                {form.manager && !hasManagerInList ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 h-9 text-sm truncate"
                    onClick={() => setManagerOpen(false)}
                  >
                    <AvatarBase
                      src={null}
                      name={form.manager}
                      fallback={form.manager.slice(0, 2).toUpperCase()}
                      size={20}
                      className="border-border/60 shrink-0"
                      fallbackClassName="text-[10px] font-semibold"
                    />
                    <span className="truncate">{form.manager}</span>
                  </Button>
                ) : null}
                {teamMembers.length > 0 ? (
                  teamMembers.map((member) => (
                    <Button
                      key={member.id}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 h-9 text-sm truncate"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, manager: member.label, managerId: member.id }));
                        setManagerOpen(false);
                      }}
                      title={member.label}
                    >
                      <AvatarBase
                        src={member.avatarUrl ?? null}
                        name={member.label}
                        fallback={member.label.slice(0, 2).toUpperCase()}
                        size={20}
                        className="border-border/60 shrink-0"
                        fallbackClassName="text-[10px] font-semibold"
                      />
                      <span className="truncate">{member.label}</span>
                      <Check
                        className={cn(
                          "ml-auto h-3.5 w-3.5 text-primary",
                          form.managerId === member.id || form.manager === member.label ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </Button>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground p-2">Немає менеджерів</div>
                )}
                {form.manager.trim() ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-sm text-muted-foreground"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, manager: "", managerId: "" }));
                      setManagerOpen(false);
                    }}
                  >
                    Очистити
                  </Button>
                ) : null}
              </div>
            </PopoverContent>
              </Popover>
              <Popover open={ownershipOpen} onOpenChange={setOwnershipOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground"
                    title="Тип контрагента"
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{currentOwnership?.label ?? "Тип контрагента"}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-2" align="start">
                  <div className="space-y-2">
                    {groupedOwnershipOptions.map(([groupName, options]) => (
                      <div key={groupName} className="space-y-1">
                        <div className="px-2 pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {groupName}
                        </div>
                        {options.map((option) => (
                          <Button
                            key={option.value}
                            variant="ghost"
                            size="sm"
                            className="h-auto min-h-9 w-full justify-start gap-2 py-2 text-left"
                            onClick={() => {
                              setForm((prev) => ({ ...prev, ownershipType: option.value }));
                              setOwnershipOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mt-0.5 h-3.5 w-3.5 shrink-0 text-primary",
                                form.ownershipType === option.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="text-sm leading-5">{formatOwnershipOptionText(option)}</span>
                          </Button>
                        ))}
                      </div>
                    ))}
                    {form.ownershipType ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start h-9 text-sm text-muted-foreground"
                        onClick={() => {
                          setForm((prev) => ({ ...prev, ownershipType: "" }));
                          setOwnershipOpen(false);
                        }}
                      >
                        Очистити
                      </Button>
                    ) : null}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="inline-flex shrink-0 items-center gap-0.5 self-start rounded-md bg-background p-0.5">
            <Button
              type="button"
              size="sm"
              variant={quickMode ? "secondary" : "ghost"}
              className="h-7 px-2.5 text-xs"
              onClick={() => {
                setQuickMode(true);
                setSection("basic");
              }}
            >
              Швидко
            </Button>
            <Button
              type="button"
              size="sm"
              variant={!quickMode ? "secondary" : "ghost"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setQuickMode(false)}
            >
              Повна
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {quickMode ? (
            <div className="space-y-4">
              <SectionCard title="Основне">
              <div className="space-y-3">
                <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>{isFopOwnership ? "ПІБ" : "Назва компанії"} <span className="text-destructive">*</span></Label>
                    <Input
                      value={form.companyName}
                      onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))}
                      placeholder={isFopOwnership ? "Напр. Берновська Ольга Василівна" : "Назва компанії"}
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Джерело <span className="text-destructive">*</span></Label>
                    <SourceSelect
                      value={form.source}
                      onChange={(value) => setForm((prev) => ({ ...prev, source: value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Імʼя <span className="text-destructive">*</span></Label>
                    <Input
                      value={form.firstName}
                      onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                      placeholder="Імʼя"
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Прізвище</Label>
                    <Input
                      value={form.lastName}
                      onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                      placeholder="Прізвище"
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <div className="flex h-8 items-center">
                      <Label>Email</Label>
                    </div>
                    <EmailInput
                      value={form.email}
                      onChange={(email) => setForm((prev) => ({ ...prev, email }))}
                      placeholder="name@company.com"
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex h-8 items-center justify-between">
                      <Label>Телефон <span className="text-destructive">*</span></Label>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={addPhone}>
                        <PlusCircle className="mr-1 h-4 w-4" />
                        Додати номер
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {form.phones.map((phone, index) => (
                        <div key={`phone-${index}`} className="flex items-center gap-2">
                          <PhoneInput
                            value={phone}
                            onChange={(value) => updatePhone(index, value)}
                            className="flex-1 min-w-0"
                          />
                          {form.phones.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0"
                              onClick={() => removePhone(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              </SectionCard>
              <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => setQuickMode(false)}>
                Відкрити повну картку
              </Button>
            </div>
          ) : (
            <Tabs value={section} onValueChange={(value) => setSection(value as typeof section)} className="w-full">
              <TabsList className="mb-4 h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-0 border-b border-border/40 bg-transparent p-0 shadow-none">
                <TabsTrigger value="basic" className={UNDERLINE_TAB}>Основне</TabsTrigger>
                <TabsTrigger value="requisites" className={UNDERLINE_TAB}>Реквізити</TabsTrigger>
                <TabsTrigger value="communication" className={UNDERLINE_TAB}>Комунікація</TabsTrigger>
                <TabsTrigger value="logistics" className={UNDERLINE_TAB}>
                  Логістика
                  {form.deliveryPoints.length > 0 ? (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                      {form.deliveryPoints.length}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="related" className={UNDERLINE_TAB}>
                  Пов'язане
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                    {relatedTotalCount}
                  </span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-3 mt-3">
                <SectionCard title="Компанія">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>{isFopOwnership ? "ПІБ" : "Назва компанії"} <span className="text-destructive">*</span></Label>
                      <Input
                        value={form.companyName}
                        onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))}
                        placeholder={isFopOwnership ? "Напр. Берновська Ольга Василівна" : "Назва компанії"}
                        className="h-9"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>{isFopOwnership ? "Назва бренду" : "Юридична назва"}</Label>
                      <Input
                        value={form.legalName}
                        onChange={(e) => setForm((prev) => ({ ...prev, legalName: e.target.value }))}
                        placeholder={isFopOwnership ? "Напр. EDLIGHT" : "Повна юридична назва"}
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>{isFopOwnership ? "Instagram" : "Сайт компанії"}</Label>
                      <Input
                        value={form.website}
                        onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
                        onBlur={() => setForm((prev) => ({ ...prev, website: normalizeSiteUrl(prev.website) }))}
                        placeholder={isFopOwnership ? "@brandname" : "https://"}
                        className="h-9"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Джерело <span className="text-destructive">*</span></Label>
                      <SourceSelect
                        value={form.source}
                        onChange={(value) => setForm((prev) => ({ ...prev, source: value }))}
                      />
                    </div>
                  </div>
                </div>
                </SectionCard>

                <SectionCard title="Контакти">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Імʼя <span className="text-destructive">*</span></Label>
                      <Input
                        value={form.firstName}
                        onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                        placeholder="Імʼя"
                        className="h-9"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Прізвище</Label>
                      <Input
                        value={form.lastName}
                        onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                        placeholder="Прізвище"
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <div className="flex h-8 items-center">
                        <Label>Email</Label>
                      </div>
                      <EmailInput
                        value={form.email}
                        onChange={(email) => setForm((prev) => ({ ...prev, email }))}
                        placeholder="name@company.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <div className="flex h-8 items-center justify-between">
                        <Label>Телефон <span className="text-destructive">*</span></Label>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={addPhone}>
                          <PlusCircle className="mr-1 h-4 w-4" />
                          Додати номер
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {form.phones.map((phone, index) => (
                          <div key={`phone-${index}`} className="flex items-center gap-2">
                            <PhoneInput
                              value={phone}
                              onChange={(value) => updatePhone(index, value)}
                              className="flex-1 min-w-0"
                            />
                            {form.phones.length > 1 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0"
                                onClick={() => removePhone(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                </SectionCard>
              </TabsContent>

              <TabsContent value="requisites" className="space-y-3 mt-3">
                <SectionCard title="Реквізити">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>{isFopOwnership ? "ІПН" : "ЄДРПОУ / ІПН"}</Label>
                      <DigitsInput
                        value={form.taxId}
                        onChange={(taxId) => setForm((prev) => ({ ...prev, taxId }))}
                        maxLength={12}
                        placeholder={isFopOwnership ? "ІПН" : "Код або ІПН"}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>IBAN <span className="text-[10px] font-normal text-muted-foreground">не обовʼязково</span></Label>
                      <IbanInput value={form.iban} onChange={(iban) => setForm((prev) => ({ ...prev, iban }))} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>{isFopOwnership ? "Прописка" : "Юридична адреса"}</Label>
                    <AutoTextarea
                      value={form.legalAddress}
                      onChange={(e) => setForm((prev) => ({ ...prev, legalAddress: e.target.value }))}
                      placeholder={isFopOwnership ? "Адреса прописки ФОП" : "Юридична адреса компанії"}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Підписант</Label>
                      <Input
                        value={form.signatoryName}
                        onChange={(e) => setForm((prev) => ({ ...prev, signatoryName: e.target.value }))}
                        placeholder="ПІБ підписанта"
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Посада підписанта</Label>
                    <Select
                      value={form.signatoryPosition}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, signatoryPosition: value }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Оберіть посаду" />
                      </SelectTrigger>
                      <SelectContent>
                        {POSITION_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                </SectionCard>
              </TabsContent>

              <TabsContent value="communication" className="space-y-3 mt-3">
                <SectionCard title="Нагадування">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Дата</Label>
                    <Popover open={reminderDateOpen} onOpenChange={setReminderDateOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "h-9 w-full justify-start px-3 text-sm font-normal",
                            !form.reminderDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.reminderDate && reminderDateValue
                            ? format(reminderDateValue, "d MMM yyyy", { locale: uk })
                            : "Оберіть дату"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-fit max-w-[calc(100vw-2rem)] p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={reminderDateValue}
                          onSelect={(date) => {
                            setForm((prev) => ({
                              ...prev,
                              reminderDate: date ? format(date, "yyyy-MM-dd") : "",
                            }));
                            setReminderDateOpen(false);
                          }}
                          captionLayout="dropdown-buttons"
                          fromYear={currentYear - 3}
                          toYear={currentYear + 5}
                          initialFocus
                        />
                        <DateQuickActions
                          onSelect={(date) => {
                            setForm((prev) => ({
                              ...prev,
                              reminderDate: date ? format(date, "yyyy-MM-dd") : "",
                            }));
                            setReminderDateOpen(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid gap-2">
                    <Label>Час</Label>
                    <Input
                      value={form.reminderTime}
                      onChange={(e) => handleReminderTimeChange(e.target.value)}
                      onBlur={handleReminderTimeBlur}
                      placeholder="HH:MM"
                      inputMode="numeric"
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2 col-span-2">
                    <Label>Коментар нагадування</Label>
                    <AutoTextarea
                      value={form.reminderComment}
                      onChange={(e) => setForm((prev) => ({ ...prev, reminderComment: e.target.value }))}
                      placeholder="Що треба зробити"
                    />
                  </div>
                </div>
                </SectionCard>

                <SectionCard title="Подія">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Назва події</Label>
                    <Input
                      value={form.eventName}
                      onChange={(e) => setForm((prev) => ({ ...prev, eventName: e.target.value }))}
                      placeholder="Річниця, конференція, захід..."
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Дата події</Label>
                    <Popover open={eventDateOpen} onOpenChange={setEventDateOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "h-9 w-full justify-start px-3 text-sm font-normal",
                            !form.eventDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.eventDate && eventDateValue
                            ? format(eventDateValue, "d MMM yyyy", { locale: uk })
                            : "Оберіть дату"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-fit max-w-[calc(100vw-2rem)] p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={eventDateValue}
                          onSelect={(date) => {
                            setForm((prev) => ({
                              ...prev,
                              eventDate: date ? format(date, "yyyy-MM-dd") : "",
                            }));
                            setEventDateOpen(false);
                          }}
                          captionLayout="dropdown-buttons"
                          fromYear={currentYear - 3}
                          toYear={currentYear + 5}
                          initialFocus
                        />
                        <DateQuickActions
                          onSelect={(date) => {
                            setForm((prev) => ({
                              ...prev,
                              eventDate: date ? format(date, "yyyy-MM-dd") : "",
                            }));
                            setEventDateOpen(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid gap-2 col-span-2">
                    <Label>Коментар події</Label>
                    <AutoTextarea
                      value={form.eventComment}
                      onChange={(e) => setForm((prev) => ({ ...prev, eventComment: e.target.value }))}
                      placeholder="Контекст події"
                    />
                  </div>
                </div>
                </SectionCard>

                <SectionCard title="Коментарі">
                <div className="grid gap-2">
                  <Label>Загальні коментарі</Label>
                  <AutoTextarea
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Що замовляє, коли, важливі деталі комунікації..."
                  />
                </div>
                </SectionCard>
              </TabsContent>

              <TabsContent value="logistics" className="space-y-3 mt-3">
                <DeliveryPointsSection
                  points={form.deliveryPoints}
                  onAdd={addDeliveryPoint}
                  onRemove={removeDeliveryPoint}
                  onUpdate={updateDeliveryPoint}
                  onSetDefault={setDefaultDeliveryPoint}
                  defaultEdrpou={form.taxId}
                />
              </TabsContent>

              <TabsContent value="related" className="space-y-3 mt-3">
                <SectionHeader>Пов'язані сутності</SectionHeader>
                <Tabs defaultValue="calculations" className="w-full">
            <TabsList className={cn("w-fit", SEGMENTED_GROUP_SM)}>
              <TabsTrigger value="calculations" className={cn(SEGMENTED_TRIGGER_SM, "px-2.5 text-xs")}>
                Прорахунки
                <span className="ml-1 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                  {calculations.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="orders" className={cn(SEGMENTED_TRIGGER_SM, "px-2.5 text-xs")}>
                Замовлення
                <span className="ml-1 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                  {orders.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="design" className={cn(SEGMENTED_TRIGGER_SM, "px-2.5 text-xs")}>
                Дизайн
                <span className="ml-1 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                  {designTasks.length}
                </span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="calculations" className="mt-3">
              {linkedLoading ? (
                <SurfaceSkeleton label="Завантажуємо прорахунки..." rows={3} compact className="border-none bg-transparent p-0" />
              ) : calculations.length === 0 ? (
                <div className="text-sm text-muted-foreground">Поки немає прорахунків.</div>
              ) : (
                <div className="space-y-1.5">
                  {calculations.map((row) => renderLinkedCard(row, "quote", onOpenCalculation))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="orders" className="mt-3">
              {linkedLoading ? (
                <SurfaceSkeleton label="Завантажуємо замовлення..." rows={3} compact className="border-none bg-transparent p-0" />
              ) : orders.length === 0 ? (
                <div className="text-sm text-muted-foreground">Поки немає замовлень.</div>
              ) : (
                <div className="space-y-1.5">
                  {orders.map((row) => renderLinkedCard(row, "order", onOpenOrder))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="design" className="mt-3">
              {linkedLoading ? (
                <SurfaceSkeleton label="Завантажуємо дизайн-задачі..." rows={3} compact className="border-none bg-transparent p-0" />
              ) : designTasks.length === 0 ? (
                <div className="text-sm text-muted-foreground">Поки немає дизайн-задач.</div>
              ) : (
                <div className="space-y-1.5">
                  {designTasks.map((row) => renderLinkedCard(row, "design", onOpenDesignTask))}
                </div>
              )}
            </TabsContent>
                </Tabs>
              </TabsContent>
            </Tabs>
          )}

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        </div>

        <div className="px-6 py-4 border-t shrink-0 bg-background">
          <SheetFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Скасувати
            </Button>
            {onSecondarySubmit && secondarySubmitLabel ? (
              <Button variant="secondary" onClick={onSecondarySubmit} disabled={saving}>
                {saving ? "Збереження..." : secondarySubmitLabel}
              </Button>
            ) : null}
            <Button onClick={onSubmit} disabled={saving}>
              {saving ? "Збереження..." : submitLabel}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
};
