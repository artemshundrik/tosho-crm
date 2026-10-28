import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { PageLoading } from "@/components/app/page-loading";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/picker-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HoverTip } from "@/components/ui/hover-tip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CustomerDialog, useCustomerEditor } from "@/components/customers";
import {
  ORDER_INCOTERMS_OPTIONS,
  ORDER_PAYMENT_METHOD_OPTIONS,
  ORDER_PAYMENT_TERMS_OPTIONS,
} from "@/features/orders/config";
import {
  executorCodesInline,
  executorPreamble,
  executorRequisiteLines,
  splitVat,
} from "@/features/orders/orderExecutor";
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
import {
  type BalanceDaysKind,
  formatBalanceDaysTerm,
  getMinimumPrepaymentError,
  isCashLikePaymentMethod,
  PAYMENT_METHOD_LABELS,
} from "@/features/orders/paymentRules";
import { BalanceDaysField } from "@/components/orders/BalanceDaysField";
import {
  canCreateSpecification,
  getDocumentActionState,
  getOrderDocumentKinds,
  getSpecificationBlocker,
  type OrderDocumentKind,
} from "@/features/orders/orderDocumentRequirements";
// Панель ревізій договору тягне rich-text-редактор (tiptap/prosemirror,
// ~900 KB у чанку) — lazy, щоб сторінка замовлення відкривалась без нього;
// стек їде тільки коли до панелі реально дійшов рендер.
const ContractRevisionsPanel = lazy(() =>
  import("@/components/contracts/ContractRevisionsPanel").then((m) => ({
    default: m.ContractRevisionsPanel,
  }))
);
import {
  buildDefaultContractSections,
  renderContractSectionsHtml,
  partiesSectionNumber,
  type ContractSection,
  type ContractRenderContext,
} from "@/features/contractRevisions/contractSections";
import { amountInWords } from "@/lib/amountInWords";
import { buildOrderActHtml } from "@/features/orders/orderActDocument";
import { useOrderLegalEntity } from "@/features/orders/order-details/useOrderLegalEntity";
import { getSignedAttachmentUrl } from "@/lib/attachmentPreview";
import { buildTelegramHref } from "@/lib/telegramContact";
import { declineToGenitive } from "@/lib/nameDeclension";
import { openDocumentWindow } from "@/features/orders/documentPrintWindow";
import { buildSpecificationHtml, customerIbanWithBank, toAuthorityGenitive } from "@/features/orders/specificationDocument";
import { loadSpecificationItemTexts, resolveVisualizationImageUrls } from "@/features/orders/specificationQueries";
import { SpecificationItemTextsField } from "@/features/orders/order-details/SpecificationItemTextsField";
import { SpecificationVisualizationField } from "@/features/orders/order-details/SpecificationVisualizationField";
import { SpecificationNumberField } from "@/features/orders/order-details/SpecificationNumberField";
import { parseSpecificationParamsInput } from "@/features/orders/order-details/specificationParamsInput";
import { formatContractDateParts, formatContractEndDate } from "@/features/orders/contractDateFormat";
import { itemDocumentName, withDocumentNames } from "@/features/orders/orderItemDocumentNames";
import { useSpecificationItemTexts } from "@/features/orders/order-details/useSpecificationItemTexts";
import { formatInvoicePartyName } from "@/features/orders/invoicePartyName";
import { toSignatureInitials } from "@/lib/signatureFormat";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { renderPrintDocument } from "@/lib/printDocument";
import {
  ArrowLeft,
  ChevronDown,
  Building2,
  Mail,
  MoreHorizontal,
  PackageCheck,
  Phone,
  Loader2,
  Send,
  Truck,
} from "@/components/icons/appIcons";
import {
  OrderDeliveryDialog,
  parseQuoteDeliveryDetails,
  type OrderDeliverySnapshot,
} from "@/components/orders/OrderDeliveryDialog";
import { NovaPoshtaTtnDialog } from "@/components/orders/NovaPoshtaTtnDialog";
import { trackNpDocument } from "@/lib/novaPoshtaApi";
import { toast } from "sonner";
import { RecordRailResizer } from "@/components/app/RecordRailResizer";
import { TabBar, TabBarItem } from "@/components/ui/tab-bar";
import { QuotePartyCard } from "@/features/quotes/quote-details/QuotePartyCard";
import { TaskThreadRail } from "@/features/taskChat/TaskThreadRail";
import { ThreadDock, ThreadDockButton, ThreadDockProvider, type ThreadDockHandle } from "@/features/taskChat/ThreadDock";
import { THREAD_EVENT_ACTIONS } from "@/features/taskChat/threadEvents";
import { useRecordPageHeight } from "@/hooks/useRecordPageHeight";
import { threadKeyForOrder, threadKeyForQuote } from "@/lib/taskThread";
import {
  buildLaunchPath,
  formatPaymentTermsChip,
  getShipmentBlocker,
  isShipmentStatus,
  LAUNCHED_ORDER_STATUSES,
} from "@/features/orders/orderLaunchPath";
import { notifyOrderReadyUnpaid } from "@/lib/workflowNotifications";
import { getDocumentApprovalState, getSendToCustomerBlocker, isDocumentCleared } from "@/features/orders/orderApprovals";
import { OrderApprovalDeskCard } from "@/features/orders/order-details/OrderApprovalDeskCard";
import { useOrderApprovalFlow } from "@/features/orders/order-details/useOrderApprovalFlow";
import { IncotermsHint } from "@/features/orders/order-details/IncotermsHint";
import { OrderDeliveryCard } from "@/features/orders/order-details/OrderDeliveryCard";
import { OrderDocumentsCard } from "@/features/orders/order-details/OrderDocumentsCard";
import { OrderClosingDocumentDeskCard } from "@/features/orders/order-details/OrderClosingDocumentDeskCard";
import { OrderInvoiceDeskCard } from "@/features/orders/order-details/OrderInvoiceDeskCard";
import { useOrderInvoiceFlow } from "@/features/orders/order-details/useOrderInvoiceFlow";
import { getOrderInvoiceState } from "@/features/orders/orderInvoice";
import { canApproveOrderLaunch, canIssueOrderInvoice } from "@/lib/permissions";
import { OrderItemsTable } from "@/features/orders/order-details/OrderItemsTable";
import { OrderLaunchPathCard } from "@/features/orders/order-details/OrderLaunchPathCard";
import { OrderMaterialsTab, countOrderMaterials } from "@/features/orders/order-details/OrderMaterialsTab";
import { OrderPaymentCard } from "@/features/orders/order-details/OrderPaymentCard";
import { useOrderPaymentPanel } from "@/features/orders/order-details/useOrderPaymentPanel";
import { useOrderEconomicsPanel } from "@/features/orders/order-details/useOrderEconomicsPanel";
import { partyInitials } from "@/features/orders/partyInitials";
import { OrderStatusControl } from "@/features/orders/order-details/OrderStatusControl";
import { orderSourceQuoteExtra } from "@/features/orders/order-details/orderSourceQuoteExtra";

type OrderPageTab = "launch" | "items" | "materials" | "delivery" | "economics" | "details";

const getFileExtension = (name?: string | null) => {
  const value = (name ?? "").trim();
  if (!value.includes(".")) return "";
  return value.split(".").pop()?.trim().toUpperCase() ?? "";
};

const isPreviewableAsset = (name?: string | null) => {
  const extension = getFileExtension(name);
  return ["PNG", "JPG", "JPEG", "WEBP", "GIF", "BMP", "PDF", "TIF", "TIFF"].includes(extension);
};

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
  act: "Акт",
  techCard: "Технологічний додаток",
};

const formatPlainMoney = (value: number) =>
  new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

/** Строк виробництва, коли його ще не задавали в договорі. Збігається з дефолтом поля в модалі. */
const DEFAULT_PRODUCTION_WORK_DAYS = 50;
const DEFAULT_INCOTERMS = "FCA";

