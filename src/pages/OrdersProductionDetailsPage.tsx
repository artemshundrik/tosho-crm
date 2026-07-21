import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CustomerDialog, useCustomerEditor } from "@/components/customers";
import {
  ORDER_DOCUMENT_EXECUTOR,
  ORDER_INCOTERMS_OPTIONS,
  ORDER_PAYMENT_METHOD_OPTIONS,
  ORDER_PAYMENT_TERMS_OPTIONS,
  ORDER_STATUS_SECTIONS,
} from "@/features/orders/config";
import {
  formatOrderDate,
  formatOrderMoney,
  isCashlessPaymentMethod,
  loadDerivedOrders,
  markOrderDocumentCreated,
  updateOrderDocumentSettings,
  updateOrderStatuses,
  type OrderDesignAsset,
  type DerivedOrderRecord,
} from "@/features/orders/orderRecords";
import { ContractRevisionsPanel } from "@/components/contracts/ContractRevisionsPanel";
import {
  buildDefaultContractSections,
  renderContractSectionsHtml,
  partiesSectionNumber,
  type ContractSection,
  type ContractRenderContext,
} from "@/features/contractRevisions/contractSections";
import { getSignedAttachmentUrl } from "@/lib/attachmentPreview";
import { buildTelegramHref, formatTelegramHandle } from "@/lib/telegramContact";
import { declineToGenitive } from "@/lib/nameDeclension";
import { toSignatureInitials } from "@/lib/signatureFormat";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ExternalLink,
  FilePlus2,
  FileText,
  Info,
  Mail,
  MoreHorizontal,
  PackageCheck,
  Palette,
  Pencil,
  Phone,
  Send,
  Truck,
} from "lucide-react";
import {
  OrderDeliveryDialog,
  parseQuoteDeliveryDetails,
  type OrderDeliverySnapshot,
} from "@/components/orders/OrderDeliveryDialog";
import { NovaPoshtaTtnDialog } from "@/components/orders/NovaPoshtaTtnDialog";
import { trackNpDocument } from "@/lib/novaPoshtaApi";
import { DELIVERY_TYPE_OPTIONS } from "@/features/quotes/quotes-page/config";

const getInitials = (value?: string | null) => {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
};

const getFileExtension = (name?: string | null) => {
  const value = (name ?? "").trim();
  if (!value.includes(".")) return "";
  return value.split(".").pop()?.trim().toUpperCase() ?? "";
};

const isPreviewableAsset = (name?: string | null) => {
  const extension = getFileExtension(name);
  return ["PNG", "JPG", "JPEG", "WEBP", "GIF", "BMP", "PDF", "TIF", "TIFF"].includes(extension);
};

const IMAGE_EXTENSIONS = new Set(["PNG", "JPG", "JPEG", "WEBP", "GIF", "BMP"]);

const isImageAsset = (asset: OrderDesignAsset) => {
  if (asset.mimeType && asset.mimeType.startsWith("image/")) return true;
  return IMAGE_EXTENSIONS.has(getFileExtension(asset.label));
};

const resolveVisualizationImageUrls = async (assets: OrderDesignAsset[]): Promise<string[]> => {
  const urls: string[] = [];
  for (const asset of assets) {
    if (!isImageAsset(asset)) continue;
    if (asset.kind === "link") {
      if (asset.url) urls.push(asset.url);
      continue;
    }
    if (!asset.storageBucket || !asset.storagePath) continue;
    try {
      const signedUrl =
        (await getSignedAttachmentUrl(asset.storageBucket, asset.storagePath, "preview", 60 * 60)) ??
        (await getSignedAttachmentUrl(asset.storageBucket, asset.storagePath, "original", 60 * 60));
      if (signedUrl) urls.push(signedUrl);
    } catch (resolveError) {
      console.error("Failed to resolve visualization signed URL", resolveError);
    }
  }
  return urls;
};

const InfoHint = ({
  title,
  children,
  widthClass = "w-[320px]",
}: {
  title: string;
  children: ReactNode;
  widthClass?: string;
}) => {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openNow = () => {
    cancelClose();
    setOpen(true);
  };
  const closeSoon = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => cancelClose(), []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={title}
          onPointerEnter={openNow}
          onPointerLeave={closeSoon}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus:outline-none focus-visible:text-foreground"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={16}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={openNow}
        onPointerLeave={closeSoon}
        className={`${widthClass} max-w-[min(440px,calc(100vw-2rem))] p-3 text-xs leading-5`}
      >
        <div className="mb-1 font-semibold text-foreground">{title}</div>
        {children}
      </PopoverContent>
    </Popover>
  );
};

type RequirementCheck = {
  label: string;
  done: boolean;
  help: string;
};

const hasValue = (value?: string | null) => Boolean(value?.trim());

const getMissingRequirementLabels = (checks: RequirementCheck[]) =>
  checks.filter((check) => !check.done).map((check) => check.label);

const getContractRequirementChecks = (record: DerivedOrderRecord): RequirementCheck[] => [
  {
    label: "Замовник створений",
    done: record.partyType === "customer",
    help: "СП і договір не формуються напряму з ліда. Спочатку лід має бути переведений у Замовника.",
  },
  {
    label: "Юр. назва / форма власності",
    done: hasValue(record.legalEntityLabel),
    help: "Береться з картки Замовника, з блоку юридичних осіб.",
  },
  {
    label: "Код / ІПН",
    done: hasValue(record.customerTaxId),
    help: "Потрібен для реквізитів сторін у договорі та СП.",
  },
  {
    label: "IBAN",
    done: hasValue(record.customerIban) || hasValue(record.customerBankDetails),
    help: "Потрібен для реквізитів Замовника. Заповнюється у картці Замовника.",
  },
  {
    label: "Юридична адреса",
    done: hasValue(record.customerLegalAddress),
    help: "Для ФОП це може бути адреса реєстрації, для компанії - юридична адреса.",
  },
  {
    label: "ПІБ підписанта",
    done: hasValue(record.customerSignatoryName),
    help: "ПІБ особи, яка підписує договір зі сторони Замовника.",
  },
  {
    label: "Посада підписанта",
    done: hasValue(record.customerSignatoryPosition),
    help: "Наприклад: Директор, ФОП, Генеральний директор.",
  },
  {
    label: "Підстава підпису",
    done: hasValue(record.customerSignatoryAuthority),
    help: "Наприклад: Статуту, довіреності, виписки з ЄДР. Без цього договір не є коректним.",
  },
  {
    label: "Email і телефон",
    done: hasValue(record.contactEmail) && hasValue(record.contactPhone),
    help: "Контакти потрібні для реквізитів і відправки документів Замовнику.",
  },
];

const getSpecificationRequirementChecks = (record: DerivedOrderRecord): RequirementCheck[] => [
  {
    label: "Є позиції",
    done: record.items.length > 0,
    help: "СП формується тільки якщо у замовленні є хоча б одна позиція.",
  },
  {
    label: "Безготівковий розрахунок",
    done: isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail),
    help: "За бізнес-правилом СП створюється тільки для безготівкового розрахунку.",
  },
  {
    label: "Договір створено",
    done: Boolean(record.contractCreatedAt),
    help: "Спочатку натисни PDF у рядку Договір. Після відкриття договору CRM позначить його створеним і розблокує СП.",
  },
  {
    label: "Умови оплати",
    done: hasValue(record.paymentTerms),
    help: "Наприклад 50/50 або 70/30. Береться з блоку умов СП у цьому замовленні.",
  },
  {
    label: "Incoterms",
    done: hasValue(record.incotermsCode),
    help: "Для СП використовується Incoterms 2020. За потреби вкажи також місце поставки.",
  },
];

const getInvoiceRequirementChecks = (record: DerivedOrderRecord): RequirementCheck[] => [
  {
    label: "Є позиції",
    done: record.items.length > 0,
    help: "Рахунок формується з позицій замовлення.",
  },
];

const getTechCardRequirementChecks = (record: DerivedOrderRecord): RequirementCheck[] => [
  {
    label: "Є позиції",
    done: record.items.length > 0,
    help: "Техкарта описує позиції замовлення.",
  },
  {
    label: "Візуал погоджено",
    done: record.hasApprovedVisualization,
    help: "Потрібен затверджений візуал із дизайн-задачі.",
  },
  {
    label: "Макет погоджено",
    done: record.hasApprovedLayout,
    help: "Потрібен затверджений макет із дизайн-задачі.",
  },
];

// Коротка дата для бейджа «Створено · 12.05».
const formatShortCreatedDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
};

// actionMode керує кнопкою рядка:
//  'blocked' — даних/умов не вистачає, дії нема (лише причина);
//  'create'  — все готово, документ ще не створено → кнопка «Створити»;
//  'open'    — документ створено / готовий до генерації → кнопка «Відкрити PDF».
type DocumentActionMode = "blocked" | "create" | "open";

const getDocumentActionState = (
  record: DerivedOrderRecord,
  kind: OrderDocumentKind
): {
  title: string;
  ready: boolean;
  created?: boolean;
  statusLabel: string;
  statusReady: boolean;
  blockedLabel: string | null;
  checks: RequirementCheck[];
  hint: string;
  actionMode: DocumentActionMode;
  createdDateLabel: string | null;
  isRequisitesBlocker: boolean;
} => {
  if (kind === "contract") {
    const checks = getContractRequirementChecks(record);
    const missing = getMissingRequirementLabels(checks);
    const ready = missing.length === 0;
    const created = Boolean(record.contractCreatedAt);
    const actionMode: DocumentActionMode = !ready ? "blocked" : created ? "open" : "create";
    return {
      title: "Договір",
      ready,
      created,
      statusLabel: created ? "Створено" : ready ? "Можна створити" : "Немає даних",
      statusReady: ready,
      blockedLabel: missing.length > 0 ? `Не вистачає: ${missing.join(", ")}` : null,
      checks,
      hint:
        "Договір використовує реквізити з картки Замовника і контактні дані з замовлення. Якщо тут є жовті пункти, їх треба виправити в картці Замовника або в замовленні.",
      actionMode,
      createdDateLabel: formatShortCreatedDate(record.contractCreatedAt),
      isRequisitesBlocker: !ready,
    };
  }

  if (kind === "specification") {
    const checks = getSpecificationRequirementChecks(record);
    const missing = getMissingRequirementLabels(checks);
    const ready = missing.length === 0;
    // Правило: СП не можна створити без Договору. Якщо саме його не вистачає —
    // показуємо явну й коротку підказку замість списку всіх missing.
    const contractMissing = !record.contractCreatedAt;
    const created = Boolean(record.specificationCreatedAt);
    const blockedLabel = contractMissing
      ? "Спочатку створіть Договір — без нього СП недоступна."
      : missing.length > 0
        ? `Не виконано: ${missing.join(", ")}`
        : null;
    const actionMode: DocumentActionMode =
      contractMissing || !ready ? "blocked" : created ? "open" : "create";
    return {
      title: "СП",
      ready,
      created,
      statusLabel: created
        ? "Створено"
        : ready
          ? "Можна створити"
          : contractMissing
            ? "Очікує Договір"
            : "Потрібні умови",
      statusReady: ready,
      blockedLabel,
      checks,
      hint:
        "СП має окремі правила: тільки безготівка, тільки після створення договору, і з умовами оплати та Incoterms із замовлення.",
      actionMode,
      createdDateLabel: formatShortCreatedDate(record.specificationCreatedAt),
      isRequisitesBlocker: false,
    };
  }

  if (kind === "invoice") {
    const checks = getInvoiceRequirementChecks(record);
    const missing = getMissingRequirementLabels(checks);
    const ready = missing.length === 0;
    return {
      title: "Рахунок",
      ready,
      statusLabel: ready ? "Готовий" : "Немає позицій",
      statusReady: ready,
      blockedLabel: missing.length > 0 ? `Не виконано: ${missing.join(", ")}` : null,
      checks,
      hint: "Рахунок формується з товарних позицій замовлення і не потребує створеного договору.",
      actionMode: ready ? "open" : "blocked",
      createdDateLabel: null,
      isRequisitesBlocker: false,
    };
  }

  const checks = getTechCardRequirementChecks(record);
  const missing = getMissingRequirementLabels(checks);
  const ready = missing.length === 0;
  return {
    title: "Техкарта",
    ready,
    statusLabel: ready ? "Готова" : "Очікує дизайн",
    statusReady: ready,
    blockedLabel: missing.length > 0 ? `Не виконано: ${missing.join(", ")}` : null,
    checks,
    hint: "Техкарта доступна, коли є позиції і затверджені виробничі матеріали: візуал та макет.",
    actionMode: ready ? "open" : "blocked",
    createdDateLabel: null,
    isRequisitesBlocker: false,
  };
};

