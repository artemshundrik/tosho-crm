import * as React from "react";
import { toast } from "sonner";
import {
  Copy,
  FileText,
  Layers3,
  Loader2,
  MapPin,
  Package,
  Palette,
  Plus,
  Printer,
  Shirt,
  Trash2,
  Truck,
  Upload,
  User,
  Wand2,
  X,
  Car,
  CalendarIcon,
  Check,
  ChevronDown,
  Users,
  Ruler,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Chip } from "@/components/ui/chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { AvatarBase } from "@/components/app/avatar-kit";
import { CustomerLeadPicker, type CustomerLeadOption } from "@/components/customers";
import { cn } from "@/lib/utils";
import { normalizeUnitLabel } from "@/lib/units";
import { isDesignerJobRole, isQuoteManagerJobRole, normalizeJobRole } from "@/lib/permissions";
import {
  DESIGN_TASK_TYPE_ICONS,
  DESIGN_TASK_TYPE_LABELS,
  DESIGN_TASK_TYPE_OPTIONS,
  type DesignTaskType,
} from "@/lib/designTaskType";
import { formatUserShortName } from "@/lib/userName";
import {
  createEmptyPrintPackageConfig,
  formatPrintProductSummary,
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
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import type { CatalogType } from "@/types/catalog";

const QUOTE_TYPES = [
  { value: "merch", label: "Мерч", icon: Shirt },
  { value: "print", label: "Поліграфія", icon: Printer },
  { value: "other", label: "Інше", icon: Package },
] as const;

const CURRENCIES = [
  { value: "UAH", label: "UAH" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
] as const;

const QUANTITY_UNITS = [
  { value: "шт.", label: "шт." },
  { value: "м", label: "м" },
  { value: "м²", label: "м²" },
] as const;

const DELIVERY_OPTIONS = [
  { value: "nova_poshta", label: "Нова пошта", icon: Truck },
  { value: "pickup", label: "Самовивіз", icon: MapPin },
  { value: "taxi", label: "Таксі / Uklon", icon: Car },
  { value: "cargo", label: "Вантажне перевезення", icon: Truck },
] as const;

const NOVA_POSHTA_DELIVERY_TYPES = [
  { value: "branch", label: "Відділення" },
  { value: "locker", label: "Поштомат" },
  { value: "address", label: "Адресна" },
] as const;

const DELIVERY_PAYER_OPTIONS = [
  { value: "company", label: "Ми" },
  { value: "client", label: "Замовник" },
] as const;

const DEFAULT_DEADLINE_TIME = "10:00";
const isValidDeadlineTime = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

type QuoteTypeValue = (typeof QUOTE_TYPES)[number]["value"];

type ProductRunDraft = {
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

export type QuoteBatchPrintApplicationDraft = {
  id: string;
  method: string;
  position: string;
  width: string;
  height: string;
};

export type QuoteBatchProductSubmitData = {
  id: string;
  quoteType: QuoteTypeValue;
  categoryId: string;
  kindId: string;
  modelId: string;
  productConfiguratorPreset?: PrintConfiguratorPreset | null;
  printPackageConfig?: PrintPackageConfig;
  deliveryType: string | null;
  deliveryDetails: DeliveryDetails | null;
  quantityUnit: string;
  runs: Array<{ id: string; quantity: number }>;
  printApplications: QuoteBatchPrintApplicationDraft[];
  managerNote: string;
  files: File[];
  createDesignTask: boolean;
  designTaskType: DesignTaskType | null;
  designAssigneeId: string | null;
  designCollaboratorIds: string[];
  designBrief: string;
};

export type QuoteBatchBuilderFormData = {
  customerId: string;
  customerType: "customer" | "lead";
  managerId: string;
  deadlineAt: string | null;
  deadlineNote: string;
  currency: string;
  comment: string;
  products: QuoteBatchProductSubmitData[];
};

type ProductDraft = Omit<QuoteBatchProductSubmitData, "runs"> & {
  runs: ProductRunDraft[];
};

export type QuoteBatchCustomer = {
  id: string;
  name?: string | null;
  legal_name?: string | null;
  logo_url?: string | null;
  manager?: string | null;
  manager_user_id?: string | null;
  entityType?: "customer" | "lead";
};

export type QuoteBatchTeamMember = {
  id: string;
  label: string;
  avatarUrl?: string | null;
  jobRole?: string | null;
};

export interface QuoteBatchBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: QuoteBatchBuilderFormData) => void | Promise<void>;
  submitting?: boolean;
  submitError?: string | null;
  customers?: QuoteBatchCustomer[];
  customersLoading?: boolean;
  onCustomerSearch?: (search: string) => void;
  onCreateCustomer?: (name?: string) => void;
  onCreateLead?: (name?: string) => void;
  teamMembers?: QuoteBatchTeamMember[];
  catalogTypes?: CatalogType[];
  onCreateCatalogModel?: (input: {
    typeId: string;
    kindId: string;
    name: string;
    sku?: string | null;
    price: number | null;
    imageUrl?: string | null;
  }) => Promise<{
    id: string;
    name: string;
    sku?: string | null;
    price?: number | null;
    imageUrl?: string | null;
  } | null | undefined>;
  currentUserId?: string;
  restrictPartySelectionToOwn?: boolean;
  currentManagerLabel?: string;
}

const createRunDraft = (quantity = ""): ProductRunDraft => ({
  id: crypto.randomUUID(),
  quantity,
});

const createPrintApplicationDraft = (): QuoteBatchPrintApplicationDraft => ({
  id: crypto.randomUUID(),
  method: "",
  position: "",
  width: "",
  height: "",
});

const normalizeProductPrintPackageConfig = (
  product: Partial<ProductDraft>,
  preset?: PrintConfiguratorPreset | null
): PrintPackageConfig => ({
  ...createEmptyPrintPackageConfig(),
  ...(product.printPackageConfig ?? {}),
  productKind:
    preset ? getProductKindFromPreset(preset) : product.printPackageConfig?.productKind || "",
});

const createProductDraft = (seed?: Partial<ProductDraft>): ProductDraft => ({
  id: crypto.randomUUID(),
  quoteType: seed?.quoteType ?? "merch",
  categoryId: seed?.categoryId ?? "",
  kindId: seed?.kindId ?? "",
  modelId: seed?.modelId ?? "",
  productConfiguratorPreset: seed?.productConfiguratorPreset ?? null,
  printPackageConfig: normalizeProductPrintPackageConfig(seed ?? {}, seed?.productConfiguratorPreset ?? null),
  deliveryType: seed?.deliveryType ?? null,
  deliveryDetails: seed?.deliveryDetails ?? null,
  quantityUnit: normalizeUnitLabel(seed?.quantityUnit ?? "шт."),
  runs: seed?.runs?.length ? seed.runs.map((run) => createRunDraft(run.quantity)) : [createRunDraft()],
  printApplications: seed?.printApplications?.map((app) => ({ ...app, id: crypto.randomUUID() })) ?? [],
  managerNote: seed?.managerNote ?? "",
  files: seed?.files ?? [],
  createDesignTask: seed?.createDesignTask ?? false,
  designTaskType: seed?.designTaskType ?? null,
  designAssigneeId: seed?.designAssigneeId ?? null,
  designCollaboratorIds: seed?.designCollaboratorIds ?? [],
  designBrief: seed?.designBrief ?? "",
});

const formatDateTimeInput = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const parseDateTimeInput = (value: string) => {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const createEmptyDeliveryDetails = (): DeliveryDetails => ({
  region: "",
  city: "",
  address: "",
  street: "",
  npDeliveryType: "",
  payer: "",
});

const trimDelivery = (value?: string | null) => value?.trim() ?? "";

const getDeliveryIssues = (deliveryType?: string | null, details?: DeliveryDetails | null) => {
  const deliveryDetails = details ?? createEmptyDeliveryDetails();
  const hasRegion = trimDelivery(deliveryDetails.region).length > 0;
  const hasCity = trimDelivery(deliveryDetails.city).length > 0;
  const hasAddress = trimDelivery(deliveryDetails.address).length > 0;
  const hasStreet = trimDelivery(deliveryDetails.street).length > 0;
  const hasNpDeliveryType = trimDelivery(deliveryDetails.npDeliveryType).length > 0;

  if (deliveryType === "nova_poshta") {
    if (!hasRegion) return "для Нової пошти заповніть область";
    if (!hasCity) return "для Нової пошти заповніть місто";
    if (!hasNpDeliveryType) return "для Нової пошти оберіть тип доставки";
    if (deliveryDetails.npDeliveryType === "address" && !hasStreet) return "для адресної доставки заповніть вулицю";
  }
  if (deliveryType === "taxi") {
    if (!hasCity) return "для таксі / Uklon заповніть місто";
    if (!hasAddress) return "для таксі / Uklon заповніть адресу";
  }
  if (deliveryType === "cargo") {
    if (!hasRegion) return "для вантажного перевезення заповніть область";
    if (!hasCity) return "для вантажного перевезення заповніть місто";
    if (!hasAddress) return "для вантажного перевезення заповніть адресу";
  }
  return null;
};

const sanitizeDeliveryDetails = (deliveryType?: string | null, details?: DeliveryDetails | null) => {
  if (!deliveryType) return null;
  const deliveryDetails = details ?? createEmptyDeliveryDetails();
  const sanitizedDeliveryDetails: DeliveryDetails = createEmptyDeliveryDetails();
  sanitizedDeliveryDetails.payer = trimDelivery(deliveryDetails.payer);
  if (deliveryType === "nova_poshta") {
    sanitizedDeliveryDetails.region = trimDelivery(deliveryDetails.region);
    sanitizedDeliveryDetails.city = trimDelivery(deliveryDetails.city);
    sanitizedDeliveryDetails.npDeliveryType = trimDelivery(deliveryDetails.npDeliveryType);
    sanitizedDeliveryDetails.street =
      sanitizedDeliveryDetails.npDeliveryType === "address" ? trimDelivery(deliveryDetails.street) : "";
  }
  if (deliveryType === "taxi") {
    sanitizedDeliveryDetails.city = trimDelivery(deliveryDetails.city);
    sanitizedDeliveryDetails.address = trimDelivery(deliveryDetails.address);
  }
  if (deliveryType === "cargo") {
    sanitizedDeliveryDetails.region = trimDelivery(deliveryDetails.region);
    sanitizedDeliveryDetails.city = trimDelivery(deliveryDetails.city);
    sanitizedDeliveryDetails.address = trimDelivery(deliveryDetails.address);
  }
  return sanitizedDeliveryDetails;
};

const sanitizeQuantity = (value: string) => value.replace(/[^\d]/g, "");

const normalizeDeadlineInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length === 16 ? `${trimmed}:00` : trimmed;
};

const getCatalogRefs = (catalogTypes: CatalogType[], product: ProductDraft) => {
  const type = catalogTypes.find((item) => item.id === product.categoryId) ?? null;
  const kind = type?.kinds.find((item) => item.id === product.kindId) ?? null;
  const model = kind?.models.find((item) => item.id === product.modelId) ?? null;
  return { type, kind, model };
};

const getProductLabel = (catalogTypes: CatalogType[], product: ProductDraft) => {
  const { model, kind, type } = getCatalogRefs(catalogTypes, product);
  return model?.name ?? kind?.name ?? type?.name ?? "Новий товар";
};

const getProductImageUrl = (catalogTypes: CatalogType[], product: ProductDraft) => {
  const { model } = getCatalogRefs(catalogTypes, product);
  return model?.imageUrl?.trim() || model?.metadata?.imageAsset?.thumbUrl || model?.metadata?.imageAsset?.previewUrl || null;
};

const getProductConfiguratorPreset = (catalogTypes: CatalogType[], product: ProductDraft) => {
  const { model } = getCatalogRefs(catalogTypes, product);
  return model?.metadata?.configuratorPreset ?? product.productConfiguratorPreset ?? null;
};

const buildConfiguratorProductOptions = (
  catalogTypes: CatalogType[],
  quoteType: QuoteTypeValue
): ConfiguratorProductOption[] =>
  catalogTypes.flatMap((type) =>
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

const getSelectedRuns = (product: ProductDraft) =>
  product.runs
    .map((run) => ({ id: run.id, quantity: Number(run.quantity) || 0 }))
    .filter((run) => run.quantity > 0);

const getInitials = (label: string) => {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "M") + (parts[1]?.[0] ?? "");
};

const ChipDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string; imageUrl?: string | null }>;
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
          {selected?.imageUrl ? (
            <span className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/30">
              <img src={selected.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            </span>
          ) : (
            <span className={cn("mr-2 shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5", active ? "text-primary" : "text-muted-foreground")}>
              {icon}
            </span>
          )}
          <span className={cn("min-w-0 flex-1 truncate text-left font-medium", !active && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-[260px] p-2", popoverClassName)}>
        <div className="space-y-1">
          {options.map((option) => {
            const selectedOption = option.value === value;
            return (
              <Button
                key={option.value}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-11 w-full justify-between gap-3 text-sm",
                  selectedOption && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  {option.imageUrl ? (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/30">
                      <img src={option.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </span>
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted/20 text-muted-foreground">
                      {icon}
                    </span>
                  )}
                  <span className="truncate">{option.label}</span>
                </span>
                {selectedOption ? <Check className="h-4 w-4" /> : null}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="flex items-center gap-2 text-base font-semibold text-foreground">
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border/50 bg-background/55 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
      {icon}
    </span>
    <span>{children}</span>
  </div>
);

const DesignTaskTypeChip: React.FC<{
  value: DesignTaskType | null;
  onChange: (value: DesignTaskType) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const SelectedIcon = value ? DESIGN_TASK_TYPE_ICONS[value] : Package;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 w-full items-center rounded-full border px-3.5 text-sm transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
            value
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border/40 bg-background/55 text-muted-foreground hover:border-border/50 hover:bg-background/70"
          )}
        >
          <SelectedIcon className={cn("mr-2 h-3.5 w-3.5 shrink-0", value ? "text-primary" : "text-muted-foreground")} />
          <span className={cn("min-w-0 flex-1 truncate text-left font-medium", !value && "text-muted-foreground")}>
            {value ? DESIGN_TASK_TYPE_LABELS[value] : "Оберіть тип задачі"}
          </span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-2">
        <div className="space-y-1">
          {DESIGN_TASK_TYPE_OPTIONS.map((option) => {
            const active = option.value === value;
            const TypeIcon = DESIGN_TASK_TYPE_ICONS[option.value];
            return (
              <Button
                key={option.value}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 w-full justify-start gap-2 text-sm",
                  active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <TypeIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{option.label}</span>
                {active ? <Check className="ml-auto h-4 w-4" /> : null}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const TeamMemberChipDropdown: React.FC<{
  value: string | null;
  onChange: (value: string | null) => void;
  options: QuoteBatchTeamMember[];
  placeholder: string;
}> = ({ value, onChange, options, placeholder }) => {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((member) => member.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 w-full items-center rounded-full border px-3.5 text-sm transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
            selected
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border/40 bg-background/55 text-muted-foreground hover:border-border/50 hover:bg-background/70"
          )}
        >
          {selected ? (
            <AvatarBase
              src={selected.avatarUrl ?? null}
              name={selected.label}
              fallback={getInitials(selected.label).toUpperCase()}
              size={18}
              className="mr-2 shrink-0 border-border/60"
              fallbackClassName="text-[9px] font-semibold"
            />
          ) : (
            <User className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className={cn("min-w-0 flex-1 truncate text-left font-medium", !selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-2">
        <div className="space-y-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-9 w-full justify-between text-sm", !selected && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <span className="inline-flex items-center gap-2">
              <User className="h-3.5 w-3.5" />
              Без виконавця
            </span>
            {!selected ? <Check className="h-4 w-4" /> : null}
          </Button>
          {options.map((member) => {
            const active = member.id === value;
            return (
              <Button
                key={member.id}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 w-full justify-between text-sm",
                  active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                )}
                onClick={() => {
                  onChange(member.id);
                  setOpen(false);
                }}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <AvatarBase
                    src={member.avatarUrl ?? null}
                    name={member.label}
                    fallback={getInitials(member.label).toUpperCase()}
                    size={20}
                    className="shrink-0 border-border/60"
                    fallbackClassName="text-[10px] font-semibold"
                  />
                  <span className="truncate">{member.label}</span>
                </span>
                {active ? <Check className="h-4 w-4" /> : null}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const TeamMemberMultiChipDropdown: React.FC<{
  values: string[];
  onChange: (values: string[]) => void;
  options: QuoteBatchTeamMember[];
  placeholder: string;
}> = ({ values, onChange, options, placeholder }) => {
  const [open, setOpen] = React.useState(false);
  const selected = options.filter((member) => values.includes(member.id));
  const label = selected.length === 0 ? placeholder : selected.length === 1 ? selected[0]?.label ?? placeholder : `Співвиконавці · ${selected.length}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 w-full items-center rounded-full border px-3.5 text-sm transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
            selected.length > 0
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border/40 bg-background/55 text-muted-foreground hover:border-border/50 hover:bg-background/70"
          )}
        >
          {selected[0] ? (
            <AvatarBase
              src={selected[0].avatarUrl ?? null}
              name={selected[0].label}
              fallback={getInitials(selected[0].label).toUpperCase()}
              size={18}
              className="mr-2 shrink-0 border-border/60"
              fallbackClassName="text-[9px] font-semibold"
            />
          ) : (
            <Users className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className={cn("min-w-0 flex-1 truncate text-left font-medium", selected.length === 0 && "text-muted-foreground")}>
            {label}
          </span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-2">
        <div className="space-y-1">
          {options.length === 0 ? <div className="px-2 py-2 text-sm text-muted-foreground">Немає доступних учасників</div> : null}
          {options.map((member) => {
            const active = values.includes(member.id);
            return (
              <Button
                key={member.id}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 w-full justify-between text-sm",
                  active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                )}
                onClick={() => {
                  onChange(active ? values.filter((value) => value !== member.id) : [...values, member.id]);
                }}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <AvatarBase
                    src={member.avatarUrl ?? null}
                    name={member.label}
                    fallback={getInitials(member.label).toUpperCase()}
                    size={20}
                    className="shrink-0 border-border/60"
                    fallbackClassName="text-[10px] font-semibold"
                  />
                  <span className="truncate">{member.label}</span>
                </span>
                {active ? <Check className="h-4 w-4" /> : null}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const QuoteBatchBuilderDialog: React.FC<QuoteBatchBuilderDialogProps> = ({
  open,
  onOpenChange,
  onSubmit,
  submitting = false,
  submitError = null,
  customers = [],
  customersLoading = false,
  onCustomerSearch,
  onCreateCustomer,
  onCreateLead,
  teamMembers = [],
  catalogTypes = [],
  onCreateCatalogModel,
  currentUserId,
  restrictPartySelectionToOwn = false,
  currentManagerLabel,
}) => {
  const [customerId, setCustomerId] = React.useState("");
  const [customerType, setCustomerType] = React.useState<"customer" | "lead">("customer");
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [customerPopoverOpen, setCustomerPopoverOpen] = React.useState(false);
  const [managerId, setManagerId] = React.useState("");
  const [deadlineAt, setDeadlineAt] = React.useState("");
  const [deadlinePopoverOpen, setDeadlinePopoverOpen] = React.useState(false);
  const [deadlineTimeDraft, setDeadlineTimeDraft] = React.useState(DEFAULT_DEADLINE_TIME);
  const [currency, setCurrency] = React.useState("UAH");
  const [products, setProducts] = React.useState<ProductDraft[]>(() => [createProductDraft()]);
  const [activeProductId, setActiveProductId] = React.useState(products[0]?.id ?? "");
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = React.useState(false);
  const [quickModelName, setQuickModelName] = React.useState("");
  const [quickModelSku, setQuickModelSku] = React.useState("");
  const [quickModelImageUrl, setQuickModelImageUrl] = React.useState("");
  const [quickModelImageErrored, setQuickModelImageErrored] = React.useState(false);
  const [quickModelSaving, setQuickModelSaving] = React.useState(false);
  const [quickModelError, setQuickModelError] = React.useState<string | null>(null);
  const [quickModelPopoverOpen, setQuickModelPopoverOpen] = React.useState(false);
  const [contentReady, setContentReady] = React.useState(false);
  const wasOpenRef = React.useRef(false);

  React.useLayoutEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      setContentReady(false);
      return;
    }
    if (wasOpenRef.current) {
      if (!contentReady) setContentReady(true);
      return;
    }
    wasOpenRef.current = true;
    const firstProduct = createProductDraft();
    setCustomerId("");
    setCustomerType("customer");
    setCustomerSearch("");
    setCustomerPopoverOpen(false);
    setManagerId(currentUserId ?? "");
    setDeadlineAt("");
    setDeadlinePopoverOpen(false);
    setDeadlineTimeDraft(DEFAULT_DEADLINE_TIME);
    setCurrency("UAH");
    setProducts([firstProduct]);
    setActiveProductId(firstProduct.id);
    setLocalError(null);
    setHasAttemptedSubmit(false);
    setQuickModelName("");
    setQuickModelSku("");
    setQuickModelImageUrl("");
    setQuickModelImageErrored(false);
    setQuickModelError(null);
    setQuickModelPopoverOpen(false);
    setContentReady(true);
  }, [contentReady, currentUserId, open]);

  const currentManagerKey = React.useMemo(() => {
    const ownLabel =
      teamMembers.find((member) => member.id === currentUserId)?.label?.trim() || currentManagerLabel || "";
    return ownLabel.trim().toLowerCase();
  }, [currentManagerLabel, currentUserId, teamMembers]);

  const customerOptions = React.useMemo<CustomerLeadOption[]>(() => {
    const normalizeManagerKey = (value?: string | null) => (value ?? "").trim().toLowerCase();
    const resolvePartyManagerUserId = (customer: QuoteBatchCustomer) => {
      const managerUserId = customer.manager_user_id?.trim() ?? "";
      if (managerUserId) return managerUserId;
      const managerValue = customer.manager?.trim() ?? "";
      if (!managerValue) return "";
      const managerShortLabel = formatUserShortName({ fullName: managerValue, fallback: managerValue });
      const matched = teamMembers.find((member) => {
        const label = member.label.trim();
        return (
          normalizeManagerKey(label) === normalizeManagerKey(managerValue) ||
          normalizeManagerKey(label) === normalizeManagerKey(managerShortLabel)
        );
      });
      return matched?.id ?? "";
    };

    return customers.map((customer) => {
      const entityType = customer.entityType ?? "customer";
      const managerUserId = resolvePartyManagerUserId(customer);
      const managerValue = customer.manager?.trim() ?? "";
      const blockedByUserId =
        restrictPartySelectionToOwn && currentUserId && managerUserId && managerUserId !== currentUserId;
      const blockedByLabel =
        restrictPartySelectionToOwn &&
        currentUserId &&
        !managerUserId &&
        managerValue &&
        currentManagerKey &&
        normalizeManagerKey(managerValue) !== currentManagerKey &&
        normalizeManagerKey(formatUserShortName({ fullName: managerValue, fallback: managerValue })) !== currentManagerKey;
      const disabled = Boolean(blockedByUserId || blockedByLabel);
      return {
        id: customer.id,
        label: customer.name || customer.legal_name || "Без назви",
        legalName: customer.legal_name ?? null,
        logoUrl: customer.logo_url ?? null,
        managerLabel: customer.manager?.trim() || null,
        searchText: [customer.name ?? "", customer.legal_name ?? ""].filter(Boolean).join(" "),
        entityType,
        disabled,
        disabledReason: disabled
          ? `Можна вибрати тільки свого замовника або ліда${managerValue ? `. Менеджер: ${managerValue}` : ""}`
          : null,
      };
    });
  }, [currentManagerKey, currentUserId, customers, restrictPartySelectionToOwn, teamMembers]);

  const selectedCustomer = customerOptions.find(
    (customer) => customer.id === customerId && customer.entityType === customerType
  );
  const currentYear = React.useMemo(() => new Date().getFullYear(), []);
  const deadlineDate = React.useMemo(() => parseDateTimeInput(deadlineAt), [deadlineAt]);
  const deadlineTime = React.useMemo(() => {
    if (!deadlineDate) return DEFAULT_DEADLINE_TIME;
    return `${String(deadlineDate.getHours()).padStart(2, "0")}:${String(deadlineDate.getMinutes()).padStart(2, "0")}`;
  }, [deadlineDate]);

  React.useEffect(() => {
    if (!deadlinePopoverOpen) return;
    setDeadlineTimeDraft(deadlineTime);
  }, [deadlinePopoverOpen, deadlineTime]);

  const updateDeadlineDate = React.useCallback(
    (date?: Date) => {
      if (!date) {
        setDeadlineAt("");
        return;
      }
      const resolvedTime = isValidDeadlineTime(deadlineTimeDraft.trim())
        ? deadlineTimeDraft.trim()
        : deadlineTime;
      const [hours, minutes] = resolvedTime.split(":").map((part) => Number(part) || 0);
      const next = new Date(date);
      next.setHours(hours, minutes, 0, 0);
      setDeadlineAt(formatDateTimeInput(next));
    },
    [deadlineTime, deadlineTimeDraft]
  );

  const updateDeadlineTime = React.useCallback(
    (value: string) => {
      setDeadlineTimeDraft(value);
      if (!isValidDeadlineTime(value) || !deadlineDate) return;
      const [hours, minutes] = value.split(":").map((part) => Number(part) || 0);
      const next = new Date(deadlineDate);
      next.setHours(hours, minutes, 0, 0);
      setDeadlineAt(formatDateTimeInput(next));
    },
    [deadlineDate]
  );

  const activeProduct = products.find((product) => product.id === activeProductId) ?? products[0];
  const activeIndex = Math.max(0, products.findIndex((product) => product.id === activeProduct?.id));

  const getConfiguratorPresetForSelection = React.useCallback(
    (categoryId: string, kindId: string, modelId: string) => {
      const type = catalogTypes.find((item) => item.id === categoryId) ?? null;
      const kind = type?.kinds.find((item) => item.id === kindId) ?? null;
      const model = kind?.models.find((item) => item.id === modelId) ?? null;
      return model?.metadata?.configuratorPreset ?? null;
    },
    [catalogTypes]
  );

  const productHasDesignSurface = React.useCallback(
    (product: ProductDraft) =>
      product.printApplications.length > 0 ||
      (product.quoteType === "print" && Boolean(getProductConfiguratorPreset(catalogTypes, product))),
    [catalogTypes]
  );

  const updateProduct = React.useCallback((productId: string, patch: Partial<ProductDraft>) => {
    setProducts((prev) => prev.map((product) => (product.id === productId ? { ...product, ...patch } : product)));
  }, []);

  const updateActiveProduct = React.useCallback(
    (patch: Partial<ProductDraft>) => {
      if (!activeProduct) return;
      updateProduct(activeProduct.id, patch);
    },
    [activeProduct, updateProduct]
  );

  const resetQuickModelDraft = React.useCallback(() => {
    setQuickModelName("");
    setQuickModelSku("");
    setQuickModelImageUrl("");
    setQuickModelImageErrored(false);
    setQuickModelError(null);
    setQuickModelPopoverOpen(false);
  }, []);

  React.useEffect(() => {
    resetQuickModelDraft();
  }, [activeProduct?.id, activeProduct?.kindId, resetQuickModelDraft]);

  React.useEffect(() => {
    setQuickModelImageErrored(false);
  }, [quickModelImageUrl]);

  const getProductIssues = React.useCallback(
    (product: ProductDraft) => {
      const issues: string[] = [];
      const productConfiguratorPreset = getProductConfiguratorPreset(catalogTypes, product);
      const isPrintPackageProduct = product.quoteType === "print" && Boolean(productConfiguratorPreset);
      const hasDesignSurface = productHasDesignSurface(product);
      if (!product.modelId) issues.push("оберіть товар");
      if (getSelectedRuns(product).length === 0) issues.push("додайте тираж");
      const deliveryIssue = getDeliveryIssues(product.deliveryType, product.deliveryDetails);
      if (deliveryIssue) issues.push(deliveryIssue);
      if (isPrintPackageProduct && productConfiguratorPreset) {
        const configError = validatePrintProductConfig(
          normalizeProductPrintPackageConfig(product, productConfiguratorPreset)
        );
        if (configError) issues.push(configError);
      } else {
        const invalidPrintIndex = product.printApplications.findIndex((app) => !app.method || !app.position);
        if (invalidPrintIndex !== -1) issues.push(`заповніть нанесення ${invalidPrintIndex + 1}`);
        const invalidSizeIndex = product.printApplications.findIndex((app) => {
          const width = app.width.trim() ? Number(app.width) : null;
          const height = app.height.trim() ? Number(app.height) : null;
          return (
            (app.width.trim() && Number.isNaN(width)) ||
            (app.height.trim() && Number.isNaN(height))
          );
        });
        if (invalidSizeIndex !== -1) issues.push(`перевірте розмір нанесення ${invalidSizeIndex + 1}`);
      }
      if (hasDesignSurface && product.createDesignTask && !product.designTaskType) issues.push("оберіть тип задачі дизайну");
      return issues;
    },
    [catalogTypes, productHasDesignSurface]
  );

  const addProduct = () => {
    const quoteType = activeProduct?.quoteType ?? "merch";
    const product = createProductDraft({
      quoteType,
      quantityUnit: activeProduct?.quantityUnit ?? "шт.",
    });
    setProducts((prev) => [...prev, product]);
    setActiveProductId(product.id);
  };

  const duplicateProduct = (product: ProductDraft) => {
    const copy = createProductDraft(product);
    setProducts((prev) => {
      const index = prev.findIndex((item) => item.id === product.id);
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setActiveProductId(copy.id);
  };

  const removeProduct = (productId: string) => {
    setProducts((prev) => {
      if (prev.length <= 1) {
        const next = createProductDraft();
        setActiveProductId(next.id);
        return [next];
      }
      const next = prev.filter((product) => product.id !== productId);
      if (activeProductId === productId) {
        setActiveProductId(next[Math.max(0, activeIndex - 1)]?.id ?? next[0]?.id ?? "");
      }
      return next;
    });
  };

  const copyRunsFromPrevious = () => {
    if (!activeProduct || activeIndex <= 0) return;
    const previous = products[activeIndex - 1];
    updateActiveProduct({
      runs: previous.runs.map((run) => createRunDraft(run.quantity)),
      quantityUnit: previous.quantityUnit,
    });
  };

  const copyPrintsFromPrevious = () => {
    if (!activeProduct || activeIndex <= 0) return;
    const previous = products[activeIndex - 1];
    updateActiveProduct({
      printApplications: previous.printApplications.map((app) => ({
        ...app,
        id: crypto.randomUUID(),
      })),
      productConfiguratorPreset: previous.productConfiguratorPreset ?? null,
      printPackageConfig: normalizeProductPrintPackageConfig(previous, previous.productConfiguratorPreset ?? null),
      createDesignTask: previous.printApplications.length > 0 || previous.productConfiguratorPreset ? previous.createDesignTask : activeProduct.createDesignTask,
      designTaskType: previous.designTaskType,
      designAssigneeId: previous.designAssigneeId,
      designCollaboratorIds: previous.designCollaboratorIds,
      designBrief: previous.designBrief,
    });
  };

  const setProductQuoteType = (value: QuoteTypeValue) => {
    updateActiveProduct({
      quoteType: value,
      categoryId: "",
      kindId: "",
      modelId: "",
      productConfiguratorPreset: null,
      printPackageConfig: normalizeProductPrintPackageConfig({}, null),
      printApplications: [],
      createDesignTask: false,
      designTaskType: null,
      designAssigneeId: null,
      designCollaboratorIds: [],
      designBrief: "",
      files: [],
    });
  };

  const setProductCategory = (categoryId: string) => {
    updateActiveProduct({
      categoryId,
      kindId: "",
      modelId: "",
      productConfiguratorPreset: null,
      printPackageConfig: normalizeProductPrintPackageConfig({}, null),
      printApplications: [],
    });
  };

  const setProductKind = (kindId: string) => {
    if (!activeProduct) return;
    updateActiveProduct({
      kindId,
      modelId: "",
      productConfiguratorPreset: null,
      printPackageConfig: normalizeProductPrintPackageConfig({}, null),
      printApplications: [],
    });
  };

  const setProductModel = (modelId: string) => {
    if (!activeProduct) return;
    const preset = getConfiguratorPresetForSelection(activeProduct.categoryId, activeProduct.kindId, modelId);
    updateActiveProduct({
      modelId,
      productConfiguratorPreset: preset,
      printPackageConfig: normalizeProductPrintPackageConfig(activeProduct, preset),
      ...(preset
        ? { printApplications: [], createDesignTask: true }
        : {}),
    });
  };

  const handleQuickCreateModel = React.useCallback(async () => {
    if (!activeProduct || !onCreateCatalogModel) return;
    const name = quickModelName.trim();
    if (!activeProduct.categoryId || !activeProduct.kindId) {
      setQuickModelError("Оберіть категорію і вид товару.");
      return;
    }
    if (!name) {
      setQuickModelError("Вкажіть назву товару.");
      return;
    }
    setQuickModelSaving(true);
    setQuickModelError(null);
    try {
      const created = await onCreateCatalogModel({
        typeId: activeProduct.categoryId,
        kindId: activeProduct.kindId,
        name,
        sku: quickModelSku.trim() || null,
        price: 0,
        imageUrl: quickModelImageUrl.trim() || null,
      });
      if (created?.id) {
        setProductModel(created.id);
        resetQuickModelDraft();
        setQuickModelPopoverOpen(false);
      }
    } catch (error) {
      setQuickModelError(
        error instanceof Error && error.message
          ? error.message
          : "Не вдалося створити товар. Спробуйте ще раз."
      );
    } finally {
      setQuickModelSaving(false);
    }
  }, [
    activeProduct,
    onCreateCatalogModel,
    quickModelImageUrl,
    quickModelName,
    quickModelSku,
    resetQuickModelDraft,
    setProductModel,
  ]);

  const updateRun = (runId: string, value: string) => {
    if (!activeProduct) return;
    updateActiveProduct({
      runs: activeProduct.runs.map((run) =>
        run.id === runId ? { ...run, quantity: sanitizeQuantity(value) } : run
      ),
    });
  };

  const addRun = () => {
    if (!activeProduct) return;
    updateActiveProduct({ runs: [...activeProduct.runs, createRunDraft()] });
  };

  const removeRun = (runId: string) => {
    if (!activeProduct) return;
    if (activeProduct.runs.length <= 1) {
      updateActiveProduct({ runs: [createRunDraft()] });
      return;
    }
    updateActiveProduct({ runs: activeProduct.runs.filter((run) => run.id !== runId) });
  };

  const addPrintApplication = () => {
    if (!activeProduct) return;
    const { kind } = getCatalogRefs(catalogTypes, activeProduct);
    const next = createPrintApplicationDraft();
    next.method = kind?.methods?.[0]?.id ?? "";
    next.position = kind?.printPositions?.[0]?.id ?? "";
    updateActiveProduct({
      printApplications: [...activeProduct.printApplications, next],
      createDesignTask: true,
    });
  };

  const updatePrintApplication = (
    applicationId: string,
    field: keyof QuoteBatchPrintApplicationDraft,
    value: string
  ) => {
    if (!activeProduct) return;
    updateActiveProduct({
      printApplications: activeProduct.printApplications.map((app) =>
        app.id === applicationId ? { ...app, [field]: value } : app
      ),
    });
  };

  const removePrintApplication = (applicationId: string) => {
    if (!activeProduct) return;
    const nextPrintApplications = activeProduct.printApplications.filter((app) => app.id !== applicationId);
    updateActiveProduct({
      printApplications: nextPrintApplications,
      ...(nextPrintApplications.length === 0
        ? {
            createDesignTask: false,
            designTaskType: null,
            designAssigneeId: null,
            designCollaboratorIds: [],
            designBrief: "",
            files: [],
          }
        : {}),
    });
  };

  const addFiles = (fileList: FileList | null) => {
    if (!activeProduct || !fileList) return;
    const nextFiles = Array.from(fileList).slice(0, Math.max(0, 5 - activeProduct.files.length));
    updateActiveProduct({ files: [...activeProduct.files, ...nextFiles].slice(0, 5) });
  };

  const removeFile = (fileIndex: number) => {
    if (!activeProduct) return;
    updateActiveProduct({
      files: activeProduct.files.filter((_, index) => index !== fileIndex),
    });
  };

  const prepareDesignBrief = () => {
    if (!activeProduct) return;
    const { kind } = getCatalogRefs(catalogTypes, activeProduct);
    const productConfiguratorPreset = getProductConfiguratorPreset(catalogTypes, activeProduct);
    const isPrintPackageProduct = activeProduct.quoteType === "print" && Boolean(productConfiguratorPreset);
    const lines: string[] = [];
    if (isPrintPackageProduct && productConfiguratorPreset) {
      const config = normalizeProductPrintPackageConfig(activeProduct, productConfiguratorPreset);
      const summary = formatPrintProductSummary(config);
      if (summary.length > 0) {
        lines.push("Поліграфія:");
        summary.forEach((line) => lines.push(`- ${line}`));
      }
    } else if (activeProduct.printApplications.length > 0) {
      lines.push("Нанесення:");
      activeProduct.printApplications.forEach((app, index) => {
        const method = kind?.methods?.find((item) => item.id === app.method)?.name ?? "метод не вказано";
        const position =
          kind?.printPositions?.find((item) => item.id === app.position)?.label ?? "місце не вказано";
        const size = [app.width.trim(), app.height.trim()].every(Boolean)
          ? `, розмір ${app.width.trim()}x${app.height.trim()} мм`
          : "";
        lines.push(`${index + 1}. ${method}, ${position}${size}.`);
      });
    }
    if (activeProduct.managerNote.trim()) {
      lines.push("", "Коментар менеджера:", activeProduct.managerNote.trim());
    }
    if (activeProduct.files.length > 0) {
      lines.push("", `Файли: ${activeProduct.files.map((file) => file.name).join(", ")}`);
    }
    if (lines.length === 0) {
      lines.push("Підготувати макет або візуалізацію для нанесення. Уточнити місце, розмір і технічні обмеження перед роботою.");
    }
    updateActiveProduct({ designBrief: lines.join("\n") });
  };

  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);
    const normalizedProducts = products.map((product) => {
      const productConfiguratorPreset = getProductConfiguratorPreset(catalogTypes, product);
      const isPrintPackageProduct = product.quoteType === "print" && Boolean(productConfiguratorPreset);
      const hasDesignSurface = productHasDesignSurface(product);
      return {
        ...product,
        productConfiguratorPreset: isPrintPackageProduct ? productConfiguratorPreset : null,
        printPackageConfig:
          isPrintPackageProduct && productConfiguratorPreset
            ? normalizeProductPrintPackageConfig(product, productConfiguratorPreset)
            : undefined,
        deliveryType: product.deliveryType || null,
        deliveryDetails: sanitizeDeliveryDetails(product.deliveryType, product.deliveryDetails),
        quantityUnit: normalizeUnitLabel(product.quantityUnit),
        printApplications: isPrintPackageProduct ? [] : product.printApplications,
        managerNote: hasDesignSurface ? product.managerNote.trim() : "",
        designBrief: hasDesignSurface ? product.designBrief.trim() : "",
        files: hasDesignSurface ? product.files : [],
        createDesignTask: hasDesignSurface ? product.createDesignTask : false,
        designTaskType: hasDesignSurface ? product.designTaskType : null,
        designAssigneeId: hasDesignSurface ? product.designAssigneeId : null,
        designCollaboratorIds: hasDesignSurface ? product.designCollaboratorIds : [],
        runs: getSelectedRuns(product),
      };
    });
    const invalidProductIndex = products.findIndex((product) => getProductIssues(product).length > 0);
    const showValidationError = (message: string) => {
      setLocalError(message);
      toast.error("Перевірте білдер", { description: message });
    };

    if (!customerId) {
      showValidationError("Оберіть замовника або ліда.");
      setCustomerPopoverOpen(true);
      return;
    }
    if (!deadlineAt.trim()) {
      showValidationError("Вкажіть дедлайн прорахунку.");
      return;
    }
    if (quoteGroupCount > 1 && customerType !== "customer") {
      showValidationError("КП з кількох прорахунків зараз можна створити тільки для замовника, не ліда.");
      return;
    }
    if (invalidProductIndex !== -1) {
      const invalidProduct = products[invalidProductIndex];
      const message = `${getProductLabel(catalogTypes, invalidProduct)}: ${getProductIssues(invalidProduct).join(", ")}.`;
      setActiveProductId(invalidProduct.id);
      showValidationError(message);
      return;
    }

    setLocalError(null);
    await onSubmit({
      customerId,
      customerType,
      managerId,
      deadlineAt: normalizeDeadlineInput(deadlineAt),
      deadlineNote: "",
      currency,
      comment: "",
      products: normalizedProducts,
    });
  };

  const merchCount = products.filter((product) => product.quoteType === "merch").length;
  const printCount = products.filter((product) => product.quoteType === "print").length;
  const otherCount = products.filter((product) => product.quoteType === "other").length;
  const quoteGroupCount = (merchCount > 0 ? 1 : 0) + (printCount > 0 ? 1 : 0) + otherCount;
  const resultLabel = quoteGroupCount === 1 ? "1 прорахунок" : `КП · ${quoteGroupCount} прорахунки`;
  const allIssues = products.flatMap((product) =>
    getProductIssues(product).map((issue) => `${getProductLabel(catalogTypes, product)}: ${issue}`)
  );
  const shouldShowIssues = hasAttemptedSubmit && (Boolean(localError || submitError) || allIssues.length > 0);

  const activeRefs = activeProduct ? getCatalogRefs(catalogTypes, activeProduct) : { type: null, kind: null, model: null };
  const filteredTypes = activeProduct
    ? catalogTypes.filter((type) => !type.quote_type || type.quote_type === activeProduct.quoteType)
    : [];
  const availableKinds = activeRefs.type?.kinds ?? [];
  const availableModels = activeRefs.kind?.models ?? [];
  const availableMethods = activeRefs.kind?.methods ?? [];
  const availablePositions = activeRefs.kind?.printPositions ?? [];
  const fallbackPrintPositions = (() => {
    const fromSelectedType = (activeRefs.type?.kinds ?? []).flatMap((kind) => kind.printPositions ?? []);
    const fromCatalog = catalogTypes.flatMap((type) => type.kinds.flatMap((kind) => kind.printPositions ?? []));
    const source = fromSelectedType.length > 0 ? fromSelectedType : fromCatalog;
    const unique = new Map<string, { id: string; label: string; sort_order?: number | null }>();
    source.forEach((position) => {
      if (!position?.id || unique.has(position.id)) return;
      unique.set(position.id, position);
    });
    return Array.from(unique.values());
  })();
  const resolvedPrintPositions = availablePositions.length > 0 ? availablePositions : fallbackPrintPositions;
  const activeConfiguratorPreset = activeProduct ? getProductConfiguratorPreset(catalogTypes, activeProduct) : null;
  const isPrintPackageMode = activeProduct?.quoteType === "print" && Boolean(activeConfiguratorPreset);
  const activePrintPackageConfig = activeProduct
    ? normalizeProductPrintPackageConfig(activeProduct, activeConfiguratorPreset)
    : createEmptyPrintPackageConfig();
  const configuratorProductOptions = React.useMemo(
    () => buildConfiguratorProductOptions(catalogTypes, activeProduct?.quoteType ?? "print"),
    [activeProduct?.quoteType, catalogTypes]
  );
  const selectedConfiguratorProduct = React.useMemo(
    () =>
      configuratorProductOptions.find(
        (option) =>
          option.typeId === activeProduct?.categoryId &&
          option.kindId === activeProduct?.kindId &&
          option.modelId === activeProduct?.modelId
      ) ?? null,
    [activeProduct?.categoryId, activeProduct?.kindId, activeProduct?.modelId, configuratorProductOptions]
  );
  const availablePackageDensities = React.useMemo(
    () =>
      PRINT_PACKAGE_DENSITIES.filter((option) => {
        if (option.onlyFor === "kraft") return activePrintPackageConfig.paperType === "kraft";
        if (option.onlyFor === "cardboard") return activePrintPackageConfig.paperType === "cardboard";
        return true;
      }),
    [activePrintPackageConfig.paperType]
  );
  const availablePackageHandles = React.useMemo(
    () =>
      PRINT_PACKAGE_HANDLES.filter((option) => {
        if (option.onlyFor === "kraft") return activePrintPackageConfig.paperType === "kraft";
        return true;
      }),
    [activePrintPackageConfig.paperType]
  );
  const availablePackagePrintTypes = React.useMemo(
    () =>
      PRINT_PACKAGE_PRINT_TYPES.filter((option) => {
        if (option.notForReady) return activePrintPackageConfig.packageType !== "ready";
        return true;
      }),
    [activePrintPackageConfig.packageType]
  );
  const setActivePrintPackageConfig = React.useCallback<React.Dispatch<React.SetStateAction<PrintPackageConfig>>>(
    (nextConfig) => {
      if (!activeProduct) return;
      setProducts((prev) =>
        prev.map((product) => {
          if (product.id !== activeProduct.id) return product;
          const preset = getProductConfiguratorPreset(catalogTypes, product);
          const currentConfig = normalizeProductPrintPackageConfig(product, preset);
          const resolvedConfig =
            typeof nextConfig === "function" ? nextConfig(currentConfig) : nextConfig;
          return {
            ...product,
            productConfiguratorPreset: preset,
            printPackageConfig: normalizeProductPrintPackageConfig(
              { printPackageConfig: resolvedConfig },
              preset
            ),
          };
        })
      );
    },
    [activeProduct, catalogTypes]
  );
  const showPrintConfigurator = activeProduct?.quoteType === "print" && configuratorProductOptions.length > 0;
  const activeHasDesignSurface = activeProduct ? productHasDesignSurface(activeProduct) : false;
  const selectableManagerMembers = React.useMemo(
    () =>
      teamMembers.filter(
        (member) =>
          member.id === currentUserId ||
          isQuoteManagerJobRole(member.jobRole) ||
          normalizeJobRole(member.jobRole) === "seo"
      ),
    [currentUserId, teamMembers]
  );
  const hasRoleInfo = React.useMemo(
    () => teamMembers.some((member) => Boolean(member.jobRole && member.jobRole.trim())),
    [teamMembers]
  );
  const designerMembers = React.useMemo(() => {
    const designers = teamMembers.filter((member) => isDesignerJobRole(member.jobRole));
    return designers.length > 0 || hasRoleInfo ? designers : teamMembers;
  }, [hasRoleInfo, teamMembers]);
  const selectedManager = teamMembers.find((member) => member.id === managerId) ?? null;
  const activeDeliveryType = activeProduct?.deliveryType ?? "";
  const activeDeliveryDetails = activeProduct?.deliveryDetails ?? createEmptyDeliveryDetails();
  const activeDelivery = DELIVERY_OPTIONS.find((option) => option.value === activeDeliveryType) ?? null;
  const updateActiveDeliveryDetails = React.useCallback(
    (patch: Partial<DeliveryDetails>) => {
      if (!activeProduct) return;
      updateActiveProduct({
        deliveryDetails: {
          ...createEmptyDeliveryDetails(),
          ...(activeProduct.deliveryDetails ?? {}),
          ...patch,
        },
      });
    },
    [activeProduct, updateActiveProduct]
  );

  React.useEffect(() => {
    if (!isPrintPackageMode || activePrintPackageConfig.productKind !== "package") return;
    const activeHandleValid = availablePackageHandles.some((option) => option.value === activePrintPackageConfig.handleType);
    const activeDensityValid = availablePackageDensities.some((option) => option.value === activePrintPackageConfig.density);
    const shouldHideEyelets =
      activePrintPackageConfig.packageType !== "custom" || activePrintPackageConfig.paperType === "kraft";
    const nextHandleType = activeHandleValid ? activePrintPackageConfig.handleType : "";
    const nextDensity = activeDensityValid ? activePrintPackageConfig.density : "";
    const nextEyelets = shouldHideEyelets ? "" : activePrintPackageConfig.eyelets;
    const nextKraftColor = activePrintPackageConfig.paperType === "kraft" ? activePrintPackageConfig.kraftColor : "";
    if (
      nextHandleType === activePrintPackageConfig.handleType &&
      nextDensity === activePrintPackageConfig.density &&
      nextEyelets === activePrintPackageConfig.eyelets &&
      nextKraftColor === activePrintPackageConfig.kraftColor
    ) {
      return;
    }
    setActivePrintPackageConfig((prev) => ({
      ...prev,
      handleType: nextHandleType,
      density: nextDensity,
      eyelets: nextEyelets,
      kraftColor: nextKraftColor,
    }));
  }, [
    activePrintPackageConfig.density,
    activePrintPackageConfig.eyelets,
    activePrintPackageConfig.handleType,
    activePrintPackageConfig.kraftColor,
    activePrintPackageConfig.packageType,
    activePrintPackageConfig.paperType,
    activePrintPackageConfig.productKind,
    availablePackageDensities,
    availablePackageHandles,
    isPrintPackageMode,
    setActivePrintPackageConfig,
  ]);

  React.useEffect(() => {
    if (!isPrintPackageMode || activePrintPackageConfig.productKind !== "package") return;
    const activePrintTypeValid = availablePackagePrintTypes.some((option) => option.value === activePrintPackageConfig.printType);
    if (activePrintTypeValid) return;
    setActivePrintPackageConfig((prev) => ({
      ...prev,
      printType: "",
      pantoneCount: "",
      stickerSize: "",
    }));
  }, [
    activePrintPackageConfig.printType,
    activePrintPackageConfig.productKind,
    availablePackagePrintTypes,
    isPrintPackageMode,
    setActivePrintPackageConfig,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[88vh] w-[calc(100vw-1.5rem)] max-w-[1320px] overflow-hidden !animate-none !p-0 [&_*]:!animate-none [&_*]:!transition-none sm:!p-0">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="border-b border-border/60 px-4 py-3 pr-14">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Layers3 className="h-4 w-4" />
                  Білдер прорахунку
                  <Badge variant="outline" className="ml-1 rounded-md">
                    {resultLabel}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="sr-only">Білдер для створення одного або кількох прорахунків.</DialogDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CustomerLeadPicker
                  open={customerPopoverOpen}
                  onOpenChange={setCustomerPopoverOpen}
                  selectedLabel={selectedCustomer?.label ?? ""}
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
                <Select value={managerId || "unassigned"} onValueChange={(value) => setManagerId(value === "unassigned" ? "" : value)}>
                  <SelectTrigger className="h-9 w-full rounded-full sm:w-[220px]">
                    {selectedManager ? (
                      <div className="flex min-w-0 items-center gap-2">
                        <AvatarBase
                          src={selectedManager.avatarUrl ?? null}
                          name={selectedManager.label}
                          fallback={getInitials(selectedManager.label).toUpperCase()}
                          size={20}
                          className="shrink-0 border-border/60"
                          fallbackClassName="text-[10px] font-semibold"
                        />
                        <span className="truncate">{selectedManager.label}</span>
                      </div>
                    ) : (
                      <SelectValue placeholder="Менеджер" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Без менеджера
                      </div>
                    </SelectItem>
                    {selectableManagerMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex min-w-0 items-center gap-2">
                          <AvatarBase
                            src={member.avatarUrl ?? null}
                            name={member.label}
                            fallback={getInitials(member.label).toUpperCase()}
                            size={20}
                            className="shrink-0 border-border/60"
                            fallbackClassName="text-[10px] font-semibold"
                          />
                          <span className="truncate">{member.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Popover open={deadlinePopoverOpen} onOpenChange={setDeadlinePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Chip size="md" icon={<CalendarIcon />} active={Boolean(deadlineDate)}>
                      {deadlineDate ? format(deadlineDate, "d MMM, HH:mm", { locale: uk }) : "Дедлайн"}
                    </Chip>
                  </PopoverTrigger>
                  <PopoverContent className="w-fit max-w-[calc(100vw-2rem)] p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={deadlineDate ?? undefined}
                      onSelect={(date) => updateDeadlineDate(date ?? undefined)}
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
                        onChange={(event) => updateDeadlineTime(event.target.value)}
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
                    <DateQuickActions onSelect={(date) => updateDeadlineDate(date ?? undefined)} />
                  </PopoverContent>
                </Popover>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-9 w-[104px] rounded-full">
                    <SelectValue placeholder="Валюта" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogHeader>

          {contentReady ? (
          <>
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-y-auto border-b border-border/60 bg-muted/10 p-3 lg:border-b-0 lg:border-r">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-foreground">Товари</div>
                  <div className="text-xs text-muted-foreground">Склад майбутнього прорахунку</div>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addProduct} className="h-9 rounded-full gap-1.5">
                  <Plus className="h-4 w-4" />
                  Додати
                </Button>
              </div>
              <div className="space-y-2">
                {products.map((product, index) => {
                  const issues = getProductIssues(product);
                  const selected = product.id === activeProduct?.id;
                  const runs = getSelectedRuns(product);
                  const productConfiguratorPreset = getProductConfiguratorPreset(catalogTypes, product);
                  const printCount = product.quoteType === "print" && productConfiguratorPreset ? 1 : product.printApplications.length;
                  const imageUrl = getProductImageUrl(catalogTypes, product);
                  const productLabel = getProductLabel(catalogTypes, product);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => setActiveProductId(product.id)}
                      className={cn(
                        "group relative w-full overflow-hidden rounded-xl border p-3 text-left shadow-sm transition-all",
                        selected
                          ? "border-primary/45 bg-primary/10 shadow-[0_12px_28px_-24px_hsl(var(--primary))] ring-1 ring-primary/15"
                          : "border-border/60 bg-background/85 hover:border-border hover:bg-background hover:shadow-md"
                      )}
                    >
                      <div className="flex gap-3">
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={productLabel}
                              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-muted-foreground">
                              <Package className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                                Товар {index + 1}
                              </div>
                              <div className="mt-0.5 truncate text-sm font-semibold text-foreground">
                                {productLabel}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "shrink-0 rounded-full px-2 text-[11px]",
                                issues.length === 0
                                  ? "border-success-soft-border bg-success-soft text-success-foreground"
                                  : "border-warning-soft-border bg-warning-soft text-warning-foreground"
                              )}
                            >
                              {issues.length === 0 ? "Готово" : "Чернетка"}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                              {runs.length > 0 ? runs.map((run) => run.quantity).join(" / ") : "Без тиражів"}
                            </span>
                            <span className="rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                              {product.quoteType === "print" && productConfiguratorPreset
                                ? "Поліграфія"
                                : printCount > 0
                                  ? `Нанесень: ${printCount}`
                                  : "Без нанесення"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <main className="min-h-0 overflow-y-auto p-5">
              {activeProduct ? (
                <div className="mx-auto max-w-6xl space-y-5">
                  {shouldShowIssues ? (
                    <div className="rounded-lg border border-warning-soft-border bg-warning-soft p-4">
                      <div className="text-sm font-semibold text-warning-foreground">Потрібно перевірити</div>
                      {localError || submitError ? (
                        <div className="mt-2 text-xs text-warning-foreground">{localError ?? submitError}</div>
                      ) : null}
                      {allIssues.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-xs text-warning-foreground">
                          {allIssues.slice(0, 5).map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  <section className="space-y-3 rounded-lg border border-border/60 bg-background p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-3">
                        <SectionTitle icon={<Package />}>{getProductLabel(catalogTypes, activeProduct)}</SectionTitle>
                        <div className="inline-flex rounded-full border border-border/50 bg-background/40 p-1">
                          {QUOTE_TYPES.map((item) => {
                            const Icon = item.icon;
                            const active = activeProduct.quoteType === item.value;
                            return (
                              <button
                                key={item.value}
                                type="button"
                                onClick={() => setProductQuoteType(item.value)}
                                className={cn(
                                  "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all",
                                  active
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                                )}
                              >
                                <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                                <span>{item.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => duplicateProduct(activeProduct)} className="h-9 gap-1.5 rounded-full px-3">
                          <Copy className="h-4 w-4" />
                          Дублювати
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeProduct(activeProduct.id)} className="h-9 gap-1.5 rounded-full px-3 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                          Видалити
                        </Button>
                      </div>
                    </div>

                    {showPrintConfigurator ? (
                      <PrintProductConfigurator
                        config={activePrintPackageConfig}
                        onConfigChange={setActivePrintPackageConfig}
                        selectedConfiguratorProduct={selectedConfiguratorProduct}
                        configuratorProductOptions={configuratorProductOptions}
                        selectedTypeName={activeRefs.type?.name}
                        selectedKindName={activeRefs.kind?.name}
                        selectedModelName={activeRefs.model?.name}
                        availablePackageDensities={availablePackageDensities}
                        availablePackageHandles={availablePackageHandles}
                        availablePackagePrintTypes={availablePackagePrintTypes}
                        onSelectProduct={(nextOption) => {
                          updateActiveProduct({
                            categoryId: nextOption.typeId,
                            kindId: nextOption.kindId,
                            modelId: nextOption.modelId,
                            productConfiguratorPreset: nextOption.preset,
                            printPackageConfig: normalizeProductPrintPackageConfig(
                              activeProduct,
                              nextOption.preset
                            ),
                            printApplications: [],
                            createDesignTask: true,
                          });
                        }}
                      />
                    ) : (
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-muted-foreground">Категорія</div>
                          <ChipDropdown
                            value={activeProduct.categoryId}
                            onChange={setProductCategory}
                            options={filteredTypes.map((type) => ({
                              value: type.id,
                              label: type.name,
                            }))}
                            placeholder="Оберіть категорію"
                            icon={<Layers3 className="h-3.5 w-3.5" />}
                            popoverClassName="w-[320px]"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-muted-foreground">Вид</div>
                          <ChipDropdown
                            value={activeProduct.kindId}
                            onChange={setProductKind}
                            disabled={!activeProduct.categoryId || availableKinds.length === 0}
                            options={availableKinds.map((kind) => ({
                              value: kind.id,
                              label: kind.name,
                            }))}
                            placeholder="Оберіть вид"
                            icon={<Package className="h-3.5 w-3.5" />}
                            popoverClassName="w-[320px]"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-muted-foreground">Модель</div>
                          <ChipDropdown
                            value={activeProduct.modelId}
                            onChange={setProductModel}
                            disabled={!activeProduct.kindId || availableModels.length === 0}
                            options={availableModels.map((model) => ({
                              value: model.id,
                              label: model.metadata?.sku?.trim()
                                ? `${model.name} · ${model.metadata.sku.trim()}`
                                : model.name,
                              imageUrl:
                                model.imageUrl?.trim() ||
                                model.metadata?.imageAsset?.thumbUrl ||
                                model.metadata?.imageAsset?.previewUrl ||
                                null,
                            }))}
                            placeholder="Оберіть модель"
                            icon={<Shirt className="h-3.5 w-3.5" />}
                            popoverClassName="w-[360px]"
                          />
                          {activeRefs.model?.metadata?.sku?.trim() ? (
                            <div className="text-xs text-muted-foreground">
                              Артикул:{" "}
                              <span className="font-medium text-foreground/80">
                                {activeRefs.model.metadata.sku.trim()}
                              </span>
                            </div>
                          ) : null}
                          {activeProduct.kindId && onCreateCatalogModel ? (
                            <Popover open={quickModelPopoverOpen} onOpenChange={setQuickModelPopoverOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                >
                                  <Plus className="mr-1 h-3.5 w-3.5" />
                                  Створити товар
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-[420px] p-3">
                                <div className="space-y-3">
                                  <div>
                                    <div className="text-sm font-medium text-foreground">Новий товар</div>
                                    <div className="text-xs text-muted-foreground">
                                      Додамо в каталог і одразу виберемо.
                                    </div>
                                  </div>
                                  <div className="grid gap-3 sm:grid-cols-[112px_minmax(0,1fr)]">
                                    <div className="aspect-square overflow-hidden rounded-[14px] border border-border/60 bg-muted/20">
                                      {quickModelImageUrl.trim() && !quickModelImageErrored ? (
                                        <img
                                          src={quickModelImageUrl.trim()}
                                          alt={quickModelName.trim() || "Прев'ю товару"}
                                          className="h-full w-full object-cover"
                                          onError={() => setQuickModelImageErrored(true)}
                                        />
                                      ) : (
                                        <div className="grid h-full w-full place-items-center text-muted-foreground/60">
                                          <div className="text-center">
                                            <Package className="mx-auto h-5 w-5" />
                                            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em]">
                                              Прев'ю
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <div className="grid gap-2">
                                      <Input
                                        value={quickModelName}
                                        onChange={(event) => {
                                          setQuickModelName(event.target.value);
                                          if (quickModelError) setQuickModelError(null);
                                        }}
                                        placeholder="Назва товару"
                                        className="h-9"
                                        disabled={quickModelSaving}
                                      />
                                      <Input
                                        value={quickModelSku}
                                        onChange={(event) => {
                                          setQuickModelSku(event.target.value);
                                          if (quickModelError) setQuickModelError(null);
                                        }}
                                        placeholder="Артикул"
                                        className="h-9"
                                        disabled={quickModelSaving}
                                      />
                                      <Input
                                        value={quickModelImageUrl}
                                        onChange={(event) => setQuickModelImageUrl(event.target.value)}
                                        placeholder="Фото URL, необов'язково"
                                        className="h-9"
                                        disabled={quickModelSaving}
                                      />
                                    </div>
                                  </div>
                                  {quickModelImageUrl.trim() && quickModelImageErrored ? (
                                    <div className="text-xs text-warning-foreground">
                                      Фото не завантажилось. Перевірте URL або вставте пряме посилання на зображення.
                                    </div>
                                  ) : null}
                                  {quickModelError ? (
                                    <div className="text-xs text-destructive">{quickModelError}</div>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-full gap-2"
                                    onClick={handleQuickCreateModel}
                                    disabled={quickModelSaving || !quickModelName.trim()}
                                  >
                                    {quickModelSaving ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Plus className="h-4 w-4" />
                                    )}
                                    Створити і вибрати
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </section>

                  <section className={cn("space-y-3 rounded-lg border border-border/60 bg-background p-4", showPrintConfigurator && "hidden")}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <SectionTitle icon={<Palette />}>Нанесення</SectionTitle>
                        <div className="flex flex-wrap items-center gap-2">
                          {activeIndex > 0 ? (
                            <Button type="button" variant="outline" size="sm" onClick={copyPrintsFromPrevious}>
                              Скопіювати з попереднього
                            </Button>
                          ) : null}
                          <Button type="button" variant="outline" size="sm" onClick={addPrintApplication} className="gap-1.5">
                            <Plus className="h-4 w-4" />
                            Додати
                          </Button>
                        </div>
                      </div>

                      {activeProduct.printApplications.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                          Без нанесення
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {activeProduct.printApplications.map((app, index) => (
                            <div key={app.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                  <Palette className="h-4 w-4 text-muted-foreground" />
                                  Нанесення {index + 1}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removePrintApplication(app.id)}
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  aria-label={`Видалити нанесення ${index + 1}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_280px]">
                                <div className="space-y-1.5">
                                  <div className="text-xs text-muted-foreground">Метод</div>
                                  <ChipDropdown
                                    value={app.method}
                                    onChange={(value) => updatePrintApplication(app.id, "method", value)}
                                    options={availableMethods.map((method) => ({
                                      value: method.id,
                                      label: method.name,
                                    }))}
                                    placeholder={availableMethods.length ? "Тип нанесення" : "Немає методів"}
                                    icon={<Palette className="h-3.5 w-3.5" />}
                                    disabled={availableMethods.length === 0}
                                    popoverClassName="w-[320px]"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <div className="text-xs text-muted-foreground">Позиція</div>
                                  <ChipDropdown
                                    value={app.position}
                                    onChange={(value) => updatePrintApplication(app.id, "position", value)}
                                    options={resolvedPrintPositions.map((position) => ({
                                      value: position.id,
                                      label: position.label,
                                    }))}
                                    placeholder={resolvedPrintPositions.length ? "Місце" : "Немає місць"}
                                    icon={<MapPin className="h-3.5 w-3.5" />}
                                    disabled={resolvedPrintPositions.length === 0}
                                    popoverClassName="w-[320px]"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <div className="text-xs text-muted-foreground">Розмір, мм</div>
                                  <div className="grid grid-cols-[minmax(110px,1fr)_auto_minmax(110px,1fr)] items-center gap-2">
                                    <Input
                                      value={app.width}
                                      onChange={(event) => updatePrintApplication(app.id, "width", event.target.value)}
                                      inputMode="decimal"
                                      placeholder="Ширина"
                                      className="h-9 bg-background/70"
                                    />
                                    <span className="text-sm text-muted-foreground">x</span>
                                    <Input
                                      value={app.height}
                                      onChange={(event) => updatePrintApplication(app.id, "height", event.target.value)}
                                      inputMode="decimal"
                                      placeholder="Висота"
                                      className="h-9 bg-background/70"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                  </section>

                  <section className={cn("space-y-3 rounded-lg border border-border/60 bg-background p-4", !activeHasDesignSurface && "hidden")}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <SectionTitle icon={<Wand2 />}>ТЗ дизайнеру</SectionTitle>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const next = !activeProduct.createDesignTask;
                              updateActiveProduct({
                                createDesignTask: next,
                                ...(next
                                  ? {}
                                  : {
                                      designTaskType: null,
                                      designAssigneeId: null,
                                      designCollaboratorIds: [],
                                    }),
                              });
                            }}
                            className={cn(
                              "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-all",
                              activeProduct.createDesignTask
                                ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                                : "border-border/40 bg-background/55 text-muted-foreground hover:border-border/50 hover:bg-background/70"
                            )}
                          >
                            <Palette className={cn("mr-2 h-3.5 w-3.5", activeProduct.createDesignTask ? "text-primary" : "text-muted-foreground")} />
                            {activeProduct.createDesignTask ? "Задача увімкнена" : "Без задачі"}
                          </button>
                          <Button type="button" variant="outline" size="sm" onClick={prepareDesignBrief} className="gap-1.5">
                            <Wand2 className="h-4 w-4" />
                            Підготувати ТЗ
                          </Button>
                        </div>
                      </div>

                      {activeProduct.createDesignTask ? (
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="space-y-1.5">
                            <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              Тип задачі
                            </div>
                            <DesignTaskTypeChip
                              value={activeProduct.designTaskType}
                              onChange={(value) => updateActiveProduct({ designTaskType: value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              Виконавець
                            </div>
                            <TeamMemberChipDropdown
                              value={activeProduct.designAssigneeId}
                              onChange={(value) => {
                                updateActiveProduct({
                                  designAssigneeId: value,
                                  designCollaboratorIds: activeProduct.designCollaboratorIds.filter((entry) => entry !== value),
                                });
                              }}
                              options={designerMembers}
                              placeholder="Без виконавця"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              Співвиконавці
                            </div>
                            <TeamMemberMultiChipDropdown
                              values={activeProduct.designCollaboratorIds}
                              onChange={(values) =>
                                updateActiveProduct({
                                  designCollaboratorIds: values.filter((value) => value !== activeProduct.designAssigneeId),
                                })
                              }
                              options={designerMembers.filter((member) => member.id !== activeProduct.designAssigneeId)}
                              placeholder="Не додано"
                            />
                          </div>
                        </div>
                      ) : null}
                      <Textarea
                        value={activeProduct.designBrief}
                        onChange={(event) => updateActiveProduct({ designBrief: event.target.value })}
                        placeholder="ТЗ дизайнеру: що нанести, де, розмір, важливі побажання, файли"
                        rows={5}
                      />
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="outline" size="sm" className="relative gap-1.5">
                            <Upload className="h-4 w-4" />
                            Файли
                            <input
                              type="file"
                              multiple
                              className="absolute inset-0 cursor-pointer opacity-0"
                              onChange={(event) => {
                                addFiles(event.target.files);
                                event.target.value = "";
                              }}
                            />
                          </Button>
                          <div className="text-xs text-muted-foreground">До 5 файлів на товар.</div>
                        </div>
                        {activeProduct.files.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {activeProduct.files.map((file, index) => (
                              <Badge key={`${file.name}-${index}`} variant="outline" className="gap-1 rounded-md">
                                <FileText className="h-3.5 w-3.5" />
                                <span className="max-w-[180px] truncate">{file.name}</span>
                                <button
                                  type="button"
                                  className="ml-1 rounded-full text-muted-foreground hover:text-destructive"
                                  onClick={() => removeFile(index)}
                                  aria-label={`Видалити файл ${file.name}`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                  </section>

                  <section className="space-y-3 rounded-lg border border-border/60 bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <SectionTitle icon={<Ruler />}>Тиражі</SectionTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        {activeIndex > 0 ? (
                          <Button type="button" variant="outline" size="sm" onClick={copyRunsFromPrevious}>
                            Скопіювати з попереднього
                          </Button>
                        ) : null}
                        <Button type="button" variant="outline" size="sm" onClick={addRun} className="gap-1.5">
                          <Plus className="h-4 w-4" />
                          Додати
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      {activeProduct.runs.map((run, index) => (
                        <div key={run.id} className="space-y-1.5">
                          <div className="text-xs text-muted-foreground">Тираж {index + 1}</div>
                          <div className="flex h-9 items-center gap-1.5 rounded-full border border-border/50 bg-background/55 px-2">
                            <Input
                              type="number"
                              min={1}
                              value={run.quantity}
                              onChange={(event) => updateRun(run.id, event.target.value)}
                              className="h-8 w-28 border-0 bg-transparent px-2 shadow-none"
                              placeholder="К-сть"
                            />
                            <button
                              type="button"
                              onClick={() => removeRun(run.id)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Видалити тираж ${index + 1}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="space-y-1.5">
                        <div className="text-xs text-muted-foreground">Одиниця</div>
                        <Select
                          value={activeProduct.quantityUnit}
                          onValueChange={(quantityUnit) => updateActiveProduct({ quantityUnit })}
                        >
                          <SelectTrigger className="h-9 w-[120px] rounded-full">
                            <SelectValue placeholder="Од." />
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
                  </section>

                  <section className="space-y-3 rounded-lg border border-border/60 bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <SectionTitle icon={<Truck />}>Логістика</SectionTitle>
                      {activeDelivery ? (
                        <Badge variant="outline" className="gap-1 rounded-full">
                          <activeDelivery.icon className="h-3.5 w-3.5" />
                          {activeDelivery.label}
                        </Badge>
                      ) : null}
                    </div>
                    <Select
                      value={activeDeliveryType || "none"}
                      onValueChange={(value) =>
                        updateActiveProduct({
                          deliveryType: value === "none" ? null : value,
                          deliveryDetails: value === "none" ? null : createEmptyDeliveryDetails(),
                        })
                      }
                    >
                      <SelectTrigger className="max-w-sm">
                        <SelectValue placeholder="Оберіть доставку" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Без логістики</SelectItem>
                        {DELIVERY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {activeDeliveryType === "nova_poshta" ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          value={activeDeliveryDetails.region}
                          onChange={(event) => updateActiveDeliveryDetails({ region: event.target.value })}
                          placeholder="Область *"
                        />
                        <Input
                          value={activeDeliveryDetails.city}
                          onChange={(event) => updateActiveDeliveryDetails({ city: event.target.value })}
                          placeholder="Місто *"
                        />
                        <Select
                          value={activeDeliveryDetails.npDeliveryType}
                          onValueChange={(value) =>
                            updateActiveDeliveryDetails({
                              npDeliveryType: value,
                              street: value === "address" ? activeDeliveryDetails.street : "",
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Тип доставки *" />
                          </SelectTrigger>
                          <SelectContent>
                            {NOVA_POSHTA_DELIVERY_TYPES.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={activeDeliveryDetails.payer}
                          onValueChange={(value) => updateActiveDeliveryDetails({ payer: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Хто платить" />
                          </SelectTrigger>
                          <SelectContent>
                            {DELIVERY_PAYER_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {activeDeliveryDetails.npDeliveryType === "address" ? (
                          <Input
                            value={activeDeliveryDetails.street}
                            onChange={(event) => updateActiveDeliveryDetails({ street: event.target.value })}
                            placeholder="Вулиця *"
                            className="sm:col-span-2"
                          />
                        ) : null}
                      </div>
                    ) : null}

                    {activeDeliveryType === "taxi" ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          value={activeDeliveryDetails.city}
                          onChange={(event) => updateActiveDeliveryDetails({ city: event.target.value })}
                          placeholder="Місто *"
                        />
                        <Select
                          value={activeDeliveryDetails.payer}
                          onValueChange={(value) => updateActiveDeliveryDetails({ payer: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Хто платить" />
                          </SelectTrigger>
                          <SelectContent>
                            {DELIVERY_PAYER_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={activeDeliveryDetails.address}
                          onChange={(event) => updateActiveDeliveryDetails({ address: event.target.value })}
                          placeholder="Адреса *"
                          className="sm:col-span-2"
                        />
                      </div>
                    ) : null}

                    {activeDeliveryType === "cargo" ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          value={activeDeliveryDetails.region}
                          onChange={(event) => updateActiveDeliveryDetails({ region: event.target.value })}
                          placeholder="Область *"
                        />
                        <Input
                          value={activeDeliveryDetails.city}
                          onChange={(event) => updateActiveDeliveryDetails({ city: event.target.value })}
                          placeholder="Місто *"
                        />
                        <Input
                          value={activeDeliveryDetails.address}
                          onChange={(event) => updateActiveDeliveryDetails({ address: event.target.value })}
                          placeholder="Адреса *"
                        />
                        <Select
                          value={activeDeliveryDetails.payer}
                          onValueChange={(value) => updateActiveDeliveryDetails({ payer: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Хто платить" />
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
                    ) : null}

                    {activeDeliveryType === "pickup" ? (
                      <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                        Для самовивозу додаткові поля не потрібні.
                      </div>
                    ) : null}
                  </section>

                </div>
              ) : null}
            </main>
          </div>

          <DialogFooter className="border-t border-border/60 px-4 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Скасувати
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={submitting} className="gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Створити {quoteGroupCount === 1 ? "прорахунок" : "КП"}
            </Button>
          </DialogFooter>
          </>
          ) : (
            <div className="min-h-0 flex-1" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