// Живе поруч із полем Incoterms у модалі СП — саме там менеджер обирає базис поставки.


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
  const code = record.incotermsCode?.trim() || DEFAULT_INCOTERMS;
  const place = record.incotermsPlace?.trim();
  return `${code} (Incoterms 2020)${place ? `, ${place}` : ""}`;
};

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
    productionWorkingDays: record.contractProductionDays ?? DEFAULT_PRODUCTION_WORK_DAYS,
    contractEndDate: formatContractEndDate(record.contractCreatedAt ?? null),
    hasPaymentBreakdown: hasBreakdown,
    paymentAdvancePct: advance ?? 0,
    paymentBalancePct: balance ?? 0,
    balanceTimingPhrase,
    balanceAfterShipmentTermSuffix:
      timing === "after_shipment"
        ? `, протягом ${formatBalanceDaysTerm(balanceDays, record.balanceDaysKind)} з дати відвантаження`
        : "",
    contractAutoProlongation: false,
    // totalWithVat is intentionally unused in the default template body, but kept here for future tokens.
    ...{ totalWithVat },
  } as ContractRenderContext;
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
  /** Робочі чи календарні дні на доплату. */
  balanceDaysKind?: BalanceDaysKind;
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
  // Якщо їх не задано — номер, виданий CRM (ДД/ММ/РРРР-NNN); у старих договорів без нього — номер замовлення.
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
  // Банк після IBAN — і в договорі, і в СП (REQ-322#p25).
  const customerBankDetails = customerIbanWithBank(record);
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
  // Строк виробництва — одне число на всі документи замовлення: спершу те, що прийшло
  // з модала Договору, інакше збережене на замовленні, інакше дефолт. Специфікація бере
  // його звідси ж, щоб не розходитися з підписаним договором.
  const productionWorkingDays =
    typeof options.productionWorkingDays === "number" && Number.isFinite(options.productionWorkingDays) && options.productionWorkingDays > 0
      ? Math.round(options.productionWorkingDays)
      : typeof record.contractProductionDays === "number" && record.contractProductionDays > 0
        ? Math.round(record.contractProductionDays)
        : DEFAULT_PRODUCTION_WORK_DAYS;
  const contractAutoProlongation = options.contractAutoProlongation === true;
  // Від кого документ: ТОВ (з ПДВ) чи ФОП (без ПДВ) — REQ-322#p1–p2.
  const executor = record.executor;
  const vatPayer = executor.vatPayer;
  const executorPreambleText = executorPreamble(executor);
  const executorLinesHtml = (addressLabel?: string) =>
    executorRequisiteLines(executor, { addressLabel })
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("");
  const totalWithVat = Number(record.total || 0);
  const totalWithoutVat = splitVat(totalWithVat, vatPayer).net;
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
  const effectiveBalanceDaysTerm = formatBalanceDaysTerm(
    effectiveBalanceDays,
    options.balanceDaysKind ?? record.balanceDaysKind
  );
  const balanceTimingPhrase =
    effectiveBalanceTiming === "after_shipment"
      ? "після відвантаження продукції (отримання Замовником)"
      : "після готовності продукції, до відвантаження";
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
        ? `, протягом ${effectiveBalanceDaysTerm} з дати відвантаження`
        : "",
    contractAutoProlongation,
  };
  const contractSectionsToRender =
    options.contractSections ?? buildDefaultContractSections(contractRenderContext);
  const contractBodyHtml = renderContractSectionsHtml(contractSectionsToRender);
  const partiesSectionIndex = partiesSectionNumber(contractSectionsToRender);

  if (kind === "contract") {
    // Хром (toolbar/page/print-media) — спільний, див. lib/printDocument.
    return renderPrintDocument({
      title: `${title} ${record.quoteNumber}`,
      toolbarTitle: `Договір ${effectiveContractNumber}`,
      styles: `
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
      `,
      bodyHtml: `
        <h1>ДОГОВІР № ${escapeHtml(effectiveContractNumber)}</h1>
        <h2>на виготовлення та поставку рекламно-сувенірної продукції</h2>
        <div class="topline">
          <div>${escapeHtml(contractDate.city)}</div>
          <div>«${escapeHtml(contractDate.day)}» ${escapeHtml(contractDate.monthLabel)} ${escapeHtml(contractDate.year)} р.</div>
        </div>

        <p>${escapeHtml(executorPreambleText)}, з однієї сторони, та ${escapeHtml(customerTitle)} (надалі – Замовник), в особі ${escapeHtml(customerSignatoryRoleBody)} ${escapeHtml(customerSignatoryNameBody)}, яка діє на підставі ${escapeHtml(customerSignatoryAuthority)}, з іншої сторони (надалі – Сторони), уклали цей Договір про наступне:</p>

        ${contractBodyHtml}

        <h3>${partiesSectionIndex}. Адреси і реквізити сторін</h3>
        <div class="party-grid">
          <div class="party-card">
            <div class="party-title">ВИКОНАВЕЦЬ</div>
            ${executorLinesHtml()}
            <p class="signature">${escapeHtml(executor.signatoryPositionDisplay)} ____________________ ${escapeHtml(executor.signatureLabel)}</p>
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
      `,
    });
  }

  if (kind === "invoice") {
    // Номер і дату вносить бухгалтер з BAS (REQ-322#p10). Без номера це чернетка,
    // яку бачить лише бухгалтерія: «№ ___», і дата теж порожня — її задає бухгалтер.
    const invoiceNumber = record.invoiceNumber?.trim() || "___";
    const invoiceDateSource = record.invoiceDate ?? record.invoiceCreatedAt;
    const invoiceDate = invoiceDateSource
      ? formatContractDateParts(invoiceDateSource)
      : { day: "___", monthLabel: "__________", year: "20__" };
    const currencyShort =
      record.currency === "USD" ? "дол. США" : record.currency === "EUR" ? "євро" : "грн.";
    const wordsCurrency = record.currency === "USD" || record.currency === "EUR" ? record.currency : "UAH";
    const vatAmount = totalWithVat - totalWithoutVat;
    const contractDateSource = record.contractDate ?? record.contractCreatedAt;
    const contractDateParts = contractDateSource ? formatContractDateParts(contractDateSource) : null;
    const contractReference = record.contractNumber
      ? `№ ${record.contractNumber}${contractDateParts ? ` від ${contractDateParts.day} ${contractDateParts.monthLabel} ${contractDateParts.year} р.` : ""}`
      : null;
    // Сторони — як друкує BAS: повна форма великими, прямі лапки (зразок № 433).
    const supplierName = formatInvoicePartyName(executor.companyName);

    const invoiceRows = record.items
      .map((item, index) => {
        // Ціни в замовленні зберігаються З ПДВ — у рахунку колонки без ПДВ,
        // тож ділимо, як це вже робить специфікація.
        const unitPriceWithoutVat = splitVat(Number(item.unitPrice || 0), vatPayer).net;
        const lineWithoutVat = unitPriceWithoutVat * Number(item.qty || 0);
        return `
        <tr>
          <td class="mid">${index + 1}</td>
          <td>${escapeHtml(itemDocumentName(item))}</td>
          <td class="num">${escapeHtml(item.qty.toLocaleString("uk-UA"))}</td>
          <td class="mid">${escapeHtml(item.unit)}</td>
          <td class="num">${escapeHtml(formatPlainMoney(unitPriceWithoutVat))}</td>
          <td class="num">${escapeHtml(formatPlainMoney(lineWithoutVat))}</td>
        </tr>`;
      })
      .join("");

    return renderPrintDocument({
      title: `${title} ${invoiceNumber}`,
      toolbarTitle: `Рахунок ${invoiceNumber}`,
      styles: `
          .notice { font-size: 11px; line-height: 1.5; text-align: center; margin: 0 0 22px; }
          .sample-title { text-align: center; font-size: 13px; margin: 0 0 8px; }
          .pay-box { width: 100%; border-collapse: collapse; margin-bottom: 26px; }
          .pay-box td { border: 1px solid #111827; padding: 5px 8px; font-size: 12px; vertical-align: top; }
          .pay-box .label { width: 150px; color: #374151; }
          h1 { font-size: 19px; margin: 0 0 18px; padding-bottom: 6px; border-bottom: 2px solid #111827; font-weight: 700; }
          .req-row { display: flex; gap: 12px; font-size: 13px; margin-bottom: 4px; }
          .req-label { width: 120px; flex: 0 0 120px; }
          .req-value { flex: 1; }
          .req-value div { margin-bottom: 2px; }
          .items { width: 100%; border-collapse: collapse; margin: 22px 0 0; }
          .items th, .items td { border: 1px solid #111827; padding: 6px 8px; font-size: 12px; }
          .items th { background: #f3f4f6; font-weight: 700; text-align: center; }
          .items .num { text-align: right; white-space: nowrap; }
          .items .mid { text-align: center; }
          .totals { margin-top: 10px; display: flex; justify-content: flex-end; }
          .totals table { border-collapse: collapse; font-size: 13px; }
          .totals td { padding: 3px 8px; }
          .totals .cap { text-align: right; font-weight: 700; }
          .totals .val { text-align: right; white-space: nowrap; min-width: 130px; }
          .totals .grand td { font-size: 14px; border-top: 1px solid #111827; padding-top: 6px; }
          .summary { margin-top: 18px; font-size: 13px; line-height: 1.6; }
          .summary b { font-weight: 700; }
          .sign { margin-top: 44px; display: flex; justify-content: flex-end; font-size: 13px; }
          .sign .line { border-bottom: 1px solid #111827; width: 220px; margin-left: 10px; }
      `,
      bodyHtml: `
        <div class="notice">
          Увага! Оплата цього рахунку означає погодження з умовами поставки товарів. Повідомлення про оплату
          є обов'язковим, в іншому випадку не гарантується наявність товарів на складі. Товар відпускається за фактом
          надходження коштів на п/р Постачальника, самовивозом, за наявності довіреності та паспорта.
        </div>

        <div class="sample-title">Зразок заповнення платіжного доручення</div>
        <table class="pay-box">
          <tr>
            <td class="label">Отримувач</td>
            <td colspan="3"><b>${escapeHtml(supplierName)}</b></td>
          </tr>
          <tr>
            <td class="label">Код</td>
            <td colspan="3">${escapeHtml(executor.taxId)}</td>
          </tr>
          <tr>
            <td class="label">Банк отримувача</td>
            <td>${escapeHtml(executor.bank)}</td>
            <td class="label">КРЕДИТ рах. №</td>
            <td>${escapeHtml(executor.iban)}</td>
          </tr>
        </table>

        <h1>Рахунок на оплату № ${escapeHtml(invoiceNumber)} від ${escapeHtml(invoiceDate.day)} ${escapeHtml(invoiceDate.monthLabel)} ${escapeHtml(invoiceDate.year)} р.</h1>

        <div class="req-row">
          <div class="req-label"><b>Постачальник:</b></div>
          <div class="req-value">
            <div><b>${escapeHtml(supplierName)}</b></div>
            <div>п/р ${escapeHtml(executor.iban)}${executor.bank ? ` у банку ${escapeHtml(executor.bank)}` : ""},</div>
            ${executor.address ? `<div>${escapeHtml(executor.address)},</div>` : ""}
            ${executor.phone ? `<div>тел.: ${escapeHtml(executor.phone)},</div>` : ""}
            <div>${escapeHtml(executorCodesInline(executor))}</div>
          </div>
        </div>
        <div class="req-row">
          <div class="req-label"><b>Покупець:</b></div>
          <div class="req-value"><div><b>${escapeHtml(formatInvoicePartyName(customerTitle))}</b></div></div>
        </div>
        ${
          contractReference
            ? `<div class="req-row">
                 <div class="req-label"><b>Договір:</b></div>
                 <div class="req-value"><div>${escapeHtml(contractReference)}</div></div>
               </div>`
            : ""
        }

        <table class="items">
          <thead>
            <tr>
              <th style="width:36px;">№</th>
              <th>Товари (роботи, послуги)</th>
              <th style="width:70px;">Кіл-сть</th>
              <th style="width:52px;">Од.</th>
              <th style="width:100px;">${vatPayer ? "Ціна без ПДВ" : "Ціна"}</th>
              <th style="width:110px;">${vatPayer ? "Сума без ПДВ" : "Сума"}</th>
            </tr>
          </thead>
          <tbody>${invoiceRows}</tbody>
        </table>

        <div class="totals">
          <table>
            <tr><td class="cap">Всього:</td><td class="val">${escapeHtml(formatPlainMoney(totalWithoutVat))}</td></tr>
            ${
              vatPayer
                ? `<tr><td class="cap">Сума ПДВ:</td><td class="val">${escapeHtml(formatPlainMoney(vatAmount))}</td></tr>
            <tr class="grand"><td class="cap">Всього із ПДВ:</td><td class="val">${escapeHtml(formatPlainMoney(totalWithVat))}</td></tr>`
                : `<tr class="grand"><td class="cap">ПДВ:</td><td class="val">без ПДВ</td></tr>`
            }
          </table>
        </div>

        <div class="summary">
          <div>Всього найменувань ${record.items.length}, на суму ${escapeHtml(formatPlainMoney(totalWithVat))} ${escapeHtml(currencyShort)}</div>
          <div><b>${escapeHtml(amountInWords(totalWithVat, wordsCurrency))}</b></div>
          <div>${vatPayer ? `У т.ч. ПДВ: ${escapeHtml(amountInWords(vatAmount, wordsCurrency))}` : "Без ПДВ"}</div>
        </div>

        <div class="sign">
          <div>Виписав(ла):</div>
          <div class="line"></div>
        </div>
      `,
    });
  }

  if (kind === "act") return buildOrderActHtml(record);

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

  // Дрібна уніфікація: раніше цей документ мав padding 32 і дефолтний
  // line-height — тепер бере хромові 36px/1.45, як договір і специфікація.
  return renderPrintDocument({
    title: `${title} ${record.quoteNumber}`,
    toolbarTitle: `${title} ${record.quoteNumber}`,
    styles: `
        h1 { font-size: 28px; margin: 0 0 8px; }
        .sub { color: #6b7280; margin-bottom: 24px; }
        .meta-block { margin: 0 0 20px; display: grid; gap: 6px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #cbd5e1; padding: 10px 12px; font-size: 14px; }
        th { background: #f8fafc; text-align: left; }
        .num { text-align: right; white-space: nowrap; }
        .total { margin-top: 16px; display: flex; justify-content: flex-end; font-size: 18px; font-weight: bold; }
    `,
    bodyHtml: `
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
    `,
  });
};

