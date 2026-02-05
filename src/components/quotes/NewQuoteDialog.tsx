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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
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
 * Print methods (types of application)
 */
const PRINT_METHODS = [
  { value: "dtf", label: "DTF" },
  { value: "screen", label: "Трафарет" },
  { value: "embroidery", label: "Вишивка" },
  { value: "sublimation", label: "Сублімація" },
  { value: "vinyl", label: "Термовініл" },
];

/**
 * Print positions
 */
const PRINT_POSITIONS = [
  { value: "chest", label: "Груди" },
  { value: "back", label: "Спина" },
  { value: "left_sleeve", label: "Лівий рукав" },
  { value: "right_sleeve", label: "Правий рукав" },
  { value: "neck", label: "Комір" },
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
};

/**
 * New Quote Dialog Props
 */
export interface NewQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (data: NewQuoteFormData) => void;
  teamId: string;
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
  customerId?: string;
  managerId?: string;
  deadline?: Date;
  deadlineNote?: string;
  currency: string;
  quoteType: string;
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
  teamId,
  customers = [],
  customersLoading = false,
  onCustomerSearch,
  onCreateCustomer,
  teamMembers = [],
  catalogTypes = [],
  currentUserId,
}) => {
  // Form state
  const [status, setStatus] = React.useState("new");
  const [customerId, setCustomerId] = React.useState<string>("");
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [managerId, setManagerId] = React.useState<string>("");
  const [deadline, setDeadline] = React.useState<Date>();
  const [deadlineNote, setDeadlineNote] = React.useState("");
  const [currency, setCurrency] = React.useState("UAH");
  const [quoteType, setQuoteType] = React.useState("merch");
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

  // Set default manager to current user when dialog opens
  React.useEffect(() => {
    if (open && currentUserId && !managerId) {
      setManagerId(currentUserId);
    }
  }, [open, currentUserId, managerId]);

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
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles([...files, ...droppedFiles].slice(0, 5));
  };

  // Handle file select
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles([...files, ...selectedFiles].slice(0, 5));
    }
  };

  // Handle submit
  const handleSubmit = () => {
    // Validation
    if (!customerId) {
      alert("Оберіть клієнта");
      setCustomerPopoverOpen(true);
      return;
    }

    const finalPrints = printMode === "no_print" ? [] : printApplications;

    const formData: NewQuoteFormData = {
      status,
      customerId,
      managerId,
      deadline,
      deadlineNote,
      currency,
      quoteType,
      categoryId,
      kindId,
      modelId,
      quantity,
      quantityUnit,
      printApplications: finalPrints,
      createDesignTask,
      files,
    };

    onSubmit?.(formData);

    onOpenChange(false);
  };

  // Get current status
  const currentStatus = QUOTE_STATUSES.find((s) => s.value === status) ?? QUOTE_STATUSES[0];
  const currentCurrency = CURRENCIES.find((c) => c.value === currency);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[800px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-medium flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Новий прорахунок
          </DialogTitle>
          <DialogDescription>
            Заповніть параметри замовлення, щоб створити прорахунок.
          </DialogDescription>
        </DialogHeader>

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

          {/* Manager */}
          <Popover open={managerPopoverOpen} onOpenChange={setManagerPopoverOpen}>
            <PopoverTrigger asChild>
              <Chip size="md" icon={<User />} active={!!managerId}>
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
                      <User className="h-3.5 w-3.5 shrink-0" />
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
            <PopoverContent className="w-auto p-0" align="start">
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

        </div>

        {/* Product section */}
        <div className="space-y-4">
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
          </div>
        </div>

        {/* Print applications section */}
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
                className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-border/40 bg-muted/5"
              >
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

                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    placeholder="0"
                    value={app.width}
                    onChange={(e) =>
                      handleUpdatePrintApplication(app.id, "width", e.target.value)
                    }
                    className="h-8 w-[70px]"
                  />
                  <span className="text-sm text-muted-foreground">×</span>
                  <Input
                    type="number"
                    placeholder="0"
                    value={app.height}
                    onChange={(e) =>
                      handleUpdatePrintApplication(app.id, "height", e.target.value)
                    }
                    className="h-8 w-[70px]"
                  />
                  <span className="text-xs text-muted-foreground">мм</span>
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

        {/* Files section */}
        <div className="space-y-4">
          <SectionHeader>Файли</SectionHeader>

          <div
            onDrop={handleFileDrop}
            onDragOver={(e) => e.preventDefault()}
            className="relative border-2 border-dashed border-border/40 rounded-[var(--radius-md)] p-8 text-center hover:border-border/60 transition-colors cursor-pointer"
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
              <div className="text-sm text-foreground">
                Перетягніть або клікніть для вибору
              </div>
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

        {/* Footer */}
        <Separator className="bg-border/40 -mx-6 w-[calc(100%+3rem)]" />
        <div className="flex items-center justify-between -mb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            <span>{files.length} файлів</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSubmit}
              size="sm"
              className="gap-1.5 px-4 h-9 rounded-[var(--radius-md)] shadow-md shadow-primary/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Створити
            </Button>
          </div>
        </div>

        {/* Design task toggle */}
        <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border/40 bg-muted/5 px-4 py-3">
          <Checkbox
            checked={createDesignTask}
            onCheckedChange={(checked) => setCreateDesignTask(!!checked)}
            className="mt-1"
          />
          <div className="space-y-1 text-sm">
            <div className="font-medium">Створити задачу дизайну</div>
            <p className="text-muted-foreground text-xs">
              Якщо потрібен макет: увімкніть, додайте метод нанесення та файли/коментар для дизайнера.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
