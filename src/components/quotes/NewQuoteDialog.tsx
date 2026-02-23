import * as React from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { Separator } from "@/components/ui/separator";
import { AvatarBase } from "@/components/app/avatar-kit";
import { cn } from "@/lib/utils";
import { isDesignerJobRole } from "@/lib/permissions";
import {
  Building2,
  User,
  CalendarIcon,
  DollarSign,
  Shirt,
  Printer,
  Package,
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
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import type { CatalogType } from "@/types/catalog";

/**
 * Quote statuses
 */
const QUOTE_STATUSES = [
  { value: "new", label: "Новий", icon: PlusCircle, iconClass: "text-slate-400" },
  { value: "estimating", label: "На прорахунку", icon: PlayCircle, iconClass: "text-amber-400" },
  { value: "estimated", label: "Пораховано", icon: Check, iconClass: "text-sky-400" },
  { value: "awaiting_approval", label: "На погодженні", icon: Hourglass, iconClass: "text-violet-400" },
  { value: "approved", label: "Затверджено", icon: CheckCircle2, iconClass: "text-emerald-400" },
  { value: "cancelled", label: "Скасовано", icon: XCircle, iconClass: "text-rose-400" },
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
  { value: "client", label: "Клієнт" },
];

/**
 * Quantity units
 */
const QUANTITY_UNITS = [
  { value: "pcs", label: "шт" },
  { value: "m", label: "м" },
  { value: "m2", label: "м²" },
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

type DeliveryDetails = {
  region: string;
  city: string;
  address: string;
  street: string;
  npDeliveryType: string;
  payer: string;
};

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

/**
 * Customer type
 */
export type Customer = {
  id: string;
  name?: string | null;
  legal_name?: string | null;
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
  teamMembers?: TeamMember[];
  catalogTypes?: CatalogType[];
  currentUserId?: string;
}

/**
 * Form data structure
 */
export type NewQuoteFormData = {
  status: string;
  comment?: string;
  customerId?: string;
  managerId?: string;
  designAssigneeId?: string | null;
  deadline?: Date;
  deadlineNote?: string;
  currency: string;
  quoteType: string;
  deliveryType?: string;
  deliveryDetails?: DeliveryDetails;
  categoryId?: string;
  kindId?: string;
  modelId?: string;
  quantity?: number;
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
  teamMembers = [],
  catalogTypes = [],
  currentUserId,
}) => {
  void _teamId;
  const isEditMode = mode === "edit";
  // Form state
  const [status, setStatus] = React.useState("new");
  const [comment, setComment] = React.useState("");
  const [customerId, setCustomerId] = React.useState<string>("");
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [managerId, setManagerId] = React.useState<string>("");
  const [deadline, setDeadline] = React.useState<Date>();
  const [deadlineNote, setDeadlineNote] = React.useState("");
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
  const [categoryId, setCategoryId] = React.useState<string>("");
  const [kindId, setKindId] = React.useState<string>("");
  const [modelId, setModelId] = React.useState<string>("");
  const [quantity, setQuantity] = React.useState<number>();
  const [quantityUnit, setQuantityUnit] = React.useState("pcs");
  const [printApplications, setPrintApplications] = React.useState<PrintApplication[]>([]);
  const [printMode, setPrintMode] = React.useState<"with_print" | "no_print">("with_print");
  const [createDesignTask, setCreateDesignTask] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);

  // Popover states
  const [statusPopoverOpen, setStatusPopoverOpen] = React.useState(false);
  const [customerPopoverOpen, setCustomerPopoverOpen] = React.useState(false);
  const [managerPopoverOpen, setManagerPopoverOpen] = React.useState(false);
  const [deadlinePopoverOpen, setDeadlinePopoverOpen] = React.useState(false);
  const [currencyPopoverOpen, setCurrencyPopoverOpen] = React.useState(false);
  const [deliveryPopoverOpen, setDeliveryPopoverOpen] = React.useState(false);
  const currentYear = React.useMemo(() => new Date().getFullYear(), []);

  const selectedType = React.useMemo(
    () => catalogTypes.find((type) => type.id === categoryId),
    [catalogTypes, categoryId]
  );
  const selectedKind = React.useMemo(
    () => selectedType?.kinds.find((kind) => kind.id === kindId),
    [selectedType, kindId]
  );
  const availablePrintMethods = selectedKind?.methods ?? [];
  const availablePrintPositions = selectedKind?.printPositions ?? [];
  const hasRoleInfo = React.useMemo(
    () => teamMembers.some((member) => !!member.jobRole),
    [teamMembers]
  );
  const designerMembers = React.useMemo(() => {
    return teamMembers.filter((member) => isDesignerJobRole(member.jobRole));
  }, [teamMembers]);

  React.useEffect(() => {
    if (!open) return;
    const nextPrintApplications = (initialValues?.printApplications ?? []).map((app, index) => ({
      id: app.id || `${Date.now()}-${index}`,
      method: app.method ?? "",
      position: app.position ?? "",
      width: app.width ?? "",
      height: app.height ?? "",
    }));

    setStatus(initialValues?.status ?? "new");
    setComment(initialValues?.comment ?? "");
    setCustomerId(initialValues?.customerId ?? "");
    setCustomerSearch("");
    setManagerId(initialValues?.managerId ?? currentUserId ?? "");
    setDeadline(initialValues?.deadline);
    setDeadlineNote(initialValues?.deadlineNote ?? "");
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
    setQuantity(initialValues?.quantity);
    setQuantityUnit(initialValues?.quantityUnit ?? "pcs");
    setPrintApplications(nextPrintApplications);
    const nextPrintMode = nextPrintApplications.length > 0 ? "with_print" : "no_print";
    setPrintMode(nextPrintMode);
    if (nextPrintMode === "no_print") {
      setCreateDesignTask(false);
      setDesignAssigneeId(null);
    } else {
      setCreateDesignTask(!!initialValues?.createDesignTask);
      setDesignAssigneeId(initialValues?.designAssigneeId ?? null);
    }
    setFiles(initialValues?.files ?? []);

    setStatusPopoverOpen(false);
    setCustomerPopoverOpen(false);
    setManagerPopoverOpen(false);
    setDeadlinePopoverOpen(false);
    setCurrencyPopoverOpen(false);
    setDeliveryPopoverOpen(false);
  }, [open, initialValues, currentUserId]);

  // Add print application
  const handleAddPrintApplication = () => {
    if (printMode === "no_print") return;
    setPrintApplications([
      ...printApplications,
      {
        id: `${Date.now()}-${Math.random()}`,
        method: availablePrintMethods[0]?.id ?? "",
        position: availablePrintPositions[0]?.id ?? "",
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
    if (printMode === "no_print") return;
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles([...files, ...droppedFiles].slice(0, 5));
  };

  // Handle file select
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (printMode === "no_print") return;
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles([...files, ...selectedFiles].slice(0, 5));
    }
  };

  // Handle submit
  const handleSubmit = async () => {
    // Validation
    if (!isEditMode && !customerId) {
      alert("Оберіть клієнта");
      setCustomerPopoverOpen(true);
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
        alert("Для Нової пошти заповніть область");
        return;
      }
      if (!hasCity) {
        alert("Для Нової пошти заповніть місто");
        return;
      }
      if (!hasNpDeliveryType) {
        alert("Для Нової пошти оберіть тип доставки");
        return;
      }
      if (deliveryDetails.npDeliveryType === "address" && !hasStreet) {
        alert("Для адресної доставки заповніть вулицю");
        return;
      }
    }

    if (deliveryType === "taxi") {
      if (!hasCity) {
        alert("Для таксі / Uklon заповніть місто");
        return;
      }
      if (!hasAddress) {
        alert("Для таксі / Uklon заповніть адресу");
        return;
      }
    }

    if (deliveryType === "cargo") {
      if (!hasRegion) {
        alert("Для вантажного перевезення заповніть область");
        return;
      }
      if (!hasCity) {
        alert("Для вантажного перевезення заповніть місто");
        return;
      }
      if (!hasAddress) {
        alert("Для вантажного перевезення заповніть адресу");
        return;
      }
    }

    const finalPrints = printMode === "no_print" ? [] : printApplications;
    const shouldCreateDesignTask = printMode !== "no_print" && createDesignTask;
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
      managerId,
      designAssigneeId: shouldCreateDesignTask ? designAssigneeId : null,
      deadline,
      deadlineNote,
      currency,
      quoteType,
      deliveryType,
      deliveryDetails: sanitizedDeliveryDetails,
      categoryId,
      kindId,
      modelId,
      quantity,
      quantityUnit,
      printApplications: finalPrints,
      createDesignTask: shouldCreateDesignTask,
      files,
    };

    await onSubmit?.(formData);
  };

  // Get current status
  const currentStatus = QUOTE_STATUSES.find((s) => s.value === status) ?? QUOTE_STATUSES[0];
  const currentCurrency = CURRENCIES.find((c) => c.value === currency);
  const currentDelivery = DELIVERY_OPTIONS.find((opt) => opt.value === deliveryType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[800px] max-h-[85vh] overflow-hidden p-0">
        <div className="flex max-h-[85vh] flex-col">
          <DialogHeader className="px-6 pt-6 pb-3">
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
          <div className="overflow-y-auto px-6 pb-4">

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
                {QUOTE_STATUSES.map((statusOption) => (
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
          {isEditMode ? (
            <Chip size="md" icon={<Building2 />} active>
              {customerLabel || "Клієнт"}
            </Chip>
          ) : (
            <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
              <PopoverTrigger asChild>
                <Chip size="md" icon={<Building2 />} active={!!customerId}>
                  {customerId
                    ? customers.find((c) => c.id === customerId)?.name || "Клієнт обрано"
                    : "Клієнт"}
                </Chip>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="space-y-2">
                  <Input
                    placeholder="Пошук клієнта..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      onCustomerSearch?.(e.target.value);
                    }}
                    className="h-8"
                  />
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {customersLoading ? (
                      <div className="text-xs text-muted-foreground p-2">Завантаження...</div>
                    ) : customers.length > 0 ? (
                      customers.map((customer) => (
                        <Button
                          key={customer.id}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start h-9 text-sm truncate"
                          onClick={() => {
                            setCustomerId(customer.id);
                            setCustomerPopoverOpen(false);
                          }}
                          title={customer.name || customer.legal_name || "Без назви"}
                        >
                          <span className="truncate max-w-[220px]">
                            {customer.name || customer.legal_name || "Без назви"}
                          </span>
                        </Button>
                      ))
                    ) : customerSearch ? (
                      <div className="space-y-2 p-2">
                        <div className="text-xs text-muted-foreground">Клієнтів не знайдено</div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full justify-center text-sm h-9"
                          onClick={() => {
                            onCreateCustomer?.(customerSearch.trim());
                            setCustomerPopoverOpen(false);
                          }}
                        >
                          Додати нового клієнта
                        </Button>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground p-2">Введіть назву для пошуку</div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

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
                  ? format(deadline, "d MMM", { locale: uk })
                  : "Дедлайн"}
              </Chip>
            </PopoverTrigger>
            <PopoverContent className="w-fit max-w-[calc(100vw-2rem)] p-0" align="start">
              <Calendar
                mode="single"
                selected={deadline}
                onSelect={(date) => {
                  setDeadline(date);
                  setDeadlinePopoverOpen(false);
                }}
                captionLayout="dropdown-buttons"
                fromYear={currentYear - 3}
                toYear={currentYear + 5}
                initialFocus
              />
              <DateQuickActions
                onSelect={(date) => {
                  setDeadline(date ?? undefined);
                  setDeadlinePopoverOpen(false);
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
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Нотатка до дедлайну</div>
            <Input
              value={deadlineNote}
              onChange={(e) => setDeadlineNote(e.target.value)}
              placeholder="Напр. До 12:00 погодити макет"
              className="h-9"
            />
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

          <div className="space-y-3">
            {/* Type toggle */}
            <div className="grid grid-cols-[auto_1fr] items-center gap-2">
              <span className="text-sm text-muted-foreground">Тип:</span>
              <ToggleGroup
                type="single"
                value={quoteType}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    setQuoteType(value);
                  } else if (Array.isArray(value) && value[0]) {
                    setQuoteType(value[0]);
                  }
                }}
                className="w-full justify-start gap-2"
              >
                {QUOTE_TYPES.map((type) => (
                  <ToggleGroupItem
                    key={type.value}
                    value={type.value}
                    className={cn(
                      "gap-1.5 h-9 px-3 rounded-[var(--radius-md)] border border-border/50",
                      "bg-muted/20 text-sm text-foreground",
                      "data-[state=on]:bg-primary/12 data-[state=on]:border-primary/40 data-[state=on]:text-primary",
                      "data-[state=on]:shadow-sm"
                    )}
                  >
                    <type.icon className="h-3.5 w-3.5" />
                    {type.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            {!isEditMode ? (
              <>
                {/* Cascading selects */}
                <div className="grid grid-cols-3 gap-3">
                  <Select 
                    value={categoryId} 
                    onValueChange={(value) => {
                      setCategoryId(value);
                      setKindId("");
                      setModelId("");
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Категорія" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogTypes
                        .filter(type => !quoteType || type.quote_type === quoteType || !type.quote_type)
                        .map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  <Select 
                    value={kindId} 
                    onValueChange={(value) => {
                      setKindId(value);
                      setModelId("");
                    }}
                    disabled={!categoryId}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Вид" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogTypes
                        .find(t => t.id === categoryId)
                        ?.kinds.map((kind) => (
                          <SelectItem key={kind.id} value={kind.id}>
                            {kind.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  <Select value={modelId} onValueChange={setModelId} disabled={!kindId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Модель" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogTypes
                        .find(t => t.id === categoryId)
                        ?.kinds.find(k => k.id === kindId)
                        ?.models.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quantity */}
                <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                  <span className="text-sm text-muted-foreground">Кількість:</span>
                  <div className="flex gap-2 flex-1">
                    <Input
                      type="number"
                      placeholder="0"
                      value={quantity || ""}
                      onChange={(e) => setQuantity(Number(e.target.value) || undefined)}
                      className="h-9 max-w-[120px]"
                    />
                    <Select value={quantityUnit} onValueChange={setQuantityUnit}>
                      <SelectTrigger className="h-9 w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUANTITY_UNITS.map((unit) => (
                          <SelectItem key={unit.value} value={unit.value}>
                            {unit.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-[var(--radius-md)] border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                Категорія/вид/модель і кількість редагуються в деталях прорахунку.
              </div>
            )}
          </div>
        </div>

        {/* Print applications section */}
        {!isEditMode ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 -mx-6 px-6">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-normal">
              Нанесення
            </span>
            <Separator className="flex-1 bg-border/40" />
            <ToggleGroup
              type="single"
              value={printMode}
              onValueChange={(value) => {
                const next = (value as "with_print" | "no_print" | null) ?? "with_print";
                setPrintMode(next);
                if (next === "no_print") {
                  setPrintApplications([]);
                  setFiles([]);
                  setCreateDesignTask(false);
                  setDesignAssigneeId(null);
                }
              }}
              className="hidden sm:flex"
            >
              <ToggleGroupItem value="with_print" className="px-3 py-1 text-xs">
                З нанесенням
              </ToggleGroupItem>
              <ToggleGroupItem value="no_print" className="px-3 py-1 text-xs">
                Без нанесення
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddPrintApplication}
              className="h-7 gap-1.5 text-xs -mr-2"
              disabled={printMode === "no_print"}
            >
              <Plus className="h-3.5 w-3.5" />
              Додати
            </Button>
          </div>

          {/* Print applications list */}
          <div className="space-y-2">
            {printApplications.map((app) => (
              <div
                key={app.id}
                className="flex items-end gap-3 p-3 rounded-[var(--radius-md)] border border-border/40 bg-muted/5"
              >
                <div className="space-y-1">
                  <div className="px-1 text-[11px] font-medium text-foreground/80">
                    Метод
                  </div>
                  <Select
                    value={app.method}
                    onValueChange={(value) =>
                      handleUpdatePrintApplication(app.id, "method", value)
                    }
                  >
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue placeholder="Метод" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePrintMethods.map((method) => (
                        <SelectItem key={method.id} value={method.id}>
                          {method.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <div className="px-1 text-[11px] font-medium text-foreground/80">
                    Місце
                  </div>
                  <Select
                    value={app.position}
                    onValueChange={(value) =>
                      handleUpdatePrintApplication(app.id, "position", value)
                    }
                  >
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue placeholder="Місце" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePrintPositions.map((pos) => (
                        <SelectItem key={pos.id} value={pos.id}>
                          {pos.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end gap-1.5">
                  <div className="space-y-1">
                    <div className="px-1 text-[11px] font-medium text-foreground/80">
                      Ширина, мм
                    </div>
                    <Input
                      type="number"
                      aria-label="Ширина нанесення, мм"
                      placeholder="0"
                      value={app.width}
                      onChange={(e) =>
                        handleUpdatePrintApplication(app.id, "width", e.target.value)
                      }
                      className="h-8 w-[84px]"
                    />
                  </div>
                  <span className="mb-2 text-sm text-muted-foreground">×</span>
                  <div className="space-y-1">
                    <div className="px-1 text-[11px] font-medium text-foreground/80">
                      Висота, мм
                    </div>
                    <Input
                      type="number"
                      aria-label="Висота нанесення, мм"
                      placeholder="0"
                      value={app.height}
                      onChange={(e) =>
                        handleUpdatePrintApplication(app.id, "height", e.target.value)
                      }
                      className="h-8 w-[84px]"
                    />
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={() => handleRemovePrintApplication(app.id)}
                  className="ml-auto text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            {printMode === "no_print" ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Нанесення не потрібне для цього прорахунку.
              </div>
            ) : printApplications.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Немає нанесень. Натисніть "Додати", щоб створити.
              </div>
            ) : null}
          </div>
        </div>
        ) : null}

        {/* Design section */}
        {!isEditMode && printMode !== "no_print" ? (
        <div className="space-y-4">
          <SectionHeader>Дизайн</SectionHeader>
          <div className="rounded-[var(--radius-md)] border border-border/40 bg-muted/5 p-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,1fr)]">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">ТЗ для дизайнера</div>
                <Textarea
                  className="min-h-[120px] resize-y text-foreground placeholder:text-muted-foreground"
                  placeholder="Опишіть задачу для дизайнера: референси, текст, побажання, обмеження"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={createDesignTask}
                    onCheckedChange={(checked) => {
                      const next = !!checked;
                      setCreateDesignTask(next);
                      if (!next) setDesignAssigneeId(null);
                    }}
                    className="mt-1"
                  />
                  <div className="space-y-1 text-sm">
                    <div className="font-medium">Створити задачу на дизайн</div>
                    <p className="text-muted-foreground text-xs">
                      Використайте, коли потрібен макет від дизайнера.
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Виконавець (дизайнер)</div>
                  <Select
                    value={designAssigneeId ?? "none"}
                    onValueChange={(value) => setDesignAssigneeId(value === "none" ? null : value)}
                    disabled={!createDesignTask}
                  >
                    <SelectTrigger className="h-9 w-full text-foreground">
                      <SelectValue
                        className="text-foreground"
                        placeholder={createDesignTask ? "Без виконавця" : "Увімкніть задачу"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без виконавця</SelectItem>
                      {designerMembers.length > 0 ? (
                        designerMembers.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.label}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="empty" disabled>
                          {teamMembers.length === 0
                            ? "Немає учасників"
                            : hasRoleInfo
                              ? "Немає дизайнерів"
                              : "Ролі не налаштовані"}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Файли для дизайнера</div>
              <div
                onDrop={handleFileDrop}
                onDragOver={(e) => e.preventDefault()}
                className="relative border-2 border-dashed border-border/40 rounded-[var(--radius-md)] p-6 text-center transition-colors hover:border-border/60 cursor-pointer"
              >
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept="*/*"
                />
                <div className="flex flex-col items-center gap-2">
                  <Paperclip className="h-5 w-5 text-muted-foreground" />
                  <div className="text-sm text-foreground">Перетягніть або клікніть для вибору</div>
                  <div className="text-xs text-muted-foreground">
                    до 5 файлів, до 50MB
                  </div>
                </div>
              </div>

              {files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/20 border border-border/30 text-sm"
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
                  {isEditMode ? "Зберегти" : "Створити"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
