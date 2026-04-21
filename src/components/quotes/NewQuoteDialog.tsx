import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chip } from "@/components/ui/chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { Separator } from "@/components/ui/separator";
import { AvatarBase } from "@/components/app/avatar-kit";
import { CustomerLeadPicker, type CustomerLeadOption } from "@/components/customers";
import { cn } from "@/lib/utils";
import { normalizeUnitLabel } from "@/lib/units";
import { isDesignerJobRole } from "@/lib/permissions";
import { DESIGN_TASK_TYPE_OPTIONS, type DesignTaskType } from "@/lib/designTaskType";
import { getCatalogModelMetadata } from "@/lib/toshoApi";
import { formatUserShortName } from "@/lib/userName";
import {
  createEmptyPrintPackageConfig,
  getConfiguratorProductLabel,
  getProductKindFromPreset,
  validatePrintProductConfig,
  type PrintConfiguratorPreset,
  type PrintPackageConfig,
} from "@/lib/printPackage";
import {
  PrintProductConfigurator,
  PRINT_PACKAGE_DENSITIES,
  PRINT_PACKAGE_HANDLES,
  PRINT_PACKAGE_PRINT_TYPES,
  type ConfiguratorProductOption,
} from "@/components/quotes/PrintPackageConfigurator";
import {
  ChevronDown,
  User,
  Users,
  CalendarIcon,
  DollarSign,
  Shirt,
  Printer,
  Package,
  Layers3,
  Plus,
  Trash2,
  Paperclip,
  CheckCircle2,
  PlusCircle,
  PlayCircle,
  Check,
  Hourglass,
  XCircle,
  Truck,
  MapPin,
  Car,
  Ruler,
  Palette,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import type { CatalogType } from "@/types/catalog";

/**
 * Quote statuses
 */
const QUOTE_STATUSES = [
  { value: "new", label: "Новий", icon: PlusCircle, iconClass: "tone-text-neutral" },
  { value: "estimating", label: "На прорахунку", icon: PlayCircle, iconClass: "tone-text-warning" },
  { value: "estimated", label: "Пораховано", icon: Check, iconClass: "tone-text-info" },
  { value: "awaiting_approval", label: "На погодженні", icon: Hourglass, iconClass: "text-primary" },
  { value: "approved", label: "Затверджено", icon: CheckCircle2, iconClass: "tone-text-success" },
  { value: "cancelled", label: "Скасовано", icon: XCircle, iconClass: "tone-text-danger" },
];

/**
 * Currencies
 */
const CURRENCIES = [
  { value: "UAH", label: "UAH", symbol: "₴" },
  { value: "USD", label: "USD", symbol: "$" },
  { value: "EUR", label: "EUR", symbol: "€" },
];

/**
 * Quote types
 */
const QUOTE_TYPES = [
  { value: "merch", label: "Мерч", icon: Shirt },
  { value: "print", label: "Поліграфія", icon: Printer },
  { value: "other", label: "Інше", icon: Package },
];

/**
 * Delivery options
 */
const DELIVERY_OPTIONS = [
  { value: "nova_poshta", label: "Нова пошта", icon: Truck },
  { value: "pickup", label: "Самовивіз", icon: MapPin },
  { value: "taxi", label: "Таксі / Uklon", icon: Car },
  { value: "cargo", label: "Вантажне перевезення", icon: Truck },
];

const NOVA_POSHTA_DELIVERY_TYPES = [
  { value: "branch", label: "Відділення" },
  { value: "locker", label: "Поштомат" },
  { value: "address", label: "Адресна" },
];

const DELIVERY_PAYER_OPTIONS = [
  { value: "company", label: "Ми" },
  { value: "client", label: "Замовник" },
];

const DEFAULT_DEADLINE_TIME = "10:00";
const isValidDeadlineTime = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
const createDefaultDeadline = (time = DEFAULT_DEADLINE_TIME) => {
  if (time === DEFAULT_DEADLINE_TIME) {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    if (next.getTime() - now.getTime() < 30 * 60 * 1000) {
      next.setHours(next.getHours() + 1);
    }
    if (next.toDateString() !== now.toDateString()) {
      next.setHours(10, 0, 0, 0);
    }
    return next;
  }
  const [hours, minutes] = time.split(":").map((part) => Number(part) || 0);
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);
  return next;
};
const DEADLINE_REMINDER_OPTIONS = [
  { value: "none", label: "Без сповіщення" },
  { value: "0", label: "У момент дедлайну" },
  { value: "15", label: "За 15 хвилин" },
  { value: "60", label: "За 1 годину" },
  { value: "180", label: "За 3 години" },
  { value: "1440", label: "За 1 день" },
] as const;

/**
 * Quantity units
 */
const QUANTITY_UNITS = [
  { value: "шт.", label: "шт." },
  { value: "м", label: "м" },
  { value: "м²", label: "м²" },
];

/**
 * Print application entry
 */
type PrintApplication = {
  id: string;
  method: string;
  position: string;
  width: string;
  height: string;
};

type QuoteRunDraft = {
  id: string;
  quantity: string;
};

type DeliveryDetails = {
  region: string;
  city: string;
  address: string;
  street: string;
  npDeliveryType: string;
  payer: string;
};

const normalizePartyLabel = (value?: string | null) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[«»"'`]/g, "");

/**
 * Section header component
 */
const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-3 -mx-6 px-6">
    <span className="text-xs uppercase tracking-wider text-muted-foreground font-normal">
      {children}
    </span>
    <Separator className="flex-1 bg-border/40" />
  </div>
);

const InfoPill: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <div className="rounded-[16px] border border-border/50 bg-muted/20 px-3 py-2.5">
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
  <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
  </div>
);

