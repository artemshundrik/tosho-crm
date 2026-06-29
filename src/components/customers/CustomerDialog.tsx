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
import { DropboxIcon } from "@/components/icons/DropboxIcon";
import { POSITION_OPTIONS } from "@/components/customers/positionOptions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { SourceSelect } from "./customerSources";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";
import { normalizeCustomerLogoUrl } from "@/lib/customerLogo";
import type { ImageUploadMode } from "@/types/catalog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
// LTV (MVP, frontend-only): summary card data — purely additive props.
import {
  buildCustomerLtvTooltip,
  RFM_SEGMENT_LABELS,
  RFM_SEGMENT_TONE,
  type CustomerLtvEntry,
  type RfmSegment,
} from "@/lib/customerLtv";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { SurfaceSkeleton } from "@/components/app/loading-primitives";
import {
  createEmptyCustomerLegalEntity,
  formatOwnershipTypeLabel,
  formatCustomerLegalEntitySummary,
  formatVatRateLabel,
  getCustomerLegalEntityDocumentMissingFields,
  hasCustomerLegalEntityIdentity,
  type CustomerLegalEntity,
} from "@/lib/customerLegalEntities";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { statusLabels as quoteStatusLabels, statusClasses as quoteStatusClasses } from "@/features/quotes/quotes-page/config";
import { DESIGN_STATUS_LABELS } from "@/lib/designTaskStatus";
import { DESIGN_TASK_TYPE_ICONS, DESIGN_TASK_TYPE_LABELS, parseDesignTaskType } from "@/lib/designTaskType";
import {
  CalendarIcon,
  Image as ImageIcon,
  Loader2,
  PlusCircle,
  Trash2,
  Unlink,
  User,
  UserPlus,
  PackageCheck,
  ReceiptText,
  Building2,
} from "lucide-react";

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

export type CustomerPaymentType = "invoice" | "cash";

export type CustomerFormState = {
  name: string;
  paymentType: CustomerPaymentType;
  source: string;
  manager: string;
  managerId: string;
  website: string;
  logoUrl: string;
  logoFile: File | null;
  logoUploadMode: ImageUploadMode;
  legalEntities: CustomerLegalEntity[];
  contacts: CustomerContact[];
  reminderDate: string;
  reminderTime: string;
  reminderComment: string;
  eventName: string;
  eventDate: string;
  eventComment: string;
  notes: string;
  accountantName: string;
  accountantEmail: string;
  accountantEdrpou: string;
};

export type CustomerContact = {
  name: string;
  position: string;
  phone: string;
  email: string;
  birthday: string;
  telegram: string;
};

export type { CustomerLegalEntity } from "@/lib/customerLegalEntities";

export type CustomerLinkedItem = {
  id: string;
  number?: string | null;
  title?: string | null;
  status?: string | null;
  total?: number | null;
  subtitle?: string | null;
  created_at?: string | null;
};

export type CustomerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CustomerFormState;
  setForm: React.Dispatch<React.SetStateAction<CustomerFormState>>;
  ownershipOptions: OwnershipOption[];
  vatOptions: VatOption[];
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
  onSubmit: () => void;
  calculations?: CustomerLinkedItem[];
  orders?: CustomerLinkedItem[];
  designTasks?: CustomerLinkedItem[];
  linkedLoading?: boolean;
  onOpenCalculation?: (id: string) => void;
  onOpenOrder?: (id: string) => void;
  onOpenDesignTask?: (id: string) => void;
  isDropboxLinked?: boolean;
  dropboxAction?: "open" | "create" | "attach" | "detach" | null;
  onOpenClientFiles?: () => void;
  onCreateDropboxFolder?: () => void;
  onAttachDropboxFolder?: () => void;
  onDetachDropboxFolder?: () => void;
  // LTV (MVP): optional. When provided, a "Lifetime Value" card renders at the
  // top of the "Пов'язані сутності" tab. Pass `null`/`undefined` to hide.
  ltvEntry?: CustomerLtvEntry | null;
  ltvSegment?: RfmSegment;
};

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
    {children}
  </h4>
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
  if (!value) return "Не вказано";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Не вказано";
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