export default function OrdersProductionDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { teamId, session, userId, accessRole, jobRole } = useAuth();
  // Approver pool for contract revisions: owner OR job_role=seo (per project policy).
  const isCeo = accessRole === "owner" || (jobRole ?? "").toLowerCase() === "seo";
  const canIssueInvoice = canIssueOrderInvoice(accessRole, jobRole);
  const canApproveLaunch = canApproveOrderLaunch(jobRole);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<DerivedOrderRecord | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const approvalFlow = useOrderApprovalFlow({
    record,
    teamId,
    userId,
    loadFresh: async () =>
      teamId && id ? ((await loadDerivedOrders(teamId, userId)).find((entry) => entry.id === id) ?? null) : null,
    onRecordPatch: (patch) =>
      setRecord((current) => {
        if (!current) return current;
        const next = patch(current);
        return { ...next, docs: normalizeDocumentDocs(next) };
      }),
  });
  const applyDocumentNames = (names: Map<string, string | null>) =>
    setRecord((current) => (current ? withDocumentNames(current, names) : current));
  const invoiceFlow = useOrderInvoiceFlow({
    record,
    teamId,
    userId,
    onPatched: (patch) =>
      setRecord((current) => {
        if (!current) return current;
        const next = { ...current, ...patch };
        return { ...next, docs: normalizeDocumentDocs(next) };
      }),
  });
  const legalEntity = useOrderLegalEntity({
    record,
    teamId,
    onRecordPatch: (patch) =>
      setRecord((current) => {
        if (!current) return current;
        const next = patch(current);
        return { ...next, docs: normalizeDocumentDocs(next) };
      }),
  });
  const [activeTab, setActiveTab] = useState<OrderPageTab>("launch");
  const layoutRootRef = useRef<HTMLDivElement>(null);
  useRecordPageHeight(layoutRootRef);
  const threadDockRef = useRef<ThreadDockHandle>(null);
  const [openingAssetId, setOpeningAssetId] = useState<string | null>(null);
  // Параметри модала створення Договору (відкривається на кнопці "PDF" біля рядка "Договір").
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [contractProductionDaysInput, setContractProductionDaysInput] = useState(
    String(DEFAULT_PRODUCTION_WORK_DAYS)
  );
  const [contractAutoProlongation, setContractAutoProlongation] = useState(false);
  const [contractPrepaymentPctInput, setContractPrepaymentPctInput] = useState("70");
  const [contractBalancePctInput, setContractBalancePctInput] = useState("30");
  const [contractBalanceTiming, setContractBalanceTiming] = useState<"before_shipment" | "after_shipment">("before_shipment");
  const [contractBalanceDaysInput, setContractBalanceDaysInput] = useState("3");
  const [contractBalanceDaysKind, setContractBalanceDaysKind] = useState<BalanceDaysKind>("working");
  // Ручні № і дата договору (редагує лише owner/seo) — реальний паперовий договір може мати власні значення.
  const [contractNumberInput, setContractNumberInput] = useState("");
  const [contractDateInput, setContractDateInput] = useState("");
  const [contractDialogSubmitting, setContractDialogSubmitting] = useState(false);
  // Параметри модала СП. Договір підписується раз, а специфікація — під кожне замовлення,
  // тож умови партії (оплата, строки, доставка) задаються саме тут.
  const [specDialogOpen, setSpecDialogOpen] = useState(false);
  const [specDialogSubmitting, setSpecDialogSubmitting] = useState(false);
  const specItemTexts = useSpecificationItemTexts(teamId ?? null, record, specDialogOpen);
  const [specPaymentMethodId, setSpecPaymentMethodId] = useState("bank_uah");
  const [specDialogError, setSpecDialogError] = useState<string | null>(null);
  const [specPrepaymentPctInput, setSpecPrepaymentPctInput] = useState("70");
  const [specBalancePctInput, setSpecBalancePctInput] = useState("30");
  const [specBalanceTiming, setSpecBalanceTiming] = useState<"before_shipment" | "after_shipment">("before_shipment");
  const [specBalanceDaysInput, setSpecBalanceDaysInput] = useState("3");
  const [specBalanceDaysKind, setSpecBalanceDaysKind] = useState<BalanceDaysKind>("working");
  const [specProductionDaysInput, setSpecProductionDaysInput] = useState(String(DEFAULT_PRODUCTION_WORK_DAYS));
  const [specIncotermsCode, setSpecIncotermsCode] = useState(DEFAULT_INCOTERMS);
  const [specIncotermsPlaceInput, setSpecIncotermsPlaceInput] = useState("");
  const [specIncludeVisualization, setSpecIncludeVisualization] = useState(true);
  const [specNumberInput, setSpecNumberInput] = useState("");
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
  // Мемо обовʼязкове: новий масив на кожен рендер перезапускав би ефект діалогу.
  const ttnCatalogModelIds = useMemo(
    () => (record?.items ?? []).map((item) => item.catalogModelId ?? "").filter(Boolean),
    [record?.items]
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

  // Оплати замовлення (REQ-322#p26): вносить бухгалтерія, статус оплати рахує база.
  const paymentPanel = useOrderPaymentPanel({ record, teamId, userId, canEnter: canIssueInvoice, onChanged: refreshRecord });
  const economicsPanel = useOrderEconomicsPanel({ record, teamId, userId, accessRole, jobRole, onChanged: refreshRecord }); // закупки й маржа

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


  const handleStatusChange = async (field: "orderStatus" | "paymentStatus" | "deliveryStatus", value: string) => {
    if (!record || record.source !== "stored" || !teamId) return;
    // Ворота запуску (REQ-322#p8): без підписаної СП і оплати за умовами — лише з
    // дозволу СЕО чи головбуха. Запущене раніше не чіпаємо.
    if (
      field === "orderStatus" &&
      LAUNCHED_ORDER_STATUSES.has(value) &&
      !LAUNCHED_ORDER_STATUSES.has(record.orderStatus)
    ) {
      const gate = buildLaunchPath(record);
      if (gate.blocker) {
        toast.error(`Запустити ще не можна: ${gate.blocker.toLowerCase()}.`, {
          description: "Попросіть дозвіл у «Шляху до запуску» — вирішує СЕО або головний бухгалтер.",
        });
        setActiveTab("launch");
        return;
      }
    }
    // Ворота відвантаження (REQ-322#p9): без суми, належної до відвантаження, не веземо.
    if (
      (field === "orderStatus" || field === "deliveryStatus") &&
      isShipmentStatus(field, value) &&
      !isShipmentStatus(field, record[field])
    ) {
      const shipmentBlocker = getShipmentBlocker(record);
      if (shipmentBlocker) {
        toast.error(shipmentBlocker);
        return;
      }
    }
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
      // Готове, але неоплачене — менеджер і логіст дізнаються одразу.
      const readyBlocker = field === "orderStatus" && value === "ready" ? getShipmentBlocker(record) : null;
      if (readyBlocker) {
        void notifyOrderReadyUnpaid({
          teamId,
          orderId: record.id,
          orderNumber: record.quoteNumber,
          customerName: record.customerName,
          managerUserId: record.managerUserId,
          blocker: readyBlocker,
          actorUserId: userId,
        }).catch(() => undefined);
      }
    } catch (statusError: unknown) {
      setRecord({
        ...record,
        orderStatus: previous.orderStatus,
        paymentStatus: previous.paymentStatus,
        deliveryStatus: previous.deliveryStatus,
      });
      toast.error(statusError instanceof Error ? statusError.message : "Не вдалося оновити статуси.");
    } finally {
      setStatusSaving(false);
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
      | "balanceDaysKind"
      | "contractSections"
      | "contractNumberOverride"
      | "contractDateOverride"
    > & {
      /** false — перегляд чернетки договору: друкуємо, але не позначаємо договір створеним. */
      markCreated?: boolean;
    } = {},
    // Модалка параметрів зберігає значення й одразу друкує: `record` у замиканні на цей
    // момент ще старий, тож вона передає вже оновлений запис явно.
    recordOverride?: DerivedOrderRecord
  ) => {
    const activeRecord = recordOverride ?? record;
    if (!activeRecord) return;
    if (kind === "specification") {
      const blocker = getSpecificationBlocker(activeRecord);
      if (blocker) {
        toast.error(blocker);
        return;
      }
    }
    if (kind === "contract" && !activeRecord.docs.contract) {
      toast.error("Для договору не вистачає реквізитів замовника.");
      return;
    }
    const printWindow = openDocumentWindow(documentTitleByKind[kind]);
    if (printWindow.blocked) {
      toast.error("Браузер заблокував нове вікно для документа.");
      return;
    }
    // Родовий відмінок ПІБ і посади («в особі директора …») потрібен лише договору й СП:
    // рахунок і акт не чекають на OpenAI. Недоступний API — fallback на оригінал.
    const needsGenitive = kind === "contract" || kind === "specification";
    const [customerSignatoryNameGenitive, customerSignatoryRoleGenitive] = await Promise.all([
      needsGenitive && activeRecord.customerSignatoryName ? declineToGenitive(activeRecord.customerSignatoryName) : "",
      needsGenitive && activeRecord.customerSignatoryPosition ? declineToGenitive(activeRecord.customerSignatoryPosition) : "",
    ]);
    printWindow.mark("відмінювання ПІБ");

    // Позначку «створено» ставимо ДО збирання документа і лише при першій генерації:
    // номер договору (ДД/ММ/РРРР-NNN) і № СП видає тригер у цю мить, і вони мають
    // стояти вже в першому надрукованому примірнику. Повторне «Відкрити PDF» дату
    // створення не зсуває.
    let printedRecord = activeRecord;
    const alreadyCreated =
      kind === "contract"
        ? Boolean(activeRecord.contractCreatedAt)
        : kind === "specification"
          ? Boolean(activeRecord.specificationCreatedAt)
          : true;
    if (
      activeRecord.source === "stored" &&
      teamId &&
      (kind === "contract" || kind === "specification") &&
      !alreadyCreated &&
      extraOptions.markCreated !== false
    ) {
      try {
        const created = await markOrderDocumentCreated({ teamId, orderId: activeRecord.id, documentKind: kind });
        const patch =
          kind === "contract"
            ? {
                contractCreatedAt: created.createdAt,
                contractNumber: created.contractNumber ?? activeRecord.contractNumber,
                contractDate: created.contractDate ?? activeRecord.contractDate,
              }
            : { specificationCreatedAt: created.createdAt, specificationNumber: created.specificationNumber };
        printedRecord = { ...activeRecord, ...patch };
        printedRecord = { ...printedRecord, docs: normalizeDocumentDocs(printedRecord) };
        setRecord((current) => {
          if (!current || current.id !== activeRecord.id) return current;
          const next = { ...current, ...patch };
          return { ...next, docs: normalizeDocumentDocs(next) };
        });
      } catch (markError: unknown) {
        toast.error(markError instanceof Error ? markError.message : "Документ відкрито, але не вдалося зберегти позначку створення.");
      }
    }

    let builtHtml: string;
    if (kind === "specification") {
      // Візуал — за вибором менеджера у вікні параметрів (REQ-322#p37); старі СП — як були.
      const includeVisualization = printedRecord.specIncludeVisualization !== false;
      const [visualizationImageUrls, itemTexts] = await Promise.all([
        includeVisualization ? resolveVisualizationImageUrls(printedRecord.approvedVisualizationAssets) : [],
        teamId ? loadSpecificationItemTexts(teamId, [printedRecord]).catch(() => []) : [],
      ]);
      printWindow.mark("візуалізації й тексти позицій");
      builtHtml = buildSpecificationHtml({
        records: [printedRecord],
        specificationNumber: printedRecord.specificationNumber,
        itemTexts: new Map(itemTexts.map((entry) => [entry.itemId, entry.text])),
        visualizationImageUrls,
        customerSignatoryNameGenitive,
        customerSignatoryRoleGenitive,
      });
    } else {
      builtHtml = buildOrderDocumentHtml(printedRecord, kind, {
        customerSignatoryNameGenitive,
        customerSignatoryRoleGenitive,
        ...extraOptions,
      });
    }
    // Непогоджений договір чи СП друкуються з плашкою «чернетка» (REQ-322#p6):
    // надіслати PDF повз погодження тоді видно з першого погляду.
    const unapproved =
      (kind === "contract" || kind === "specification") &&
      !isDocumentCleared(getDocumentApprovalState(printedRecord, kind).state);
    const html = unapproved
      ? builtHtml.replace(
          /<body([^>]*)>/i,
          `<body$1><div style="border:2px dashed #c2410c;color:#c2410c;padding:6px 10px;margin:0 0 12px;font:600 12px/1.4 sans-serif;text-align:center">ЧЕРНЕТКА — ще не погоджено бухгалтером або СЕО. Замовнику не надсилати.</div>`
        )
      : builtHtml;
    printWindow.show(html, { teamId, orderId: printedRecord.id });
  };

  // Договір спершу відкриває модал параметрів (строки, пролонгація, оплата), а вже звідти — генерацію PDF.
  // Поля сидяться з раніше збережених значень (persisted), щоб модалка показувала реальний стан.
  const openContractParamsDialog = () => {
    if (!record) return;
    setContractAutoProlongation(record.contractAutoProlongation);
    setContractProductionDaysInput(
      record.contractProductionDays !== null
        ? String(record.contractProductionDays)
        : String(DEFAULT_PRODUCTION_WORK_DAYS)
    );
    setContractPrepaymentPctInput(record.prepaymentPct !== null ? String(record.prepaymentPct) : "70");
    setContractBalancePctInput(record.balancePct !== null ? String(record.balancePct) : "30");
    setContractBalanceTiming(record.balanceTiming ?? "before_shipment");
    setContractBalanceDaysInput(
      record.balanceDaysAfterShipment !== null ? String(record.balanceDaysAfterShipment) : "3"
    );
    setContractBalanceDaysKind(record.balanceDaysKind);
    // Порожній № — його видасть CRM при створенні: ДД/ММ/РРРР-NNN за датою договору (REQ-322#p23).
    setContractNumberInput(record.contractNumber?.trim() ?? "");
    setContractDateInput(
      (record.contractDate || record.contractCreatedAt || new Date().toISOString()).slice(0, 10)
    );
    setContractDialogOpen(true);
  };

  // Модал параметрів СП. Сидиться з поточних умов замовлення — а вони, якщо на цьому
  // замовленні ще нічого не задавали, успадковані з договору замовника.
  // Блокер СП тут свідомо НЕ перевіряємо: саме в цій модалці міняється тип оплати,
  // а готівка — один із блокерів. Інакше заблоковану СП не було б чим розблокувати.
  const openSpecificationParamsDialog = () => {
    if (!record) return;
    setSpecPaymentMethodId(record.paymentMethodId);
    setSpecPrepaymentPctInput(record.prepaymentPct !== null ? String(record.prepaymentPct) : "70");
    setSpecBalancePctInput(record.balancePct !== null ? String(record.balancePct) : "30");
    setSpecBalanceTiming(record.balanceTiming ?? "before_shipment");
    setSpecBalanceDaysInput(record.balanceDaysAfterShipment !== null ? String(record.balanceDaysAfterShipment) : "3");
    setSpecBalanceDaysKind(record.balanceDaysKind);
    setSpecProductionDaysInput(
      record.contractProductionDays !== null
        ? String(record.contractProductionDays)
        : String(DEFAULT_PRODUCTION_WORK_DAYS)
    );
    setSpecIncotermsCode(record.incotermsCode || DEFAULT_INCOTERMS);
    setSpecIncotermsPlaceInput(record.incotermsPlace ?? "");
    setSpecIncludeVisualization(record.specIncludeVisualization !== false);
    setSpecNumberInput(record.specificationNumber !== null ? String(record.specificationNumber) : "");
    setSpecDialogError(null);
    setSpecDialogOpen(true);
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
    // Рахунок без номера з BAS не відкривається: менеджер його просить (REQ-322#p10).
    if (kind === "invoice" && record && getOrderInvoiceState(record) !== "issued") {
      void invoiceFlow.request();
      return;
    }
    if (kind === "contract") {
      if (record?.contractCreatedAt) {
        regenerateContract();
      } else {
        openContractParamsDialog();
      }
      return;
    }
    // СП — свій набір умов на кожну партію. Перше створення йде через модал,
    // далі одразу PDF (умови міняються кнопкою «Змінити» в картці «Умови СП»).
    if (kind === "specification" && !record?.specificationCreatedAt) {
      openSpecificationParamsDialog();
      return;
    }
    void openDocumentPrint(kind);
  };

  // Нова ТТН — це відвантаження: ті самі ворота, що й статус (REQ-322#p9).
  // Уже створену ТТН відкрити можна завжди.
  const openTtnDialog = () => {
    const shipmentBlocker = record && !record.npTtnNumber ? getShipmentBlocker(record) : null;
    if (shipmentBlocker) {
      toast.error(shipmentBlocker);
      return;
    }
    setTtnDialogOpen(true);
  };

  // Договір і СП — замовнику лише після погодження бухгалтера або СЕО (REQ-322#p6).
  const guardSendToCustomer = () => {
    const blocker = record ? getSendToCustomerBlocker(record) : null;
    if (blocker) toast.error(blocker);
    return !blocker;
  };

  const openEmailDraft = () => {
    if (!record) return;
    if (!guardSendToCustomer()) return;
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
    if (!guardSendToCustomer()) return;
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
    if (!guardSendToCustomer()) return;
    const text = encodeURIComponent(
      `Документи по замовленню ${record.quoteNumber}. ${record.customerName}. Сума: ${formatOrderMoney(record.total, record.currency)}`
    );
    window.location.href = `viber://forward?text=${text}`;
  };

  if (!id) {
    return <div className="p-6 text-sm text-muted-foreground">Невірний ідентифікатор.</div>;
  }

  if (loading) {
    return <PageLoading />;
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

  const requiresCustomerDocuments = isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail);
  const documentActions = getOrderDocumentKinds(record).map((kind) => ({
    kind,
    ...getDocumentActionState(record, kind),
  }));
  const launchPath = buildLaunchPath(record);
  const termsChip = formatPaymentTermsChip(record);
  const paymentMethodChip =
    isCashLikePaymentMethod(record.paymentMethodId)
      ? PAYMENT_METHOD_LABELS[record.paymentMethodId]
      : requiresCustomerDocuments
        ? "Безготівка"
        : record.paymentMethodId === "crypto"
          ? "Криптовалюта"
          : record.paymentRail;
  const openCustomerCard = record.customerId ? () => void openCustomerEditor(record.customerId!) : null;
  const orderTabs: { value: OrderPageTab; label: string; badge?: string | number | null; mobileOnly?: boolean }[] = [
    { value: "launch", label: "Запуск", badge: `${launchPath.steps.filter((step) => step.state === "done").length}/${launchPath.steps.length}` },
    { value: "items", label: "Позиції", badge: record.items.length || null },
    { value: "materials", label: "Матеріали", badge: countOrderMaterials(record) || null },
    { value: "delivery", label: "Доставка", badge: record.incotermsCode || null },
    ...(economicsPanel.tab ? [economicsPanel.tab] : []),
    { value: "details", label: "Деталі", badge: formatOrderMoney(record.total, record.currency), mobileOnly: true },
  ];
  const partyExtras = [
    orderSourceQuoteExtra(record),
    record.customerTaxId
      ? { label: "Реквізити", value: `ЄДРПОУ ${record.customerTaxId}` }
      : requiresCustomerDocuments
        ? { label: "Реквізити", value: "Бракує" }
        : null,
    record.customerSignatoryName
      ? {
          label: "Підписант",
          value: [toSignatureInitials(record.customerSignatoryName), record.customerSignatoryPosition]
            .filter(Boolean)
            .join(", "),
        }
      : null,
    record.designTaskNumber ? { label: "Дизайн", value: record.designTaskNumber } : null,
  ].filter((extra): extra is { label: string; value: string } => extra !== null);

  return (
    <>
    <div ref={layoutRootRef} className="@container/record text-foreground">
      {/* Розкладка — та сама, що в картці прорахунку (QuoteDetailsPage): дві колонки
          на всю висоту, коли їх вміщає сторінка; вужче права колонка стає вкладкою
          «Деталі», а обговорення — шторкою. */}
      <ThreadDockProvider
        handleRef={threadDockRef}
        onModeChange={(mode) => {
          if (mode === "split") setActiveTab((tab) => (tab === "details" ? "launch" : tab));
        }}
      >
      <div className="grid grid-cols-1 record-split:relative [--record-rail-w:21.25rem] record-wide:[--record-rail-w:23.75rem] record-split:h-(--record-page-h) record-split:grid-cols-[minmax(0,1fr)_var(--record-rail-w)] record-split:overflow-hidden">
        <div className="flex min-w-0 flex-col record-split:h-full record-split:min-h-0 record-split:overflow-hidden">
      <header className="sticky top-[var(--page-chrome-offset,var(--app-header-height))] z-40 bg-background/95 backdrop-blur record-split:static record-split:shrink-0 record-split:bg-transparent record-split:backdrop-blur-none">
        <div className="px-2 py-2 md:px-2.5 lg:px-3 2xl:px-4">
          <div className="flex min-h-10 flex-wrap items-center gap-x-1.5 gap-y-2 sm:gap-x-3">
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:gap-3">
              <HoverTip asChild label="До списку замовлень">
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={() => navigate("/orders/production")}
                  className="shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="До списку замовлень"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </HoverTip>
              <HoverCopyText
                value={record.quoteNumber}
                textClassName="tabular-nums text-[15px] font-medium tracking-wide text-foreground sm:text-[17px]"
                successMessage="Номер замовлення скопійовано"
                copyLabel="Скопіювати номер замовлення"
              >
                {record.quoteNumber}
              </HoverCopyText>
            </div>
            <div className="order-3 flex w-full flex-wrap items-center gap-1.5 lg:order-none lg:w-auto">
              {/* Вузько права колонка схована у «Деталях» — замовника показуємо тут, щоб було видно, чиє це. */}
              <span className="mr-1 min-w-0 max-w-full truncate text-sm font-medium text-foreground record-split:hidden">
                {record.customerName}
              </span>
              <span className="rounded-md border border-border/70 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {paymentMethodChip}
              </span>
              {termsChip ? (
                <span className="tone-info rounded-md border px-2 py-0.5 text-xs font-semibold">{termsChip}</span>
              ) : null}
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
              {teamId ? <ThreadDockButton /> : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {/* На телефоні кнопка не влазить у рядок із номером; надсилання там у картці документів. */}
                  <Button variant="outline" size="sm" className="hidden gap-1.5 sm:inline-flex">
                    <Send className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Надіслати замовнику</span>
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={openEmailDraft} disabled={!record.contactEmail}>
                    <Mail className="mr-2 h-4 w-4" />
                    Email
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openTelegramDraft}>
                    <Send className="mr-2 h-4 w-4" />
                    Telegram
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openViberDraft} disabled={!record.contactPhone}>
                    <Phone className="mr-2 h-4 w-4" />
                    Viber
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <OrderStatusControl
                values={{
                  orderStatus: record.orderStatus,
                  paymentStatus: record.paymentStatus,
                  deliveryStatus: record.deliveryStatus,
                }}
                busy={statusSaving}
                readOnly={record.source !== "stored"}
                paymentLocked={paymentPanel.paymentLocked}
                onChange={(field, value) => void handleStatusChange(field, value)}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="iconSm" aria-label="Ще дії із замовленням">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {openCustomerCard ? (
                    <DropdownMenuItem onClick={openCustomerCard}>
                      <Building2 className="mr-2 h-4 w-4" />
                      Картка замовника
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={() => setDeliveryDialogOpen(true)}>
                    <Truck className="mr-2 h-4 w-4" />
                    Доставка
                  </DropdownMenuItem>
                  {record.source === "stored" ? (
                    <DropdownMenuItem
                      onClick={openTtnDialog}
                      disabled={!orderDelivery?.deliveryType && !record.npTtnNumber}
                    >
                      <PackageCheck className="mr-2 h-4 w-4" />
                      ТТН Нової пошти
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

        <main
          className={cn(
            "min-w-0 px-2 pt-0 md:px-2.5 lg:px-3 record-split:flex record-split:h-full record-split:min-h-0 record-split:flex-1 record-split:flex-col record-split:overflow-hidden record-split:pb-0 2xl:px-4",
            activeTab === "details" ? "pb-0" : "pb-10"
          )}
        >
          <div className="mb-4 -mx-4 border-b border-border/50 bg-background/95 px-4 backdrop-blur md:-mx-5 md:px-5 lg:-mx-6 lg:px-6 record-split:mb-0 record-split:shrink-0 2xl:-mx-8 2xl:px-8">
            <TabBar value={activeTab}>
              {orderTabs.map((tab) => (
                <TabBarItem
                  key={tab.value}
                  value={tab.value}
                  onSelect={(next) => setActiveTab(next as OrderPageTab)}
                  className={cn(tab.mobileOnly && "record-split:hidden")}
                >
                  <span>{tab.label}</span>
                  {tab.badge ? (
                    <span className="inline-flex h-[18px] min-w-[18px] max-w-[104px] items-center justify-center truncate rounded-md bg-muted px-1.5 text-2xs tabular-nums text-muted-foreground">
                      {tab.badge}
                    </span>
                  ) : null}
                </TabBarItem>
              ))}
            </TabBar>
          </div>
          <div className="space-y-4 record-split:-mr-3 record-split:min-h-0 record-split:flex-1 record-split:overflow-y-auto record-split:overscroll-contain record-split:pb-8 record-split:pr-3 record-split:pt-4 record-split:2xl:-mr-4 record-split:2xl:pr-4">
            <OrderApprovalDeskCard
              record={record}
              pending={record.approvals.filter(
                (approval) =>
                  approval.status === "pending" && (approval.kind === "launch" ? canApproveLaunch : canIssueInvoice)
              )}
              busy={approvalFlow.busy !== null}
              onDecide={approvalFlow.decide}
              onPreview={(kind) => void openDocumentPrint(kind, { markCreated: false })}
            />
            {canIssueInvoice && getOrderInvoiceState(record) === "requested" ? (
              <OrderInvoiceDeskCard
                record={record}
                busy={invoiceFlow.busy}
                onIssue={invoiceFlow.issue}
                onReturn={invoiceFlow.returnRequest}
                onPreview={() => void openDocumentPrint("invoice")}
                teamId={teamId}
                onDocumentNamesSaved={applyDocumentNames}
                onContractSaved={() => void refreshRecord()}
              />
            ) : null}
            {canIssueInvoice &&
            teamId &&
            record.invoiceNumber &&
            (record.closingDocument === "act" ||
              // ВН виписують на відвантаженні — раніше картка лише заважала б.
              (requiresCustomerDocuments &&
                (Boolean(record.waybillNumber) || ["ready", "shipped", "completed"].includes(record.orderStatus)))) ? (
              <OrderClosingDocumentDeskCard
                key={`${record.id}:${record.closingDocument ?? ""}:${record.actNumber ?? ""}:${record.waybillNumber ?? ""}`}
                record={record} teamId={teamId} waybillBlockers={economicsPanel.waybillBlockers}
                onSaved={(patch) => setRecord((current) => (current ? { ...current, ...patch } : current))}
                onPreview={
                  record.closingDocument === "act" ? () => void openDocumentPrint("act", { markCreated: false }) : null
                }
              />
            ) : null}
            {activeTab === "launch" ? (
              <>
                <OrderLaunchPathCard
                  record={record}
                  termsSummary={[
                    { label: "Оплата", value: termsChip ?? "не задано" },
                    {
                      label: "Виробництво",
                      value: `${record.contractProductionDays ?? DEFAULT_PRODUCTION_WORK_DAYS} р.д.`,
                    },
                    { label: "Поставка", value: formatIncotermsLabel(record).replace(" (Incoterms 2020)", "") },
                  ]}
                  onEditTerms={record.source === "stored" ? openSpecificationParamsDialog : null}
                  exceptionBusy={approvalFlow.busy !== null}
                  onRequestException={record.source === "stored" ? (note) => approvalFlow.request("launch", note) : null}
                />
                <OrderDocumentsCard
                  record={record}
                  approvals={{
                    busy: approvalFlow.busy,
                    onRequestApproval: (kind) => void approvalFlow.request(kind),
                    onWithdraw: (approval) => void approvalFlow.withdraw(approval),
                    onSign: (kind, via, signedOn) => void approvalFlow.sign(kind, via, signedOn),
                  }}
                  issuer={
                    record.source === "stored"
                      ? {
                          options: legalEntity.options,
                          busy: legalEntity.busy,
                          onChangeEntity: (option) => void legalEntity.changeEntity(option),
                          onChangeClosingDocument: (value) => void legalEntity.changeClosingDocument(value),
                        }
                      : null
                  }
                  documentActions={documentActions}
                  onAction={handleDocumentAction}
                  onParams={(kind) =>
                    kind === "contract" ? openContractParamsDialog() : openSpecificationParamsDialog()
                  }
                  onFixRequisites={openCustomerCard}
                  onEmail={openEmailDraft}
                  onTelegram={openTelegramDraft}
                  onViber={openViberDraft}
                  teamId={teamId} onRecordChanged={() => void refreshRecord()}
                />
                {/* Готівка без договору: панель лише там, де договір уже є. Версії пишуться в рядок
                    orders — у незбереженого запису його ще немає. */}
                {teamId && userId && record.source === "stored" && (requiresCustomerDocuments || record.contractCreatedAt) ? (
                  <Suspense
                    fallback={
                      <div className="flex items-center gap-2 rounded-xl border border-border/60 p-5 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Завантаження договорів…
                      </div>
                    }
                  >
                    <ContractRevisionsPanel
                      teamId={teamId}
                      orderId={record.id}
                      currentUserId={userId}
                      // Погоджувач тепер не лише СЕО, а й бухгалтерія (REQ-322#p6).
                      isCeo={canIssueInvoice}
                      quoteNumber={record.quoteNumber}
                      initialDefaultSections={buildDefaultContractSections(buildContractRenderContextFromRecord(record))}
                      onOpenPreview={(sections) =>
                        openDocumentPrint("contract", { contractSections: sections, markCreated: false })
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
                  </Suspense>
                ) : null}
              </>
            ) : null}
            {activeTab === "items" ? (
              <OrderItemsTable record={record} teamId={teamId} onDocumentNamesSaved={applyDocumentNames} />
            ) : null}
            {activeTab === "economics" ? economicsPanel.content : null}
            {activeTab === "materials" ? (
              <OrderMaterialsTab
                record={record}
                openingAssetId={openingAssetId}
                onOpenAsset={(asset) => void handleOpenDesignAsset(asset)}
                onOpenDesignTask={(designTaskId) => navigate(`/design/${designTaskId}`)}
              />
            ) : null}
            {activeTab === "delivery" ? (
              <OrderDeliveryCard
                record={record}
                delivery={orderDelivery}
                ttnStatus={ttnStatus}
                onEditDelivery={() => setDeliveryDialogOpen(true)}
                onOpenTtn={openTtnDialog}
              />
            ) : null}
          </div>
        </main>
        </div>

        <aside
          className={cn(
            "self-start px-4 pb-10 pt-2 md:px-5 lg:px-6 record-split:flex record-split:min-h-0 record-split:h-full record-split:flex-col record-split:self-stretch record-split:overflow-hidden record-split:border-l record-split:border-[hsl(var(--app-structure-divider))] record-split:px-0 record-split:pb-0 record-split:pt-0",
            activeTab !== "details" && "record-stack:hidden"
          )}
        >
          <div className="flex flex-col gap-2 record-split:h-full record-split:min-h-0 record-split:px-3 record-split:pt-3">
            <QuotePartyCard
              customerName={record.customerName}
              customerLogoUrl={record.customerLogoUrl}
              customerInitials={partyInitials(record.customerName)}
              managerName={record.managerLabel}
              managerAvatarUrl={record.managerAvatarUrl}
              managerInitials={partyInitials(record.managerLabel)}
              createdAt={record.createdAt}
              deadlines={[
                launchPath.steps.find((step) => step.key === "launch")?.state === "done"
                  ? { label: "Запуск", short: "Запущено", tone: "future", title: "Запущено у виробництво" }
                  : { label: "Запуск", short: "—", tone: "none", title: "Запуск: ще не запущено" },
                {
                  label: "Готовність",
                  short: `${record.contractProductionDays ?? DEFAULT_PRODUCTION_WORK_DAYS} р.д.`,
                  tone: "future",
                  title: "Строк виробництва від запуску",
                },
                launchPath.steps.find((step) => step.key === "shipment")?.state === "done"
                  ? { label: "Відвантаження", short: "Так", tone: "future", title: "Відвантажено" }
                  : { label: "Відвантаження", short: "—", tone: "none", title: "Відвантаження: ще ні" },
              ]}
              extras={partyExtras}
              onOpenParty={openCustomerCard ?? (() => undefined)}
              onOpenDeadlines={() => setActiveTab("launch")}
            />
            <OrderPaymentCard record={record} ledger={paymentPanel.ledger} />
            {teamId ? (
              <ThreadDock
                className="min-h-0 flex-1 pb-4"
                renderRail={(slot) => (
                  <TaskThreadRail
                    {...slot}
                    // Замовлення з прорахунку говорить у нитці прорахунку (docs/TASK_CHAT_DESIGN.md):
                    // уся історія справи лишається в одному місці.
                    threadKey={record.linkedQuoteId ? threadKeyForQuote(record.linkedQuoteId) : threadKeyForOrder(record.id)}
                    eventActions={THREAD_EVENT_ACTIONS}
                    quoteId={record.linkedQuoteId}
                    teamId={teamId}
                    canManage={isCeo}
                  />
                )}
              />
            ) : null}
          </div>
        </aside>
        <RecordRailResizer storageKey="tosho_order_rail_width" />
      </div>
      </ThreadDockProvider>
    </div>

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
                  <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-3xs font-medium text-muted-foreground">
                    Тільки CEO / власник
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
                    placeholder="ДД/ММ/РРРР-NNN — видасть CRM"
                    disabled={!isCeo}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="contract-date">Дата договору</Label>
                  <DateInput
                    id="contract-date"
                    value={contractDateInput}
                    onChange={(e) => setContractDateInput(e.target.value)}
                    className="h-9"
                    disabled={!isCeo}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {isCeo
                  ? "Якщо паперовий договір вже існує — встав його реальні № і дату. Інакше CRM видасть номер за датою договору: ДД/ММ/РРРР-001, -002…"
                  : "Змінювати № і дату договору може лише CEO або власник. CRM видасть номер за датою договору: ДД/ММ/РРРР-001, -002…"}
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
                <div className="grid content-start gap-2">
                  <Label htmlFor="contract-prepayment-pct">Передоплата, %</Label>
                  <Input
                    id="contract-prepayment-pct"
                    inputMode="numeric"
                    value={contractPrepaymentPctInput}
                    onChange={(e) => setContractPrepaymentPctInput(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    placeholder="Напр. 70"
                  />
                  <p className="text-xs text-muted-foreground">Перед запуском у виробництво.</p>
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="contract-balance-pct">Доплата, %</Label>
                  <Input
                    id="contract-balance-pct"
                    inputMode="numeric"
                    value={contractBalancePctInput}
                    onChange={(e) => setContractBalancePctInput(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    placeholder="Напр. 30"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Доплата — коли</Label>
                <Select
                  value={contractBalanceTiming}
                  onValueChange={(value) => setContractBalanceTiming(value as "before_shipment" | "after_shipment")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before_shipment">По факту готовності, до відвантаження</SelectItem>
                    <SelectItem value="after_shipment">По факту готовності, після відвантаження</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {contractBalanceTiming === "after_shipment" ? (
                <BalanceDaysField
                  id="contract-balance-days"
                  days={contractBalanceDaysInput}
                  onDaysChange={setContractBalanceDaysInput}
                  kind={contractBalanceDaysKind}
                  onKindChange={setContractBalanceDaysKind}
                />
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
                  // № і дату договору може змінювати лише CEO/власник. Для решти — лишаємо як є (override не застосовуємо).
                  const contractNumberOverride = isCeo
                    ? (contractNumberInput.trim() || null)
                    : (record.contractNumber ?? null);
                  const contractDateOverride = isCeo
                    ? (contractDateInput.trim() || null)
                    : (record.contractDate ?? null);
                  // Зберігаємо параметри генерації (строки, пролонгація, оплата) + (для CEO) № і дату.
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
                        balanceDaysKind: contractBalanceDaysKind,
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
                              balanceDaysKind: contractBalanceDaysKind,
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
                      // Друкувати з незбереженими умовами не можна: договір розійдеться з тим, що в CRM.
                      toast.error("Не вдалося зберегти параметри договору", {
                        description: saveError instanceof Error ? saveError.message : undefined,
                      });
                      return;
                    }
                  }
                  await openDocumentPrint("contract", {
                    productionWorkingDays,
                    contractAutoProlongation,
                    prepaymentPct,
                    balancePct,
                    balanceTiming: contractBalanceTiming,
                    balanceDaysAfterShipment,
                    balanceDaysKind: contractBalanceDaysKind,
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

      {/* Умови партії для СП: договір один на замовника, а специфікація — під кожне замовлення. */}
      <Dialog
        open={specDialogOpen}
        onOpenChange={(open) => {
          if (specDialogSubmitting) return;
          setSpecDialogOpen(open);
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[960px]">
          <DialogHeader>
            <DialogTitle>
              {isCashlessPaymentMethod(specPaymentMethodId) ? "Параметри специфікації" : "Умови оплати"}
            </DialogTitle>
            <DialogDescription>
              Умови цієї партії. Дефолти підтягнуті з договору замовника — зміни, якщо для цього замовлення вони інші.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid items-start gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-md border border-border/60 p-3">
              <div className="text-sm font-medium">Умови оплати</div>
              <div className="grid gap-2">
                <Label>Тип оплати</Label>
                <Select value={specPaymentMethodId} onValueChange={setSpecPaymentMethodId}>
                  <SelectTrigger>
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
                <p className="text-xs text-muted-foreground">СП формується тільки для безготівкового розрахунку.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid content-start gap-2">
                  <Label htmlFor="spec-prepayment-pct">Передоплата, %</Label>
                  <Input
                    id="spec-prepayment-pct"
                    inputMode="numeric"
                    value={specPrepaymentPctInput}
                    onChange={(e) => setSpecPrepaymentPctInput(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    placeholder="Напр. 70"
                  />
                  <p className="text-xs text-muted-foreground">Перед запуском у виробництво.</p>
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="spec-balance-pct">Доплата, %</Label>
                  <Input
                    id="spec-balance-pct"
                    inputMode="numeric"
                    value={specBalancePctInput}
                    onChange={(e) => setSpecBalancePctInput(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    placeholder="Напр. 30"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Доплата — коли</Label>
                <Select
                  value={specBalanceTiming}
                  onValueChange={(value) => setSpecBalanceTiming(value as "before_shipment" | "after_shipment")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before_shipment">По факту готовності, до відвантаження</SelectItem>
                    <SelectItem value="after_shipment">По факту готовності, після відвантаження</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {specBalanceTiming === "after_shipment" ? (
                <BalanceDaysField
                  id="spec-balance-days"
                  days={specBalanceDaysInput}
                  onDaysChange={setSpecBalanceDaysInput}
                  kind={specBalanceDaysKind}
                  onKindChange={setSpecBalanceDaysKind}
                />
              ) : null}
            </div>
            <div className="space-y-4">
            {isCashlessPaymentMethod(specPaymentMethodId) ? (
              <SpecificationNumberField value={specNumberInput} onChange={setSpecNumberInput} />
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="spec-production-days">Строки виробництва (робочих днів)</Label>
              <Input
                id="spec-production-days"
                inputMode="numeric"
                value={specProductionDaysInput}
                onChange={(e) => setSpecProductionDaysInput(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                placeholder={`Напр. ${DEFAULT_PRODUCTION_WORK_DAYS}`}
              />
              <p className="text-xs text-muted-foreground">Іде в п. 2.2 СП: «до N робочих днів».</p>
            </div>
            <div className="space-y-3 rounded-md border border-border/60 p-3">
              <div className="text-sm font-medium">Умови доставки</div>
              <div className="grid gap-2">
                <div className="flex h-5 items-center gap-1.5">
                  <Label>Incoterms 2020</Label>
                  <IncotermsHint />
                </div>
                <Select value={specIncotermsCode} onValueChange={setSpecIncotermsCode}>
                  <SelectTrigger>
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
              </div>
              <div className="grid gap-2">
                <Label htmlFor="spec-incoterms-place">Місце поставки</Label>
                <Input
                  id="spec-incoterms-place"
                  value={specIncotermsPlaceInput}
                  onChange={(e) => setSpecIncotermsPlaceInput(e.target.value)}
                  placeholder="Напр. склад НП, Київ"
                />
                <p className="text-xs text-muted-foreground">Іде в п. 3.2 СП разом із базисом Incoterms.</p>
              </div>
            </div>
            </div>
            </div>
            {isCashlessPaymentMethod(specPaymentMethodId) ? (
              <SpecificationVisualizationField
                available={Boolean(record?.hasApprovedVisualization)}
                checked={specIncludeVisualization}
                onCheckedChange={setSpecIncludeVisualization}
              />
            ) : null}
            {isCashlessPaymentMethod(specPaymentMethodId) ? <SpecificationItemTextsField state={specItemTexts} /> : null}
          </div>
          {specDialogError ? (
            <div className="tone-warning-subtle rounded-lg border px-3 py-2 text-sm tone-text-warning">{specDialogError}</div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSpecDialogOpen(false)} disabled={specDialogSubmitting}>
              Скасувати
            </Button>
            <Button
              onClick={async () => {
                if (!record) return;
                const { productionWorkingDays, prepaymentPct, balancePct, balanceDaysAfterShipment, specificationNumber } =
                  parseSpecificationParamsInput(
                    {
                      productionDays: specProductionDaysInput,
                      prepaymentPct: specPrepaymentPctInput,
                      balancePct: specBalancePctInput,
                      balanceTiming: specBalanceTiming,
                      balanceDays: specBalanceDaysInput,
                      specificationNumber: specNumberInput,
                    },
                    record.specificationNumber
                  );
                const prepaymentError = getMinimumPrepaymentError({
                  methodId: specPaymentMethodId,
                  prepaymentPct,
                  paymentTerms: record.paymentTerms,
                });
                if (prepaymentError) {
                  // Помилка лишається у вікні, поруч із полем, яке треба виправити.
                  setSpecDialogError(prepaymentError);
                  return;
                }
                setSpecDialogError(null);
                const paymentMethodLabel =
                  ORDER_PAYMENT_METHOD_OPTIONS.find((item) => item.id === specPaymentMethodId)?.label ??
                  record.paymentRail;
                const incotermsPlace = specIncotermsPlaceInput.trim() || null;

                setSpecDialogSubmitting(true);
                try {
                  // Оновлений запис будуємо один раз: він іде і в state, і одразу в генерацію
                  // (у замиканні `record` ще старий, а СП читає з нього і доставку, і оплату).
                  const patched: DerivedOrderRecord = {
                    ...record,
                    paymentMethodId: specPaymentMethodId,
                    paymentRail: paymentMethodLabel,
                    prepaymentPct,
                    balancePct,
                    balanceTiming: specBalanceTiming,
                    balanceDaysAfterShipment,
                    balanceDaysKind: specBalanceDaysKind,
                    contractProductionDays: productionWorkingDays,
                    incotermsCode: specIncotermsCode,
                    incotermsPlace,
                    specIncludeVisualization,
                    specificationNumber,
                  };
                  const nextRecord = { ...patched, docs: normalizeDocumentDocs(patched) };
                  if (record.source === "stored" && teamId) {
                    await updateOrderDocumentSettings({
                      teamId,
                      orderId: record.id,
                      paymentMethodId: specPaymentMethodId,
                      paymentMethodLabel,
                      prepaymentPct,
                      balancePct,
                      balanceTiming: specBalanceTiming,
                      balanceDaysAfterShipment,
                      balanceDaysKind: specBalanceDaysKind,
                      contractProductionDays: productionWorkingDays,
                      incotermsCode: specIncotermsCode,
                      incotermsPlace,
                      specIncludeVisualization,
                      ...(specificationNumber !== record.specificationNumber ? { specificationNumber } : {}),
                    });
                    setRecord((current) => (current && current.id === record.id ? nextRecord : current));
                    await specItemTexts.save();
                  }
                  // Умови збережені — закриваємо модалку в будь-якому разі. Якщо СП усе ще
                  // заблокована (напр. лишили готівку), генерація покаже причину на сторінці.
                  setSpecDialogOpen(false);
                  if (isCashlessPaymentMethod(specPaymentMethodId)) {
                    await openDocumentPrint("specification", {}, nextRecord);
                  }
                } catch (submitError: unknown) {
                  toast.error(
                    submitError instanceof Error ? submitError.message : "Не вдалося зберегти умови специфікації."
                  );
                } finally {
                  setSpecDialogSubmitting(false);
                }
              }}
              disabled={specDialogSubmitting}
            >
              {specDialogSubmitting
                ? "Збереження..."
                : isCashlessPaymentMethod(specPaymentMethodId)
                  ? "Створити PDF"
                  : "Зберегти"}
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
          catalogModelIds={ttnCatalogModelIds}
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
      {paymentPanel.dialogs}
    </>
  );
}
