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
import { Chip } from "@/components/ui/chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { AvatarBase } from "@/components/app/avatar-kit";
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

export type LeadFormState = {
  companyName: string;
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
  <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground">{children}</h4>
);

const getInitials = (value?: string) => {
  if (!value) return "ЛД";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ЛД";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
};

const POSITION_OPTIONS = [
  "Директор",
  "Власник",
  "Адміністратор",
  "Маркетолог",
  "Керівник відділу маркетингу",
  "Директор з маркетингу",
  "Менеджер відділу закупівель",
  "Офіс-менеджер",
  "Секретар",
];

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
  const [section, setSection] = React.useState<"basic" | "requisites" | "communication" | "related">(
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
      <SheetContent className="w-full sm:max-w-[540px] overflow-y-auto p-0 flex flex-col">
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

        <div className="flex flex-wrap items-center gap-2">
          <Popover open={ownershipOpen} onOpenChange={setOwnershipOpen}>
            <PopoverTrigger asChild>
              <Chip
                size="md"
                icon={<Building2 className="h-4 w-4" />}
                active={!!form.ownershipType}
              >
                {currentOwnership?.label ?? "Тип контрагента"}
              </Chip>
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

          <Popover open={logoOpen} onOpenChange={setLogoOpen}>
            <PopoverTrigger asChild>
              <Chip
                size="md"
                icon={<ImageIcon className="h-4 w-4" />}
                active={!!displayedLogoUrl}
              >
                {hasInvalidLogoUrl ? "Лого невалідне" : displayedLogoUrl ? "Лого додано" : "Лого"}
              </Chip>
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

          <Popover open={managerOpen} onOpenChange={setManagerOpen}>
            <PopoverTrigger asChild>
              <Chip
                size="md"
                icon={
                  selectedManager ? (
                    <AvatarBase
                      src={selectedManager.avatarUrl ?? null}
                      name={selectedManager.label}
                      fallback={selectedManager.label.slice(0, 2).toUpperCase()}
                      size={20}
                      className="border-border/60"
                      fallbackClassName="text-[10px] font-semibold"
                    />
                  ) : (
                    <User className="h-4 w-4" />
                  )
                }
                active={!!form.manager.trim()}
              >
                {form.manager.trim() || "Менеджер"}
              </Chip>
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
        </div>

        <div className="rounded-md border border-border/50 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
          {[form.companyName || "Без назви", form.manager || "Без менеджера", form.reminderDate || "Без нагадування"]
            .filter(Boolean)
            .join(" • ")}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/10 p-1.5">
            <span className="text-xs text-muted-foreground">Режим форми</span>
            <div className="inline-flex items-center gap-1 rounded-md bg-background p-1">
              <Button
                type="button"
                size="sm"
                variant={quickMode ? "secondary" : "ghost"}
                className="h-7 px-2 text-xs"
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
                className="h-7 px-2 text-xs"
                onClick={() => setQuickMode(false)}
              >
                Повна картка
              </Button>
            </div>
          </div>

          {quickMode ? (
            <div className="space-y-4">
              <SectionHeader>Основне</SectionHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>{isFopOwnership ? "ПІБ *" : "Назва компанії *"}</Label>
                    <Input
                      value={form.companyName}
                      onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))}
                      placeholder={isFopOwnership ? "Напр. Берновська Ольга Василівна" : "Назва компанії"}
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Джерело *</Label>
                    <Input
                      value={form.source}
                      onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
                      placeholder="Звідки отримали контакт"
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Імʼя *</Label>
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
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="name@company.com"
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex h-8 items-center justify-between">
                      <Label>Телефон *</Label>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={addPhone}>
                        <PlusCircle className="mr-1 h-4 w-4" />
                        Додати номер
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {form.phones.map((phone, index) => (
                        <div key={`phone-${index}`} className="flex items-center gap-2">
                          <Input
                            value={phone}
                            onChange={(e) => updatePhone(index, e.target.value)}
                            placeholder="+380..."
                            className="h-9"
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
              <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => setQuickMode(false)}>
                Відкрити повну картку
              </Button>
            </div>
          ) : (
            <Tabs value={section} onValueChange={(value) => setSection(value as typeof section)} className="w-full">
              <TabsList className={cn("w-fit", SEGMENTED_GROUP_SM)}>
                <TabsTrigger value="basic" className={cn(SEGMENTED_TRIGGER_SM, "px-2.5 text-xs")}>Основне</TabsTrigger>
                <TabsTrigger value="requisites" className={cn(SEGMENTED_TRIGGER_SM, "px-2.5 text-xs")}>Реквізити</TabsTrigger>
                <TabsTrigger value="communication" className={cn(SEGMENTED_TRIGGER_SM, "px-2.5 text-xs")}>Комунікація</TabsTrigger>
                <TabsTrigger value="related" className={cn(SEGMENTED_TRIGGER_SM, "px-2.5 text-xs")}>
                  Пов'язане
                  <span className="ml-1 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                    {relatedTotalCount}
                  </span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-3 mt-3">
                <SectionHeader>Компанія</SectionHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>{isFopOwnership ? "ПІБ *" : "Назва компанії *"}</Label>
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
                        placeholder={isFopOwnership ? "@brandname" : "https://"}
                        className="h-9"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Джерело *</Label>
                      <Input
                        value={form.source}
                        onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
                        placeholder="Звідки отримали контакт"
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>

                <SectionHeader>Контакти</SectionHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Імʼя *</Label>
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
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="name@company.com"
                        className="h-9"
                      />
                    </div>
                    <div className="grid gap-2">
                      <div className="flex h-8 items-center justify-between">
                        <Label>Телефон *</Label>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={addPhone}>
                          <PlusCircle className="mr-1 h-4 w-4" />
                          Додати номер
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {form.phones.map((phone, index) => (
                          <div key={`phone-${index}`} className="flex items-center gap-2">
                            <Input
                              value={phone}
                              onChange={(e) => updatePhone(index, e.target.value)}
                              placeholder="+380..."
                              className="h-9"
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
              </TabsContent>

              <TabsContent value="requisites" className="space-y-3 mt-3">
                <SectionHeader>Реквізити</SectionHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>{isFopOwnership ? "ІПН" : "ЄДРПОУ / ІПН"}</Label>
                      <Input
                        value={form.taxId}
                        onChange={(e) => setForm((prev) => ({ ...prev, taxId: e.target.value }))}
                        placeholder={isFopOwnership ? "ІПН" : "Код або ІПН"}
                        className="h-9"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>IBAN</Label>
                      <Input
                        value={form.iban}
                        onChange={(e) => setForm((prev) => ({ ...prev, iban: e.target.value }))}
                        placeholder="UA..."
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>{isFopOwnership ? "Прописка" : "Юридична адреса"}</Label>
                    <Textarea
                      value={form.legalAddress}
                      onChange={(e) => setForm((prev) => ({ ...prev, legalAddress: e.target.value }))}
                      placeholder={isFopOwnership ? "Адреса прописки ФОП" : "Юридична адреса компанії"}
                      className="min-h-[76px]"
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
              </TabsContent>

              <TabsContent value="communication" className="space-y-3 mt-3">
                <SectionHeader>Нагадування</SectionHeader>
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
                    <Textarea
                      value={form.reminderComment}
                      onChange={(e) => setForm((prev) => ({ ...prev, reminderComment: e.target.value }))}
                      placeholder="Що треба зробити"
                      className="min-h-16"
                    />
                  </div>
                </div>

                <SectionHeader>Подія</SectionHeader>
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
                    <Textarea
                      value={form.eventComment}
                      onChange={(e) => setForm((prev) => ({ ...prev, eventComment: e.target.value }))}
                      placeholder="Контекст події"
                      className="min-h-16"
                    />
                  </div>
                </div>

                <SectionHeader>Коментарі</SectionHeader>
                <div className="grid gap-2">
                  <Label>Загальні коментарі</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Що замовляє, коли, важливі деталі комунікації..."
                    className="min-h-16"
                  />
                </div>
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