const RunsEditor: React.FC<{
  runs: QuoteRunDraft[];
  quantityUnit: string;
  onRunChange: (runId: string, value: string) => void;
  onAddRun: () => void;
  onRemoveRun: (runId: string) => void;
  onUnitChange: (value: string) => void;
  compact?: boolean;
  showHeader?: boolean;
}> = ({
  runs,
  quantityUnit,
  onRunChange,
  onAddRun,
  onRemoveRun,
  onUnitChange,
  compact = false,
  showHeader = true,
}) => (
  <div className="space-y-3">
    {showHeader ? (
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Тиражі</div>
          <div className="text-xs text-muted-foreground">Можна додати кілька варіантів одразу</div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAddRun} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Додати
        </Button>
      </div>
    ) : null}
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {runs.map((run, index) => (
          <div key={run.id} className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Тираж</span>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-border/40 bg-background/60 px-1.5 text-[11px] font-medium text-foreground">
                {index + 1}
              </span>
            </div>
            <div className="flex h-9 items-center gap-1.5 rounded-full border border-border/50 bg-background/55 px-2">
              <Input
                type="number"
                min={1}
                placeholder="Тираж"
                value={run.quantity}
                onChange={(e) => onRunChange(run.id, e.target.value)}
                className={cn(
                  "h-9 border-0 bg-transparent px-2 shadow-none",
                  compact ? "w-28" : "w-32"
                )}
              />
              <button
                type="button"
                onClick={() => onRemoveRun(run.id)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Видалити тираж ${index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className={cn("space-y-1.5", compact ? "w-[140px]" : "w-[148px]")}>
        <div className="text-xs text-muted-foreground">Одиниця</div>
        <ChipDropdown
          value={quantityUnit}
          onChange={onUnitChange}
          options={QUANTITY_UNITS}
          placeholder="Одиниця"
          icon={<Ruler className="h-3.5 w-3.5" />}
        />
      </div>
    </div>
  </div>
);

const ChipDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder: string;
  icon: React.ReactNode;
  disabled?: boolean;
  popoverClassName?: string;
  isActive?: boolean;
}> = ({ value, onChange, options, placeholder, icon, disabled = false, popoverClassName, isActive }) => {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value) ?? null;
  const active = isActive ?? Boolean(selected);

  return (
    <Popover open={disabled ? false : open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex h-9 w-full items-center rounded-full border px-3.5 text-sm transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
            active
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border/40 bg-background/55 text-muted-foreground hover:border-border/50 hover:bg-background/70",
            disabled && "pointer-events-none opacity-50"
          )}
        >
          <span className={cn("mr-2 shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5", active ? "text-primary" : "text-muted-foreground")}>{icon}</span>
          <span className={cn("min-w-0 flex-1 truncate text-left font-medium", !active && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-[260px] p-2", popoverClassName)}>
        <div className="space-y-1">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <Button
                key={option.value}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 w-full justify-between text-sm",
                  active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {active ? <Check className="h-4 w-4" /> : null}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const MultiChipDropdown: React.FC<{
  values: string[];
  onChange: (values: string[]) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder: string;
  icon: React.ReactNode;
  disabled?: boolean;
  popoverClassName?: string;
}> = ({ values, onChange, options, placeholder, icon, disabled = false, popoverClassName }) => {
  const [open, setOpen] = React.useState(false);
  const selectedOptions = options.filter((option) => values.includes(option.value));
  const label =
    selectedOptions.length === 0
      ? placeholder
      : selectedOptions.length === 1
      ? selectedOptions[0]?.label ?? placeholder
      : `Співвиконавці · ${selectedOptions.length}`;

  return (
    <Popover open={disabled ? false : open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex h-9 w-full items-center rounded-full border px-3.5 text-sm transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
            selectedOptions.length > 0
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border/40 bg-background/55 text-muted-foreground hover:border-border/50 hover:bg-background/70",
            disabled && "pointer-events-none opacity-50"
          )}
        >
          <span className={cn("mr-2 shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5", selectedOptions.length > 0 ? "text-primary" : "text-muted-foreground")}>
            {icon}
          </span>
          <span className={cn("min-w-0 flex-1 truncate text-left font-medium", selectedOptions.length === 0 && "text-muted-foreground")}>
            {label}
          </span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-[320px] p-2", popoverClassName)}>
        <div className="space-y-1">
          {options.map((option) => {
            const active = values.includes(option.value);
            return (
              <Button
                key={option.value}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 w-full justify-between text-sm",
                  active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                )}
                onClick={() => {
                  onChange(
                    active ? values.filter((value) => value !== option.value) : [...values, option.value]
                  );
                }}
              >
                <span>{option.label}</span>
                {active ? <Check className="h-4 w-4" /> : null}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/**
 * Customer type
 */
export type Customer = {
  id: string;
  name?: string | null;
  legal_name?: string | null;
  logo_url?: string | null;
  manager?: string | null;
  manager_user_id?: string | null;
  entityType?: "customer" | "lead";
};

/**
 * Team member type
 */
export type TeamMember = {
  id: string;
  label: string;
  avatarUrl?: string | null;
  jobRole?: string | null;
};

/**
 * New Quote Dialog Props
 */
export interface NewQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (data: NewQuoteFormData) => void | Promise<void>;
  teamId: string;
  mode?: "create" | "edit";
  initialValues?: Partial<NewQuoteFormData>;
  submitting?: boolean;
  submitError?: string | null;
  customerLabel?: string | null;
  quoteLabel?: string | null;
  customers?: Customer[];
  customersLoading?: boolean;
  onCustomerSearch?: (search: string) => void;
  onCreateCustomer?: (name?: string) => void;
  onCreateLead?: (name?: string) => void;
  teamMembers?: TeamMember[];
  catalogTypes?: CatalogType[];
  currentUserId?: string;
  restrictPartySelectionToOwn?: boolean;
  currentManagerLabel?: string;
}

/**
 * Form data structure
 */
export type NewQuoteFormData = {
  status: string;
  comment?: string;
  customerId?: string;
  customerType?: "customer" | "lead";
  managerId?: string;
  designAssigneeId?: string | null;
  designCollaboratorIds?: string[];
  designTaskType?: DesignTaskType | null;
  deadline?: Date;
  deadlineNote?: string;
  deadlineReminderOffsetMinutes?: number | null;
  deadlineReminderComment?: string;
  currency: string;
  quoteType: string;
  deliveryType?: string;
  deliveryDetails?: DeliveryDetails;
  categoryId?: string;
  kindId?: string;
  modelId?: string;
  productConfiguratorPreset?: PrintConfiguratorPreset | null;
  printPackageConfig?: PrintPackageConfig;
  quantity?: number;
  runs?: Array<{ id?: string; quantity: number }>;
  quantityUnit: string;
  printApplications: PrintApplication[];
  createDesignTask?: boolean;
  files: File[];
};

/**
 * New Quote Dialog Component
 * Linear-style form for creating new quotes
 */
export const NewQuoteDialog: React.FC<NewQuoteDialogProps> = ({
  open,
  onOpenChange,
  onSubmit,
  teamId: _teamId,
  mode = "create",
  initialValues,
  submitting = false,
  submitError = null,
  customerLabel = null,
  quoteLabel = null,
  customers = [],
  customersLoading = false,
  onCustomerSearch,
  onCreateCustomer,
  onCreateLead,
  teamMembers = [],
  catalogTypes = [],
  currentUserId,
  restrictPartySelectionToOwn = false,
  currentManagerLabel,
}) => {
  void _teamId;
  const isEditMode = mode === "edit";
  // Form state
  const [status, setStatus] = React.useState("new");
  const [comment, setComment] = React.useState("");
  const [customerId, setCustomerId] = React.useState<string>("");
  const [customerType, setCustomerType] = React.useState<"customer" | "lead">("customer");
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [managerId, setManagerId] = React.useState<string>("");
  const [deadline, setDeadline] = React.useState<Date | undefined>(() => (isEditMode ? undefined : createDefaultDeadline()));
  const [deadlineNote, setDeadlineNote] = React.useState("");
  const [deadlineReminderOffset, setDeadlineReminderOffset] = React.useState<string>("0");
  const [deadlineReminderComment, setDeadlineReminderComment] = React.useState("");
  const [currency, setCurrency] = React.useState("UAH");
  const [quoteType, setQuoteType] = React.useState("merch");
  const [deliveryType, setDeliveryType] = React.useState("");
  const [deliveryDetails, setDeliveryDetails] = React.useState<DeliveryDetails>({
    region: "",
    city: "",
    address: "",
    street: "",
    npDeliveryType: "",
    payer: "",
  });
  const [designAssigneeId, setDesignAssigneeId] = React.useState<string | null>(null);
  const [designCollaboratorIds, setDesignCollaboratorIds] = React.useState<string[]>([]);
  const [designTaskType, setDesignTaskType] = React.useState<DesignTaskType | null>(null);
  const [categoryId, setCategoryId] = React.useState<string>("");
  const [kindId, setKindId] = React.useState<string>("");
  const [modelId, setModelId] = React.useState<string>("");
  const [printPackageConfig, setPrintPackageConfig] = React.useState<PrintPackageConfig>(
    createEmptyPrintPackageConfig()
  );
  const [quantity, setQuantity] = React.useState<number>();
  const [runs, setRuns] = React.useState<QuoteRunDraft[]>([{ id: crypto.randomUUID(), quantity: "" }]);
  const [quantityUnit, setQuantityUnit] = React.useState("шт.");
  const [printApplications, setPrintApplications] = React.useState<PrintApplication[]>([]);
  const [printMode, setPrintMode] = React.useState<"with_print" | "no_print">("no_print");
  const [createDesignTask, setCreateDesignTask] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);
  const [filesDragActive, setFilesDragActive] = React.useState(false);

  // Popover states
  const [statusPopoverOpen, setStatusPopoverOpen] = React.useState(false);
  const [customerPopoverOpen, setCustomerPopoverOpen] = React.useState(false);
  const [managerPopoverOpen, setManagerPopoverOpen] = React.useState(false);
  const [deadlinePopoverOpen, setDeadlinePopoverOpen] = React.useState(false);
  const [deadlineTimeDraft, setDeadlineTimeDraft] = React.useState(DEFAULT_DEADLINE_TIME);
  const [currencyPopoverOpen, setCurrencyPopoverOpen] = React.useState(false);
  const [deliveryPopoverOpen, setDeliveryPopoverOpen] = React.useState(false);
  const currentYear = React.useMemo(() => new Date().getFullYear(), []);
  const deadlineTime = React.useMemo(() => {
    if (!deadline) return DEFAULT_DEADLINE_TIME;
    return `${String(deadline.getHours()).padStart(2, "0")}:${String(deadline.getMinutes()).padStart(2, "0")}`;
  }, [deadline]);

  const updateDeadlineDate = React.useCallback((date?: Date) => {
    if (!date) {
      setDeadline(undefined);
      return;
    }
    const resolvedTime = isValidDeadlineTime(deadlineTimeDraft.trim()) ? deadlineTimeDraft.trim() : DEFAULT_DEADLINE_TIME;
    const [hours, minutes] = resolvedTime.split(":").map((part) => Number(part) || 0);
    const next = new Date(date);
    next.setHours(hours, minutes, 0, 0);
    setDeadline(next);
  }, [deadlineTimeDraft]);

  const updateDeadlineTime = React.useCallback((value: string) => {
    setDeadlineTimeDraft(value);
    if (!isValidDeadlineTime(value)) return;
    const [hours, minutes] = value.split(":").map((part) => Number(part) || 0);
    const next = deadline ? new Date(deadline) : createDefaultDeadline(value);
    next.setHours(hours, minutes, 0, 0);
    setDeadline(next);
  }, [deadline]);

  React.useEffect(() => {
    if (!deadlinePopoverOpen) return;
    setDeadlineTimeDraft(deadlineTime);
  }, [deadlinePopoverOpen, deadlineTime]);

  const selectedType = React.useMemo(
    () => catalogTypes.find((type) => type.id === categoryId),
    [catalogTypes, categoryId]
  );
  const filteredCatalogTypes = React.useMemo(
    () => catalogTypes.filter((type) => !quoteType || type.quote_type === quoteType || !type.quote_type),
    [catalogTypes, quoteType]
  );
  const availableKinds = React.useMemo(() => selectedType?.kinds ?? [], [selectedType]);
  const selectedKind = React.useMemo(
    () => selectedType?.kinds.find((kind) => kind.id === kindId),
    [selectedType, kindId]
  );
  const availableModels = React.useMemo(() => selectedKind?.models ?? [], [selectedKind]);
  const selectedModel = React.useMemo(
    () => selectedKind?.models.find((model) => model.id === modelId),
    [selectedKind, modelId]
  );
  const [selectedModelMetadata, setSelectedModelMetadata] = React.useState<CatalogType["kinds"][number]["models"][number]["metadata"] | null>(null);
  React.useEffect(() => {
    let cancelled = false;

    if (!open || !modelId) {
      setSelectedModelMetadata(null);
      return;
    }

    const seedMetadata = selectedModel?.metadata ?? null;
    setSelectedModelMetadata(seedMetadata);

    void (async () => {
      try {
        const metadata = await getCatalogModelMetadata(modelId);
        if (!cancelled) {
          setSelectedModelMetadata(metadata);
        }
      } catch {
        if (!cancelled) {
          setSelectedModelMetadata(seedMetadata);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [modelId, open, selectedModel]);

  const activeConfiguratorPreset =
    selectedModelMetadata?.configuratorPreset ?? selectedModel?.metadata?.configuratorPreset ?? null;
  const isPrintPackageMode = activeConfiguratorPreset !== null;
  const configuratorProductOptions = React.useMemo<ConfiguratorProductOption[]>(() => {
    return catalogTypes.flatMap((type) =>
      type.quote_type && type.quote_type !== quoteType
        ? []
        : type.kinds.flatMap((kind) =>
            kind.models.flatMap((model) => {
              const preset = model.metadata?.configuratorPreset ?? null;
              if (!preset) return [];
              return [
                {
                  typeId: type.id,
                  typeName: type.name,
                  kindId: kind.id,
                  kindName: kind.name,
                  modelId: model.id,
                  modelName: model.name,
                  preset,
                  productLabel: getConfiguratorProductLabel(preset),
                },
              ];
            })
          )
    );
  }, [catalogTypes, quoteType]);
  const selectedConfiguratorProduct = React.useMemo(
    () =>
      configuratorProductOptions.find(
        (option) =>
          option.typeId === categoryId && option.kindId === kindId && option.modelId === modelId
      ) ?? null,
    [categoryId, configuratorProductOptions, kindId, modelId]
  );
  const activeProductKind = React.useMemo(
    () => (activeConfiguratorPreset ? getProductKindFromPreset(activeConfiguratorPreset) : ""),
    [activeConfiguratorPreset]
  );
  const availablePackageDensities = React.useMemo(
    () =>
      PRINT_PACKAGE_DENSITIES.filter((option) => {
        if (option.onlyFor === "kraft") return printPackageConfig.paperType === "kraft";
        if (option.onlyFor === "cardboard") return printPackageConfig.paperType === "cardboard";
        return true;
      }),
    [printPackageConfig.paperType]
  );
  const availablePackageHandles = React.useMemo(
    () =>
      PRINT_PACKAGE_HANDLES.filter((option) => {
        if (option.onlyFor === "kraft") return printPackageConfig.paperType === "kraft";
        return true;
      }),
    [printPackageConfig.paperType]
  );
  const availablePackagePrintTypes = React.useMemo(
    () =>
      PRINT_PACKAGE_PRINT_TYPES.filter((option) => {
        if (option.notForReady) return printPackageConfig.packageType !== "ready";
        return true;
      }),
    [printPackageConfig.packageType]
  );
  const availablePrintMethods = selectedKind?.methods ?? [];
  const availablePrintPositions = selectedKind?.printPositions ?? [];
  const fallbackPrintPositions = React.useMemo(() => {
    const fromSelectedType = (selectedType?.kinds ?? []).flatMap((kind) => kind.printPositions ?? []);
    const fromCatalog = catalogTypes.flatMap((type) => type.kinds.flatMap((kind) => kind.printPositions ?? []));
    const source = fromSelectedType.length > 0 ? fromSelectedType : fromCatalog;
    const unique = new Map<string, { id: string; label: string; sort_order?: number | null }>();
    source.forEach((position) => {
      if (!position?.id || unique.has(position.id)) return;
      unique.set(position.id, position);
    });
    return Array.from(unique.values());
  }, [catalogTypes, selectedType]);
  const resolvedPrintPositions = availablePrintPositions.length > 0 ? availablePrintPositions : fallbackPrintPositions;
  const hasRoleInfo = React.useMemo(
    () => teamMembers.some((member) => !!member.jobRole),
    [teamMembers]
  );
  const designerMembers = React.useMemo(() => {
    return teamMembers.filter((member) => isDesignerJobRole(member.jobRole));
  }, [teamMembers]);
  const availableStatuses = React.useMemo(() => {
    if (isEditMode) return QUOTE_STATUSES;
    return QUOTE_STATUSES.filter(
      (statusOption) => statusOption.value === "new" || statusOption.value === "estimating"
    );
  }, [isEditMode]);

  React.useEffect(() => {
    if (!open) return;
    const nextPrintApplications = (initialValues?.printApplications ?? []).map((app, index) => ({
      id: app.id || `${Date.now()}-${index}`,
      method: app.method ?? "",
      position: app.position ?? "",
      width: app.width ?? "",
      height: app.height ?? "",
    }));

    const initialStatus = initialValues?.status ?? "new";
    const nextStatus = availableStatuses.some((statusOption) => statusOption.value === initialStatus)
      ? initialStatus
      : availableStatuses[0]?.value ?? "new";
    setStatus(nextStatus);
    setComment(initialValues?.comment ?? "");
    setCustomerId(initialValues?.customerId ?? "");
    setCustomerType(initialValues?.customerType ?? "customer");
    setCustomerSearch("");
    setManagerId(initialValues?.managerId ?? currentUserId ?? "");
    setDeadline(initialValues?.deadline ?? (isEditMode ? undefined : createDefaultDeadline()));
    setDeadlineNote(initialValues?.deadlineNote ?? "");
    setDeadlineReminderOffset(
      initialValues?.deadlineReminderOffsetMinutes === null || initialValues?.deadlineReminderOffsetMinutes === undefined
        ? "0"
        : String(initialValues.deadlineReminderOffsetMinutes)
    );
    setDeadlineReminderComment(initialValues?.deadlineReminderComment ?? "");
    setCurrency(initialValues?.currency ?? "UAH");
    setQuoteType(initialValues?.quoteType ?? "merch");
    setDeliveryType(initialValues?.deliveryType ?? "");
    setDeliveryDetails({
      region: initialValues?.deliveryDetails?.region ?? "",
      city: initialValues?.deliveryDetails?.city ?? "",
      address: initialValues?.deliveryDetails?.address ?? "",
      street: initialValues?.deliveryDetails?.street ?? "",
      npDeliveryType: initialValues?.deliveryDetails?.npDeliveryType ?? "",
      payer: initialValues?.deliveryDetails?.payer ?? "",
    });
    setCategoryId(initialValues?.categoryId ?? "");
    setKindId(initialValues?.kindId ?? "");
    setModelId(initialValues?.modelId ?? "");
    setPrintPackageConfig({
      ...createEmptyPrintPackageConfig(),
      ...(initialValues?.printPackageConfig ?? {}),
      productKind:
        (initialValues?.quoteType ?? "merch") === "print"
          ? initialValues?.printPackageConfig?.productKind ??
            (initialValues?.productConfiguratorPreset
              ? getProductKindFromPreset(initialValues.productConfiguratorPreset)
              : "package")
          : initialValues?.printPackageConfig?.productKind ?? "",
    });
    setQuantity(initialValues?.quantity);
    const nextRuns =
      (initialValues?.runs ?? [])
        .filter((run) => Number(run.quantity) > 0)
        .map((run, index) => ({
          id: run.id?.trim() || `${Date.now()}-${index}`,
          quantity: String(run.quantity),
        })) ?? [];
    if (nextRuns.length > 0) {
      setRuns(nextRuns);
      setQuantity(Number(nextRuns[0]?.quantity) || initialValues?.quantity);
    } else {
      const initialQuantity = initialValues?.quantity ? String(initialValues.quantity) : "";
      setRuns([{ id: `${Date.now()}-0`, quantity: initialQuantity }]);
    }
    setQuantityUnit(normalizeUnitLabel(initialValues?.quantityUnit ?? "шт."));
    setPrintApplications(nextPrintApplications);
    const nextPrintMode = nextPrintApplications.length > 0 ? "with_print" : "no_print";
    setPrintMode(nextPrintMode);
    if (nextPrintMode === "no_print") {
      setCreateDesignTask(false);
      setDesignAssigneeId(null);
      setDesignCollaboratorIds([]);
      setDesignTaskType(null);
    } else {
      setCreateDesignTask(!!initialValues?.createDesignTask);
      setDesignAssigneeId(initialValues?.designAssigneeId ?? null);
      setDesignCollaboratorIds(
        Array.from(
          new Set(
            (initialValues?.designCollaboratorIds ?? []).filter(
              (value) => value && value !== (initialValues?.designAssigneeId ?? null)
            )
          )
        )
      );
      setDesignTaskType(initialValues?.designTaskType ?? null);
    }
    setFiles(initialValues?.files ?? []);

    setStatusPopoverOpen(false);
    setCustomerPopoverOpen(false);
    setManagerPopoverOpen(false);
    setDeadlinePopoverOpen(false);
    setCurrencyPopoverOpen(false);
    setDeliveryPopoverOpen(false);
    setFilesDragActive(false);
  }, [availableStatuses, currentUserId, initialValues, isEditMode, open]);

  React.useEffect(() => {
    if (quoteType !== "print") return;
    if (isPrintPackageMode) return;
    if (categoryId || kindId || modelId) return;
    if (configuratorProductOptions.length !== 1) return;
    const [defaultOption] = configuratorProductOptions;
    setCategoryId(defaultOption.typeId);
    setKindId(defaultOption.kindId);
    setModelId(defaultOption.modelId);
    setPrintPackageConfig((prev) => ({
      ...createEmptyPrintPackageConfig(),
      ...prev,
      productKind: getProductKindFromPreset(defaultOption.preset),
    }));
  }, [
    categoryId,
    configuratorProductOptions,
    isPrintPackageMode,
    kindId,
    modelId,
    quoteType,
  ]);

  React.useEffect(() => {
    if (!isPrintPackageMode || printPackageConfig.productKind !== "package") return;
    const activeHandleValid = availablePackageHandles.some((option) => option.value === printPackageConfig.handleType);
    const activeDensityValid = availablePackageDensities.some((option) => option.value === printPackageConfig.density);
    const shouldHideEyelets =
      printPackageConfig.packageType !== "custom" || printPackageConfig.paperType === "kraft";
    const nextKraftColor = printPackageConfig.paperType === "kraft" ? printPackageConfig.kraftColor : "";
    const nextHandleType = activeHandleValid ? printPackageConfig.handleType : "";
    const nextDensity = activeDensityValid ? printPackageConfig.density : "";
    const nextEyelets = shouldHideEyelets ? "" : printPackageConfig.eyelets;
    if (
      nextKraftColor !== printPackageConfig.kraftColor ||
      nextHandleType !== printPackageConfig.handleType ||
      nextDensity !== printPackageConfig.density ||
      nextEyelets !== printPackageConfig.eyelets
    ) {
      setPrintPackageConfig((prev) => ({
        ...prev,
        kraftColor: nextKraftColor,
        handleType: nextHandleType,
        density: nextDensity,
        eyelets: nextEyelets,
      }));
    }
  }, [
    availablePackageDensities,
    availablePackageHandles,
    isPrintPackageMode,
    printPackageConfig.density,
    printPackageConfig.eyelets,
    printPackageConfig.handleType,
    printPackageConfig.kraftColor,
    printPackageConfig.packageType,
    printPackageConfig.paperType,
    printPackageConfig.productKind,
  ]);

  React.useEffect(() => {
    if (!isPrintPackageMode || !activeProductKind) return;
    if (printPackageConfig.productKind === activeProductKind) return;
    setPrintPackageConfig((prev) => ({
      ...prev,
      productKind: activeProductKind,
    }));
  }, [activeProductKind, isPrintPackageMode, printPackageConfig.productKind]);

  React.useEffect(() => {
    if (!isPrintPackageMode || printPackageConfig.productKind !== "package") return;
    const activePrintTypeValid = availablePackagePrintTypes.some((option) => option.value === printPackageConfig.printType);
    if (activePrintTypeValid) return;
    setPrintPackageConfig((prev) => ({
      ...prev,
      printType: "",
      pantoneCount: "",
      stickerSize: "",
    }));
  }, [availablePackagePrintTypes, isPrintPackageMode, printPackageConfig.printType, printPackageConfig.productKind]);

  React.useEffect(() => {
    if (isPrintPackageMode) return;
    const hasApplications = printApplications.length > 0;
    setPrintMode(hasApplications ? "with_print" : "no_print");
    if (!hasApplications) {
      setFiles([]);
      setCreateDesignTask(false);
      setDesignAssigneeId(null);
    }
  }, [isPrintPackageMode, printApplications.length]);

  // Add print application
  const handleAddPrintApplication = () => {
    setPrintMode("with_print");
    setPrintApplications([
      ...printApplications,
      {
        id: `${Date.now()}-${Math.random()}`,
        method: availablePrintMethods[0]?.id ?? "",
        position: resolvedPrintPositions[0]?.id ?? "",
        width: "",
        height: "",
      },
    ]);
  };

  // Remove print application
  const handleRemovePrintApplication = (id: string) => {
    setPrintApplications(printApplications.filter((app) => app.id !== id));
  };

  // Update print application
  const handleUpdatePrintApplication = (
    id: string,
    field: keyof PrintApplication,
    value: string
  ) => {
    setPrintApplications(
      printApplications.map((app) =>
        app.id === id ? { ...app, [field]: value } : app
      )
    );
  };

  // Handle file drop
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setFilesDragActive(false);
    if (printMode === "no_print" && !isPrintPackageMode) return;
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles([...files, ...droppedFiles].slice(0, 5));
  };

  // Handle file select
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (printMode === "no_print" && !isPrintPackageMode) return;
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles([...files, ...selectedFiles].slice(0, 5));
    }
  };

  const updateRunDraft = (runId: string, value: string) => {
    const sanitized = value.replace(/[^\d]/g, "");
    setRuns((prev) => prev.map((run) => (run.id === runId ? { ...run, quantity: sanitized } : run)));
  };

  const addRunDraft = () => {
    setRuns((prev) => [...prev, { id: crypto.randomUUID(), quantity: "" }]);
  };

  const removeRunDraft = (runId: string) => {
    setRuns((prev) => {
      if (prev.length <= 1) return [{ ...prev[0], quantity: "" }];
      return prev.filter((run) => run.id !== runId);
    });
  };

  // Handle submit
  const handleSubmit = async () => {
    const showValidationError = (message: string) => {
      toast.error("Перевірте форму", {
        description: message,
      });
    };

    // Validation
    const hasResolvedLeadInEditMode =
      isEditMode && customerType === "lead" && Boolean(customerLabel?.trim());
    if (!customerId && !hasResolvedLeadInEditMode) {
      showValidationError("Оберіть замовника або ліда");
      setCustomerPopoverOpen(true);
      return;
    }
    if (!isEditMode && !deadline) {
      showValidationError("Вкажіть дедлайн прорахунку з датою та часом");
      setDeadlinePopoverOpen(true);
      return;
    }

    const trim = (value?: string) => value?.trim() ?? "";
    const hasRegion = trim(deliveryDetails.region).length > 0;
    const hasCity = trim(deliveryDetails.city).length > 0;
    const hasAddress = trim(deliveryDetails.address).length > 0;
    const hasStreet = trim(deliveryDetails.street).length > 0;
    const hasNpDeliveryType = trim(deliveryDetails.npDeliveryType).length > 0;

    if (deliveryType === "nova_poshta") {
      if (!hasRegion) {
        showValidationError("Для Нової пошти заповніть область");
        return;
      }
      if (!hasCity) {
        showValidationError("Для Нової пошти заповніть місто");
        return;
      }
      if (!hasNpDeliveryType) {
        showValidationError("Для Нової пошти оберіть тип доставки");
        return;
      }
      if (deliveryDetails.npDeliveryType === "address" && !hasStreet) {
        showValidationError("Для адресної доставки заповніть вулицю");
        return;
      }
    }

    if (deliveryType === "taxi") {
      if (!hasCity) {
        showValidationError("Для таксі / Uklon заповніть місто");
        return;
      }
      if (!hasAddress) {
        showValidationError("Для таксі / Uklon заповніть адресу");
        return;
      }
    }

    if (deliveryType === "cargo") {
      if (!hasRegion) {
        showValidationError("Для вантажного перевезення заповніть область");
        return;
      }
      if (!hasCity) {
        showValidationError("Для вантажного перевезення заповніть місто");
        return;
      }
      if (!hasAddress) {
        showValidationError("Для вантажного перевезення заповніть адресу");
        return;
      }
    }

    const normalizedRuns = runs
      .map((run) => ({ id: run.id, quantity: Number(run.quantity) || 0 }))
      .filter((run) => run.quantity > 0);
    const primaryQuantity = normalizedRuns[0]?.quantity ?? Number(quantity ?? 0);
    const normalizedPrintProductConfig =
      isPrintPackageMode && activeProductKind
        ? {
            ...printPackageConfig,
            productKind: printPackageConfig.productKind || activeProductKind,
          }
        : printPackageConfig;

    if (!isEditMode && isPrintPackageMode) {
      const qtyValue = primaryQuantity;
      const configError = validatePrintProductConfig(normalizedPrintProductConfig);
      if (configError) {
        showValidationError(configError);
        return;
      }
      if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
        showValidationError("Вкажіть коректну кількість");
        return;
      }
    }

    if (!isEditMode && normalizedRuns.length === 0) {
      showValidationError("Додайте хоча б один коректний тираж");
      return;
    }

    const finalPrints = printMode === "no_print" ? [] : printApplications;
    const shouldCreateDesignTask =
      ((printMode !== "no_print" && !isPrintPackageMode) || isPrintPackageMode) && createDesignTask;
    if (shouldCreateDesignTask && !designTaskType) {
      showValidationError("Оберіть тип дизайнерської задачі");
      return;
    }
    const sanitizedDeliveryDetails: DeliveryDetails = {
      region: "",
      city: "",
      address: "",
      street: "",
      npDeliveryType: "",
      payer: trim(deliveryDetails.payer),
    };
    if (deliveryType === "nova_poshta") {
      sanitizedDeliveryDetails.region = trim(deliveryDetails.region);
      sanitizedDeliveryDetails.city = trim(deliveryDetails.city);
      sanitizedDeliveryDetails.npDeliveryType = trim(deliveryDetails.npDeliveryType);
      sanitizedDeliveryDetails.street =
        sanitizedDeliveryDetails.npDeliveryType === "address" ? trim(deliveryDetails.street) : "";
    }
    if (deliveryType === "taxi") {
      sanitizedDeliveryDetails.city = trim(deliveryDetails.city);
      sanitizedDeliveryDetails.address = trim(deliveryDetails.address);
    }
    if (deliveryType === "cargo") {
      sanitizedDeliveryDetails.region = trim(deliveryDetails.region);
      sanitizedDeliveryDetails.city = trim(deliveryDetails.city);
      sanitizedDeliveryDetails.address = trim(deliveryDetails.address);
    }

    const formData: NewQuoteFormData = {
      status,
      comment,
      customerId,
      customerType,
      managerId,
      designAssigneeId: shouldCreateDesignTask ? designAssigneeId : null,
      designCollaboratorIds:
        shouldCreateDesignTask
          ? Array.from(new Set(designCollaboratorIds.filter((value) => value && value !== designAssigneeId)))
          : [],
      designTaskType: shouldCreateDesignTask ? designTaskType : null,
      deadline,
      deadlineNote,
      deadlineReminderOffsetMinutes:
        deadlineReminderOffset === "none" ? null : Number(deadlineReminderOffset),
      deadlineReminderComment,
      currency,
      quoteType,
      deliveryType,
      deliveryDetails: sanitizedDeliveryDetails,
      categoryId,
      kindId,
      modelId,
      productConfiguratorPreset: activeConfiguratorPreset,
      printPackageConfig:
        isPrintPackageMode
          ? {
              ...normalizedPrintProductConfig,
            }
          : undefined,
      quantity: primaryQuantity || undefined,
      runs: normalizedRuns,
      quantityUnit: normalizeUnitLabel(quantityUnit),
      printApplications: finalPrints,
      createDesignTask: shouldCreateDesignTask,
      files,
    };

    await onSubmit?.(formData);
  };

  // Get current status
  const currentStatus = availableStatuses.find((s) => s.value === status) ?? availableStatuses[0];
  const currentCurrency = CURRENCIES.find((c) => c.value === currency);
  const currentDelivery = DELIVERY_OPTIONS.find((opt) => opt.value === deliveryType);
  const customerOptions = React.useMemo<CustomerLeadOption[]>(
    () => {
      const effectiveCurrentManagerLabel =
        teamMembers.find((member) => member.id === currentUserId)?.label?.trim() || currentManagerLabel || "";
      const normalizeManagerKey = (value?: string | null) => (value ?? "").trim().toLowerCase();
      const currentManagerKey = normalizeManagerKey(effectiveCurrentManagerLabel);

      const resolvePartyManagerUserId = (customer: Customer) => {
        const managerUserId = customer.manager_user_id?.trim() ?? "";
        if (managerUserId) return managerUserId;

        const managerValue = customer.manager?.trim() ?? "";
        if (!managerValue) return "";

        const managerShortLabel = formatUserShortName({ fullName: managerValue, fallback: managerValue });
        const matchedTeamMember = teamMembers.find((member) => {
          const memberLabel = member.label.trim();
          if (!memberLabel) return false;
          const memberKey = normalizeManagerKey(memberLabel);
          return memberKey === normalizeManagerKey(managerValue) || memberKey === normalizeManagerKey(managerShortLabel);
        });

        return matchedTeamMember?.id ?? "";
      };

      const isBlockedForCurrentManager = (customer: Customer) => {
        if (!restrictPartySelectionToOwn) return false;
        if (!currentUserId) return false;

        const resolvedManagerUserId = resolvePartyManagerUserId(customer);
        if (resolvedManagerUserId) {
          return resolvedManagerUserId !== currentUserId;
        }

        const managerValue = customer.manager?.trim() ?? "";
        if (!managerValue) return false;
        if (!currentManagerKey) return false;

        if (normalizeManagerKey(managerValue) === currentManagerKey) return false;

        const managerShortLabel = formatUserShortName({ fullName: managerValue, fallback: managerValue });
        if (normalizeManagerKey(managerShortLabel) === currentManagerKey) return false;

        return false;
      };

      return customers.map((customer) => ({
        id: customer.id,
        label: customer.name || customer.legal_name || "Без назви",
        legalName: customer.legal_name ?? null,
        logoUrl: customer.logo_url ?? null,
        managerLabel: customer.manager?.trim() || null,
        searchText: [customer.name ?? "", customer.legal_name ?? ""].filter(Boolean).join(" "),
        entityType: customer.entityType ?? "customer",
        disabled: isBlockedForCurrentManager(customer),
        disabledReason: isBlockedForCurrentManager(customer)
          ? `Можна вибрати тільки свого замовника або ліда${customer.manager?.trim() ? `. Менеджер: ${customer.manager.trim()}` : ""}`
          : null,
      }));
    },
    [currentManagerLabel, currentUserId, customers, restrictPartySelectionToOwn, teamMembers]
  );
  const selectedCustomer = customerOptions.find(
    (customer) => customer.id === customerId && customer.entityType === customerType
  );

  React.useEffect(() => {
    if (!open || !isEditMode) return;
    if (customerId || !customerLabel?.trim()) return;
    const matched = customerOptions.find(
      (option) =>
        option.entityType === customerType &&
        normalizePartyLabel(option.label) === normalizePartyLabel(customerLabel)
    );
    if (!matched) return;
    setCustomerId(matched.id);
    setCustomerType(matched.entityType);
  }, [open, isEditMode, customerId, customerLabel, customerOptions, customerType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[1180px] max-h-[88vh] overflow-hidden !p-0 sm:!p-0">
        <div className="flex max-h-[85vh] flex-col">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-base font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {isEditMode ? "Редагувати прорахунок" : "Новий прорахунок"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Оновіть актуальні параметри прорахунку."
                : "Заповніть параметри замовлення, щоб створити прорахунок."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 overflow-x-hidden overflow-y-auto px-4 pb-4">

            {isEditMode ? (
              <div className="rounded-[var(--radius-md)] border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                {quoteLabel ? <span className="font-medium text-foreground">{quoteLabel}</span> : null}
                {customerLabel ? `${quoteLabel ? " · " : ""}${customerLabel}` : ""}
              </div>
            ) : null}

        {/* Main chips row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status */}
          <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
            <PopoverTrigger asChild>
              <Chip
                size="md"
                icon={
                  currentStatus?.icon ? (
                    <currentStatus.icon className={currentStatus.iconClass} />
                  ) : null
                }
              >
                {currentStatus?.label}
              </Chip>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1">
                {availableStatuses.map((statusOption) => (
                  <Button
                    key={statusOption.value}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 h-9 text-sm"
                    onClick={() => {
                      setStatus(statusOption.value);
                      setStatusPopoverOpen(false);
                    }}
                  >
                    <statusOption.icon className={cn("h-3.5 w-3.5", statusOption.iconClass)} />
                    <span className="text-sm">{statusOption.label}</span>
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Customer */}
          <CustomerLeadPicker
            open={customerPopoverOpen}
            onOpenChange={setCustomerPopoverOpen}
            selectedLabel={selectedCustomer?.label ?? customerLabel ?? ""}
            selectedType={customerType}
            selectedLogoUrl={selectedCustomer?.logoUrl ?? null}
            searchValue={customerSearch}
            onSearchChange={(value) => {
              setCustomerSearch(value);
              onCustomerSearch?.(value);
            }}
            options={customerOptions}
            loading={customersLoading}
            onSelect={(customer) => {
              setCustomerId(customer.id);
              setCustomerType(customer.entityType);
            }}
            onCreateCustomer={onCreateCustomer}
            onCreateLead={onCreateLead}
            onClear={() => {
              setCustomerId("");
              setCustomerType("customer");
              setCustomerSearch("");
            }}
            popoverClassName="w-72 p-2"
          />

          {/* Manager */}
          <Popover open={managerPopoverOpen} onOpenChange={setManagerPopoverOpen}>
            <PopoverTrigger asChild>
              <Chip
                size="md"
                icon={
                  managerId ? (
                    <AvatarBase
                      src={teamMembers.find((m) => m.id === managerId)?.avatarUrl ?? null}
                      name={teamMembers.find((m) => m.id === managerId)?.label ?? "Менеджер"}
                      fallback={
                        (teamMembers.find((m) => m.id === managerId)?.label ?? "M")
                          .slice(0, 2)
                          .toUpperCase()
                      }
                      size={20}
                      className="border-border/60"
                      fallbackClassName="text-[10px] font-semibold"
                    />
                  ) : (
                    <User />
                  )
                }
                active={!!managerId}
              >
                {managerId 
                  ? teamMembers.find(m => m.id === managerId)?.label || "Менеджер обрано"
                  : "Менеджер"}
              </Chip>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1">
                {teamMembers.length > 0 ? (
                  teamMembers.map((member) => (
                    <Button
                      key={member.id}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 h-9 text-sm truncate"
                      onClick={() => {
                        setManagerId(member.id);
                        setManagerPopoverOpen(false);
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
                      <span className="text-sm truncate max-w-[220px]">{member.label}</span>
                    </Button>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground p-2">
                    Немає менеджерів
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Deadline */}
          <Popover open={deadlinePopoverOpen} onOpenChange={setDeadlinePopoverOpen}>
            <PopoverTrigger asChild>
              <Chip size="md" icon={<CalendarIcon />} active={!!deadline}>
                {deadline
                  ? format(deadline, "d MMM, HH:mm", { locale: uk })
                  : "Дедлайн *"}
              </Chip>
            </PopoverTrigger>
            <PopoverContent className="w-fit max-w-[calc(100vw-2rem)] p-0" align="start">
              <Calendar
                mode="single"
                selected={deadline}
                onSelect={(date) => {
                  updateDeadlineDate(date ?? undefined);
                }}
                captionLayout="dropdown-buttons"
                fromYear={currentYear - 3}
                toYear={currentYear + 5}
                initialFocus
              />
              <div className="border-t border-border/50 px-3 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Час дедлайну
                </div>
                <Input
                  type="time"
                  value={deadlineTimeDraft}
                  onChange={(e) => updateDeadlineTime(e.target.value)}
                  onBlur={() => {
                    const normalized = isValidDeadlineTime(deadlineTimeDraft.trim())
                      ? deadlineTimeDraft.trim()
                      : DEFAULT_DEADLINE_TIME;
                    setDeadlineTimeDraft(normalized);
                    updateDeadlineTime(normalized);
                  }}
                  step={60}
                  className="mt-2 h-9"
                />
              </div>
              <DateQuickActions
                onSelect={(date) => {
                  updateDeadlineDate(date ?? undefined);
                }}
              />
            </PopoverContent>
          </Popover>

          {/* Currency */}
          <Popover open={currencyPopoverOpen} onOpenChange={setCurrencyPopoverOpen}>
            <PopoverTrigger asChild>
              <Chip size="md" icon={<DollarSign />}>
                {currentCurrency?.symbol} {currentCurrency?.label}
              </Chip>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2" align="start">
              <div className="space-y-1">
                {CURRENCIES.map((curr) => (
                  <Button
                    key={curr.value}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 h-9 text-sm"
                    onClick={() => {
                      setCurrency(curr.value);
                      setCurrencyPopoverOpen(false);
                    }}
                  >
                    <span className="text-sm">
                      {curr.symbol} {curr.label}
                    </span>
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Delivery */}
          <Popover open={deliveryPopoverOpen} onOpenChange={setDeliveryPopoverOpen}>
            <PopoverTrigger asChild>
              <Chip
                size="md"
                icon={currentDelivery ? <currentDelivery.icon /> : <Truck />}
                active={!!deliveryType}
              >
                {currentDelivery?.label || "Логістика"}
              </Chip>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1">
                {DELIVERY_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 h-9 text-sm"
                    onClick={() => {
                      setDeliveryType(option.value);
                      setDeliveryDetails({
                        region: "",
                        city: "",
                        address: "",
                        street: "",
                        npDeliveryType: "",
                        payer: "",
                      });
                      setDeliveryPopoverOpen(false);
                    }}
                  >
                    <option.icon className="h-3.5 w-3.5" />
                    <span className="text-sm">{option.label}</span>
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="mt-5 space-y-4">
          <SectionHeader>Деталі</SectionHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Замовник або Лід *</div>
              <div className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                customerId ? "tone-success-subtle text-foreground" : "border-destructive/40 bg-destructive/5 text-destructive"
              )}>
                {customerId ? "Поле заповнено" : "Потрібно обрати замовника або ліда перед збереженням"}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Дедлайн прорахунку *</div>
              <div className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                deadline ? "tone-success-subtle text-foreground" : "border-destructive/40 bg-destructive/5 text-destructive"
              )}>
                {deadline ? format(deadline, "d MMMM yyyy, HH:mm", { locale: uk }) : "Потрібно вказати дату та час дедлайну"}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <div className="text-sm text-muted-foreground">Коментар до дедлайну / текст нагадування</div>
              <Input
                value={deadlineNote}
                onChange={(e) => setDeadlineNote(e.target.value)}
                placeholder="Напр. До 12:00 погодити макет"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Сповіщення про дедлайн</div>
              <Select value={deadlineReminderOffset} onValueChange={setDeadlineReminderOffset}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Оберіть момент сповіщення" />
                </SelectTrigger>
                <SelectContent>
                  {DEADLINE_REMINDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Текст сповіщення</div>
              <Input
                value={deadlineReminderComment}
                onChange={(e) => setDeadlineReminderComment(e.target.value)}
                placeholder="Напр. Перевірити готовність і зв'язатись з замовником"
                className="h-9"
              />
            </div>
          </div>
        </div>

        {deliveryType ? (
          <div className="mt-5 space-y-4">
            <SectionHeader>Логістика</SectionHeader>
            <div className="grid gap-3 md:grid-cols-2">
              {deliveryType === "nova_poshta" ? (
                <>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Область *</div>
                    <Input
                      value={deliveryDetails.region}
                      onChange={(e) =>
                        setDeliveryDetails((prev) => ({ ...prev, region: e.target.value }))
                      }
                      placeholder="Київська"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Місто *</div>
                    <Input
                      value={deliveryDetails.city}
                      onChange={(e) => setDeliveryDetails((prev) => ({ ...prev, city: e.target.value }))}
                      placeholder="Київ"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Тип доставки *</div>
                    <Select
                      value={deliveryDetails.npDeliveryType}
                      onValueChange={(value) =>
                        setDeliveryDetails((prev) => ({
                          ...prev,
                          npDeliveryType: value,
                          street: value === "address" ? prev.street : "",
                        }))
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Оберіть тип доставки" />
                      </SelectTrigger>
                      <SelectContent>
                        {NOVA_POSHTA_DELIVERY_TYPES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Хто платить</div>
                    <Select
                      value={deliveryDetails.payer}
                      onValueChange={(value) => setDeliveryDetails((prev) => ({ ...prev, payer: value }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Оберіть варіант" />
                      </SelectTrigger>
                      <SelectContent>
                        {DELIVERY_PAYER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {deliveryDetails.npDeliveryType === "address" ? (
                    <div className="space-y-1 md:col-span-2">
                      <div className="text-sm text-muted-foreground">Вулиця *</div>
                      <Input
                        value={deliveryDetails.street}
                        onChange={(e) =>
                          setDeliveryDetails((prev) => ({ ...prev, street: e.target.value }))
                        }
                        placeholder="Вул. Хрещатик, 1"
                        className="h-9"
                      />
                    </div>
                  ) : null}
                </>
              ) : null}

              {deliveryType === "taxi" ? (
                <>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Місто *</div>
                    <Input
                      value={deliveryDetails.city}
                      onChange={(e) => setDeliveryDetails((prev) => ({ ...prev, city: e.target.value }))}
                      placeholder="Київ"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Хто платить</div>
                    <Select
                      value={deliveryDetails.payer}
                      onValueChange={(value) => setDeliveryDetails((prev) => ({ ...prev, payer: value }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Оберіть варіант" />
                      </SelectTrigger>
                      <SelectContent>
                        {DELIVERY_PAYER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <div className="text-sm text-muted-foreground">Адреса *</div>
                    <Input
                      value={deliveryDetails.address}
                      onChange={(e) =>
                        setDeliveryDetails((prev) => ({ ...prev, address: e.target.value }))
                      }
                      placeholder="Вул. Хрещатик, 1"
                      className="h-9"
                    />
                  </div>
                </>
              ) : null}

              {deliveryType === "cargo" ? (
                <>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Область *</div>
                    <Input
                      value={deliveryDetails.region}
                      onChange={(e) =>
                        setDeliveryDetails((prev) => ({ ...prev, region: e.target.value }))
                      }
                      placeholder="Київська"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Місто *</div>
                    <Input
                      value={deliveryDetails.city}
                      onChange={(e) => setDeliveryDetails((prev) => ({ ...prev, city: e.target.value }))}
                      placeholder="Київ"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <div className="text-sm text-muted-foreground">Адреса *</div>
                    <Input
                      value={deliveryDetails.address}
                      onChange={(e) =>
                        setDeliveryDetails((prev) => ({ ...prev, address: e.target.value }))
                      }
                      placeholder="Вул. Хрещатик, 1"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Хто платить</div>
                    <Select
                      value={deliveryDetails.payer}
                      onValueChange={(value) => setDeliveryDetails((prev) => ({ ...prev, payer: value }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Оберіть варіант" />
                      </SelectTrigger>
                      <SelectContent>
                        {DELIVERY_PAYER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}

              {deliveryType === "pickup" ? (
                <div className="text-sm text-muted-foreground md:col-span-2">
                  Для самовивозу додаткові поля не потрібні.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Product section */}
        <div className="mt-5 space-y-4">
          <SectionHeader>Продукція</SectionHeader>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-border/40 bg-background/30 p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Вибір продукту
                  </div>
                  <div className="text-lg font-semibold text-foreground">Виберіть напрямок і продукт</div>
                </div>

                <div className="inline-flex rounded-full border border-border/50 bg-background/40 p-1">
                  {QUOTE_TYPES.map((type) => {
                    const active = quoteType === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => {
                          setQuoteType(type.value);
                          setCategoryId("");
                          setKindId("");
                          setModelId("");
                          setPrintApplications([]);
                          setPrintMode("no_print");
                          setPrintPackageConfig(createEmptyPrintPackageConfig());
                        }}
                        className={cn(
                          "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                        )}
                      >
                        <type.icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                        <span>{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {isPrintPackageMode ? (
                  <div className="mt-4 space-y-4">
                    <PrintProductConfigurator
                      config={printPackageConfig}
                      onConfigChange={setPrintPackageConfig}
                      selectedConfiguratorProduct={selectedConfiguratorProduct}
                      configuratorProductOptions={configuratorProductOptions}
                      selectedTypeName={selectedType?.name}
                      selectedKindName={selectedKind?.name}
                      selectedModelName={selectedModel?.name}
                      availablePackageDensities={availablePackageDensities}
                      availablePackageHandles={availablePackageHandles}
                      availablePackagePrintTypes={availablePackagePrintTypes}
                      onSelectProduct={(nextOption) => {
                        setCategoryId(nextOption.typeId);
                        setKindId(nextOption.kindId);
                        setModelId(nextOption.modelId);
                        setPrintPackageConfig((prev) => ({
                          ...createEmptyPrintPackageConfig(),
                          ...prev,
                          productKind: getProductKindFromPreset(nextOption.preset),
                        }));
                      }}
                    />

                    <div className="rounded-[20px] border border-border/40 bg-background/35 p-4 md:p-5">
                      <RunsEditor
                        runs={runs}
                        quantityUnit={quantityUnit}
                        onRunChange={updateRunDraft}
                        onAddRun={addRunDraft}
                        onRemoveRun={removeRunDraft}
                        onUnitChange={setQuantityUnit}
                        compact
                        showHeader
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[20px] border border-border/40 bg-background/35 p-4 md:p-5">
                    <div
                      className={cn(
                        "grid gap-3 md:grid-cols-3",
                        quoteType === "print"
                          ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(320px,1.2fr)]"
                          : "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
                      )}
                    >
                        <div className="space-y-1.5">
                          <div className="text-xs text-muted-foreground">Категорія</div>
                          <ChipDropdown
                            value={categoryId}
                            onChange={(value) => {
                              setCategoryId(value);
                              setKindId("");
                              setModelId("");
                            }}
                            options={(filteredCatalogTypes.length > 0 ? filteredCatalogTypes : catalogTypes).map((type) => ({
                              value: type.id,
                              label: type.name,
                            }))}
                            placeholder="Оберіть категорію"
                            icon={<Layers3 className="h-3.5 w-3.5" />}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="text-xs text-muted-foreground">Вид</div>
                          <ChipDropdown
                            value={kindId}
                            onChange={(value) => {
                              setKindId(value);
                              setModelId("");
                            }}
                            disabled={!categoryId}
                            options={availableKinds.map((kind) => ({
                              value: kind.id,
                              label: kind.name,
                            }))}
                            placeholder="Оберіть вид"
                            icon={<Package className="h-3.5 w-3.5" />}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="text-xs text-muted-foreground">Модель</div>
                          <ChipDropdown
                            value={modelId}
                            onChange={setModelId}
                            disabled={!kindId}
                            options={availableModels.map((model) => ({
                              value: model.id,
                              label: model.name,
                            }))}
                            placeholder="Оберіть модель"
                            icon={<Shirt className="h-3.5 w-3.5" />}
                            popoverClassName="w-[320px]"
                          />
                        </div>
                        {quoteType === "print" ? (
                          <div className="space-y-1.5 xl:col-span-1">
                            <RunsEditor
                              runs={runs}
                              quantityUnit={quantityUnit}
                              onRunChange={updateRunDraft}
                              onAddRun={addRunDraft}
                              onRemoveRun={removeRunDraft}
                              onUnitChange={setQuantityUnit}
                              compact
                              showHeader
                            />
                        </div>
                        ) : null}
                    </div>
                    {quoteType !== "print" ? (
                      <div className="mt-4">
                        <RunsEditor
                          runs={runs}
                          quantityUnit={quantityUnit}
                          onRunChange={updateRunDraft}
                          onAddRun={addRunDraft}
                          onRemoveRun={removeRunDraft}
                          onUnitChange={setQuantityUnit}
                        />
                      </div>
                    ) : null}
                  </div>
                )
              }
            </div>
          </div>
        </div>

        {/* Print applications section */}
        {!isPrintPackageMode ? (
        <div className="mt-8 space-y-4">
          <SectionHeader>Нанесення</SectionHeader>
          <div className="rounded-[24px] border border-border/40 bg-background/30 p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-lg font-semibold text-foreground">Нанесення</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={printApplications.length > 0 ? "outline" : "primary"}
                  size="sm"
                  onClick={handleAddPrintApplication}
                  className="h-10 gap-1.5 rounded-[14px] px-4 text-sm"
                >
                  <Plus className="h-4 w-4" />
                  {printApplications.length > 0 ? "Додати ще нанесення" : "Додати нанесення"}
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <InfoPill icon={<Palette className="h-3.5 w-3.5" />} label="Режим" value={printMode === "with_print" ? "З нанесенням" : "Без нанесення"} />
              <InfoPill icon={<Package className="h-3.5 w-3.5" />} label="Конфігурацій" value={`${printApplications.length}`} />
              <InfoPill
                icon={<Ruler className="h-3.5 w-3.5" />}
                label="Позиції"
                value={resolvedPrintPositions.length > 0 ? `${resolvedPrintPositions.length} доступно` : "Не налаштовано"}
              />
            </div>

            <div className="mt-4 space-y-3">
            {printApplications.map((app) => (
              <div
                key={app.id}
                className="rounded-[20px] border border-border/40 bg-background/45 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Нанесення #{printApplications.findIndex((entry) => entry.id === app.id) + 1}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Метод, позиція, розмір.</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    onClick={() => handleRemovePrintApplication(app.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_280px]">
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">Метод</div>
                    <ChipDropdown
                      value={app.method}
                      onChange={(value) => handleUpdatePrintApplication(app.id, "method", value)}
                      options={availablePrintMethods.map((method) => ({
                        value: method.id,
                        label: method.name,
                      }))}
                      placeholder="Оберіть метод"
                      icon={<Palette className="h-3.5 w-3.5" />}
                      popoverClassName="w-[320px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">Позиція</div>
                    <ChipDropdown
                      value={app.position}
                      onChange={(value) => handleUpdatePrintApplication(app.id, "position", value)}
                      options={resolvedPrintPositions.map((pos) => ({
                        value: pos.id,
                        label: pos.label,
                      }))}
                      placeholder="Оберіть позицію"
                      icon={<MapPin className="h-3.5 w-3.5" />}
                      popoverClassName="w-[320px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">Розмір, мм</div>
                    <div className="grid grid-cols-[minmax(110px,1fr)_auto_minmax(110px,1fr)] items-center gap-2">
                      <Input
                        type="number"
                        aria-label="Ширина нанесення, мм"
                        placeholder="Ширина"
                        value={app.width}
                        onChange={(e) => handleUpdatePrintApplication(app.id, "width", e.target.value)}
                        className="h-9 bg-background/70"
                      />
                      <span className="text-sm text-muted-foreground">×</span>
                      <Input
                        type="number"
                        aria-label="Висота нанесення, мм"
                        placeholder="Висота"
                        value={app.height}
                        onChange={(e) => handleUpdatePrintApplication(app.id, "height", e.target.value)}
                        className="h-9 bg-background/70"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {printApplications.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-border/60 bg-muted/15 px-4 py-8 text-center text-sm text-muted-foreground">
                Для цього прорахунку друк не потрібен. Дизайн-блок і файли теж будуть приховані.
              </div>
            ) : null}
            </div>
          </div>
        </div>
        ) : null}

        {/* Design section */}
        {(isPrintPackageMode || printMode !== "no_print") ? (
        <div className="mt-8 space-y-4">
          <SectionHeader>Дизайн</SectionHeader>
          <div className="rounded-[20px] border border-border/40 bg-background/35 p-4 md:p-5">
            <div className="grid gap-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Задача на дизайн
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !createDesignTask;
                      setCreateDesignTask(next);
                      if (!next) {
                        setDesignAssigneeId(null);
                        setDesignCollaboratorIds([]);
                        setDesignTaskType(null);
                      }
                    }}
                    className={cn(
                      "inline-flex h-9 w-full items-center rounded-full border px-3.5 text-sm font-medium transition-all",
                      createDesignTask
                        ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                        : "border-border/40 bg-background/55 text-muted-foreground hover:border-border/50 hover:bg-background/70"
                    )}
                  >
                    <Palette className={cn("mr-2 h-3.5 w-3.5", createDesignTask ? "text-primary" : "text-muted-foreground")} />
                    <span>{createDesignTask ? "Створити задачу" : "Не створювати"}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Виконавець
                  </div>
                  <ChipDropdown
                    value={designAssigneeId ?? "none"}
                    onChange={(value) => {
                      const nextAssigneeId = value === "none" ? null : value;
                      setDesignAssigneeId(nextAssigneeId);
                      setDesignCollaboratorIds((prev) => prev.filter((entry) => entry !== nextAssigneeId));
                    }}
                    disabled={!createDesignTask}
                    options={
                      designerMembers.length > 0
                        ? [
                            { value: "none", label: "Без виконавця" },
                            ...designerMembers.map((member) => ({
                              value: member.id,
                              label: member.label,
                            })),
                          ]
                        : [
                            {
                              value: "none",
                              label:
                                teamMembers.length === 0
                                  ? "Немає учасників"
                                  : hasRoleInfo
                                    ? "Немає дизайнерів"
                                    : "Ролі не налаштовані",
                            },
                          ]
                    }
                    placeholder={createDesignTask ? "Без виконавця" : "Увімкніть задачу"}
                    icon={<User className="h-3.5 w-3.5" />}
                    popoverClassName="w-[320px]"
                    isActive={Boolean(designAssigneeId)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Співвиконавці
                  </div>
                  <MultiChipDropdown
                    values={designCollaboratorIds}
                    onChange={(values) => setDesignCollaboratorIds(values.filter((value) => value !== designAssigneeId))}
                    disabled={!createDesignTask}
                    options={designerMembers
                      .filter((member) => member.id !== designAssigneeId)
                      .map((member) => ({
                        value: member.id,
                        label: member.label,
                      }))}
                    placeholder={createDesignTask ? "Не додано" : "Увімкніть задачу"}
                    icon={<Users className="h-3.5 w-3.5" />}
                    popoverClassName="w-[320px]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Тип задачі
                  </div>
                  <ChipDropdown
                    value={designTaskType ?? ""}
                    onChange={(value) => setDesignTaskType((value || null) as DesignTaskType | null)}
                    disabled={!createDesignTask}
                    options={DESIGN_TASK_TYPE_OPTIONS}
                    placeholder={createDesignTask ? "Оберіть тип задачі" : "Увімкніть задачу"}
                    icon={<Palette className="h-3.5 w-3.5" />}
                    popoverClassName="w-[320px]"
                    isActive={Boolean(designTaskType)}
                  />
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">ТЗ для дизайнера</div>
                  <Textarea
                    className="min-h-[180px] resize-y text-foreground placeholder:text-muted-foreground"
                    placeholder="Опишіть задачу для дизайнера: референси, текст, побажання, обмеження"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Файли для дизайнера</div>
                  <div
                    onDrop={handleFileDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!filesDragActive) setFilesDragActive(true);
                    }}
                    onDragLeave={() => setFilesDragActive(false)}
                    className={cn(
                      "relative flex min-h-[180px] items-center justify-center border-2 border-dashed rounded-[18px] p-6 text-center transition-colors cursor-pointer",
                      filesDragActive
                        ? "border-primary/70 bg-primary/10"
                        : "border-border/40 hover:border-border/60"
                    )}
                  >
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      accept="*/*"
                    />
                    <div className="flex flex-col items-center gap-2">
                      <Paperclip className={cn("h-5 w-5", filesDragActive ? "text-primary" : "text-muted-foreground")} />
                      <div className={cn("text-sm", filesDragActive ? "font-medium text-primary" : "text-foreground")}>
                        {filesDragActive ? "Відпустіть файли тут" : "Перетягніть або клікніть для вибору"}
                      </div>
                      <div className="text-xs text-muted-foreground">до 5 файлів, до 50MB</div>
                    </div>
                  </div>

                  {files.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {files.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 rounded-full border border-border/30 bg-muted/20 px-3 py-1.5 text-sm"
                        >
                          <Paperclip className="h-3 w-3" />
                          <span className="text-xs">{file.name}</span>
                          <button
                            onClick={() => setFiles(files.filter((_, i) => i !== index))}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        ) : null}

        {submitError ? (
          <div className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {submitError}
          </div>
        ) : null}
          </div>
          {/* Footer */}
          <div className="border-t border-border/40 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {files.length > 0 ? (
                  <>
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>{files.length} файлів</span>
                  </>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => void handleSubmit()}
                  size="sm"
                  disabled={submitting}
                  className="gap-1.5 px-4 h-9 rounded-[var(--radius-md)] shadow-md shadow-primary/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {submitting ? "Збереження..." : isEditMode ? "Зберегти" : "Створити"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