const RequirementList = ({ checks }: { checks: RequirementCheck[] }) => (
  <div className="space-y-1.5">
    {checks.map((check) => (
      <div key={check.label} className="flex items-start gap-2">
        {check.done ? (
          <CheckCircle2 className="tone-text-success mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <AlertTriangle className="tone-text-warning mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <div>
          <div className={cn("font-medium", check.done ? "text-foreground" : "tone-text-warning")}>{check.label}</div>
          <div className="text-muted-foreground">{check.help}</div>
        </div>
      </div>
    ))}
  </div>
);

const renderDesignAssetList = (
  title: string,
  assets: OrderDesignAsset[],
  options: {
    openingAssetId: string | null;
    onOpenAsset: (asset: OrderDesignAsset) => void;
  }
) => (
  <div className="rounded-lg border border-border/60 bg-muted/[0.04] p-3">
    <div className="flex items-center justify-between gap-2">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">
        {assets.length}
      </Badge>
    </div>
    {assets.length === 0 ? (
      <div className="mt-2 text-sm text-muted-foreground">Немає погоджених матеріалів</div>
    ) : (
      <div className="mt-2 space-y-2">
        {assets.map((asset) => (
          <div
            key={`${title}:${asset.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/80 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{asset.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {asset.kind === "file" ? "Файл" : "Посилання"}
                {asset.createdAt ? ` • ${formatOrderDate(asset.createdAt)}` : ""}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => options.onOpenAsset(asset)}
              disabled={
                options.openingAssetId === asset.id ||
                (!asset.url && !(asset.kind === "file" && asset.storageBucket && asset.storagePath))
              }
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              {options.openingAssetId === asset.id ? "Відкриваємо..." : "Відкрити"}
            </Button>
          </div>
        ))}
      </div>
    )}
  </div>
);

type OrderDocumentKind = "contract" | "invoice" | "specification" | "techCard";

const escapeHtml = (value?: string | number | null) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Підстава підпису у тексті йде після «діє на підставі ...» → потрібен родовий відмінок.
// Закритий набір значень із Select (Статут/Довіреність) відмінюємо детерміновано;
// довільні значення (напр. для ФОП) лишаємо як є — їх вводять уже в потрібній формі.
const toAuthorityGenitive = (value?: string | null) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const normalized = trimmed.toLowerCase();
  if (normalized === "статут" || normalized === "статуту") return "Статуту";
  if (normalized === "довіреність" || normalized === "довіреності") return "Довіреності";
  return trimmed;
};

const documentTitleByKind: Record<OrderDocumentKind, string> = {
  contract: "Договір",
  invoice: "Рахунок",
  specification: "Специфікація",
  techCard: "Технологічний додаток",
};

const CONTRACT_EXECUTOR = ORDER_DOCUMENT_EXECUTOR;

const formatContractDateParts = (value?: string | null) => {
  const source = value ? new Date(value) : new Date();
  const date = Number.isNaN(source.getTime()) ? new Date() : source;
  const monthLabel = date.toLocaleDateString("uk-UA", { month: "long" });
  return {
    day: String(date.getDate()).padStart(2, "0"),
    monthLabel,
    year: String(date.getFullYear()),
    city: "м. Київ",
  };
};

const formatContractEndDate = (value?: string | null) => {
  const source = value ? new Date(value) : new Date();
  const date = Number.isNaN(source.getTime()) ? new Date() : source;
  date.setFullYear(date.getFullYear() + 1);
  return date.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatSlashDate = (value?: string | null) => {
  const source = value ? new Date(value) : new Date();
  const date = Number.isNaN(source.getTime()) ? new Date() : source;
  return date.toLocaleDateString("uk-UA");
};

const formatPlainMoney = (value: number) =>
  new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

const SPEC_VAT_RATE = 20;
const SPEC_DEFAULT_WORK_DAYS = 15;

const getPaymentTermsParts = (terms: string, total: number) => {
  const option = ORDER_PAYMENT_TERMS_OPTIONS.find((item) => item.id === terms) ?? ORDER_PAYMENT_TERMS_OPTIONS[1];
  const advanceAmount = total * (option.advance / 100);
  const balanceAmount = total - advanceAmount;
  return {
    ...option,
    advanceAmount,
    balanceAmount,
  };
};

const formatIncotermsLabel = (record: Pick<DerivedOrderRecord, "incotermsCode" | "incotermsPlace">) => {
  const code = record.incotermsCode?.trim() || "FCA";
  const place = record.incotermsPlace?.trim();
  return `${code} (Incoterms 2020)${place ? `, ${place}` : ""}`;
};

const canCreateSpecification = (record: DerivedOrderRecord) =>
  record.items.length > 0 &&
  isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail) &&
  Boolean(record.contractCreatedAt) &&
  record.hasApprovedVisualization;

// Build initial render context for the contract sections from current record fields.
// Used to seed defaults when manager creates the very first revision (v1).
const buildContractRenderContextFromRecord = (record: DerivedOrderRecord): ContractRenderContext => {
  const totalWithVat = Number(record.total || 0);
  const advance = record.prepaymentPct ?? null;
  const balance = record.balancePct ?? null;
  const hasBreakdown = typeof advance === "number" && typeof balance === "number";
  const timing = record.balanceTiming ?? "before_shipment";
  const balanceDays = record.balanceDaysAfterShipment ?? 3;
  const balanceTimingPhrase =
    timing === "after_shipment"
      ? "після відвантаження продукції (отримання Замовником)"
      : "після готовності продукції, до відвантаження";
  return {
    productionWorkingDays: 50,
    contractEndDate: formatContractEndDate(record.contractCreatedAt ?? null),
    hasPaymentBreakdown: hasBreakdown,
    paymentAdvancePct: advance ?? 0,
    paymentBalancePct: balance ?? 0,
    balanceTimingPhrase,
    balanceAfterShipmentTermSuffix:
      timing === "after_shipment" ? `, протягом ${balanceDays} робочих днів з дати відвантаження` : "",
    contractAutoProlongation: false,
    // totalWithVat is intentionally unused in the default template body, but kept here for future tokens.
    ...{ totalWithVat },
  } as ContractRenderContext;
};

const getSpecificationBlocker = (record: DerivedOrderRecord) => {
  if (record.items.length === 0) return "Немає позицій для СП.";
  if (!isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)) {
    return "СП створюється тільки для безготівкового розрахунку.";
  }
  if (!record.contractCreatedAt) {
    return "Перед СП потрібно створити Договір.";
  }
  if (!record.hasApprovedVisualization) {
    return "Для СП потрібна погоджена візуалізація.";
  }
  return null;
};

const normalizeDocumentDocs = (record: DerivedOrderRecord) => ({
  ...record.docs,
  specification: canCreateSpecification(record),
});

type BuildOrderDocumentOptions = {
  /** Підписант замовника у родовому відмінку (Кого?) — використовується у тілі документа після "в особі ...". */
  customerSignatoryNameGenitive?: string;
  /** Посада підписанта замовника у родовому відмінку (Кого?) — також для тіла "в особі ...". */
  customerSignatoryRoleGenitive?: string;
  /** Кількість робочих днів на виконання замовлення (для п. 2.2 договору). */
  productionWorkingDays?: number;
  /** Автоматична пролонгація договору на рік (додає умову в п. 8.13). */
  contractAutoProlongation?: boolean;
  /** % передоплати (перед запуском). Override щодо значення на record. */
  prepaymentPct?: number | null;
  /** % доплати. */
  balancePct?: number | null;
  /** Коли відбувається доплата. */
  balanceTiming?: "before_shipment" | "after_shipment" | null;
  /** Кількість робочих днів на доплату (тільки при balanceTiming='after_shipment'). */
  balanceDaysAfterShipment?: number | null;
  /** URL-и зображень погодженої візуалізації, готові до вставки в <img src>. */
  visualizationImageUrls?: string[];
  /** Якщо передано — рендеримо договір з цих секцій (з ревізії), інакше — з дефолтів. */
  contractSections?: ContractSection[];
  /** Ручний № договору (owner/seo). Override щодо record.contractNumber. */
  contractNumberOverride?: string;
  /** Ручна дата договору (owner/seo), формат YYYY-MM-DD. Override щодо record.contractDate. */
  contractDateOverride?: string | null;
};

const buildOrderDocumentHtml = (
  record: DerivedOrderRecord,
  kind: OrderDocumentKind,
  options: BuildOrderDocumentOptions = {}
) => {
  const title = documentTitleByKind[kind];
  // Ручні перевизначення (редагує лише owner/seo): реальний паперовий договір може мати власний № і дату.
  // Якщо їх не задано — fallback на номер замовлення CRM та дату створення.
  const effectiveContractNumber =
    options.contractNumberOverride?.trim() || record.contractNumber?.trim() || record.quoteNumber;
  const effectiveContractDateSource =
    options.contractDateOverride || record.contractDate || record.contractCreatedAt || null;
  // Дата документа = ручна дата договору, інакше момент створення. Якщо ще не створено — сьогодні (fallback у форматері).
  const contractDate = formatContractDateParts(effectiveContractDateSource);
  const contractEndDate = formatContractEndDate(effectiveContractDateSource);
  const customerTitle = record.legalEntityLabel || record.customerName;
  const customerSignatoryName = record.customerSignatoryName?.trim() || "Не вказано";
  // Підпис унизу документа — короткий формат "І.П. Прізвище" (як у Виконавця "О.В. Борщ").
  const customerSignatureLabel = toSignatureInitials(record.customerSignatoryName) || customerSignatoryName;
  // Genitive form for body text ("в особі директора ..."), fallback to nominative if not provided.
  const customerSignatoryNameBody = options.customerSignatoryNameGenitive?.trim() || customerSignatoryName;
  const customerSignatoryRole = record.customerSignatoryPosition?.trim() || "уповноваженої особи";
  // Для тіла документа ("в особі ...") — посада у родовому відмінку з малої літери.
  // Якщо OpenAI повернув genitive — беремо його; інакше fallback на оригінал.
  const customerSignatoryRoleGenitive = options.customerSignatoryRoleGenitive?.trim() || customerSignatoryRole;
  const customerSignatoryRoleBody = customerSignatoryRoleGenitive
    ? customerSignatoryRoleGenitive.charAt(0).toLocaleLowerCase("uk-UA") + customerSignatoryRoleGenitive.slice(1)
    : customerSignatoryRoleGenitive;
  const customerSignatoryAuthority = record.customerSignatoryAuthority?.trim()
    ? toAuthorityGenitive(record.customerSignatoryAuthority)
    : "Не вказано";
  const rows = record.items
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${item.thumbUrl || item.imageUrl ? `<img src="${escapeHtml(item.thumbUrl || item.imageUrl)}" alt="${escapeHtml(item.name)}" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #d1d5db;margin-bottom:8px;" />` : ""}${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.unit)}</td>
          <td class="num">${escapeHtml(item.qty.toLocaleString("uk-UA"))}</td>
          <td class="num">${escapeHtml(formatOrderMoney(item.unitPrice, record.currency))}</td>
          <td class="num">${escapeHtml(formatOrderMoney(item.lineTotal, record.currency))}</td>
        </tr>`
    )
    .join("");
  const customerBankDetails = record.customerBankDetails?.trim() || record.customerIban?.trim() || "Не вказано";
  const customerTaxId = record.customerTaxId?.trim() || "Не вказано";
  const customerVatId = record.customerVatId?.trim() || "Не вказано";
  // Формуємо фразу про статус ПДВ зі ставки в карті клієнта.
  const buildVatStatusLabel = (rate?: string | null) => {
    const normalized = (rate ?? "").trim();
    if (!normalized || normalized === "none") return "Не є платником ПДВ.";
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric < 0) return "Не є платником ПДВ.";
    if (numeric === 20) return "Є платником ПДВ на загальних підставах.";
    if (numeric === 0) return "Є платником ПДВ за нульовою ставкою.";
    return `Є платником ПДВ за ставкою ${numeric}%.`;
  };
  const customerVatStatus = buildVatStatusLabel(record.customerVatRate);
  // Параметри з модала створення Договору. Дефолти збігаються зі старим хардкодом.
  const productionWorkingDays =
    typeof options.productionWorkingDays === "number" && Number.isFinite(options.productionWorkingDays) && options.productionWorkingDays > 0
      ? Math.round(options.productionWorkingDays)
      : 50;
  const contractAutoProlongation = options.contractAutoProlongation === true;
  const specificationNumber = record.quoteNumber;
  const specificationDateLong = formatContractDateParts(record.specificationCreatedAt ?? null);
  const totalWithVat = Number(record.total || 0);
  const totalWithoutVat = totalWithVat / (1 + SPEC_VAT_RATE / 100);
  // Структура оплати: пріоритет — options з модала, потім збережені на record поля,
  // у фоллбеку — legacy `paymentTerms` (50/50, 70/30, ...).
  const effectivePrepaymentPct =
    options.prepaymentPct !== undefined && options.prepaymentPct !== null
      ? options.prepaymentPct
      : record.prepaymentPct;
  const effectiveBalancePct =
    options.balancePct !== undefined && options.balancePct !== null
      ? options.balancePct
      : record.balancePct;
  const effectiveBalanceTiming =
    options.balanceTiming !== undefined && options.balanceTiming !== null
      ? options.balanceTiming
      : record.balanceTiming ?? "before_shipment";
  const hasExplicitPaymentBreakdown =
    typeof effectivePrepaymentPct === "number" &&
    typeof effectiveBalancePct === "number";
  const paymentTerms = hasExplicitPaymentBreakdown
    ? (() => {
        const adv = effectivePrepaymentPct ?? 0;
        const bal = effectiveBalancePct ?? 0;
        return {
          id: `${adv}/${bal}`,
          label: `${adv}/${bal}`,
          advance: adv,
          balance: bal,
          advanceAmount: totalWithVat * (adv / 100),
          balanceAmount: totalWithVat * (bal / 100),
        };
      })()
    : getPaymentTermsParts(record.paymentTerms, totalWithVat);
  // Кількість робочих днів на доплату — пріоритет: options → record → дефолт 3.
  const effectiveBalanceDays =
    options.balanceDaysAfterShipment ?? record.balanceDaysAfterShipment ?? 3;
  const balanceTimingPhrase =
    effectiveBalanceTiming === "after_shipment"
      ? "після відвантаження продукції (отримання Замовником)"
      : "після готовності продукції, до відвантаження";
  // Фраза про строк доплати у пункті СП. До відвантаження — без термінів; після відвантаження — N робочих днів.
  const balanceTermPhrase =
    effectiveBalanceTiming === "after_shipment"
      ? `протягом ${effectiveBalanceDays} робочих днів з дати відвантаження`
      : "протягом 3-х робочих днів з дати готовності продукції";
  const deliveryTerms = formatIncotermsLabel(record);
  const specificationRows = record.items
    .map((item, index) => {
      const unitPriceWithVat = Number(item.unitPrice || 0);
      const unitPriceWithoutVat = unitPriceWithVat / (1 + SPEC_VAT_RATE / 100);
      // Свідомо НЕ виводимо посилання на каталог постачальника (catalogSourceUrl) —
      // це внутрішнє джерело, його не місце в документі для замовника.
      const itemDetails = [
        item.description?.trim() ? `<div style="margin-top:4px;font-size:12px;color:#374151;">${escapeHtml(item.description)}</div>` : "",
        item.methodsSummary?.trim() ? `<div style="margin-top:4px;font-size:12px;color:#4b5563;">Нанесення: ${escapeHtml(item.methodsSummary)}</div>` : "",
      ].join("");
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${item.thumbUrl || item.imageUrl ? `<img src="${escapeHtml(item.thumbUrl || item.imageUrl)}" alt="${escapeHtml(item.name)}" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #d1d5db;margin-bottom:8px;" />` : ""}${escapeHtml(item.name)}${itemDetails}</td>
          <td class="num">${escapeHtml(item.qty.toLocaleString("uk-UA"))}</td>
          <td class="num">${escapeHtml(formatPlainMoney(unitPriceWithVat))}</td>
          <td class="num">${escapeHtml(formatPlainMoney(unitPriceWithoutVat))}</td>
          <td class="num">${escapeHtml(`${SPEC_DEFAULT_WORK_DAYS} р.д.`)}</td>
        </tr>`;
    })
    .join("");

  // Контекст для генерації дефолтних секцій договору з поточних опцій/полів.
  const contractRenderContext = {
    productionWorkingDays,
    contractEndDate,
    hasPaymentBreakdown: hasExplicitPaymentBreakdown,
    paymentAdvancePct: paymentTerms.advance,
    paymentBalancePct: paymentTerms.balance,
    balanceTimingPhrase,
    balanceAfterShipmentTermSuffix:
      effectiveBalanceTiming === "after_shipment"
        ? `, протягом ${effectiveBalanceDays} робочих днів з дати відвантаження`
        : "",
    contractAutoProlongation,
  };
  const contractSectionsToRender =
    options.contractSections ?? buildDefaultContractSections(contractRenderContext);
  const contractBodyHtml = renderContractSectionsHtml(contractSectionsToRender);
  const partiesSectionIndex = partiesSectionNumber(contractSectionsToRender);

  if (kind === "contract") {
    return `<!doctype html>
    <html lang="uk">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)} ${escapeHtml(record.quoteNumber)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 0; line-height: 1.45; background: #f3f4f6; }
          .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 24px; background: rgba(255,255,255,0.96); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(8px); }
          .toolbar-title { font-size: 14px; color: #4b5563; }
          .toolbar-actions { display: flex; gap: 12px; }
          .toolbar-button { border: 1px solid #d1d5db; background: #ffffff; color: #111827; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 600; cursor: pointer; }
          .toolbar-button.primary { background: #111827; border-color: #111827; color: #ffffff; }
          .page { max-width: 960px; margin: 24px auto; background: #ffffff; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); padding: 36px; }
          h1 { font-size: 24px; text-align: center; margin: 0; }
          h2 { font-size: 16px; text-align: center; margin: 2px 0 18px; font-weight: 600; }
          h3 { font-size: 15px; margin: 20px 0 10px; font-weight: 700; text-transform: uppercase; }
          p { margin: 0 0 10px; font-size: 14px; }
          ul { margin: 0 0 10px 20px; padding: 0; }
          li { margin: 0 0 6px; font-size: 14px; }
          .topline { display: flex; justify-content: space-between; gap: 24px; margin: 14px 0 16px; font-size: 14px; }
          .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 24px; }
          .party-card { border-top: 1px solid #cbd5e1; padding-top: 14px; }
          .party-title { font-weight: 700; margin-bottom: 10px; }
          .signature { margin-top: 18px; }
          .muted { color: #6b7280; }
          @media print {
            body { background: #ffffff; }
            .toolbar { display: none; }
            .page { max-width: none; margin: 0; box-shadow: none; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <div class="toolbar-title">Договір ${escapeHtml(effectiveContractNumber)}</div>
          <div class="toolbar-actions">
            <button class="toolbar-button" type="button" onclick="window.close()">Закрити</button>
            <button class="toolbar-button primary" type="button" onclick="window.print()">Зберегти PDF / Друк</button>
          </div>
        </div>
        <div class="page">
        <h1>ДОГОВІР № ${escapeHtml(effectiveContractNumber)}</h1>
        <h2>на виготовлення та поставку рекламно-сувенірної продукції</h2>
        <div class="topline">
          <div>${escapeHtml(contractDate.city)}</div>
          <div>«${escapeHtml(contractDate.day)}» ${escapeHtml(contractDate.monthLabel)} ${escapeHtml(contractDate.year)} р.</div>
        </div>

        <p>${escapeHtml(CONTRACT_EXECUTOR.companyName)} (надалі – Виконавець), в особі ${escapeHtml(CONTRACT_EXECUTOR.signatoryPosition)} ${escapeHtml(CONTRACT_EXECUTOR.signatory)}, яка діє на підставі ${escapeHtml(CONTRACT_EXECUTOR.authority)}, з однієї сторони, та ${escapeHtml(customerTitle)} (надалі – Замовник), в особі ${escapeHtml(customerSignatoryRoleBody)} ${escapeHtml(customerSignatoryNameBody)}, яка діє на підставі ${escapeHtml(customerSignatoryAuthority)}, з іншої сторони (надалі – Сторони), уклали цей Договір про наступне:</p>

        ${contractBodyHtml}

        <h3>${partiesSectionIndex}. Адреси і реквізити сторін</h3>
        <div class="party-grid">
          <div class="party-card">
            <div class="party-title">ВИКОНАВЕЦЬ</div>
            <p>${escapeHtml(CONTRACT_EXECUTOR.shortName)}</p>
            <p>${escapeHtml(CONTRACT_EXECUTOR.address)}</p>
            <p>Код ЄДРПОУ: ${escapeHtml(CONTRACT_EXECUTOR.taxId)}</p>
            <p>ІПН: ${escapeHtml(CONTRACT_EXECUTOR.vatId)}</p>
            <p>IBAN: ${escapeHtml(CONTRACT_EXECUTOR.iban)}</p>
            <p>${escapeHtml(CONTRACT_EXECUTOR.bank)}</p>
            <p>${escapeHtml(CONTRACT_EXECUTOR.taxStatus)}</p>
            <p class="signature">${escapeHtml(CONTRACT_EXECUTOR.signatoryPositionDisplay)} ____________________ ${escapeHtml(CONTRACT_EXECUTOR.signatureLabel)}</p>
          </div>
          <div class="party-card">
            <div class="party-title">ЗАМОВНИК</div>
            <p>${escapeHtml(customerTitle)}</p>
            <p>${escapeHtml(record.customerLegalAddress || "Не вказано")}</p>
            <p>Код ЄДРПОУ: ${escapeHtml(customerTaxId)}</p>
            <p>ІПН: ${escapeHtml(customerVatId)}</p>
            <p>IBAN: ${escapeHtml(customerBankDetails)}</p>
            <p>${escapeHtml(customerVatStatus)}</p>
            <p class="signature">${escapeHtml(customerSignatoryRole)} ____________________ ${escapeHtml(customerSignatureLabel)}</p>
          </div>
        </div>
        </div>
      </body>
    </html>`;
  }

  if (kind === "specification") {
    return `<!doctype html>
    <html lang="uk">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)} ${escapeHtml(record.quoteNumber)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 0; line-height: 1.45; background: #f3f4f6; }
          .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 24px; background: rgba(255,255,255,0.96); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(8px); }
          .toolbar-title { font-size: 14px; color: #4b5563; }
          .toolbar-actions { display: flex; gap: 12px; }
          .toolbar-button { border: 1px solid #d1d5db; background: #ffffff; color: #111827; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 600; cursor: pointer; }
          .toolbar-button.primary { background: #111827; border-color: #111827; color: #ffffff; }
          .page { max-width: 960px; margin: 24px auto; background: #ffffff; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); padding: 36px; }
          p { margin: 0 0 10px; font-size: 14px; }
          .center { text-align: center; }
          .small { font-size: 13px; }
          .section-title { margin: 18px 0 10px; font-size: 15px; font-weight: 700; }
          .topline { display: flex; justify-content: space-between; gap: 24px; margin: 14px 0 18px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #111827; padding: 8px 10px; vertical-align: top; font-size: 13px; }
          th { background: #f8fafc; font-weight: 700; text-align: left; }
          .num { text-align: right; white-space: nowrap; }
          .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 24px; }
          .party-title { font-weight: 700; margin-bottom: 10px; }
          .signature-line { margin-top: 20px; }
          .subsection-title { margin: 10px 0 4px; font-size: 14px; font-weight: 700; }
          ul { margin: 4px 0 10px 18px; padding: 0; }
          li { margin: 0 0 6px; font-size: 14px; }
          .visualization { margin: 18px 0 0; display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
          .visualization img { max-width: 100%; max-height: 320px; object-fit: contain; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; }
          @media print {
            body { background: #ffffff; }
            .toolbar { display: none; }
            .page { max-width: none; margin: 0; box-shadow: none; padding: 0; }
            .visualization { page-break-inside: avoid; }
            .visualization img { max-height: 260px; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <div class="toolbar-title">СП ${escapeHtml(record.quoteNumber)}</div>
          <div class="toolbar-actions">
            <button class="toolbar-button" type="button" onclick="window.close()">Закрити</button>
            <button class="toolbar-button primary" type="button" onclick="window.print()">Зберегти PDF / Друк</button>
          </div>
        </div>
        <div class="page">
          <div class="center small">Додаток № ${escapeHtml(specificationNumber)}</div>
          <div class="center small">До Договору на виготовлення та поставку рекламно-сувенірної продукції</div>
          <div class="center small">№${escapeHtml(effectiveContractNumber)} від ${escapeHtml(formatSlashDate(effectiveContractDateSource))}</div>

          <div class="topline">
            <div>м. Київ</div>
            <div>«${escapeHtml(specificationDateLong.day)}» ${escapeHtml(specificationDateLong.monthLabel)} ${escapeHtml(specificationDateLong.year)} р.</div>
          </div>

          <p>${escapeHtml(CONTRACT_EXECUTOR.companyName)} (надалі Виконавець), в особі ${escapeHtml(CONTRACT_EXECUTOR.signatoryPosition)} ${escapeHtml(CONTRACT_EXECUTOR.signatory)}, яка діє на підставі ${escapeHtml(CONTRACT_EXECUTOR.authority)}, з однієї сторони, та ${escapeHtml(customerTitle)} (надалі – Замовник), в особі ${escapeHtml(customerSignatoryRoleBody)} ${escapeHtml(customerSignatoryNameBody)}, що діє на підставі ${escapeHtml(customerSignatoryAuthority)}, з іншої сторони, разом - Сторони, підписали цей Додаток до Договору про наступне:</p>

          <div class="section-title center">1. СПЕЦИФІКАЦІЯ НА ВИГОТОВЛЕННЯ</div>

          <table>
            <thead>
              <tr>
                <th style="width:48px;">№</th>
                <th>Назва продукції та характеристика</th>
                <th style="width:110px;">К-ть продукції, шт.</th>
                <th style="width:120px;">Вартість з ПДВ, грн</th>
                <th style="width:140px;">Ціна 1 шт без ПДВ, грн</th>
                <th style="width:120px;">Строки виконання робіт</th>
              </tr>
            </thead>
            <tbody>
              ${specificationRows}
              <tr>
                <td colspan="3"><b>Загальна вартість з ПДВ</b></td>
                <td class="num"><b>${escapeHtml(formatPlainMoney(totalWithVat))}</b></td>
                <td colspan="2"></td>
              </tr>
            </tbody>
          </table>

          ${
            (options.visualizationImageUrls ?? []).length > 0
              ? `<div class="visualization">
            ${(options.visualizationImageUrls ?? [])
              .map(
                (src) =>
                  `<img src="${escapeHtml(src)}" alt="Візуалізація" />`
              )
              .join("")}
          </div>`
              : ""
          }

          <div class="section-title">2. ВАРТІСТЬ РОБІТ ТА СТРОКИ ВИГОТОВЛЕННЯ ПРОДУКЦІЇ</div>
          <div class="subsection-title">2.1. Загальна вартість виготовлення Продукції</div>
          <ul>
            <li>Загальна вартість робіт з виготовлення продукції складає ${escapeHtml(formatPlainMoney(totalWithVat))} грн, враховуючи ПДВ ${SPEC_VAT_RATE}%.</li>
            <li>Вартість робіт без ПДВ складає ${escapeHtml(formatPlainMoney(totalWithoutVat))} грн.</li>
          </ul>
          <div class="subsection-title">2.2. Терміни поставки Продукції</div>
          <ul>
            <li>Термін виготовлення продукції складає ${SPEC_DEFAULT_WORK_DAYS} робочих днів з дати затвердження оригінал-макету до друку.</li>
          </ul>

          <div class="section-title">3. ПОРЯДОК ОПЛАТИ ВАРТОСТІ ПРОДУКЦІЇ</div>
          <div class="subsection-title">3.1. Умови оплати</div>
          <ul>
            <li>Оплата продукції здійснюється Замовником на умовах ${escapeHtml(paymentTerms.label)}: ${paymentTerms.advance}% (${escapeHtml(formatPlainMoney(paymentTerms.advanceAmount))} грн з урахуванням ПДВ) перед запуском та ${paymentTerms.balance}% (${escapeHtml(formatPlainMoney(paymentTerms.balanceAmount))} грн з урахуванням ПДВ) — ${escapeHtml(balanceTimingPhrase)}, ${escapeHtml(balanceTermPhrase)}.</li>
            <li>Спосіб оплати: ${escapeHtml(record.paymentRail || "Не вказано")}.</li>
          </ul>
          <div class="subsection-title">3.2. Умови доставки Продукції</div>
          <ul>
            <li>Доставка продукції здійснюється на умовах ${escapeHtml(deliveryTerms)}.</li>
          </ul>

          <div class="section-title">4. АДРЕСИ І РЕКВІЗИТИ СТОРІН</div>
          <div class="signature-grid">
            <div>
              <div class="party-title">ВИКОНАВЕЦЬ:</div>
              <p>${escapeHtml(CONTRACT_EXECUTOR.shortName)}</p>
              <p>Юридична адреса: ${escapeHtml(CONTRACT_EXECUTOR.address)}</p>
              <p>IBAN: ${escapeHtml(CONTRACT_EXECUTOR.iban)}</p>
              <p>${escapeHtml(CONTRACT_EXECUTOR.bank)}</p>
              <p>Код ЄДРПОУ: ${escapeHtml(CONTRACT_EXECUTOR.taxId)}</p>
              <p>ІПН: ${escapeHtml(CONTRACT_EXECUTOR.vatId)}</p>
              <p>${escapeHtml(CONTRACT_EXECUTOR.taxStatus)}</p>
              <p class="signature-line">Директор</p>
              <p>__________________________ ${escapeHtml(CONTRACT_EXECUTOR.signatureLabel)}</p>
            </div>
            <div>
              <div class="party-title">ЗАМОВНИК:</div>
              <p>${escapeHtml(customerTitle)}</p>
              <p>Юридична адреса: ${escapeHtml(record.customerLegalAddress || "Не вказано")}</p>
              <p>Код ЄДРПОУ: ${escapeHtml(customerTaxId)}</p>
              <p>ІПН: ${escapeHtml(customerVatId)}</p>
              <p>IBAN: ${escapeHtml(customerBankDetails)}</p>
              <p>${escapeHtml(customerVatStatus)}</p>
              <p class="signature-line">${escapeHtml(customerSignatoryRole)}</p>
              <p>______________________ ${escapeHtml(customerSignatureLabel)}</p>
            </div>
          </div>
        </div>
      </body>
    </html>`;
  }

  const extraSection =
    kind === "techCard"
        ? `
          <div class="meta-block">
            <div><b>Статус дизайну:</b> ${escapeHtml(record.designStatuses.join(", ") || "Не вказано")}</div>
            <div><b>Менеджер:</b> ${escapeHtml(record.managerLabel)}</div>
            <div><b>Оплата:</b> ${escapeHtml(record.paymentRail)}</div>
          </div>`
        : `
          <div class="meta-block">
            <div><b>Замовник:</b> ${escapeHtml(record.customerName)}</div>
            <div><b>Email:</b> ${escapeHtml(record.contactEmail || "Не вказано")}</div>
            <div><b>Телефон:</b> ${escapeHtml(record.contactPhone || "Не вказано")}</div>
          </div>`;

  return `<!doctype html>
  <html lang="uk">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)} ${escapeHtml(record.quoteNumber)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111827; margin: 0; background: #f3f4f6; }
        .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 24px; background: rgba(255,255,255,0.96); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(8px); }
        .toolbar-title { font-size: 14px; color: #4b5563; }
        .toolbar-actions { display: flex; gap: 12px; }
        .toolbar-button { border: 1px solid #d1d5db; background: #ffffff; color: #111827; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .toolbar-button.primary { background: #111827; border-color: #111827; color: #ffffff; }
        .page { max-width: 960px; margin: 24px auto; background: #ffffff; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); padding: 32px; }
        h1 { font-size: 28px; margin: 0 0 8px; }
        .sub { color: #6b7280; margin-bottom: 24px; }
        .meta-block { margin: 0 0 20px; display: grid; gap: 6px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #cbd5e1; padding: 10px 12px; font-size: 14px; }
        th { background: #f8fafc; text-align: left; }
        .num { text-align: right; white-space: nowrap; }
        .total { margin-top: 16px; display: flex; justify-content: flex-end; font-size: 18px; font-weight: bold; }
        @media print {
          body { background: #ffffff; }
          .toolbar { display: none; }
          .page { max-width: none; margin: 0; box-shadow: none; padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <div class="toolbar-title">${escapeHtml(title)} ${escapeHtml(record.quoteNumber)}</div>
        <div class="toolbar-actions">
          <button class="toolbar-button" type="button" onclick="window.close()">Закрити</button>
          <button class="toolbar-button primary" type="button" onclick="window.print()">Зберегти PDF / Друк</button>
        </div>
      </div>
      <div class="page">
      <h1>${escapeHtml(title)}</h1>
      <div class="sub">Замовлення ${escapeHtml(record.quoteNumber)} від ${escapeHtml(formatOrderDate(record.updatedAt))}</div>
      ${extraSection}
      <table>
        <thead>
          <tr>
            <th style="width:50px;">№</th>
            <th>Товар</th>
            <th style="width:70px;">Од.</th>
            <th style="width:120px;">Кількість</th>
            <th style="width:160px;">Ціна</th>
            <th style="width:160px;">Сума</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">Всього: ${escapeHtml(formatOrderMoney(record.total, record.currency))}</div>
      </div>
    </body>
  </html>`;
};

export default function OrdersProductionDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { teamId, loading: authLoading, session, userId, accessRole, jobRole } = useAuth();
  // Approver pool for contract revisions: owner OR job_role=seo (per project policy).
  const isCeo = accessRole === "owner" || (jobRole ?? "").toLowerCase() === "seo";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<DerivedOrderRecord | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [documentSettingsSaving, setDocumentSettingsSaving] = useState(false);
  const [openingAssetId, setOpeningAssetId] = useState<string | null>(null);
  // Параметри модала створення Договору (відкривається на кнопці "PDF" біля рядка "Договір").
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [contractProductionDaysInput, setContractProductionDaysInput] = useState("50");
  const [contractAutoProlongation, setContractAutoProlongation] = useState(false);
  const [contractPrepaymentPctInput, setContractPrepaymentPctInput] = useState("70");
  const [contractBalancePctInput, setContractBalancePctInput] = useState("30");
  const [contractBalanceTiming, setContractBalanceTiming] = useState<"before_shipment" | "after_shipment">("before_shipment");
  const [contractBalanceDaysInput, setContractBalanceDaysInput] = useState("3");
  // Ручні № і дата договору (редагує лише owner/seo) — реальний паперовий договір може мати власні значення.
  const [contractNumberInput, setContractNumberInput] = useState("");
  const [contractDateInput, setContractDateInput] = useState("");
  const [contractDialogSubmitting, setContractDialogSubmitting] = useState(false);
  // Доставка живе на прорахунку (quotes.delivery_type/delivery_details);
  // замовлення читає і редагує саме її, щоб обидва екрани показували одне.
  const [orderDelivery, setOrderDelivery] = useState<OrderDeliverySnapshot | null>(null);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [ttnDialogOpen, setTtnDialogOpen] = useState(false);
  const ttnDelivery = useMemo(
    () => orderDelivery?.deliveryDetails ?? parseQuoteDeliveryDetails(null),
    [orderDelivery]
  );
  const ttnExisting = useMemo(
    () =>
      record?.npTtnNumber
        ? {
            number: record.npTtnNumber,
            ref: record.npTtnRef,
            cost: record.npTtnCost,
            estimatedDelivery: record.npTtnEstimatedDelivery,
          }
        : null,
    [record?.npTtnNumber, record?.npTtnRef, record?.npTtnCost, record?.npTtnEstimatedDelivery]
  );
  const [ttnStatus, setTtnStatus] = useState<string | null>(null);
  useEffect(() => {
    const number = record?.npTtnNumber;
    if (!number) {
      setTtnStatus(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await trackNpDocument(number, record?.contactPhone ?? undefined);
        if (!cancelled) setTtnStatus(result?.status || null);
      } catch {
        /* статус опційний */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [record?.npTtnNumber, record?.contactPhone]);

  useEffect(() => {
    if (!teamId || !record) {
      setOrderDelivery(null);
      return;
    }
    // Замовлення без прорахунку тримає логістику на самому замовленні —
    // у quotes для нього рядка немає, тож туди ходити нема сенсу.
    if (!record.linkedQuoteId) {
      setOrderDelivery({
        deliveryType: record.deliveryType ?? "",
        deliveryDetails: parseQuoteDeliveryDetails(record.deliveryDetails),
      });
      return;
    }
    const linkedQuoteId = record.linkedQuoteId;
    let cancelled = false;
    const loadDelivery = async () => {
      const { data, error: deliveryError } = await supabase
        .schema("tosho")
        .from("quotes")
        .select("delivery_type,delivery_details")
        .eq("team_id", teamId)
        .eq("id", linkedQuoteId)
        .maybeSingle<{ delivery_type?: string | null; delivery_details?: unknown }>();
      if (cancelled) return;
      if (deliveryError) {
        console.warn("Failed to load order delivery info", deliveryError);
        setOrderDelivery(null);
        return;
      }
      setOrderDelivery({
        deliveryType: data?.delivery_type ?? "",
        deliveryDetails: parseQuoteDeliveryDetails(data?.delivery_details),
      });
    };
    void loadDelivery();
    return () => {
      cancelled = true;
    };
  }, [teamId, record, record?.linkedQuoteId, record?.deliveryType, record?.deliveryDetails]);

  const refreshRecord = useCallback(async () => {
    if (!teamId || !id) return;
    try {
      const orders = await loadDerivedOrders(teamId, userId);
      const current = orders.find((entry) => entry.id === id) ?? null;
      setRecord(current);
      if (!current) {
        setError("Замовлення не знайдено.");
      }
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Не вдалося відкрити замовлення.");
    }
  }, [id, teamId, userId]);

  useEffect(() => {
    if (!teamId || !id) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const orders = await loadDerivedOrders(teamId, userId);
        if (!active) return;
        const current = orders.find((entry) => entry.id === id) ?? null;
        setRecord(current);
        if (!current) {
          setError("Замовлення не знайдено.");
        }
      } catch (loadError: unknown) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Не вдалося відкрити замовлення.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [id, teamId, userId]);

  const { openForCustomer: openCustomerEditor, editorProps: customerEditorProps } = useCustomerEditor({
    onSaved: () => {
      void refreshRecord();
    },
  });

  const doneSteps = useMemo(
    () => record?.readinessSteps.filter((step) => step.done).length ?? 0,
    [record]
  );
  const primaryStatusOptions = ORDER_STATUS_SECTIONS.find((section) => section.id === "primary")?.items ?? [];
  const paymentStatusOptions = ORDER_STATUS_SECTIONS.find((section) => section.id === "payment")?.items ?? [];
  const deliveryStatusOptions = ORDER_STATUS_SECTIONS.find((section) => section.id === "delivery")?.items ?? [];

  const handleStatusChange = async (field: "orderStatus" | "paymentStatus" | "deliveryStatus", value: string) => {
    if (!record || record.source !== "stored" || !teamId) return;
    const previous = {
      orderStatus: record.orderStatus,
      paymentStatus: record.paymentStatus,
      deliveryStatus: record.deliveryStatus,
    };
    setRecord({
      ...record,
      [field]: value,
    });
    setStatusSaving(true);
    try {
      await updateOrderStatuses({
        teamId,
        orderId: record.id,
        orderStatus: field === "orderStatus" ? value : undefined,
        paymentStatus: field === "paymentStatus" ? value : undefined,
        deliveryStatus: field === "deliveryStatus" ? value : undefined,
      });
    } catch (statusError: unknown) {
      setRecord({
        ...record,
        orderStatus: previous.orderStatus,
        paymentStatus: previous.paymentStatus,
        deliveryStatus: previous.deliveryStatus,
      });
      setError(statusError instanceof Error ? statusError.message : "Не вдалося оновити статуси.");
    } finally {
      setStatusSaving(false);
    }
  };

  const handleDocumentSettingChange = async (
    patch: Partial<
      Pick<DerivedOrderRecord, "paymentMethodId" | "paymentRail" | "paymentTerms" | "incotermsCode" | "incotermsPlace">
    >
  ) => {
    if (!record || record.source !== "stored" || !teamId) return;
    const previous = record;
    const next = { ...record, ...patch };
    setRecord({ ...next, docs: normalizeDocumentDocs(next) });
    setDocumentSettingsSaving(true);
    try {
      await updateOrderDocumentSettings({
        teamId,
        orderId: record.id,
        paymentMethodId: patch.paymentMethodId,
        paymentMethodLabel: patch.paymentRail,
        paymentTerms: patch.paymentTerms,
        incotermsCode: patch.incotermsCode,
        incotermsPlace: patch.incotermsPlace,
      });
    } catch (settingsError: unknown) {
      setRecord(previous);
      setError(settingsError instanceof Error ? settingsError.message : "Не вдалося зберегти умови СП.");
    } finally {
      setDocumentSettingsSaving(false);
    }
  };

  const handleOpenDesignAsset = async (asset: OrderDesignAsset) => {
    if (asset.kind === "link") {
      if (asset.url) window.open(asset.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!asset.storageBucket || !asset.storagePath) return;

    setOpeningAssetId(asset.id);
    try {
      const signedUrl =
        (await getSignedAttachmentUrl(
          asset.storageBucket,
          asset.storagePath,
          isPreviewableAsset(asset.label) ? "preview" : "original",
          60 * 60
        )) ??
        (await getSignedAttachmentUrl(asset.storageBucket, asset.storagePath, "original", 60 * 60));
      if (!signedUrl) throw new Error("Не вдалося сформувати посилання на файл.");
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (openError) {
      console.error("Failed to open design asset", openError);
    } finally {
      setOpeningAssetId((current) => (current === asset.id ? null : current));
    }
  };

  const openDocumentPrint = async (
    kind: OrderDocumentKind,
    extraOptions: Pick<
      BuildOrderDocumentOptions,
      | "productionWorkingDays"
      | "contractAutoProlongation"
      | "prepaymentPct"
      | "balancePct"
      | "balanceTiming"
      | "balanceDaysAfterShipment"
      | "contractSections"
      | "contractNumberOverride"
      | "contractDateOverride"
    > = {}
  ) => {
    if (!record) return;
    if (kind === "specification") {
      const blocker = getSpecificationBlocker(record);
      if (blocker) {
        setError(blocker);
        return;
      }
    }
    if (kind === "contract" && !record.docs.contract) {
      setError("Для договору не вистачає реквізитів замовника.");
      return;
    }
    // Відмінюємо ПІБ та посаду замовника у родовий відмінок через OpenAI (з кешем у Supabase).
    // Якщо API недоступний — fallback на оригінал, документ не зламається.
    const [customerSignatoryNameGenitive, customerSignatoryRoleGenitive] = await Promise.all([
      record.customerSignatoryName ? declineToGenitive(record.customerSignatoryName) : Promise.resolve(""),
      record.customerSignatoryPosition ? declineToGenitive(record.customerSignatoryPosition) : Promise.resolve(""),
    ]);
    // Готуємо URL-и зображень погодженої візуалізації для вставки у Специфікацію.
    const visualizationImageUrls =
      kind === "specification" ? await resolveVisualizationImageUrls(record.approvedVisualizationAssets) : [];
    const html = buildOrderDocumentHtml(record, kind, {
      customerSignatoryNameGenitive,
      customerSignatoryRoleGenitive,
      visualizationImageUrls,
      ...extraOptions,
    });
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Браузер заблокував нове вікно для документа.");
      return;
    }

    let wroteDocument = false;
    try {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      wroteDocument = true;
    } catch {
      // Fallback for browsers/extensions that prevent document.write into a popup.
    }

    if (!wroteDocument) {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      popup.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }

    // Позначку «створено» ставимо лише при ПЕРШІЙ генерації. Повторне «Відкрити PDF»
    // не має зсувати дату створення (раніше contract_created_at перезаписувався на сьогодні).
    const alreadyCreated =
      kind === "contract"
        ? Boolean(record.contractCreatedAt)
        : kind === "specification"
          ? Boolean(record.specificationCreatedAt)
          : true;
    if (record.source === "stored" && teamId && (kind === "contract" || kind === "specification") && !alreadyCreated) {
      try {
        const createdAt = await markOrderDocumentCreated({
          teamId,
          orderId: record.id,
          documentKind: kind,
        });
        setRecord((current) => {
          if (!current || current.id !== record.id) return current;
          const next =
            kind === "contract"
              ? { ...current, contractCreatedAt: createdAt }
              : { ...current, specificationCreatedAt: createdAt };
          return { ...next, docs: normalizeDocumentDocs(next) };
        });
      } catch (markError: unknown) {
        setError(markError instanceof Error ? markError.message : "Документ відкрито, але не вдалося зберегти позначку створення.");
      }
    }
  };

  // Договір спершу відкриває модал параметрів (строки, пролонгація, оплата), а вже звідти — генерацію PDF.
  // Поля сидяться з раніше збережених значень (persisted), щоб модалка показувала реальний стан.
  const openContractParamsDialog = () => {
    if (!record) return;
    setContractAutoProlongation(record.contractAutoProlongation);
    setContractProductionDaysInput(record.contractProductionDays !== null ? String(record.contractProductionDays) : "50");
    setContractPrepaymentPctInput(record.prepaymentPct !== null ? String(record.prepaymentPct) : "70");
    setContractBalancePctInput(record.balancePct !== null ? String(record.balancePct) : "30");
    setContractBalanceTiming(record.balanceTiming ?? "before_shipment");
    setContractBalanceDaysInput(
      record.balanceDaysAfterShipment !== null ? String(record.balanceDaysAfterShipment) : "3"
    );
    // Дефолти: ручний № / дата, інакше номер замовлення CRM і дата створення (або сьогодні).
    setContractNumberInput(record.contractNumber?.trim() || record.quoteNumber);
    setContractDateInput(
      (record.contractDate || record.contractCreatedAt || new Date().toISOString()).slice(0, 10)
    );
    setContractDialogOpen(true);
  };

  // Перегенерувати вже створений договір одним кліком — без модалки, з раніше збережених параметрів.
  const regenerateContract = () => {
    if (!record) return;
    void openDocumentPrint("contract", {
      productionWorkingDays: record.contractProductionDays ?? undefined,
      contractAutoProlongation: record.contractAutoProlongation,
    });
  };

  // Запуск дії рядка документа:
  //  - Договір не створено → модал параметрів (перше створення);
  //  - Договір уже створено → одразу відкриваємо PDF з persisted-параметрів;
  //  - решта документів → одразу генерація.
  const handleDocumentAction = (kind: OrderDocumentKind) => {
    if (kind === "contract") {
      if (record?.contractCreatedAt) {
        regenerateContract();
      } else {
        openContractParamsDialog();
      }
      return;
    }
    void openDocumentPrint(kind);
  };

  const openEmailDraft = () => {
    if (!record) return;
    const subject = encodeURIComponent(`Документи по замовленню ${record.quoteNumber}`);
    const body = encodeURIComponent(
      [
        `Вітаю.`,
        ``,
        `Надсилаємо документи по замовленню ${record.quoteNumber}.`,
        `Замовник: ${record.customerName}`,
        `Сума: ${formatOrderMoney(record.total, record.currency)}`,
        ``,
        `Документи можна сформувати зі сторінки замовлення: Договір, СП, Рахунок, Техкарта.`,
      ].join("\n")
    );
    window.location.href = `mailto:${encodeURIComponent(record.contactEmail || "")}?subject=${subject}&body=${body}`;
  };

  const openTelegramDraft = () => {
    if (!record) return;
    const directHref = buildTelegramHref(record.contactTelegram);
    if (directHref) {
      window.open(directHref, "_blank", "noopener,noreferrer");
      return;
    }
    const text = encodeURIComponent(
      `Документи по замовленню ${record.quoteNumber}\n${record.customerName}\nСума: ${formatOrderMoney(record.total, record.currency)}`
    );
    window.open(`https://t.me/share/url?url=&text=${text}`, "_blank", "noopener,noreferrer");
  };

  const openViberDraft = () => {
    if (!record) return;
    const text = encodeURIComponent(
      `Документи по замовленню ${record.quoteNumber}. ${record.customerName}. Сума: ${formatOrderMoney(record.total, record.currency)}`
    );
    window.location.href = `viber://forward?text=${text}`;
  };

  if (!id) {
    return <div className="p-6 text-sm text-muted-foreground">Невірний ідентифікатор.</div>;
  }

  if (authLoading || loading) {
    return <AppPageLoader title="Завантаження" subtitle="Відкриваємо деталі замовлення." />;
  }

  if (!session) {
    return <div className="p-6 text-sm text-destructive">User not authenticated</div>;
  }

  if (!teamId) {
    return <div className="p-6 text-sm text-muted-foreground">Немає доступної команди. Перевір членство або інвайт.</div>;
  }

  if (error || !record) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="outline" className="gap-2" onClick={() => navigate("/orders/production")}>
          <ArrowLeft className="h-4 w-4" />
          До списку замовлень
        </Button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? "Замовлення не знайдено."}
        </div>
      </div>
    );
  }

  const documentActions = (["contract", "specification", "invoice", "techCard"] as OrderDocumentKind[]).map((kind) => ({
    kind,
    ...getDocumentActionState(record, kind),
  }));
  const documentsReadyCount = documentActions.filter((item) => item.ready).length;
  const documentsTotalCount = documentActions.length;
  const checklistTotalCount = record.readinessSteps.length;
  const specificationBlocker = getSpecificationBlocker(record);

  return (
    <PageCanvas>
      <PageCanvasBody className="px-4 py-4 pb-20 sm:px-6 lg:px-8 2xl:px-10 md:pb-8">
        <div className="mx-auto max-w-[1760px] space-y-5">
      <Card className="border-border/60 bg-card/95 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <Button variant="outline" className="gap-2" onClick={() => navigate("/orders/production")}>
            <ArrowLeft className="h-4 w-4" />
            До списку замовлень
          </Button>
          <div className="flex min-w-0 items-start gap-4">
            {record.partyType === "customer" && record.customerId ? (
              <button
                type="button"
                onClick={() => void openCustomerEditor(record.customerId!)}
                className="shrink-0 rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:opacity-80"
                aria-label="Редагувати замовника"
                title="Редагувати замовника"
              >
                <EntityAvatar
                  src={record.customerLogoUrl}
                  name={record.customerName}
                  fallback={getInitials(record.customerName)}
                  size={52}
                />
              </button>
            ) : (
              <EntityAvatar
                src={record.customerLogoUrl}
                name={record.customerName}
                fallback={getInitials(record.customerName)}
                size={52}
              />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <HoverCopyText
                  value={record.quoteNumber}
                  textClassName="text-2xl font-semibold text-foreground"
                  successMessage="Номер замовлення скопійовано"
                  copyLabel="Скопіювати номер замовлення"
                >
                  {record.quoteNumber}
                </HoverCopyText>
                <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
                  {record.partyType === "customer" ? "Замовник" : "Лід"}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px]",
                    record.readinessColumn === "ready"
                      ? "tone-success"
                      : record.readinessColumn === "design"
                        ? "tone-info"
                        : "tone-warning"
                  )}
                >
                  {record.readinessColumn === "ready" ? "Готово до замовлення" : "Є блокери"}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1 rounded-full px-2.5 py-0.5 text-[11px]",
                    documentsReadyCount === documentsTotalCount ? "tone-success" : "border-border/70 bg-muted/20 text-muted-foreground"
                  )}
                  title="Готовність документів"
                >
                  <FileText className="h-3 w-3" />
                  {documentsReadyCount} / {documentsTotalCount}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1 rounded-full px-2.5 py-0.5 text-[11px]",
                    doneSteps === checklistTotalCount ? "tone-success" : "border-border/70 bg-muted/20 text-muted-foreground"
                  )}
                  title="Чекліст переходу в замовлення"
                >
                  <ClipboardCheck className="h-3 w-3" />
                  {doneSteps} / {checklistTotalCount}
                </Badge>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {record.partyType === "customer" && record.customerId ? (
                  <button
                    type="button"
                    onClick={() => void openCustomerEditor(record.customerId!)}
                    className="inline-flex items-center gap-1 text-left text-muted-foreground underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:text-foreground focus-visible:decoration-foreground"
                    title="Редагувати замовника"
                  >
                    {record.customerName}
                  </button>
                ) : (
                  record.customerName
                )}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Оновлено {formatOrderDate(record.updatedAt)} • сума {formatOrderMoney(record.total, record.currency)}
              </div>
            </div>
          </div>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-3 xl:w-auto xl:min-w-[520px]">
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Статус замовлення</div>
            {record.source === "stored" ? (
              <Select
                value={record.orderStatus}
                onValueChange={(value) => void handleStatusChange("orderStatus", value)}
                disabled={statusSaving}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {primaryStatusOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm font-semibold text-foreground">
                {record.readinessColumn === "ready" ? "Нове" : "Підготовка до створення"}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Статус оплати</div>
            {record.source === "stored" ? (
              <Select
                value={record.paymentStatus}
                onValueChange={(value) => void handleStatusChange("paymentStatus", value)}
                disabled={statusSaving}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentStatusOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm font-semibold text-foreground">Очікує оплату</div>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Статус доставки</div>
            {record.source === "stored" ? (
              <Select
                value={record.deliveryStatus}
                onValueChange={(value) => void handleStatusChange("deliveryStatus", value)}
                disabled={statusSaving}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deliveryStatusOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm font-semibold text-foreground">Не відвантажено</div>
            )}
          </div>
        </div>
      </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            Контрагент
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {record.legalEntityLabel || "Потрібно заповнити реквізити"}
          </div>
          <div className="mt-3 border-t border-border/60 pt-3">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Підписант</div>
            {record.customerSignatoryName ? (
              <div className="mt-1 text-sm text-foreground">
                <span className="font-medium">{toSignatureInitials(record.customerSignatoryName)}</span>
                {record.customerSignatoryPosition ? (
                  <span className="text-muted-foreground">, {record.customerSignatoryPosition}</span>
                ) : null}
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">Не вказаний</div>
            )}
          </div>
        </Card>

        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <Palette className="h-3.5 w-3.5" />
            Погодження дизайну
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {record.hasApprovedVisualization && record.hasApprovedLayout
              ? "Візуал і макет затверджені"
              : "Потрібна дія по дизайну"}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {record.designStatuses.join(", ") || "Задачі дизайну не знайдені"}
          </div>
          {record.designTaskId ? (
            <div className="mt-3 border-t border-border/50 pt-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Дизайн-задача</div>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0 text-sm"
                onClick={() => navigate(`/design/${record.designTaskId}`)}
              >
                {record.designTaskNumber || "Відкрити дизайн-задачу"}
              </Button>
            </div>
          ) : null}
        </Card>

        <Card className="border-border/60 p-4">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Менеджер замовлення</div>
          <div className="mt-2 flex items-center gap-3">
            <AvatarBase
              src={record.managerAvatarUrl ?? null}
              name={record.managerLabel}
              fallback={getInitials(record.managerLabel)}
              size={36}
              className="border-border/60"
              fallbackClassName="text-[11px] font-semibold"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {record.managerLabel || "Менеджер не призначений"}
              </div>
              <div className="text-xs text-muted-foreground">Відповідальний за замовлення</div>
            </div>
          </div>
        </Card>

        <Card className="border-border/60 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <Truck className="h-3.5 w-3.5" />
              Доставка
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setDeliveryDialogOpen(true)}
            >
              <Pencil className="h-3 w-3" />
              Змінити
            </Button>
          </div>
          {orderDelivery?.deliveryType ? (
            <>
              <div className="mt-2 text-sm font-semibold text-foreground">
                {DELIVERY_TYPE_OPTIONS.find((option) => option.id === orderDelivery.deliveryType)?.label ??
                  orderDelivery.deliveryType}
              </div>
              {(() => {
                const details = orderDelivery.deliveryDetails;
                const location = [details.city, details.npDeliveryType === "address" ? details.street : details.address]
                  .filter(Boolean)
                  .join(", ");
                const recipient = [details.contactName, details.contactPhone].filter(Boolean).join(" · ");
                return (
                  <>
                    {location ? <div className="mt-1 text-sm text-foreground">{location}</div> : null}
                    {recipient ? (
                      <div className="mt-1 text-xs text-muted-foreground">Отримувач: {recipient}</div>
                    ) : null}
                    {details.payer ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Платить: {details.payer === "company" ? "ми" : "замовник"}
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </>
          ) : (
            <div className="mt-2 text-sm text-muted-foreground">Спосіб доставки не вказаний</div>
          )}
          {record.packaging ? (
            <div className="mt-3 border-t border-border/50 pt-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Пакування</div>
              <div className="mt-1 text-sm text-foreground">{record.packaging}</div>
            </div>
          ) : null}
          {record.source === "stored" ? (
            <div className="mt-3 border-t border-border/50 pt-3">
              {record.npTtnNumber ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">ТТН Нової Пошти</div>
                    <div className="font-mono text-sm font-semibold">{record.npTtnNumber}</div>
                    {record.npTtnEstimatedDelivery ? (
                      <div className="text-xs text-muted-foreground">Орієнтовно: {record.npTtnEstimatedDelivery}</div>
                    ) : null}
                    {ttnStatus ? <div className="text-xs font-medium text-foreground">{ttnStatus}</div> : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => setTtnDialogOpen(true)}
                  >
                    Деталі
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full gap-1.5 text-xs"
                  onClick={() => setTtnDialogOpen(true)}
                  disabled={!orderDelivery?.deliveryType}
                >
                  <PackageCheck className="h-3.5 w-3.5" />
                  Створити ТТН
                </Button>
              )}
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="border-border/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              Умови СП
              <InfoHint title="Коли можна створити СП">
                <RequirementList checks={getSpecificationRequirementChecks(record)} />
              </InfoHint>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              СП доступна тільки для безготівки і після створення договору.
            </div>
          </div>
          {documentSettingsSaving ? (
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
              Зберігаємо...
            </Badge>
          ) : null}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <div className="flex h-5 items-center gap-1.5">
              <Label>Тип оплати</Label>
            </div>
            {record.source === "stored" ? (
              <Select
                value={record.paymentMethodId}
                onValueChange={(value) => {
                  const option = ORDER_PAYMENT_METHOD_OPTIONS.find((item) => item.id === value);
                  void handleDocumentSettingChange({
                    paymentMethodId: value,
                    paymentRail: option?.label ?? value,
                  });
                }}
                disabled={documentSettingsSaving}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_PAYMENT_METHOD_OPTIONS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm text-muted-foreground">{record.paymentRail}</div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex h-5 items-center gap-1.5">
              <Label>Умови оплати</Label>
            </div>
            {record.source === "stored" ? (
              <Select
                value={record.paymentTerms}
                onValueChange={(value) => void handleDocumentSettingChange({ paymentTerms: value })}
                disabled={documentSettingsSaving}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_PAYMENT_TERMS_OPTIONS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm text-muted-foreground">{record.paymentTerms}</div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex h-5 items-center gap-1.5">
              <Label>Incoterms 2020</Label>
              <InfoHint title="Як обрати Incoterms" widthClass="w-[440px]">
                <div className="space-y-3">
                  <div>
                    <div className="font-semibold text-foreground">CPT — підходить, якщо:</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      <li>ми самостійно оформлюємо відправку (Нова Пошта / Meest / Укрпошта);</li>
                      <li>ми сплачуємо за доставку;</li>
                      <li>
                        Замовник погоджується, що після передачі товару Перевізнику відповідальність за
                        транспортування переходить до нього;
                      </li>
                      <li>у договорі або СП це чітко зазначено — претензії по транспортуванню вирішуються через Перевізника.</li>
                    </ul>
                    <div className="mt-2 font-medium text-foreground">У Специфікації, пункт 3.2:</div>
                    <div className="mt-1 rounded-md border border-border/60 bg-muted/40 p-2 font-mono text-[11px] leading-4 text-foreground">
                      3.2 Умови доставки: CPT, адресна доставка Нова Пошта: &lt;адреса Замовника з картки клієнта&gt;, Incoterms® 2020
                    </div>
                  </div>
                  <div className="border-t border-border/60 pt-3">
                    <div className="font-semibold text-foreground">CIP — підходить, якщо:</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      <li>товар дорогий;</li>
                      <li>велика партія подарункових наборів;</li>
                      <li>техніка (павери, bluetooth-колонки, EcoFlow), дорогий мерч, преміальна продукція;</li>
                      <li>оформлюємо відправку з великою оголошеною вартістю (страхуванням);</li>
                      <li>
                        ми несемо всі витрати по доставці та страхуванню (компенсаційний захист доставки),
                        поки товар не отримав Замовник.
                      </li>
                    </ul>
                    <div className="mt-2 font-medium text-foreground">У Специфікації:</div>
                    <div className="mt-1 rounded-md border border-border/60 bg-muted/40 p-2 font-mono text-[11px] leading-4 text-foreground">
                      Умови поставки: CIP, &lt;місце доставки&gt;, згідно Incoterms® 2020. Доставка товару
                      здійснюється за рахунок Постачальника через службу доставки Нова Пошта (або Укрпошта /
                      Meest Express) із оформленням страхування (оголошеної вартості відправлення) за наш
                      рахунок. Ризик випадкової втрати або пошкодження товару переходить до Замовника
                      відповідно до погоджених умов поставки.
                    </div>
                  </div>
                </div>
              </InfoHint>
            </div>
            {record.source === "stored" ? (
              <Select
                value={record.incotermsCode}
                onValueChange={(value) => void handleDocumentSettingChange({ incotermsCode: value })}
                disabled={documentSettingsSaving}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_INCOTERMS_OPTIONS.map((item) => (
                    <SelectItem key={item.id} value={item.id} description={item.description}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm text-muted-foreground">{record.incotermsCode}</div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex h-5 items-center gap-1.5">
              <Label>Місце поставки</Label>
            </div>
            {record.source === "stored" ? (
              <Input
                value={record.incotermsPlace ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setRecord((current) => {
                    if (!current) return current;
                    const next = { ...current, incotermsPlace: value };
                    return { ...next, docs: normalizeDocumentDocs(next) };
                  });
                }}
                onBlur={(event) =>
                  void handleDocumentSettingChange({
                    incotermsPlace: event.target.value.trim() || null,
                  })
                }
                placeholder="Напр. склад НП, Київ"
                className="h-9"
                disabled={documentSettingsSaving}
              />
            ) : (
              <div className="text-sm text-muted-foreground">{record.incotermsPlace || "Не вказано"}</div>
            )}
          </div>
        </div>
        {specificationBlocker ? (
          <div className="tone-warning-subtle mt-3 flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm">
            <AlertTriangle className="tone-text-warning mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="tone-text-warning font-medium">{specificationBlocker}</div>
              <div className="mt-1 text-muted-foreground">
                Наведи на іконку біля заголовка або подивись блок “Документи” справа: там показано конкретні умови, які блокують СП.
              </div>
            </div>
          </div>
        ) : (
          <div className="tone-success-subtle mt-3 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm">
            <CheckCircle2 className="tone-text-success h-4 w-4" />
            <span className="tone-text-success font-medium">Умови СП виконані. Документ можна сформувати в блоці “Документи”.</span>
          </div>
        )}
      </Card>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <Table variant="list" size="md">
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 text-center">№</TableHead>
              <TableHead>Товар</TableHead>
              <TableHead className="w-20 text-center">Од.</TableHead>
              <TableHead className="w-28 text-right">Кількість</TableHead>
              <TableHead className="w-36 text-right">Ціна</TableHead>
              <TableHead className="w-36 pr-6 text-right">Сума</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {record.items.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell className="text-center font-medium text-muted-foreground">
                  {item.position || index + 1}
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  <div className="flex items-center gap-3">
                    {item.thumbUrl || item.imageUrl ? (
                      <img
                        src={item.thumbUrl || item.imageUrl || ""}
                        alt={item.name}
                        className="h-12 w-12 shrink-0 rounded-lg border border-border/60 object-cover bg-muted/20"
                        loading="lazy"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <div>{item.name}</div>
                      {item.description ? (
                        <div className="mt-0.5 line-clamp-2 text-xs font-normal text-muted-foreground">{item.description}</div>
                      ) : null}
                      {item.methodsSummary ? (
                        <div className="mt-0.5 text-xs font-normal text-muted-foreground">Нанесення: {item.methodsSummary}</div>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center">{item.unit}</TableCell>
                <TableCell className="text-right tabular-nums">{item.qty.toLocaleString("uk-UA")}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOrderMoney(item.unitPrice, record.currency)}</TableCell>
                <TableCell className="pr-6 text-right font-semibold tabular-nums text-foreground">
                  {formatOrderMoney(item.lineTotal, record.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Card className="border-border/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Palette className="h-4 w-4 text-muted-foreground" />
          Затверджені матеріали для виробництва
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {renderDesignAssetList("Візуал", record.approvedVisualizationAssets, {
            openingAssetId,
            onOpenAsset: (asset) => void handleOpenDesignAsset(asset),
          })}
          {renderDesignAssetList("Макет", record.approvedLayoutAssets, {
            openingAssetId,
            onOpenAsset: (asset) => void handleOpenDesignAsset(asset),
          })}
        </div>
      </Card>

      {teamId && userId ? (
        <ContractRevisionsPanel
          teamId={teamId}
          orderId={record.id}
          currentUserId={userId}
          isCeo={isCeo}
          quoteNumber={record.quoteNumber}
          initialDefaultSections={buildDefaultContractSections(buildContractRenderContextFromRecord(record))}
          onOpenPreview={(sections) =>
            openDocumentPrint("contract", { contractSections: sections })
          }
          onSnapshotRevision={async (revision) => {
            try {
              const [customerSignatoryNameGenitive, customerSignatoryRoleGenitive] = await Promise.all([
                record.customerSignatoryName ? declineToGenitive(record.customerSignatoryName) : Promise.resolve(""),
                record.customerSignatoryPosition ? declineToGenitive(record.customerSignatoryPosition) : Promise.resolve(""),
              ]);
              const html = buildOrderDocumentHtml(record, "contract", {
                customerSignatoryNameGenitive,
                customerSignatoryRoleGenitive,
                contractSections: revision.sections,
              });
              const path = `${record.id}/v${revision.revisionNumber}.html`;
              const { error: uploadError } = await supabase.storage
                .from("contract-snapshots")
                .upload(path, new Blob([html], { type: "text/html;charset=utf-8" }), {
                  upsert: true,
                  contentType: "text/html;charset=utf-8",
                });
              if (uploadError) {
                console.error("Failed to upload contract snapshot", uploadError);
                return null;
              }
              return { storageBucket: "contract-snapshots", storagePath: path };
            } catch (snapshotError) {
              console.error("Snapshot generation failed", snapshotError);
              return null;
            }
          }}
        />
      ) : null}
        </div>

      <aside className="space-y-5 xl:sticky xl:top-4 xl:self-start">
        <Card className="border-border/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Документи</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Тут показані саме умови для PDF-документів. Це окремо від чекліста переходу в замовлення.
              </div>
            </div>
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
              {documentsReadyCount} / {documentsTotalCount}
            </Badge>
          </div>
          <div className="mt-3 divide-y divide-border/60">
            {documentActions.map((document) => {
              const isCreated = document.actionMode === "open" && Boolean(document.createdDateLabel);
              const isContractParams = document.kind === "contract" && Boolean(record.contractCreatedAt);
              // Лівий індикатор стану: зелена галка (створено/готово), бурштин (блокер), нейтральне коло (можна створити).
              const StatusIcon =
                document.actionMode === "blocked" ? AlertTriangle : document.actionMode === "open" ? CheckCircle2 : Circle;
              const statusIconTone =
                document.actionMode === "blocked"
                  ? "tone-text-warning"
                  : document.actionMode === "open"
                    ? "tone-text-success"
                    : "text-muted-foreground/70";
              // Тихий вторинний рядок під назвою (для blocked — окремо нижче, з лінком виправлення).
              const secondaryText =
                document.actionMode === "open"
                  ? isCreated
                    ? `Створено · ${document.createdDateLabel}`
                    : document.statusLabel
                  : document.actionMode === "create"
                    ? "Можна створити"
                    : null;
              return (
                <div
                  key={document.kind}
                  className="group flex items-start gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted/20"
                >
                  <StatusIcon className={cn("mt-0.5 h-4 w-4 shrink-0", statusIconTone)} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">{document.title}</span>
                      <InfoHint title={`${document.title}: що перевіряється`}>
                        <p className="mb-2 text-muted-foreground">{document.hint}</p>
                        <RequirementList checks={document.checks} />
                      </InfoHint>
                    </div>
                    {document.actionMode === "blocked" ? (
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-4 text-muted-foreground">
                        <span>{document.blockedLabel}</span>
                        {document.isRequisitesBlocker && document.kind === "contract" && record.customerId ? (
                          <button
                            type="button"
                            onClick={() => void openCustomerEditor(record.customerId!)}
                            className="inline-flex items-center gap-1 font-medium text-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-primary"
                          >
                            <Pencil className="h-3 w-3" />
                            Виправити реквізити
                          </button>
                        ) : null}
                      </div>
                    ) : secondaryText ? (
                      <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{secondaryText}</div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {document.actionMode === "create" ? (
                      <Button
                        size="sm"
                        className="h-7 gap-1 px-2.5 text-xs"
                        onClick={() => handleDocumentAction(document.kind)}
                      >
                        <FilePlus2 className="h-3.5 w-3.5" />
                        Створити
                      </Button>
                    ) : document.actionMode === "open" ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-xs text-foreground hover:bg-muted/60"
                          onClick={() => handleDocumentAction(document.kind)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Відкрити
                        </Button>
                        {isContractParams ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:bg-muted/60"
                                aria-label="Більше дій з договором"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={openContractParamsDialog}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Параметри й перестворити
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 border-t border-border/60 pt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-foreground">Відправити замовнику</div>
              {record.contactTelegram ? (
                <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                  Telegram: {formatTelegramHandle(record.contactTelegram)}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={openEmailDraft} disabled={!record.contactEmail}>
                <Mail className="mr-2 h-4 w-4" />
                Email
              </Button>
              <Button size="sm" variant="outline" onClick={openTelegramDraft}>
                <Send className="mr-2 h-4 w-4" />
                Telegram
              </Button>
              <Button size="sm" variant="outline" onClick={openViberDraft} disabled={!record.contactPhone}>
                <Phone className="mr-2 h-4 w-4" />
                Viber
              </Button>
            </div>
          </div>
        </Card>

        <Card className="border-border/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <InfoHint title="Чому тут 6/6, але документи можуть бути заблоковані">
                  <p className="text-muted-foreground">
                    Цей чекліст відповідає тільки за перехід із прорахунку в замовлення: контрагент, контакти, позиції і дизайн.
                    Договір і СП мають додаткові юридичні умови, тому винесені в окремий блок “Документи”.
                  </p>
                </InfoHint>
                Чекліст створення замовлення
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Не плутати з готовністю Договору та СП.</div>
            </div>
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
              {doneSteps} / {checklistTotalCount}
            </Badge>
          </div>
          <div className="space-y-2">
            {record.readinessSteps.map((step) => (
              <div
                key={step.label}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
                  step.done ? "tone-success-subtle" : "tone-warning-subtle"
                )}
              >
                {step.done ? (
                  <CheckCircle2 className="tone-text-success mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="tone-text-warning mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </aside>
      </div>
        </div>
      </PageCanvasBody>

      <Dialog
        open={contractDialogOpen}
        onOpenChange={(open) => {
          if (contractDialogSubmitting) return;
          setContractDialogOpen(open);
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Параметри договору</DialogTitle>
            <DialogDescription>
              Уточни перед генерацією PDF. Значення підставляться у текст договору.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-3 rounded-md border border-border/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Номер і дата договору</div>
                {!isCeo ? (
                  <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Тільки СЕО / власник
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="contract-number">№ договору</Label>
                  <Input
                    id="contract-number"
                    value={contractNumberInput}
                    onChange={(e) => setContractNumberInput(e.target.value)}
                    placeholder={record.quoteNumber}
                    className="h-9"
                    disabled={!isCeo}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="contract-date">Дата договору</Label>
                  <Input
                    id="contract-date"
                    type="date"
                    value={contractDateInput}
                    onChange={(e) => setContractDateInput(e.target.value)}
                    className="h-9"
                    disabled={!isCeo}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {isCeo
                  ? "Якщо паперовий договір вже існує — встав його реальні № і дату. Інакше залишиться номер замовлення CRM і дата створення."
                  : "Змінювати № і дату договору може лише СЕО або власник. Зараз підставляться номер замовлення CRM і дата створення."}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
              <div className="grid gap-2">
                <Label htmlFor="contract-production-days">Строки виробництва (робочих днів)</Label>
                <Input
                  id="contract-production-days"
                  inputMode="numeric"
                  value={contractProductionDaysInput}
                  onChange={(e) => setContractProductionDaysInput(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                  placeholder="Напр. 50"
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">Підставляється у п. 2.2 договору. За замовчуванням — 50.</p>
              </div>
              <label
                htmlFor="contract-auto-prolongation"
                className="flex h-full cursor-pointer items-start gap-3 rounded-md border border-border/60 p-3"
              >
                <Checkbox
                  id="contract-auto-prolongation"
                  checked={contractAutoProlongation}
                  onCheckedChange={(checked) => setContractAutoProlongation(checked === true)}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <div className="text-sm font-medium">Автоматична пролонгація на 1 рік</div>
                  <p className="text-xs text-muted-foreground">
                    Додає в п. 8.13 умову: якщо за 30 днів до кінця жодна сторона не повідомить — договір продовжується.
                  </p>
                </div>
              </label>
            </div>

            <div className="space-y-3 rounded-md border border-border/60 p-3">
              <div className="text-sm font-medium">Умови оплати</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="contract-prepayment-pct">Передоплата, %</Label>
                  <Input
                    id="contract-prepayment-pct"
                    inputMode="numeric"
                    value={contractPrepaymentPctInput}
                    onChange={(e) => setContractPrepaymentPctInput(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    placeholder="Напр. 70"
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground">Перед запуском у виробництво.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="contract-balance-pct">Доплата, %</Label>
                  <Input
                    id="contract-balance-pct"
                    inputMode="numeric"
                    value={contractBalancePctInput}
                    onChange={(e) => setContractBalancePctInput(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    placeholder="Напр. 30"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Доплата — коли</Label>
                <Select
                  value={contractBalanceTiming}
                  onValueChange={(value) => setContractBalanceTiming(value as "before_shipment" | "after_shipment")}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before_shipment">По факту готовності, до відвантаження</SelectItem>
                    <SelectItem value="after_shipment">По факту готовності, після відвантаження</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {contractBalanceTiming === "after_shipment" ? (
                <div className="grid gap-2">
                  <Label htmlFor="contract-balance-days">Протягом скількох робочих днів</Label>
                  <Input
                    id="contract-balance-days"
                    inputMode="numeric"
                    value={contractBalanceDaysInput}
                    onChange={(e) => setContractBalanceDaysInput(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    placeholder="Напр. 5"
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground">
                    Доплата здійснюється протягом N робочих/банківських днів після відвантаження Продукції.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setContractDialogOpen(false)}
              disabled={contractDialogSubmitting}
            >
              Скасувати
            </Button>
            <Button
              onClick={async () => {
                const parsedDays = Number(contractProductionDaysInput);
                const productionWorkingDays =
                  Number.isFinite(parsedDays) && parsedDays > 0 ? Math.round(parsedDays) : 50;
                const parsedPrepayment = Number(contractPrepaymentPctInput);
                const prepaymentPct =
                  Number.isFinite(parsedPrepayment) && parsedPrepayment >= 0 && parsedPrepayment <= 100
                    ? parsedPrepayment
                    : null;
                const parsedBalance = Number(contractBalancePctInput);
                const balancePct =
                  Number.isFinite(parsedBalance) && parsedBalance >= 0 && parsedBalance <= 100
                    ? parsedBalance
                    : null;
                // balance_days релевантне тільки для after_shipment; для before_shipment — null.
                const parsedBalanceDays = Number(contractBalanceDaysInput);
                const balanceDaysAfterShipment =
                  contractBalanceTiming === "after_shipment" &&
                  Number.isFinite(parsedBalanceDays) &&
                  parsedBalanceDays > 0
                    ? Math.round(parsedBalanceDays)
                    : null;
                setContractDialogSubmitting(true);
                try {
                  // № і дату договору може змінювати лише СЕО/власник. Для решти — лишаємо як є (override не застосовуємо).
                  const contractNumberOverride = isCeo
                    ? (contractNumberInput.trim() || null)
                    : (record.contractNumber ?? null);
                  const contractDateOverride = isCeo
                    ? (contractDateInput.trim() || null)
                    : (record.contractDate ?? null);
                  // Зберігаємо параметри генерації (строки, пролонгація, оплата) + (для СЕО) № і дату.
                  // Завдяки цьому вже створений договір потім відкривається одним кліком без модалки.
                  if (record && record.source === "stored" && teamId) {
                    try {
                      await updateOrderDocumentSettings({
                        teamId,
                        orderId: record.id,
                        prepaymentPct,
                        balancePct,
                        balanceTiming: contractBalanceTiming,
                        balanceDaysAfterShipment,
                        contractProductionDays: productionWorkingDays ?? null,
                        contractAutoProlongation,
                        ...(isCeo ? { contractNumber: contractNumberOverride, contractDate: contractDateOverride } : {}),
                      });
                      setRecord((current) =>
                        current && current.id === record.id
                          ? {
                              ...current,
                              prepaymentPct,
                              balancePct,
                              balanceTiming: contractBalanceTiming,
                              balanceDaysAfterShipment,
                              contractProductionDays: productionWorkingDays ?? null,
                              contractAutoProlongation,
                              ...(isCeo
                                ? { contractNumber: contractNumberOverride, contractDate: contractDateOverride }
                                : {}),
                            }
                          : current
                      );
                    } catch (saveError) {
                      console.error("Failed to save contract params", saveError);
                    }
                  }
                  await openDocumentPrint("contract", {
                    productionWorkingDays,
                    contractAutoProlongation,
                    prepaymentPct,
                    balancePct,
                    balanceTiming: contractBalanceTiming,
                    balanceDaysAfterShipment,
                    contractNumberOverride: contractNumberOverride ?? undefined,
                    contractDateOverride,
                  });
                  setContractDialogOpen(false);
                } finally {
                  setContractDialogSubmitting(false);
                }
              }}
              disabled={contractDialogSubmitting}
            >
              {contractDialogSubmitting ? "Створення..." : "Створити PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CustomerDialog {...customerEditorProps} />
      {teamId && record ? (
        <OrderDeliveryDialog
          open={deliveryDialogOpen}
          onOpenChange={setDeliveryDialogOpen}
          teamId={teamId}
          quoteId={record.quoteId}
          orderId={record.id}
          storeOnOrder={!record.linkedQuoteId}
          partyType={record.partyType}
          partyId={record.customerId}
          initialDeliveryType={orderDelivery?.deliveryType ?? ""}
          initialDetails={orderDelivery?.deliveryDetails ?? parseQuoteDeliveryDetails(null)}
          onSaved={setOrderDelivery}
        />
      ) : null}
      {teamId && record ? (
        <NovaPoshtaTtnDialog
          open={ttnDialogOpen}
          onOpenChange={setTtnDialogOpen}
          teamId={teamId}
          orderId={record.id}
          delivery={ttnDelivery}
          partyType={record.partyType}
          partyId={record.customerId}
          defaultEdrpou={record.customerTaxId ?? ""}
          orderTotal={record.total}
          existingTtn={ttnExisting}
          onSaved={(ttn) =>
            setRecord((prev) =>
              prev
                ? {
                    ...prev,
                    npTtnNumber: ttn?.number ?? null,
                    npTtnRef: ttn?.ref ?? null,
                    npTtnCost: ttn?.cost ?? null,
                    npTtnEstimatedDelivery: ttn?.estimatedDelivery ?? null,
                    npTtnCreatedAt: ttn ? new Date().toISOString() : null,
                  }
                : prev
            )
          }
        />
      ) : null}
    </PageCanvas>
  );
}