const formatBirthdayForInput = (value: string) => {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${day}.${month}.${year}`;
  }
  return trimmed;
};

const normalizeBirthdayInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
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

export const CustomerDialog: React.FC<CustomerDialogProps> = ({
  open,
  onOpenChange,
  form,
  setForm,
  ownershipOptions,
  vatOptions,
  teamMembers = [],
  saving = false,
  error,
  title = "Новий замовник",
  description = "Додайте всі дані замовника, щоб одразу підхопити їх у прорахунку.",
  submitLabel = "Створити замовника",
  onSubmit,
  calculations = [],
  orders = [],
  designTasks = [],
  linkedLoading = false,
  onOpenCalculation,
  onOpenOrder,
  onOpenDesignTask,
  isDropboxLinked = false,
  dropboxAction = null,
  onOpenClientFiles,
  onCreateDropboxFolder,
  onAttachDropboxFolder,
  onDetachDropboxFolder,
  ltvEntry,
  ltvSegment,
}) => {
  const currentYear = React.useMemo(() => new Date().getFullYear(), []);
  const primaryLegalEntity = form.legalEntities[0] ?? createEmptyCustomerLegalEntity();
  const isFopOwnership = primaryLegalEntity.ownershipType === "fop";
  const [logoOpen, setLogoOpen] = React.useState(false);
  const [managerOpen, setManagerOpen] = React.useState(false);
  const [reminderDateOpen, setReminderDateOpen] = React.useState(false);
  const [eventDateOpen, setEventDateOpen] = React.useState(false);
  const [activeLegalEntityId, setActiveLegalEntityId] = React.useState<string | null>(null);
  const [section, setSection] = React.useState<"basic" | "legalEntities" | "communication" | "accountant" | "related">(
    "basic"
  );
  const [quickMode, setQuickMode] = React.useState(true);
  const normalizedLogoUrl = React.useMemo(() => normalizeCustomerLogoUrl(form.logoUrl), [form.logoUrl]);
  const [logoPreviewUrl, setLogoPreviewUrl] = React.useState<string | null>(null);
  const hasInvalidLogoUrl = React.useMemo(
    () => form.logoUploadMode === "url" && Boolean(form.logoUrl.trim()) && !normalizedLogoUrl,
    [form.logoUploadMode, form.logoUrl, normalizedLogoUrl]
  );
  const displayedLogoUrl = form.logoUploadMode === "file" ? logoPreviewUrl : normalizedLogoUrl;
  const relatedTotalCount = calculations.length + orders.length + designTasks.length;

  const reminderDateValue = React.useMemo(
    () => (form.reminderDate ? new Date(`${form.reminderDate}T00:00:00`) : undefined),
    [form.reminderDate]
  );
  const eventDateValue = React.useMemo(
    () => (form.eventDate ? new Date(`${form.eventDate}T00:00:00`) : undefined),
    [form.eventDate]
  );

  const selectedManager =
    teamMembers.find((member) => member.id === form.managerId) ??
    teamMembers.find((member) => member.label === form.manager);
  const groupedOwnershipOptions = React.useMemo(() => {
    const groups = new Map<string, OwnershipOption[]>();
    ownershipOptions.forEach((option) => {
      const groupName = option.group ?? "Інше";
      const next = groups.get(groupName) ?? [];
      next.push(option);
      groups.set(groupName, next);
    });
    return Array.from(groups.entries());
  }, [ownershipOptions]);
  const activeOwnershipType =
    form.legalEntities.find((entity) => entity.id === activeLegalEntityId)?.ownershipType ??
    primaryLegalEntity.ownershipType;
  const activeOwnershipOption = ownershipOptions.find((option) => option.value === activeOwnershipType);

  const renderLinkedCard = React.useCallback(
    (
      row: CustomerLinkedItem,
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

  React.useEffect(() => {
    if (!open) {
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

  React.useEffect(() => {
    if (form.legalEntities.length === 0) {
      setActiveLegalEntityId(null);
      return;
    }
    if (!activeLegalEntityId || !form.legalEntities.some((entity) => entity.id === activeLegalEntityId)) {
      setActiveLegalEntityId(form.legalEntities[0]?.id ?? null);
    }
  }, [activeLegalEntityId, form.legalEntities]);

  const handleReminderTimeChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    const masked = digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
    setForm((prev) => ({ ...prev, reminderTime: masked }));
  };

  const handleReminderTimeBlur = () => {
    setForm((prev) => ({ ...prev, reminderTime: normalizeTime(prev.reminderTime) }));
  };

  const updateContact = (index: number, patch: Partial<CustomerContact>) => {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact, i) => (i === index ? { ...contact, ...patch } : contact)),
    }));
  };

  const updateLegalEntity = (index: number, patch: Partial<CustomerLegalEntity>) => {
    setForm((prev) => ({
      ...prev,
      legalEntities: prev.legalEntities.map((entity, entityIndex) =>
        entityIndex === index ? { ...entity, ...patch } : entity
      ),
    }));
  };

  // Оновлення частини ПІБ підписанта: одразу перераховуємо combined signatoryName,
  // який тягнеться у договір/СП (відмінювання + ініціали).
  const updateSignatoryName = (
    index: number,
    patch: Partial<Pick<CustomerLegalEntity, "signatoryLastName" | "signatoryFirstName" | "signatoryMiddleName">>
  ) => {
    setForm((prev) => ({
      ...prev,
      legalEntities: prev.legalEntities.map((entity, entityIndex) => {
        if (entityIndex !== index) return entity;
        const next = { ...entity, ...patch };
        const signatoryName = [next.signatoryLastName, next.signatoryFirstName, next.signatoryMiddleName]
          .map((part) => part.trim())
          .filter(Boolean)
          .join(" ");
        return { ...next, signatoryName };
      }),
    }));
  };

  const addLegalEntity = () => {
    const next = createEmptyCustomerLegalEntity();
    setForm((prev) => ({
      ...prev,
      legalEntities: [...prev.legalEntities, next],
    }));
    setActiveLegalEntityId(next.id);
  };

  const removeLegalEntity = (index: number) => {
    setForm((prev) => {
      if (prev.legalEntities.length <= 1) return prev;
      return {
        ...prev,
        legalEntities: prev.legalEntities.filter((_, entityIndex) => entityIndex !== index),
      };
    });
  };

  const formatOwnershipOptionText = (option: OwnershipOption) =>
    option.description ? `${option.label} (${option.description})` : option.label;

  const activeLegalEntityIndex = Math.max(
    0,
    form.legalEntities.findIndex((entity) => entity.id === activeLegalEntityId)
  );
  const activeLegalEntity = form.legalEntities[activeLegalEntityIndex] ?? form.legalEntities[0] ?? null;
  const activeLegalEntityIsPerson = activeLegalEntity?.ownershipType === "fop";
  const hasMultipleLegalEntities = form.legalEntities.length > 1;
  const contactMissingFields = React.useMemo(() => {
    const hasPhone = form.contacts.some((contact) => contact.phone.trim());
    const hasEmail = form.contacts.some((contact) => contact.email.trim());
    return [
      !hasPhone ? "мобільний номер телефону" : null,
      !hasEmail ? "email" : null,
    ].filter((entry): entry is string => Boolean(entry));
  }, [form.contacts]);
  const activeLegalEntityMissingFields = React.useMemo(
    () => getCustomerLegalEntityDocumentMissingFields(activeLegalEntity),
    [activeLegalEntity]
  );

  const addContact = () => {
    setForm((prev) => ({
      ...prev,
      contacts: [...prev.contacts, { name: "", position: "", phone: "", email: "", birthday: "", telegram: "" }],
    }));
  };

  const removeContact = (index: number) => {
    setForm((prev) => {
      if (prev.contacts.length <= 1) return prev;
      return { ...prev, contacts: prev.contacts.filter((_, i) => i !== index) };
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[640px] overflow-y-auto p-0 flex flex-col">
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
                    name={form.name || "Замовник"}
                    fallback={getInitials(form.name)}
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
                    alt={form.name || "logo"}
                    className="h-12 w-12 rounded-full object-cover border border-border/60 bg-muted/20"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full border border-border/60 bg-muted/20 text-xs font-semibold text-muted-foreground flex items-center justify-center">
                    {getInitials(form.name)}
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
                {form.name.trim() || "Новий замовник"}
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
                Готівка — email і реквізити необовʼязкові
              </div>
            ) : null}
            <Popover open={managerOpen} onOpenChange={setManagerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground"
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

        {isDropboxLinked && onOpenClientFiles ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onOpenClientFiles} disabled={dropboxAction !== null}>
              {dropboxAction === "open" ? <Loader2 className="h-4 w-4 animate-spin" /> : <DropboxIcon className="h-4 w-4 shrink-0" />}
              Відкрити папку Dropbox
            </Button>
            {onDetachDropboxFolder ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-10 px-0 shrink-0"
                onClick={onDetachDropboxFolder}
                disabled={dropboxAction !== null}
                title="Відв'язати папку Dropbox"
                aria-label="Відв'язати папку Dropbox"
              >
                {dropboxAction === "detach" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
              </Button>
            ) : null}
          </div>
        ) : (!isDropboxLinked && (onCreateDropboxFolder || onAttachDropboxFolder)) ? (
          <div className="flex flex-wrap gap-2">
            {onCreateDropboxFolder ? (
              <Button type="button" variant="outline" size="sm" onClick={onCreateDropboxFolder} disabled={dropboxAction !== null}>
                {dropboxAction === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <DropboxIcon className="h-4 w-4 shrink-0" />}
                Створити папку Dropbox
              </Button>
            ) : null}
            {onAttachDropboxFolder ? (
              <Button type="button" variant="outline" size="sm" onClick={onAttachDropboxFolder} disabled={dropboxAction !== null}>
                {dropboxAction === "attach" ? <Loader2 className="h-4 w-4 animate-spin" /> : <DropboxIcon className="h-4 w-4 shrink-0" />}
                Прив'язати папку Dropbox
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          {quickMode ? (
            <div className="space-y-5">
              <SectionCard title="Компанія">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>{isFopOwnership ? "ПІБ" : "Назва компанії"} <span className="text-destructive">*</span></Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder={isFopOwnership ? "Напр. Іваненко Іван Іванович" : "Напр. Кока-Кола"}
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{isFopOwnership ? "Instagram" : "Сайт"}</Label>
                    <Input
                      value={form.website}
                      onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
                      placeholder={isFopOwnership ? "@username або https://instagram.com/username" : "https://"}
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
              </SectionCard>

              <SectionCard title="Контакт">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Імʼя контакту <span className="text-destructive">*</span></Label>
                    <Input
                      value={form.contacts[0]?.name ?? ""}
                      onChange={(e) => updateContact(0, { name: e.target.value })}
                      placeholder="Імʼя та прізвище"
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Телефон <span className="text-destructive">*</span></Label>
                    <Input
                      value={form.contacts[0]?.phone ?? ""}
                      onChange={(e) => updateContact(0, { phone: e.target.value })}
                      placeholder="+380..."
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>
                      Email{" "}
                      {form.paymentType === "invoice" ? (
                        <span className="text-destructive">*</span>
                      ) : (
                        <span className="text-[10px] font-normal text-muted-foreground">необовʼязково</span>
                      )}
                    </Label>
                    <Input
                      type="email"
                      value={form.contacts[0]?.email ?? ""}
                      onChange={(e) => updateContact(0, { email: e.target.value })}
                      placeholder="name@company.com"
                      className="h-9"
                    />
                  </div>
                  {!isFopOwnership ? (
                    <div className="grid gap-2">
                      <Label>Посада</Label>
                      <Select
                        value={form.contacts[0]?.position ?? ""}
                        onValueChange={(value) => updateContact(0, { position: value })}
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
                  ) : null}
                  <div className="grid gap-2">
                    <Label>Telegram</Label>
                    <Input
                      value={form.contacts[0]?.telegram ?? ""}
                      onChange={(e) => updateContact(0, { telegram: e.target.value })}
                      placeholder="@username"
                      className="h-9"
                    />
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
              <TabsTrigger value="legalEntities" className={UNDERLINE_TAB}>Юр. особи</TabsTrigger>
              <TabsTrigger value="communication" className={UNDERLINE_TAB}>Комунікація</TabsTrigger>
              <TabsTrigger value="accountant" className={UNDERLINE_TAB}>Бухгалтер</TabsTrigger>
              <TabsTrigger value="related" className={UNDERLINE_TAB}>
                Пов'язане
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                  {relatedTotalCount}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-3">
              <SectionCard title="Компанія">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>{isFopOwnership ? "ПІБ" : "Назва компанії"} <span className="text-destructive">*</span></Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder={isFopOwnership ? "Напр. Іваненко Іван Іванович" : "Напр. Кока-Кола"}
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{isFopOwnership ? "Instagram" : "Сайт"}</Label>
                    <Input
                      value={form.website}
                      onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
                      placeholder={isFopOwnership ? "@username або https://instagram.com/username" : "https://"}
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
              </SectionCard>

              <SectionCard
                title="Контакти"
                action={
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={addContact}>
                    <PlusCircle className="mr-1 h-4 w-4" />
                    Додати контакт
                  </Button>
                }
              >
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    Додайте кілька контактів: імʼя, номер{isFopOwnership ? "" : ", посада"}, email.
                  </div>
                  {contactMissingFields.length > 0 ? (
                    <div className="rounded-lg border tone-warning-subtle px-3 py-2 text-xs leading-5">
                      Для договору та відправки документів додайте: {contactMissingFields.join(", ")}.
                    </div>
                  ) : null}
                  {form.contacts.map((contact, index) => (
                    <div key={`customer-contact-${index}`} className="space-y-3 rounded-lg border border-border/50 bg-background/40 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-muted-foreground">Контакт {index + 1}</div>
                      {form.contacts.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeContact(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Імʼя контакту <span className="text-destructive">*</span></Label>
                        <Input
                          value={contact.name}
                          onChange={(e) => updateContact(index, { name: e.target.value })}
                          placeholder="Імʼя та прізвище"
                          className="h-9"
                        />
                      </div>
                      {!isFopOwnership ? (
                        <div className="grid gap-2">
                          <Label>Посада</Label>
                          <Select
                            value={contact.position}
                            onValueChange={(value) => updateContact(index, { position: value })}
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
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Номер телефону</Label>
                        <Input
                          value={contact.phone}
                          onChange={(e) => updateContact(index, { phone: e.target.value })}
                          placeholder="+380..."
                          className="h-9"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={contact.email}
                          onChange={(e) => updateContact(index, { email: e.target.value })}
                          placeholder="name@company.com"
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>День народження</Label>
                        <Input
                          value={formatBirthdayForInput(contact.birthday)}
                          onChange={(e) => updateContact(index, { birthday: normalizeBirthdayInput(e.target.value) })}
                          inputMode="numeric"
                          maxLength={10}
                          placeholder="дд.мм або дд.мм.рррр"
                          className="h-9"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Telegram</Label>
                        <Input
                          value={contact.telegram}
                          onChange={(e) => updateContact(index, { telegram: e.target.value })}
                          placeholder="@username"
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              </SectionCard>
            </TabsContent>

            <TabsContent value="legalEntities" className="space-y-3 mt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Додайте реквізити для рахунків і договорів.
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={addLegalEntity}>
                  <PlusCircle className="mr-1 h-4 w-4" />
                  Додати юр. особу
                </Button>
              </div>

              <div className={cn("grid gap-3", hasMultipleLegalEntities ? "lg:grid-cols-[320px_minmax(0,1fr)]" : "grid-cols-1")}>
                {hasMultipleLegalEntities ? (
                  <div className="space-y-2">
                  {form.legalEntities.map((entity, index) => {
                    const isActive = entity.id === activeLegalEntity?.id;
                    const ownershipLabel = formatOwnershipTypeLabel(entity.ownershipType) || "Тип не вказано";
                    const vatLabel = formatVatRateLabel(entity.vatRate);
                    const hasIdentity = hasCustomerLegalEntityIdentity(entity);
                    const isPerson = entity.ownershipType === "fop";
                    const title = entity.legalName.trim() || (hasIdentity ? `Юр. особа ${index + 1}` : "Нова юрособа");

                    return (
                      <button
                        key={entity.id}
                        type="button"
                        onClick={() => setActiveLegalEntityId(entity.id)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                          !hasIdentity
                            ? isActive
                              ? "border-primary/35 border-dashed bg-primary/5 shadow-sm"
                              : "border-dashed border-border/70 bg-muted/10 hover:border-border hover:bg-muted/20"
                            : isActive
                              ? "border-primary/40 bg-primary/5 shadow-sm"
                              : "border-border/60 bg-card hover:border-border hover:bg-muted/20"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">
                                {index === 0 ? "Основна" : `Юр. особа ${index + 1}`}
                            </span>
                            {entity.ownershipType.trim() ? (
                              <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                                {ownershipLabel}
                              </span>
                            ) : null}
                          </div>
                          <div className={cn("mt-1 text-sm", hasIdentity ? "font-medium" : "font-medium text-muted-foreground")}>
                            {title}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {entity.taxId.trim()
                              ? `${isPerson ? "ІПН" : "ЄДРПОУ / ІПН"}: ${entity.taxId.trim()}`
                              : hasIdentity
                                ? "Код не вказано"
                                : "Заповніть тип, назву та код для документів"}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {hasIdentity
                              ? isPerson
                                ? [entity.cardNumber.trim() ? `Карта ${entity.cardNumber.trim()}` : "", entity.iban.trim() ? `IBAN ${entity.iban.trim()}` : ""]
                                    .filter(Boolean)
                                    .join(" • ") || "Реквізити виплати не вказано"
                                : `${vatLabel}${entity.iban.trim() ? ` • ${entity.iban.trim()}` : ""}`
                              : "Натисніть, щоб внести реквізити"}
                          </div>
                        </div>
                        {form.legalEntities.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeLegalEntity(index);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                  </div>
                ) : null}

                {activeLegalEntity ? (
                  <div className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">
                          {form.legalEntities.length === 1
                            ? "Реквізити"
                            : activeLegalEntityIndex === 0
                              ? "Редагування основної юр. особи"
                              : `Редагування юр. особи ${activeLegalEntityIndex + 1}`}
                        </div>
                      </div>
                      {hasMultipleLegalEntities && hasCustomerLegalEntityIdentity(activeLegalEntity) ? (
                        <div className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
                          {formatCustomerLegalEntitySummary(activeLegalEntity)}
                        </div>
                      ) : hasMultipleLegalEntities ? (
                        <div className="rounded-full border border-dashed border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
                          Нова юрособа
                        </div>
                      ) : null}
                    </div>

                    {!hasCustomerLegalEntityIdentity(activeLegalEntity) ? (
                      <div className="mb-4 rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
                        Ця юрособа ще порожня. Вкажіть хоча б тип, назву та код, щоб менеджер міг використовувати її в документах.
                      </div>
                    ) : null}
                    {activeLegalEntityMissingFields.length > 0 ? (
                      <div className="mb-4 rounded-lg border tone-warning-subtle px-3 py-2 text-sm leading-6">
                        <div className="font-medium text-warning-foreground">Реквізити не заповнені повністю</div>
                        <div className="mt-1">Не вистачає: {activeLegalEntityMissingFields.join(", ")}.</div>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="grid min-w-0 gap-2">
                        <Label>Тип контрагента</Label>
                        <Select
                          value={activeLegalEntity.ownershipType}
                          onValueChange={(value) =>
                            updateLegalEntity(activeLegalEntityIndex, {
                              ownershipType: value,
                              ...(value === "fop" ? { vatRate: "none" } : {}),
                            })
                          }
                        >
                          <SelectTrigger className="h-9 min-w-0">
                            <SelectValue placeholder="Оберіть тип">
                              {activeOwnershipOption?.label}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent sideOffset={6} align="start">
                            {groupedOwnershipOptions.map(([groupName, options], groupIndex) => (
                              <React.Fragment key={groupName}>
                                {groupIndex > 0 ? <SelectSeparator /> : null}
                                <SelectGroup>
                                  <SelectLabel className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                                    {groupName}
                                  </SelectLabel>
                                  {options.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {formatOwnershipOptionText(option)}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </React.Fragment>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {!activeLegalEntityIsPerson ? (
                        <div className="grid min-w-0 gap-2">
                          <Label>ПДВ</Label>
                          <Select
                            value={activeLegalEntity.vatRate}
                            onValueChange={(value) => updateLegalEntity(activeLegalEntityIndex, { vatRate: value })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Оберіть ставку" />
                            </SelectTrigger>
                            <SelectContent>
                              {vatOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-2">
                      <Label>{activeLegalEntityIsPerson ? "Назва бренду" : "Юридична назва"}</Label>
                      <Input
                        value={activeLegalEntity.legalName}
                        onChange={(e) => updateLegalEntity(activeLegalEntityIndex, { legalName: e.target.value })}
                        placeholder={activeLegalEntityIsPerson ? "Напр. EDLIGHT" : "Напр. ТОВ «Кока-Кола-Україна Лімітед»"}
                        className="h-9"
                      />
                    </div>

                    {/* ЄДРПОУ та ІПН платника ПДВ — два окремі поля. Для платника ПДВ ІПН обовʼязковий (12 цифр). */}
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>{activeLegalEntityIsPerson ? "ІПН (10 цифр)" : "Код ЄДРПОУ"}</Label>
                        <Input
                          value={activeLegalEntity.taxId}
                          onChange={(e) =>
                            updateLegalEntity(activeLegalEntityIndex, {
                              taxId: e.target.value.replace(/\D/g, "").slice(0, activeLegalEntityIsPerson ? 10 : 8),
                            })
                          }
                          placeholder={activeLegalEntityIsPerson ? "10-значний ІПН" : "8-значний код"}
                          inputMode="numeric"
                          maxLength={activeLegalEntityIsPerson ? 10 : 8}
                          className="h-9"
                        />
                      </div>
                      {!activeLegalEntityIsPerson ? (
                        <div className="grid gap-2">
                          <Label>
                            ІПН платника ПДВ
                            {activeLegalEntity.vatRate !== "none" && activeLegalEntity.vatRate !== "" ? (
                              <span className="text-destructive"> *</span>
                            ) : null}
                          </Label>
                          <Input
                            value={activeLegalEntity.vatId}
                            onChange={(e) =>
                              updateLegalEntity(activeLegalEntityIndex, {
                                vatId: e.target.value.replace(/\D/g, "").slice(0, 12),
                              })
                            }
                            placeholder="12-значний ІПН"
                            inputMode="numeric"
                            maxLength={12}
                            className="h-9"
                          />
                          {activeLegalEntity.vatRate !== "none" && activeLegalEntity.vatRate !== "" ? (
                            activeLegalEntity.vatId.trim() === "" ? (
                              <p className="text-xs text-muted-foreground">
                                Обовʼязково для платника ПДВ — рівно 12 цифр. Без нього не можна створити замовлення.
                              </p>
                            ) : activeLegalEntity.vatId.trim().length !== 12 ? (
                              <p className="text-xs text-destructive">
                                ІПН має містити рівно 12 цифр (зараз {activeLegalEntity.vatId.trim().length}).
                              </p>
                            ) : null
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-2">
                      <Label>{activeLegalEntityIsPerson ? "Прописка" : "Юридична адреса"}</Label>
                      <Textarea
                        value={activeLegalEntity.legalAddress}
                        onChange={(e) => updateLegalEntity(activeLegalEntityIndex, { legalAddress: e.target.value })}
                        placeholder={activeLegalEntityIsPerson ? "Адреса прописки ФОП" : "Юридична адреса компанії"}
                        className="min-h-[76px]"
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {activeLegalEntityIsPerson ? (
                        <div className="grid gap-2">
                          <Label>Номер карти</Label>
                          <Input
                            value={activeLegalEntity.cardNumber}
                            onChange={(e) => updateLegalEntity(activeLegalEntityIndex, { cardNumber: e.target.value })}
                            placeholder="0000 0000 0000 0000"
                            className="h-9"
                          />
                        </div>
                      ) : null}
                      <div className="grid gap-2">
                        <Label>IBAN</Label>
                        <Input
                          value={activeLegalEntity.iban}
                          onChange={(e) => updateLegalEntity(activeLegalEntityIndex, { iban: e.target.value })}
                          placeholder="UA..."
                          className="h-9"
                        />
                      </div>
                    </div>

                    {/* ПІБ підписанта — трьома окремими полями: повне ПІБ тягнеться у договір/СП
                        (правильне відмінювання у родовий + ініціали "І.П. Прізвище"). */}
                    <div className="mt-4 space-y-1.5">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                        {activeLegalEntityIsPerson ? "ПІБ ФОП / підписанта" : "ПІБ підписанта"}
                      </Label>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="grid gap-2">
                          <Label className="text-xs font-normal text-muted-foreground">Прізвище</Label>
                          <Input
                            value={activeLegalEntity.signatoryLastName}
                            onChange={(e) => updateSignatoryName(activeLegalEntityIndex, { signatoryLastName: e.target.value })}
                            placeholder="Напр. Іваненко"
                            className="h-9"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label className="text-xs font-normal text-muted-foreground">Імʼя</Label>
                          <Input
                            value={activeLegalEntity.signatoryFirstName}
                            onChange={(e) => updateSignatoryName(activeLegalEntityIndex, { signatoryFirstName: e.target.value })}
                            placeholder="Напр. Іван"
                            className="h-9"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label className="text-xs font-normal text-muted-foreground">По-батькові</Label>
                          <Input
                            value={activeLegalEntity.signatoryMiddleName}
                            onChange={(e) => updateSignatoryName(activeLegalEntityIndex, { signatoryMiddleName: e.target.value })}
                            placeholder="Напр. Іванович"
                            className="h-9"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 md:max-w-[calc(50%-0.5rem)]">
                      <Label>{activeLegalEntityIsPerson ? "Статус підписанта" : "Посада підписанта"}</Label>
                      <Input
                        value={activeLegalEntity.signatoryPosition}
                        onChange={(e) => updateLegalEntity(activeLegalEntityIndex, { signatoryPosition: e.target.value })}
                        placeholder={activeLegalEntityIsPerson ? "Напр. ФОП" : "Напр. Директор"}
                        className="h-9"
                      />
                    </div>

                    <div className="mt-4 grid gap-2">
                      <Label>Підстава підпису / діяльності</Label>
                      {activeLegalEntityIsPerson ? (
                        <Input
                          value={activeLegalEntity.signatoryAuthority}
                          onChange={(e) => updateLegalEntity(activeLegalEntityIndex, { signatoryAuthority: e.target.value })}
                          placeholder="Напр. Виписки з ЄДР"
                          className="h-9"
                        />
                      ) : (
                        <Select
                          value={activeLegalEntity.signatoryAuthority}
                          onValueChange={(value) => updateLegalEntity(activeLegalEntityIndex, { signatoryAuthority: value })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Оберіть підставу" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Статут">Статут</SelectItem>
                            <SelectItem value="Довіреність">Довіреність</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="communication" className="space-y-4 mt-3">
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
                  <Textarea
                    value={form.reminderComment}
                    onChange={(e) => setForm((prev) => ({ ...prev, reminderComment: e.target.value }))}
                    placeholder="Що треба зробити"
                    className="min-h-16"
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
                  <Textarea
                    value={form.eventComment}
                    onChange={(e) => setForm((prev) => ({ ...prev, eventComment: e.target.value }))}
                    placeholder="Контекст події"
                    className="min-h-16"
                  />
                </div>
              </div>
              </SectionCard>

              <SectionCard title="Коментарі">
              <div className="grid gap-2">
                <Label>Загальні коментарі</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Що замовляє, коли, важливі деталі комунікації..."
                  className="min-h-16"
                />
              </div>
              </SectionCard>
            </TabsContent>

            <TabsContent value="accountant" className="space-y-3 mt-3">
              <SectionCard title="Бухгалтер контрагента">
              <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Дані для відправки документів через «Вчасно»: на який email слати та ЄДРПОУ/ІПН отримувача. Якщо порожньо — підставляється основний email і податковий номер контрагента.
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Email для документів</Label>
                  <Input
                    type="email"
                    value={form.accountantEmail}
                    onChange={(e) => setForm((prev) => ({ ...prev, accountantEmail: e.target.value }))}
                    placeholder="buh@example.com"
                    className="h-9"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>ЄДРПОУ / ІПН отримувача</Label>
                  <Input
                    value={form.accountantEdrpou}
                    onChange={(e) => setForm((prev) => ({ ...prev, accountantEdrpou: e.target.value }))}
                    placeholder="напр. 3247719674"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Бухгалтер / підписант (ПІБ)</Label>
                <Input
                  value={form.accountantName}
                  onChange={(e) => setForm((prev) => ({ ...prev, accountantName: e.target.value }))}
                  placeholder="Імʼя бухгалтера або керівника"
                  className="h-9"
                />
              </div>
              </div>
              </SectionCard>
            </TabsContent>

            <TabsContent value="related" className="space-y-3 mt-3">
              {/* LTV (MVP): summary card. Only renders when caller supplies ltvEntry. */}
              {ltvEntry ? (
                <div className="rounded-[var(--radius-inner)] border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <SectionHeader>Lifetime value</SectionHeader>
                    {ltvSegment && ltvSegment !== "none" ? (
                      <Badge
                        tone={RFM_SEGMENT_TONE[ltvSegment]}
                        variant="outline"
                        className="rounded-full px-2 py-0 text-[10px] font-medium normal-case tracking-normal"
                      >
                        {RFM_SEGMENT_LABELS[ltvSegment]}
                      </Badge>
                    ) : null}
                  </div>
                  <div
                    className="mt-2 flex items-baseline gap-2 tabular-nums"
                    title={buildCustomerLtvTooltip(ltvEntry)}
                  >
                    <span className="text-2xl font-semibold">
                      {new Intl.NumberFormat("uk-UA", {
                        style: "currency",
                        currency: ltvEntry.currency || "UAH",
                        maximumFractionDigits: 0,
                      }).format(ltvEntry.lifetimeRevenue)}
                    </span>
                    {ltvEntry.mixedCurrencies ? (
                      <span className="text-xs text-muted-foreground" title="Є замовлення в інших валютах — показана домінантна">
                        · мульти-валютне
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Замовлень</div>
                      <div className="text-sm text-foreground">{ltvEntry.ordersCount}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Сер. чек</div>
                      <div className="text-sm text-foreground">
                        {new Intl.NumberFormat("uk-UA", {
                          style: "currency",
                          currency: ltvEntry.currency || "UAH",
                          maximumFractionDigits: 0,
                        }).format(ltvEntry.lifetimeRevenue / Math.max(ltvEntry.ordersCount, 1))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Останнє</div>
                      <div className="text-sm text-foreground">
                        {ltvEntry.lastOrderAt
                          ? format(new Date(ltvEntry.lastOrderAt), "dd.MM.yyyy", { locale: uk })
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Тиша</div>
                      <div className="text-sm text-foreground">
                        {ltvEntry.lastOrderAt
                          ? `${Math.floor((Date.now() - new Date(ltvEntry.lastOrderAt).getTime()) / 86400000)} дн`
                          : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    Сума по всіх замовленнях клієнта. Без врахування собівартості та повернень.
                  </div>
                </div>
              ) : null}
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
            <Button onClick={onSubmit} disabled={saving}>
              {saving ? "Збереження..." : submitLabel}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
};
