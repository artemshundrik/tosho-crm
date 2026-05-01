import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { getSignedAttachmentUrl } from "@/lib/attachmentPreview";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  Info,
  Mail,
  Palette,
  Phone,
  Send,
  Wallet,
} from "lucide-react";

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

const renderDocBadge = (label: string, ready: boolean) => (
  <Badge
    variant="outline"
    className={cn(
      "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
      ready ? "tone-success" : "border-border/70 bg-muted/20 text-muted-foreground"
    )}
  >
    {label}
  </Badge>
);

const InfoHint = ({ title, children }: { title: string; children: ReactNode }) => (
  <span className="group relative inline-flex">
    <button
      type="button"
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      aria-label={title}
    >
      <Info className="h-3.5 w-3.5" />
    </button>
    <span className="pointer-events-none absolute right-0 top-8 z-50 hidden w-[320px] rounded-lg border border-border/60 bg-popover/95 p-3 text-left text-xs leading-5 text-popover-foreground shadow-[var(--shadow-overlay)] backdrop-blur-xl group-hover:block group-focus-within:block">
      <span className="mb-1 block font-semibold text-foreground">{title}</span>
      {children}
    </span>
  </span>
);

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
} => {
  if (kind === "contract") {
    const checks = getContractRequirementChecks(record);
    const missing = getMissingRequirementLabels(checks);
    const ready = missing.length === 0;
    return {
      title: "Договір",
      ready,
      created: Boolean(record.contractCreatedAt),
      statusLabel: record.contractCreatedAt ? "Створено" : ready ? "Можна створити" : "Немає даних",
      statusReady: ready,
      blockedLabel: missing.length > 0 ? `Не вистачає: ${missing.join(", ")}` : null,
      checks,
      hint:
        "Договір використовує реквізити з картки Замовника і контактні дані з замовлення. Якщо тут є жовті пункти, їх треба виправити в картці Замовника або в замовленні.",
    };
  }

  if (kind === "specification") {
    const checks = getSpecificationRequirementChecks(record);
    const missing = getMissingRequirementLabels(checks);
    const ready = missing.length === 0;
    return {
      title: "СП",
      ready,
      created: Boolean(record.specificationCreatedAt),
      statusLabel: record.specificationCreatedAt ? "Створено" : ready ? "Можна створити" : "Потрібні умови",
      statusReady: ready,
      blockedLabel: missing.length > 0 ? `Не виконано: ${missing.join(", ")}` : null,
      checks,
      hint:
        "СП має окремі правила: тільки безготівка, тільки після створення договору, і з умовами оплати та Incoterms із замовлення.",
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
  Boolean(record.contractCreatedAt);

const getSpecificationBlocker = (record: DerivedOrderRecord) => {
  if (record.items.length === 0) return "Немає позицій для СП.";
  if (!isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)) {
    return "СП створюється тільки для безготівкового розрахунку.";
  }
  if (!record.contractCreatedAt) {
    return "Перед СП потрібно створити Договір.";
  }
  return null;
};

const normalizeDocumentDocs = (record: DerivedOrderRecord) => ({
  ...record.docs,
  specification: canCreateSpecification(record),
});

const buildOrderDocumentHtml = (record: DerivedOrderRecord, kind: OrderDocumentKind) => {
  const title = documentTitleByKind[kind];
  const contractDate = formatContractDateParts(record.updatedAt ?? record.createdAt);
  const contractEndDate = formatContractEndDate(record.updatedAt ?? record.createdAt);
  const customerTitle = record.legalEntityLabel || record.customerName;
  const customerSignatoryName = record.customerSignatoryName?.trim() || "Не вказано";
  const customerSignatoryRole = record.customerSignatoryPosition?.trim() || "уповноваженої особи";
  const customerSignatoryAuthority = record.customerSignatoryAuthority?.trim() || "Не вказано";
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
  const specificationNumber = record.quoteNumber;
  const specificationDate = formatSlashDate(record.updatedAt ?? record.createdAt);
  const totalWithVat = Number(record.total || 0);
  const totalWithoutVat = totalWithVat / (1 + SPEC_VAT_RATE / 100);
  const paymentTerms = getPaymentTermsParts(record.paymentTerms, totalWithVat);
  const deliveryTerms = formatIncotermsLabel(record);
  const specificationRows = record.items
    .map((item, index) => {
      const unitPriceWithVat = Number(item.unitPrice || 0);
      const unitPriceWithoutVat = unitPriceWithVat / (1 + SPEC_VAT_RATE / 100);
      const itemDetails = [
        item.description?.trim() ? `<div style="margin-top:4px;font-size:12px;color:#374151;">${escapeHtml(item.description)}</div>` : "",
        item.methodsSummary?.trim() ? `<div style="margin-top:4px;font-size:12px;color:#4b5563;">Нанесення: ${escapeHtml(item.methodsSummary)}</div>` : "",
        item.catalogSourceUrl?.trim() ? `<div style="margin-top:4px;font-size:11px;color:#6b7280;">${escapeHtml(item.catalogSourceUrl)}</div>` : "",
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
          <div class="toolbar-title">Договір ${escapeHtml(record.quoteNumber)}</div>
          <div class="toolbar-actions">
            <button class="toolbar-button" type="button" onclick="window.close()">Закрити</button>
            <button class="toolbar-button primary" type="button" onclick="window.print()">Зберегти PDF / Друк</button>
          </div>
        </div>
        <div class="page">
        <h1>ДОГОВІР № ${escapeHtml(record.quoteNumber)}</h1>
        <h2>на виготовлення та поставку рекламно-сувенірної продукції</h2>
        <div class="topline">
          <div>${escapeHtml(contractDate.city)}</div>
          <div>«${escapeHtml(contractDate.day)}» ${escapeHtml(contractDate.monthLabel)} ${escapeHtml(contractDate.year)} р.</div>
        </div>

        <p>${escapeHtml(CONTRACT_EXECUTOR.companyName)} (надалі – Виконавець), в особі ${escapeHtml(CONTRACT_EXECUTOR.signatoryPosition)} ${escapeHtml(CONTRACT_EXECUTOR.signatory)}, яка діє на підставі ${escapeHtml(CONTRACT_EXECUTOR.authority)}, з однієї сторони, та ${escapeHtml(customerTitle)} (надалі – Замовник), в особі ${escapeHtml(customerSignatoryRole)} ${escapeHtml(customerSignatoryName)}, яка діє на підставі ${escapeHtml(customerSignatoryAuthority)}, з іншої сторони (надалі – Сторони), уклали цей Договір про наступне:</p>

        <h3>1. Предмет договору</h3>
        <p>Виконавець зобов’язується виготовити та поставити Замовнику рекламно-сувенірну продукцію (надалі – Продукція) в асортименті, кількості та по ціні згідно Специфікаціям, що є невід’ємними частинами цього Договору, а Замовник зобов’язується прийняти Продукцію та оплатити її в порядку та на умовах, визначених Договором.</p>
        <p>На кожне окреме замовлення (партію) Продукції оформлюється Специфікація, в якій зазначається:</p>
        <ul>
          <li>кількість Продукції;</li>
          <li>назва Продукції;</li>
          <li>технічні параметри продукції згідно затверджених макетів та візуалів;</li>
          <li>умови та терміни оплати конкретної партії Продукції;</li>
          <li>строк виготовлення та поставки Продукції Замовнику.</li>
        </ul>

        <h3>2. Порядок виконання, здачі та приймання виконаних робіт</h3>
        <p>2.1. Виготовлення Продукції здійснюється партіями відповідно до наданих Замовником і затверджених ним макетів Продукції, підписаних уповноваженою особою Замовника.</p>
        <p>2.2. Поставка здійснюється на склад Замовника. Термін поставки Продукції становить не більше 50 (п’ятдесяти) робочих днів з моменту погодження Сторонами та затвердження Замовником оригінал-макету і здійснення передоплати, залежно від події, що наступить пізніше. Якщо на конкретну партію Продукції встановлені інші умови поставки, то вони зазначаються у Специфікації на відповідну партію замовлення.</p>
        <p>2.3. Датою поставки вважається дата фактичної передачі Продукції Замовнику, що зазначається в накладних на виготовлену Продукцію.</p>
        <p>2.4. Приймання Продукції за кількістю та якістю здійснюється сторонами в порядку, що визначається чинним законодавством України.</p>

        <h3>3. Вартість робіт по договору та порядок розрахунків</h3>
        <p>3.1. Перелік робіт та цін визначаються у Специфікаціях до цього Договору.</p>
        <p>3.2. Оплата за цим Договором здійснюється шляхом перерахування на розрахунковий рахунок Виконавця грошових коштів в національній валюті України, відповідно до умов кожної Специфікації.</p>
        <p>3.3. Зміна вартості робіт по виготовленню Продукції та умов оплати можлива лише за згодою Сторін, що оформляється шляхом підписання Сторонами Додаткової угоди до Специфікації.</p>

        <h3>4. Права та обов’язки сторін</h3>
        <p>4.1. Замовник зобов’язується своєчасно здійснювати розрахунки з Виконавцем за Договором.</p>
        <p>4.2. Замовник має право контролювати якість виконуваних робіт на їх відповідність погодженим Сторонами Специфікаціям.</p>
        <p>4.3. Виконавець зобов’язується виконувати роботи по виготовленню Продукції згідно Специфікаціям та з додержанням вимог діючих державних стандартів і технічних умов.</p>
        <p>4.4. Виконавець має право вимагати оплати Замовником вартості робіт в порядку та строки, визначені цим Договором.</p>

        <h3>5. Відповідальність сторін</h3>
        <p>5.1. У випадку порушення умов даного Договору Сторони несуть відповідальність відповідно до чинного законодавства України та даного Договору.</p>
        <p>5.2. За несвоєчасну поставку виготовленої Продукції Виконавець сплачує Замовнику пеню в розмірі подвійної облікової ставки НБУ від вартості несвоєчасно поставленої Продукції за кожен день прострочення.</p>
        <p>5.3. У випадку порушення Замовником строків оплати, передбачених у відповідних Специфікаціях, Замовник сплачує Виконавцю штраф в розмірі 5% від суми заборгованості.</p>

        <h3>6. Форс-мажор</h3>
        <p>6.1. Сторони звільняються від відповідальності за повне або часткове невиконання своїх зобов’язань по даному Договору, якщо воно викликано обставинами непереборної сили відповідно до чинного законодавства України.</p>

        <h3>7. Врегулювання суперечок</h3>
        <p>7.1. Всі суперечки між сторонами з приводу виконання даного договору вирішуються шляхом переговорів. У випадку недосягнення згоди спірне питання підлягає вирішенню в Господарському суді згідно чинного законодавства України.</p>

        <h3>8. Інші умови</h3>
        <p>8.1. Цей Договір складений українською мовою у двох автентичних примірниках, які мають однакову юридичну силу, по одному для кожної із Сторін.</p>
        <p>8.2. Цей Договір вважається укладеним і набирає чинності з моменту його підписання Сторонами.</p>
        <p>8.3. Додатки до цього Договору є його невід'ємними частинами і мають юридичну силу у разі, якщо вони викладені у письмовій формі та підписані Сторонами.</p>
        <p>8.4. Термін дії Договору до ${escapeHtml(contractEndDate)} року та/або до повного виконання Сторонами своїх зобов’язань.</p>

        <h3>9. Адреси і реквізити сторін</h3>
        <div class="party-grid">
          <div class="party-card">
            <div class="party-title">ВИКОНАВЕЦЬ</div>
            <p>${escapeHtml(CONTRACT_EXECUTOR.companyName)}</p>
            <p>${escapeHtml(CONTRACT_EXECUTOR.address)}</p>
            <p>Код ЄДРПОУ: ${escapeHtml(CONTRACT_EXECUTOR.taxId)}</p>
            <p>ІПН: ${escapeHtml(CONTRACT_EXECUTOR.vatId)}</p>
            <p>IBAN: ${escapeHtml(CONTRACT_EXECUTOR.iban)}</p>
            <p>${escapeHtml(CONTRACT_EXECUTOR.bank)}</p>
            <p>${escapeHtml(CONTRACT_EXECUTOR.taxStatus)}</p>
            <p class="signature">${escapeHtml(CONTRACT_EXECUTOR.signatoryPosition)} ____________________ ${escapeHtml(CONTRACT_EXECUTOR.signatureLabel)}</p>
          </div>
          <div class="party-card">
            <div class="party-title">ЗАМОВНИК</div>
            <p>${escapeHtml(customerTitle)}</p>
            <p>${escapeHtml(record.legalEntityLabel || "Юридична назва не вказана")}</p>
            <p>Код / ІПН: ${escapeHtml(customerTaxId)}</p>
            <p>IBAN / банк: ${escapeHtml(customerBankDetails)}</p>
            <p>Адреса: ${escapeHtml(record.customerLegalAddress || "Не вказано")}</p>
            <p>Email: ${escapeHtml(record.contactEmail || "Не вказано")}</p>
            <p>Телефон: ${escapeHtml(record.contactPhone || "Не вказано")}</p>
            <p>Підписант: ${escapeHtml(record.signatoryLabel || "Не вказано")}</p>
            <p>Підстава: ${escapeHtml(customerSignatoryAuthority)}</p>
            <p>Умови оплати: ${escapeHtml([record.paymentRail, record.paymentTerms].filter(Boolean).join(" · ") || "Не вказано")}</p>
            <p class="signature">${escapeHtml(customerSignatoryRole)} ____________________ ${escapeHtml(customerSignatoryName)}</p>
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
          ul { margin: 6px 0 10px 18px; padding: 0; }
          li { margin: 0 0 6px; font-size: 14px; }
          @media print {
            body { background: #ffffff; }
            .toolbar { display: none; }
            .page { max-width: none; margin: 0; box-shadow: none; padding: 0; }
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
          <div class="center small">№${escapeHtml(record.quoteNumber)} від ${escapeHtml(specificationDate)}</div>

          <div class="topline">
            <div>м. Київ</div>
            <div>${escapeHtml(specificationDate)} р.</div>
          </div>

          <p>${escapeHtml(CONTRACT_EXECUTOR.companyName)} (надалі Виконавець), в особі ${escapeHtml(CONTRACT_EXECUTOR.signatoryPosition)} ${escapeHtml(CONTRACT_EXECUTOR.signatory)}, яка діє на підставі ${escapeHtml(CONTRACT_EXECUTOR.authority)}, з однієї сторони, та ${escapeHtml(customerTitle)} (надалі – Замовник), в особі ${escapeHtml(customerSignatoryRole)} ${escapeHtml(customerSignatoryName)}, що діє на підставі ${escapeHtml(customerSignatoryAuthority)}, з іншої сторони, разом - Сторони, підписали цей Додаток до Договору про наступне:</p>

          <div class="section-title center">СПЕЦИФІКАЦІЯ НА ВИГОТОВЛЕННЯ</div>

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

          <div class="section-title">ВАРТІСТЬ РОБІТ ТА СТРОКИ ВИГОТОВЛЕННЯ ПРОДУКЦІЇ</div>
          <ul>
            <li>Загальна вартість робіт з виготовлення продукції складає ${escapeHtml(formatPlainMoney(totalWithVat))} грн, враховуючи ПДВ ${SPEC_VAT_RATE}%.</li>
            <li>Вартість робіт без ПДВ складає ${escapeHtml(formatPlainMoney(totalWithoutVat))} грн.</li>
            <li>Термін виготовлення продукції складає ${SPEC_DEFAULT_WORK_DAYS} робочих днів з дати затвердження оригінал-макету до друку.</li>
          </ul>

          <div class="section-title">ПОРЯДОК ОПЛАТИ ВАРТОСТІ ПРОДУКЦІЇ</div>
          <ul>
            <li>Оплата продукції здійснюється Замовником на умовах ${escapeHtml(paymentTerms.label)}: ${paymentTerms.advance}% (${escapeHtml(formatPlainMoney(paymentTerms.advanceAmount))} грн з урахуванням ПДВ) перед запуском та ${paymentTerms.balance}% (${escapeHtml(formatPlainMoney(paymentTerms.balanceAmount))} грн з урахуванням ПДВ) після готовності продукції, протягом 3-х робочих днів.</li>
            <li>Спосіб оплати: ${escapeHtml(record.paymentRail || "Не вказано")}.</li>
            <li>Доставка продукції здійснюється на умовах ${escapeHtml(deliveryTerms)}.</li>
          </ul>

          <div class="section-title">АДРЕСИ І РЕКВІЗИТИ СТОРІН</div>
          <div class="signature-grid">
            <div>
              <div class="party-title">ВИКОНАВЕЦЬ:</div>
              <p>${escapeHtml(CONTRACT_EXECUTOR.shortName)}</p>
              <p>Місцезнаходження: ${escapeHtml(CONTRACT_EXECUTOR.address)}</p>
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
              <p>Код ЄДРПОУ / ІПН: ${escapeHtml(customerTaxId)}</p>
              <p>IBAN / банк: ${escapeHtml(customerBankDetails)}</p>
              <p>Тел.: ${escapeHtml(record.contactPhone || "Не вказано")}</p>
              <p>Email: ${escapeHtml(record.contactEmail || "Не вказано")}</p>
              <p class="signature-line">${escapeHtml(customerSignatoryRole)}</p>
              <p>______________________ ${escapeHtml(customerSignatoryName)}</p>
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
  const { teamId, loading: authLoading, session, userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<DerivedOrderRecord | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [documentSettingsSaving, setDocumentSettingsSaving] = useState(false);
  const [openingAssetId, setOpeningAssetId] = useState<string | null>(null);

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

  const openDocumentPrint = async (kind: OrderDocumentKind) => {
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
    const html = buildOrderDocumentHtml(record, kind);
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

    if (record.source === "stored" && teamId && (kind === "contract" || kind === "specification")) {
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
        `Документи можна сформувати зі сторінки замовлення: Договір, Рахунок, СП, Техкарта.`,
      ].join("\n")
    );
    window.location.href = `mailto:${encodeURIComponent(record.contactEmail || "")}?subject=${subject}&body=${body}`;
  };

  const openTelegramDraft = () => {
    if (!record) return;
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

  const documentActions = (["contract", "invoice", "specification", "techCard"] as OrderDocumentKind[]).map((kind) => ({
    kind,
    ...getDocumentActionState(record, kind),
  }));
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
            <EntityAvatar
              src={record.customerLogoUrl}
              name={record.customerName}
              fallback={getInitials(record.customerName)}
              size={52}
            />
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
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{record.customerName}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Оновлено {formatOrderDate(record.updatedAt)} • сума {formatOrderMoney(record.total, record.currency)}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:min-w-[440px]">
          <Card className="border-border/60 p-4">
            <div className="text-xs text-muted-foreground">Статус замовлення</div>
            {record.source === "stored" ? (
              <Select
                value={record.orderStatus}
                onValueChange={(value) => void handleStatusChange("orderStatus", value)}
                disabled={statusSaving}
              >
                <SelectTrigger className="mt-2 h-9">
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
              <div className="mt-1 text-sm font-semibold text-foreground">
                {record.readinessColumn === "ready" ? "Нове" : "Підготовка до створення"}
              </div>
            )}
          </Card>
          <Card className="border-border/60 p-4">
            <div className="text-xs text-muted-foreground">Статус оплати</div>
            {record.source === "stored" ? (
              <Select
                value={record.paymentStatus}
                onValueChange={(value) => void handleStatusChange("paymentStatus", value)}
                disabled={statusSaving}
              >
                <SelectTrigger className="mt-2 h-9">
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
              <div className="mt-1 text-sm font-semibold text-foreground">Очікує оплату</div>
            )}
          </Card>
          <Card className="border-border/60 p-4">
            <div className="text-xs text-muted-foreground">Статус доставки</div>
            {record.source === "stored" ? (
              <Select
                value={record.deliveryStatus}
                onValueChange={(value) => void handleStatusChange("deliveryStatus", value)}
                disabled={statusSaving}
              >
                <SelectTrigger className="mt-2 h-9">
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
              <div className="mt-1 text-sm font-semibold text-foreground">Не відвантажено</div>
            )}
          </Card>
          <Card className="border-border/60 p-4">
            <div className="text-xs text-muted-foreground">Документи</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {renderDocBadge("Договір", record.docs.contract)}
              {renderDocBadge("Рахунок", record.docs.invoice)}
              {renderDocBadge("СП", record.docs.specification)}
            </div>
          </Card>
        </div>
      </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            Контрагент
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {record.legalEntityLabel || "Потрібно заповнити реквізити"}
          </div>
          <div className="mt-2 space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />
              <span>{record.contactEmail || "Email не заповнений"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" />
              <span>{record.contactPhone || "Телефон не заповнений"}</span>
            </div>
          </div>
        </Card>

        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Оплата
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">{record.paymentRail}</div>
          <div className="mt-1 text-sm text-muted-foreground">{record.paymentTerms}</div>
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
        </Card>

        <Card className="border-border/60 p-4">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Менеджер</div>
          <div className="mt-2 text-sm font-semibold text-foreground">{record.managerLabel}</div>
          <div className="mt-2 text-sm text-muted-foreground">{record.signatoryLabel || "Підписанта не вказано"}</div>
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
            <Label>Тип оплати</Label>
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
            <Label>Умови оплати</Label>
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
            <Label>Incoterms 2020</Label>
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
                    <SelectItem key={item.id} value={item.id}>
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
            <Label>Місце поставки</Label>
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
              {documentActions.filter((item) => item.ready).length} / {documentActions.length}
            </Badge>
          </div>
          <div className="mt-4 space-y-2.5">
            {documentActions.map((document) => (
              <div
                key={document.kind}
                className={cn(
                  "rounded-lg border px-3 py-3",
                  document.ready ? "border-border/60 bg-muted/[0.04]" : "tone-warning-subtle"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{document.title}</span>
                    <InfoHint title={`${document.title}: що перевіряється`}>
                      <p className="mb-2 text-muted-foreground">{document.hint}</p>
                      <RequirementList checks={document.checks} />
                    </InfoHint>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void openDocumentPrint(document.kind)}
                      disabled={!document.ready}
                      title={document.blockedLabel ?? undefined}
                    >
                      PDF
                    </Button>
                    {renderDocBadge(document.statusLabel, document.statusReady)}
                  </div>
                </div>
                {document.blockedLabel ? (
                  <div className="mt-2 text-xs leading-5 text-muted-foreground">{document.blockedLabel}</div>
                ) : null}
              </div>
            ))}
          </div>

          {documentActions.some((item) => item.kind === "contract" && item.blockedLabel) && record.customerId ? (
            <div className="tone-warning-subtle mt-4 rounded-lg border p-3 text-sm">
              <div className="tone-text-warning font-medium">Договір блокується реквізитами Замовника.</div>
              <div className="mt-1 text-muted-foreground">
                Найчастіше треба додати підставу підпису, IBAN або юридичну адресу в картці Замовника.
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => navigate(`/orders/customers?customerId=${record.customerId}`)}
              >
                Відкрити картку Замовника
              </Button>
            </div>
          ) : null}

          <div className="mt-4 border-t border-border/60 pt-4">
            <div className="mb-2 text-sm font-semibold text-foreground">Відправити замовнику</div>
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
                Чекліст створення замовлення
                <InfoHint title="Чому тут 6/6, але документи можуть бути заблоковані">
                  <p className="text-muted-foreground">
                    Цей чекліст відповідає тільки за перехід із прорахунку в замовлення: контрагент, контакти, позиції і дизайн.
                    Договір і СП мають додаткові юридичні умови, тому винесені в окремий блок “Документи”.
                  </p>
                </InfoHint>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Не плутати з готовністю Договору та СП.</div>
            </div>
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
              {doneSteps} / {record.readinessSteps.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {record.readinessSteps.map((step) => (
              <div
                key={step.label}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
                  step.done
                    ? "tone-success-subtle"
                    : "tone-warning-subtle"
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
    </PageCanvas>
  );
}
