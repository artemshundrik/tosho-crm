import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useNavigationType } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { usePageHeaderActions } from "@/components/app/usePageHeaderActions";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { ToolbarFilterSelect, ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { ActiveHereCard } from "@/components/app/workspace-presence-widgets";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { KanbanBoard, KanbanCard, KanbanColumn, KanbanSkeleton } from "@/components/kanban";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SEGMENTED_GROUP,
  SEGMENTED_TRIGGER,
  TOOLBAR_ACTION_BUTTON,
} from "@/components/ui/controlStyles";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CreateManualOrderDialog } from "@/components/orders/CreateManualOrderDialog";
import { ORDER_DOCUMENT_EXECUTOR, ORDER_PAYMENT_TERMS_OPTIONS, ORDER_READINESS_COLUMNS } from "@/features/orders/config";
import { EstimatesKanbanCanvas } from "@/features/quotes/components/EstimatesKanbanCanvas";
import {
  formatOrderDate,
  formatOrderMoney,
  isCashlessPaymentMethod,
  loadDerivedOrders,
  markOrderDocumentCreated,
  type DerivedOrderRecord,
} from "@/features/orders/orderRecords";
import { cn } from "@/lib/utils";
import { declineToGenitive } from "@/lib/nameDeclension";
import { toSignatureInitials } from "@/lib/signatureFormat";
import { shouldRestorePageUiState } from "@/lib/pageUiState";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Factory,
  FileText,
  LayoutGrid,
  List,
  Package,
  Palette,
  Plus,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { SegmentedGroup } from "@/components/ui/segmented-group";

type HeaderFilter = "all" | "created" | "ready" | "counterparty" | "design";

type OrdersProductionPageCachePayload = {
  records: DerivedOrderRecord[];
  cachedAt: number;
};

type OrdersProductionPageFiltersState = {
  search?: string;
  headerFilter?: HeaderFilter;
  managerFilter?: string;
  viewTab?: "queue" | "register";
  cachedAt?: number;
};

const HEADER_FILTER_OPTIONS: Array<{ value: HeaderFilter; label: string }> = [
  { value: "all", label: "Всі статуси" },
  { value: "created", label: "Створено замовлення" },
  { value: "ready", label: "Готово до замовлення" },
  { value: "counterparty", label: "Лід / реквізити" },
  { value: "design", label: "Макет / візуал" },
];

const ALL_MANAGERS_FILTER = "__all__";

const normalizeText = (value?: string | null) => (value ?? "").trim().toLowerCase();

const getInitials = (value?: string | null) => {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
};

function readOrdersProductionPageCache(teamId: string): OrdersProductionPageCachePayload | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = sessionStorage.getItem(`orders-production-page-cache:${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrdersProductionPageCachePayload;
    if (!Array.isArray(parsed.records)) return null;
    return {
      records: parsed.records,
      cachedAt: Number(parsed.cachedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}

function readOrdersProductionPageFiltersState(teamId: string): OrdersProductionPageFiltersState | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = sessionStorage.getItem(`orders-production-page-filters:${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrdersProductionPageFiltersState;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...parsed,
      cachedAt: Number(parsed.cachedAt ?? 0),
    };
  } catch {
    return null;
  }
}

const renderDocBadge = (label: string, ready: boolean) => (
  <Badge
    variant="outline"
    className={cn(
      "rounded-full px-2.5 py-0.5 text-2xs font-medium",
      ready ? "tone-success" : "border-border/70 bg-muted/20 text-muted-foreground"
    )}
  >
    {label}
  </Badge>
);

const SPEC_VAT_RATE = 20;
const CONTRACT_EXECUTOR = ORDER_DOCUMENT_EXECUTOR;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatPlainMoney = (value: number) =>
  new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

const formatSpecDate = (value = new Date()) =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);

const getSpecificationRecordBlocker = (record: DerivedOrderRecord) => {
  if (record.source !== "stored") return "СП можна додавати тільки зі створених замовлень.";
  if (record.items.length === 0) return "У замовленні немає позицій.";
  if (!isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)) return "СП створюється тільки для безготівки.";
  if (!record.contractCreatedAt) return "Спочатку потрібно створити договір.";
  if (!record.docs.specification) return "У замовленні ще не виконані умови для СП.";
  return null;
};

const getSpecificationCustomerKey = (record: DerivedOrderRecord) =>
  [
    record.customerId || "",
    normalizeText(record.legalEntityLabel || record.customerName),
    normalizeText(record.customerTaxId),
  ].join("|");

const getSpecificationGroupBlocker = (records: DerivedOrderRecord[]) => {
  if (records.length === 0) return "Обери хоча б одне замовлення для СП.";
  const first = records[0];
  const firstKey = getSpecificationCustomerKey(first);
  for (const record of records) {
    const blocker = getSpecificationRecordBlocker(record);
    if (blocker) return `${record.quoteNumber}: ${blocker}`;
    if (getSpecificationCustomerKey(record) !== firstKey) return "В одну СП можна додати тільки замовлення одного Замовника.";
    if (record.paymentTerms !== first.paymentTerms) return "Для групової СП обери замовлення з однаковими умовами оплати.";
    if (record.incotermsCode !== first.incotermsCode || (record.incotermsPlace ?? "") !== (first.incotermsPlace ?? "")) {
      return "Для групової СП обери замовлення з однаковими умовами Incoterms.";
    }
  }
  return null;
};

type BuildGroupedSpecOptions = {
  /** Підписант замовника у родовому відмінку (Кого?). */
  customerSignatoryNameGenitive?: string;
  /** Посада підписанта у родовому відмінку (Кого?). */
  customerSignatoryRoleGenitive?: string;
};

const buildGroupedSpecificationHtml = (records: DerivedOrderRecord[], options: BuildGroupedSpecOptions = {}) => {
  const first = records[0];
  const rows = records.flatMap((record) =>
    record.items.map((item) => ({
      orderNumber: record.quoteNumber,
      item,
    }))
  );
  const totalWithVat = rows.reduce((sum, row) => sum + Number(row.item.lineTotal || 0), 0);
  const totalWithoutVat = totalWithVat / (1 + SPEC_VAT_RATE / 100);
  const vatAmount = totalWithVat - totalWithoutVat;
  const terms =
    ORDER_PAYMENT_TERMS_OPTIONS.find((item) => item.id === first.paymentTerms) ?? ORDER_PAYMENT_TERMS_OPTIONS[1];
  const advanceAmount = totalWithVat * (terms.advance / 100);
  const balanceAmount = totalWithVat - advanceAmount;
  const deliveryTerms = `${first.incotermsCode || "FCA"} (Incoterms 2020)${
    first.incotermsPlace ? `, ${first.incotermsPlace}` : ""
  }`;
  const dateLabel = formatSpecDate();
  const numberLabel = records.map((record) => record.quoteNumber).join(", ");
  const customerTitle = first.legalEntityLabel || first.customerName;
  const customerSignatoryRole = first.customerSignatoryPosition || "уповноваженої особи";
  // Для тіла документа ("в особі ...") — посада у родовому відмінку, з малої літери.
  const customerSignatoryRoleGenitive = options.customerSignatoryRoleGenitive?.trim() || customerSignatoryRole;
  const customerSignatoryRoleBody = customerSignatoryRoleGenitive
    ? customerSignatoryRoleGenitive.charAt(0).toLocaleLowerCase("uk-UA") + customerSignatoryRoleGenitive.slice(1)
    : customerSignatoryRoleGenitive;
  const customerSignatoryName = first.customerSignatoryName || "Не вказано";
  // Підпис унизу СП — формат "І.П. Прізвище".
  const customerSignatureLabel = toSignatureInitials(first.customerSignatoryName) || customerSignatoryName;
  // Genitive form for body text; fallback to nominative if not supplied.
  const customerSignatoryNameBody = options.customerSignatoryNameGenitive?.trim() || customerSignatoryName;
  const customerAuthority = first.customerSignatoryAuthority || "Не вказано";
  // Статус ПДВ замовника — береться зі ставки в карті клієнта (як у договорі/details-spec).
  const buildVatStatusLabel = (rate?: string | null) => {
    const normalized = (rate ?? "").trim();
    if (!normalized || normalized === "none") return "Не є платником ПДВ.";
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric < 0) return "Не є платником ПДВ.";
    if (numeric === 20) return "Є платником ПДВ на загальних підставах.";
    if (numeric === 0) return "Є платником ПДВ за нульовою ставкою.";
    return `Є платником ПДВ за ставкою ${numeric}%.`;
  };
  const customerVatStatus = buildVatStatusLabel(first.customerVatRate);
  const itemRows = rows
    .map(({ orderNumber, item }, index) => {
      const unitPriceWithVat = Number(item.unitPrice || 0);
      const unitPriceWithoutVat = unitPriceWithVat / (1 + SPEC_VAT_RATE / 100);
      const imageUrl = item.thumbUrl || item.imageUrl || "";
      const details = [
        item.description ? `<div class="muted small">${escapeHtml(item.description)}</div>` : "",
        item.methodsSummary ? `<div class="muted small">Нанесення: ${escapeHtml(item.methodsSummary)}</div>` : "",
        item.catalogSourceUrl ? `<div class="muted tiny">${escapeHtml(item.catalogSourceUrl)}</div>` : "",
      ].join("");
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(orderNumber)}</td>
          <td>${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name)}" />` : ""}<strong>${escapeHtml(item.name)}</strong>${details}</td>
          <td class="num">${escapeHtml(item.qty.toLocaleString("uk-UA"))}</td>
          <td class="num">${escapeHtml(formatPlainMoney(unitPriceWithVat))}</td>
          <td class="num">${escapeHtml(formatPlainMoney(unitPriceWithoutVat))}</td>
          <td class="num">${escapeHtml(formatPlainMoney(item.lineTotal))}</td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
  <html lang="uk">
    <head>
      <meta charset="utf-8" />
      <title>СП ${escapeHtml(numberLabel)}</title>
      <style>
        @page { size: A4; margin: 16mm; }
        body { font-family: Arial, sans-serif; color: #111827; font-size: 12px; line-height: 1.42; }
        h1, h2 { margin: 0; text-align: center; }
        h1 { font-size: 18px; letter-spacing: .04em; }
        h2 { margin-top: 6px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th, td { border: 1px solid #d1d5db; padding: 6px; vertical-align: top; }
        th { background: #f3f4f6; text-align: left; }
        img { display: block; width: 52px; height: 52px; object-fit: cover; border-radius: 6px; border: 1px solid #d1d5db; margin-bottom: 6px; }
        .topline { display: flex; justify-content: space-between; gap: 16px; margin: 18px 0 12px; }
        .section { margin-top: 16px; font-weight: 700; text-transform: uppercase; }
        .muted { color: #4b5563; }
        .small { margin-top: 4px; font-size: 11px; }
        .tiny { margin-top: 4px; font-size: 10px; }
        .num { text-align: right; white-space: nowrap; }
        .totals { margin-left: auto; width: 280px; }
        .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
        .party { border: 1px solid #d1d5db; padding: 10px; min-height: 150px; }
        .signature { margin-top: 32px; border-top: 1px solid #111827; padding-top: 4px; }
      </style>
    </head>
    <body>
      <h1>СПЕЦИФІКАЦІЯ НА ВИГОТОВЛЕННЯ</h1>
      <h2>до замовлень ${escapeHtml(numberLabel)}</h2>
      <div class="topline">
        <div>Дата: ${escapeHtml(dateLabel)}</div>
        <div>Замовник: <strong>${escapeHtml(customerTitle)}</strong></div>
      </div>
      <p>${escapeHtml(CONTRACT_EXECUTOR.companyName)} (надалі Виконавець), в особі ${escapeHtml(CONTRACT_EXECUTOR.signatoryPosition)} ${escapeHtml(CONTRACT_EXECUTOR.signatory)}, яка діє на підставі ${escapeHtml(CONTRACT_EXECUTOR.authority)}, з однієї сторони, та ${escapeHtml(customerTitle)} (надалі Замовник), в особі ${escapeHtml(customerSignatoryRoleBody)} ${escapeHtml(customerSignatoryNameBody)}, що діє на підставі ${escapeHtml(customerAuthority)}, з іншої сторони, підписали цю Специфікацію щодо наступної продукції:</p>
      <table>
        <thead>
          <tr>
            <th style="width:34px;">№</th>
            <th style="width:92px;">Замовлення</th>
            <th>Назва продукції</th>
            <th style="width:70px;">К-сть</th>
            <th style="width:92px;">Ціна з ПДВ</th>
            <th style="width:92px;">Ціна без ПДВ</th>
            <th style="width:100px;">Сума з ПДВ</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table class="totals">
        <tr><td>Разом без ПДВ</td><td class="num">${escapeHtml(formatPlainMoney(totalWithoutVat))} грн</td></tr>
        <tr><td>ПДВ ${SPEC_VAT_RATE}%</td><td class="num">${escapeHtml(formatPlainMoney(vatAmount))} грн</td></tr>
        <tr><td><strong>Разом з ПДВ</strong></td><td class="num"><strong>${escapeHtml(formatPlainMoney(totalWithVat))} грн</strong></td></tr>
      </table>
      <div class="section">Порядок оплати</div>
      <p>Оплата: ${escapeHtml(terms.label)}. Перед запуском: ${terms.advance}% (${escapeHtml(formatPlainMoney(advanceAmount))} грн з ПДВ). Після готовності: ${terms.balance}% (${escapeHtml(formatPlainMoney(balanceAmount))} грн з ПДВ). Спосіб оплати: ${escapeHtml(first.paymentRail)}.</p>
      <div class="section">Доставка</div>
      <p>Доставка продукції здійснюється на умовах ${escapeHtml(deliveryTerms)}.</p>
      <div class="parties">
        <div class="party">
          <strong>ВИКОНАВЕЦЬ</strong>
          <p>${escapeHtml(CONTRACT_EXECUTOR.shortName)}</p>
          <p>Юридична адреса: ${escapeHtml(CONTRACT_EXECUTOR.address)}</p>
          <p>IBAN: ${escapeHtml(CONTRACT_EXECUTOR.iban)}</p>
          <p>${escapeHtml(CONTRACT_EXECUTOR.bank)}</p>
          <p>Код ЄДРПОУ: ${escapeHtml(CONTRACT_EXECUTOR.taxId)}</p>
          <p>ІПН: ${escapeHtml(CONTRACT_EXECUTOR.vatId)}</p>
          <p>${escapeHtml(CONTRACT_EXECUTOR.taxStatus)}</p>
          <p class="signature">${escapeHtml(CONTRACT_EXECUTOR.signatoryPositionDisplay)} ${escapeHtml(CONTRACT_EXECUTOR.signatureLabel)}</p>
        </div>
        <div class="party">
          <strong>ЗАМОВНИК</strong>
          <p>${escapeHtml(customerTitle)}</p>
          <p>Юридична адреса: ${escapeHtml(first.customerLegalAddress || "Не вказано")}</p>
          <p>Код ЄДРПОУ: ${escapeHtml(first.customerTaxId || "Не вказано")}</p>
          <p>ІПН: ${escapeHtml(first.customerVatId || "Не вказано")}</p>
          <p>IBAN: ${escapeHtml(first.customerBankDetails || first.customerIban || "Не вказано")}</p>
          <p>${escapeHtml(customerVatStatus)}</p>
          <p class="signature">${escapeHtml(customerSignatoryRole)} ${escapeHtml(customerSignatureLabel)}</p>
        </div>
      </div>
    </body>
  </html>`;
};

export default function OrdersProductionPage() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { teamId, session, userId } = useAuth();
  const workspacePresence = useWorkspacePresence();
  const desktopKanbanViewportRef = useRef<HTMLDivElement | null>(null);
  /**
   * Кеш читається ОДИН раз, а не на кожен рендер. Доти ці рядки стояли просто в
   * тілі компонента, а `JSON.parse` усього списку виконувався щоразу, хоча
   * значення потрібні лише для початкових станів нижче.
   *
   * ЧЕСНО ПРО ВИГРАШ: на дошці дизайну така сама пара рядків давала 97% ціни
   * одного рендера, бо поруч ішов повний перебір задач. Тут заміряно менше —
   * на «Прорахунках» різниця 1.4-1.6 → 1.2-1.5 мс, тобто в межах шуму. Правка
   * лишається, бо робота однаково марна, а її ціна росте разом із кешем.
   */
  const initialPageState = useMemo(() => {
    const cache = readOrdersProductionPageCache(teamId ?? "");
    const stored = readOrdersProductionPageFiltersState(teamId ?? "");
    return {
      cache,
      filters: shouldRestorePageUiState(navigationType, stored?.cachedAt) ? stored : null,
    };
  }, [teamId, navigationType]);
  const initialCache = initialPageState.cache;
  const restoredFilters = initialPageState.filters;
  const [loading, setLoading] = useState(() => !(initialCache && initialCache.records.length > 0));
  const [refreshing, setRefreshing] = useState(false);
  const [desktopKanbanViewportHeight, setDesktopKanbanViewportHeight] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<DerivedOrderRecord[]>(() => initialCache?.records ?? []);
  const [search, setSearch] = useState(() => restoredFilters?.search ?? "");
  const [headerFilter, setHeaderFilter] = useState<HeaderFilter>(() => restoredFilters?.headerFilter ?? "all");
  const [managerFilter, setManagerFilter] = useState<string>(
    () => restoredFilters?.managerFilter ?? ALL_MANAGERS_FILTER
  );
  const [viewTab, setViewTab] = useState<"queue" | "register">(() => restoredFilters?.viewTab ?? "register");
  const [selectedSpecificationIds, setSelectedSpecificationIds] = useState<string[]>([]);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);

  const openRecord = (record: DerivedOrderRecord) => {
    if (record.source === "stored") {
      navigate(`/orders/production/${record.id}`);
      return;
    }
    navigate(`/orders/estimates/${record.quoteId}`);
  };

  const loadOrders = async () => {
    if (!teamId) return;

    const cached = readOrdersProductionPageCache(teamId);
    const hasCachedRecords = (cached?.records.length ?? 0) > 0;

    if (records.length > 0 || hasCachedRecords) setRefreshing(true);
    else setLoading(true);

    try {
      setError(null);
      const nextRecords = await loadDerivedOrders(teamId, userId);
      setRecords(nextRecords);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          `orders-production-page-cache:${teamId}`,
          JSON.stringify({
            records: nextRecords,
            cachedAt: Date.now(),
          } satisfies OrdersProductionPageCachePayload)
        );
      }
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Не вдалося підготувати реєстр замовлень.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const toggleSpecificationSelection = (record: DerivedOrderRecord, checked: boolean) => {
    if (!checked) {
      setSelectedSpecificationIds((current) => current.filter((id) => id !== record.id));
      return;
    }

    const currentRecords = records.filter((entry) => selectedSpecificationIds.includes(entry.id));
    const nextRecords = currentRecords.some((entry) => entry.id === record.id)
      ? currentRecords
      : [...currentRecords, record];
    const blocker = getSpecificationGroupBlocker(nextRecords);
    if (blocker) {
      setError(blocker);
      return;
    }
    setError(null);
    setSelectedSpecificationIds(nextRecords.map((entry) => entry.id));
  };

  // useCallback, бо вузол шапки мемоїзований: без стабільної функції мемо
  // розсипався б щорендеру й повертав би цикл, який щойно полагодили.
  const openGroupedSpecification = useCallback(async () => {
    if (!teamId) return;
    const selectedRecords = records.filter((record) => selectedSpecificationIds.includes(record.id));
    const blocker = getSpecificationGroupBlocker(selectedRecords);
    if (blocker) {
      setError(blocker);
      return;
    }

    // Відмінюємо ПІБ і посаду підписанта замовника у родовий відмінок (паралельно, з кешем + fallback).
    const first = selectedRecords[0];
    const [customerSignatoryNameGenitive, customerSignatoryRoleGenitive] = await Promise.all([
      first?.customerSignatoryName ? declineToGenitive(first.customerSignatoryName) : Promise.resolve(""),
      first?.customerSignatoryPosition ? declineToGenitive(first.customerSignatoryPosition) : Promise.resolve(""),
    ]);
    const html = buildGroupedSpecificationHtml(selectedRecords, {
      customerSignatoryNameGenitive,
      customerSignatoryRoleGenitive,
    });
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Браузер заблокував відкриття документа. Дозволь popup для цього сайту.");
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
      const objectUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      popup.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }

    try {
      const markedAt = await Promise.all(
        selectedRecords.map((record) =>
          markOrderDocumentCreated({
            teamId,
            orderId: record.id,
            documentKind: "specification",
          })
        )
      );
      const markedById = new Map(selectedRecords.map((record, index) => [record.id, markedAt[index] ?? new Date().toISOString()]));
      setRecords((current) =>
        current.map((record) => {
          const specificationCreatedAt = markedById.get(record.id);
          if (!specificationCreatedAt) return record;
          return {
            ...record,
            specificationCreatedAt,
            docs: {
              ...record.docs,
              specification: true,
            },
          };
        })
      );
    } catch (markError: unknown) {
      setError(markError instanceof Error ? markError.message : "СП відкрито, але не вдалося зберегти позначку створення.");
    }
  }, [records, selectedSpecificationIds, teamId]);

  useEffect(() => {
    if (!teamId) return;
    const cached = readOrdersProductionPageCache(teamId);
    if (cached?.records.length) {
      setRecords(cached.records);
      setLoading(false);
      setError(null);
    }
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, userId]);

  useEffect(() => {
    if (typeof window === "undefined" || !teamId) return;
    sessionStorage.setItem(
      `orders-production-page-filters:${teamId}`,
      JSON.stringify({
        search,
        headerFilter,
        managerFilter,
        viewTab,
        cachedAt: Date.now(),
      } satisfies OrdersProductionPageFiltersState)
    );
  }, [teamId, search, headerFilter, managerFilter, viewTab]);

  const managerFilterOptions = useMemo(
    () =>
      Array.from(
        new Map(
          records
            .filter((record) => record.managerLabel.trim())
            .map((record) => [
              record.managerLabel.trim(),
              {
                id: record.managerLabel.trim(),
                label: record.managerLabel.trim(),
                avatarUrl: record.managerAvatarUrl ?? null,
              },
            ])
        ).values()
      ).sort((a, b) => a.label.localeCompare(b.label, "uk")),
    [records]
  );

  const renderManagerFilterValue = useCallback((value: string) => {
    if (value === ALL_MANAGERS_FILTER) return <span>Всі менеджери</span>;
    const option = managerFilterOptions.find((entry) => entry.id === value) ?? null;
    const label = option?.label ?? value;
    return (
      <span className="flex min-w-0 items-center gap-2">
        <AvatarBase
          src={option?.avatarUrl ?? null}
          name={label}
          fallback={getInitials(label)}
          size={18}
          className="shrink-0 border-border/60"
          fallbackClassName="text-3xs font-semibold"
        />
        <span className="truncate">{label}</span>
      </span>
    );
  }, [managerFilterOptions]);

  const filteredRecords = useMemo(() => {
    const query = normalizeText(search);
    return records.filter((record) => {
      if (headerFilter === "created" && record.source !== "stored") return false;
      if (headerFilter === "ready" && !(record.source !== "stored" && record.readinessColumn === "ready")) return false;
      if (headerFilter === "counterparty" && record.readinessColumn !== "counterparty") return false;
      if (headerFilter === "design" && record.readinessColumn !== "design") return false;
      if (managerFilter !== ALL_MANAGERS_FILTER && record.managerLabel.trim() !== managerFilter) return false;

      if (!query) return true;

      const haystack = [
        record.quoteNumber,
        record.customerName,
        record.paymentRail,
        record.managerLabel,
        record.contactEmail,
        record.contactPhone,
        record.legalEntityLabel,
        record.signatoryLabel,
        ...record.items.map((item) => item.name),
        ...record.blockers,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [headerFilter, managerFilter, records, search]);

  const recordsByColumn = useMemo(() => {
    const map = new Map<(typeof ORDER_READINESS_COLUMNS)[number]["id"], DerivedOrderRecord[]>();
    ORDER_READINESS_COLUMNS.forEach((column) => map.set(column.id, []));
    filteredRecords.forEach((record) => {
      const list = map.get(record.readinessColumn) ?? [];
      list.push(record);
      map.set(record.readinessColumn, list);
    });
    return map;
  }, [filteredRecords]);

  const summary = useMemo(() => {
    const ready = records.filter((record) => record.readinessColumn === "ready").length;
    const counterparty = records.filter((record) => record.readinessColumn === "counterparty").length;
    const design = records.filter((record) => record.readinessColumn === "design").length;
    return {
      total: records.length,
      ready,
      counterparty,
      design,
    };
  }, [records]);

  const selectedSpecificationRecords = useMemo(
    () => records.filter((record) => selectedSpecificationIds.includes(record.id)),
    [records, selectedSpecificationIds]
  );

  const selectedSpecificationBlocker = useMemo(
    () =>
      selectedSpecificationRecords.length > 0
        ? getSpecificationGroupBlocker(selectedSpecificationRecords)
        : null,
    [selectedSpecificationRecords]
  );

  /**
   * Яка САМЕ гілка зараз тримає вузол канбану.
   *
   * `desktopKanbanViewportRef` вішається на різні вузли: на обгортку скелета
   * поки вантажимо, і на дошку після. Гілки з помилкою та з порожнім
   * результатом рефа не мають узагалі. Тобто спостерігача треба перечіпляти
   * тоді, коли МІНЯЄТЬСЯ ГІЛКА, — і тільки тоді.
   *
   * Раніше в залежностях ефекту нижче стояла `filteredRecords.length`. Вона це
   * робила побічно (0 → 44 таки міняє число), але заразом перезапускала весь
   * ефект на КОЖНУ зміну кількості — тобто на кожну літеру в пошуку: зняти
   * слухача, зібрати новий ResizeObserver, повісити його на два вузли,
   * отримати негайний перший виклик, а з нього rAF із getBoundingClientRect по
   * всьому дереву дошки. Пошук цю кількість міняє безперервно, гілку — ні.
   *
   * Заразом лікується давніша дірка: `loading` і `error` у залежностях не було
   * взагалі, тож перечеплення після завантаження працювало лише випадково —
   * через те, що разом із гілкою мінялось і число.
   */
  const kanbanViewportBranch =
    viewTab !== "queue" ? "off" : loading ? "loading" : error ? "error" : filteredRecords.length === 0 ? "empty" : "board";

  useEffect(() => {
    if (viewTab !== "queue") return;
    if (typeof window === "undefined") return;

    const viewport = desktopKanbanViewportRef.current;
    if (!viewport) return;

    let frameId = 0;
    const measure = () => {
      frameId = 0;
      const rect = viewport.getBoundingClientRect();
      const nextHeight = Math.max(320, Math.floor(window.innerHeight - rect.top - 20));
      setDesktopKanbanViewportHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    const scheduleMeasure = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scheduleMeasure();
          })
        : null;

    resizeObserver?.observe(viewport);
    if (viewport.parentElement) {
      resizeObserver?.observe(viewport.parentElement);
    }

    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      if (frameId) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
    };
  }, [kanbanViewportBranch, viewTab]);

  // useMemo обов'язковий: без нього це новий вузол на кожен рендер, і шапка
  // сторінки перезаписується по колу (див. usePageHeaderActions).
  const headerActions = useMemo(() => (
    <UnifiedPageToolbar
      topLeft={
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
            <Factory className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <div className="text-lg font-semibold text-foreground">Замовлення</div>
            <div className="text-sm text-muted-foreground">
              Черга оформлення, оплати, виробництва та відвантаження.
            </div>
          </div>
        </div>
      }
      topRight={
        <>
          {selectedSpecificationIds.length > 0 ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => void openGroupedSpecification()}
              disabled={Boolean(selectedSpecificationBlocker)}
              title={selectedSpecificationBlocker ?? undefined}
              className="w-full sm:w-auto"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>СП з обраних ({selectedSpecificationIds.length})</span>
            </Button>
          ) : null}
          <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full sm:w-auto")}>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={viewTab === "register"}
              onClick={() => setViewTab("register")}
              className={cn(SEGMENTED_TRIGGER, "px-5")}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Список</span>
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={viewTab === "queue"}
              onClick={() => setViewTab("queue")}
              className={cn(SEGMENTED_TRIGGER, "px-5")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Kanban</span>
            </Button>
          </SegmentedGroup>
          <Button
            onClick={() => setCreateOrderOpen(true)}
            className={cn(TOOLBAR_ACTION_BUTTON, "w-full gap-2 sm:w-auto")}
          >
            <Plus className="h-4 w-4" />
            Створити замовлення
          </Button>
        </>
      }
      search={
        <ToolbarSearch
          value={search}
          onChange={setSearch}
          placeholder="Пошук за назвою..."
          loading={(loading || refreshing) && Boolean(search)}
        />
      }
      filters={
        <>
          <ToolbarFilterSelect
            value={headerFilter}
            onValueChange={(value) => setHeaderFilter(value as HeaderFilter)}
            neutralValue="all"
            className="sm:w-[210px]"
            options={HEADER_FILTER_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          />

          <ToolbarFilterSelect
            value={managerFilter}
            onValueChange={setManagerFilter}
            neutralValue={ALL_MANAGERS_FILTER}
            className="sm:w-[210px]"
            options={[
              { value: ALL_MANAGERS_FILTER, label: renderManagerFilterValue(ALL_MANAGERS_FILTER) },
              ...managerFilterOptions.map((manager) => ({
                value: manager.id,
                label: renderManagerFilterValue(manager.id),
              })),
            ]}
          />

          <ActiveHereCard entries={workspacePresence.activeHereEntries} variant="minimal" />
        </>
      }
      meta={<ToolbarMeta count={filteredRecords.length} countLabel="знайдено" />}
    />
  ), [
    openGroupedSpecification,
    renderManagerFilterValue,
    filteredRecords.length,
    headerFilter,
    loading,
    refreshing,
    search,
    viewTab,
    managerFilter,
    managerFilterOptions,
    selectedSpecificationBlocker,
    selectedSpecificationIds,
    workspacePresence.activeHereEntries,
  ]);

  usePageHeaderActions(headerActions, [headerActions]);

  // Гейта на auth loading тут немає свідомо: поки він true, RequireAuth малює
  // оболонку застосунку, і жодна сторінка не монтується. Дубль лише додавав ще
  // один кадр із лоадером (REQ-19).
  if (!session) {
    return <div className="p-6 text-sm text-destructive">User not authenticated</div>;
  }

  if (!teamId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Немає доступної команди. Перевір членство або інвайт.
      </div>
    );
  }

  return (
    <PageCanvas>
      {viewTab === "register" ? (
        <PageCanvasBody className="space-y-6 py-3 pb-20 md:pb-6">
          <div className="grid gap-4 px-5 xl:grid-cols-4">
            <Card className="overflow-hidden border-border/70 bg-card/95 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-muted-foreground">Усі затверджені прорахунки</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight">{summary.total}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            </Card>

            <Card className="tone-success-subtle overflow-hidden p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="tone-text-success text-sm">Готово до замовлення</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                    {summary.ready}
                  </div>
                </div>
                <div className="tone-icon-box-success rounded-xl border p-2.5">
                  <CheckCircle2 className="tone-text-success h-5 w-5" />
                </div>
              </div>
            </Card>

            <Card className="tone-warning-subtle overflow-hidden p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="tone-text-warning text-sm">Лід / реквізити</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                    {summary.counterparty}
                  </div>
                </div>
                <div className="tone-icon-box-warning rounded-xl border p-2.5">
                  <Building2 className="tone-text-warning h-5 w-5" />
                </div>
              </div>
            </Card>

            <Card className="tone-info-subtle overflow-hidden p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="tone-text-info text-sm">Макет / візуал</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                    {summary.design}
                  </div>
                </div>
                <div className="tone-icon-box-info rounded-xl border p-2.5">
                  <Palette className="tone-text-info h-5 w-5" />
                </div>
              </div>
            </Card>
          </div>

          <Tabs value={viewTab}>
            <TabsContent value="register" className="mt-0 space-y-4">
              {loading ? (
                <AppSectionLoader label="Готуємо таблицю замовлень..." variant="table" />
              ) : error ? (
                <div className="px-5">
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="px-5">
                  <Card className="border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
                    Немає записів для відображення у таблиці.
                  </Card>
                </div>
              ) : (
                // overflow-x-auto знято: він гасив липку шапку таблиці.
                <div>
                  <Table variant="list" size="md" stickyHeader className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[58px] pl-6 whitespace-nowrap">СП</TableHead>
                        <TableHead className="w-[160px] whitespace-nowrap">Прорахунок</TableHead>
                        <TableHead className="w-[260px] whitespace-nowrap">Контрагент</TableHead>
                        <TableHead className="w-[180px] whitespace-nowrap">Стан</TableHead>
                        <TableHead className="w-auto">Позиції</TableHead>
                        <TableHead className="w-[160px] whitespace-nowrap">Оплата</TableHead>
                        <TableHead className="w-[150px] whitespace-nowrap">Документи</TableHead>
                        <TableHead className="w-[140px] whitespace-nowrap">Готовність</TableHead>
                        <TableHead className="w-[120px] pr-6 text-right whitespace-nowrap">Сума</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecords.map((record) => {
                        const specificationBlocker = getSpecificationRecordBlocker(record);
                        const selectedForSpecification = selectedSpecificationIds.includes(record.id);
                        return (
                        <TableRow
                          key={record.id}
                          className="cursor-pointer hover:bg-muted/10"
                          onClick={() => openRecord(record)}
                        >
                          <TableCell
                            className="pl-6 align-top"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Checkbox
                              checked={selectedForSpecification}
                              disabled={Boolean(specificationBlocker)}
                              aria-label={`Додати ${record.quoteNumber} до групової СП`}
                              title={specificationBlocker ?? undefined}
                              onCheckedChange={(checked) => toggleSpecificationSelection(record, Boolean(checked))}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="space-y-1">
                              <HoverCopyText
                                value={record.quoteNumber}
                                textClassName="font-mono font-semibold text-sm text-foreground"
                                successMessage="Номер замовлення скопійовано"
                                copyLabel="Скопіювати номер замовлення"
                              >
                                {record.quoteNumber}
                              </HoverCopyText>
                              <div className="text-xs text-muted-foreground">{formatOrderDate(record.updatedAt)}</div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div
                              className="flex items-center gap-3"
                              title={[
                                `Контрагент: ${record.customerName}`,
                                record.legalEntityLabel ? `Юр. особа: ${record.legalEntityLabel}` : null,
                                `Менеджер: ${record.managerLabel.trim() || "не призначено"}`,
                                record.contactEmail ? `Email: ${record.contactEmail}` : null,
                                record.contactPhone ? `Тел.: ${record.contactPhone}` : null,
                              ]
                                .filter(Boolean)
                                .join("\n")}
                            >
                              <EntityAvatar
                                src={record.customerLogoUrl}
                                name={record.customerName}
                                fallback={getInitials(record.customerName)}
                                size={36}
                              />
                              <div className="min-w-0">
                                <div className="truncate font-medium">{record.customerName}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {record.partyType === "customer" ? "Замовник" : "Лід"}
                                </div>
                                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                                  <AvatarBase
                                    src={record.managerAvatarUrl ?? null}
                                    name={record.managerLabel || "?"}
                                    fallback={getInitials(record.managerLabel || "?")}
                                    size={16}
                                    className="border-border/60 shrink-0"
                                    fallbackClassName="text-[8px] font-semibold"
                                  />
                                  <span className="truncate">{record.managerLabel.trim() || "Менеджер не призначений"}</span>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-2xs font-medium",
                                record.source === "stored"
                                  ? "tone-success"
                                  : "border-border/70 bg-muted/20 text-muted-foreground"
                              )}
                            >
                              {record.source === "stored" ? "Створено замовлення" : "Черга з прорахунку"}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top">
                            {record.items.length > 0 ? (
                              <div className="flex min-w-0 items-start gap-2 text-sm">
                                <span className="shrink-0 font-medium text-foreground">{record.itemCount}</span>
                                <span className="mt-0.5 shrink-0 text-muted-foreground">•</span>
                                <span
                                  className="min-w-0 text-muted-foreground leading-5 line-clamp-2 break-words"
                                  title={record.items[0]?.name || "Немає позицій"}
                                >
                                  {record.items[0]?.name || "Немає позицій"}
                                </span>
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">Немає позицій</div>
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="text-sm leading-6 text-foreground break-words line-clamp-3">
                              {record.paymentRail}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex flex-wrap gap-1.5">
                              {renderDocBadge("Договір", record.docs.contract)}
                              {renderDocBadge("Рахунок", record.docs.invoice)}
                              {renderDocBadge("СП", record.docs.specification)}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-2xs font-medium",
                                record.readinessColumn === "ready"
                                  ? "tone-success"
                                  : record.readinessColumn === "design"
                                    ? "tone-info"
                                    : "tone-warning"
                              )}
                            >
                              {record.readinessColumn === "ready"
                                ? "Готово"
                                : record.readinessColumn === "design"
                                  ? "Очікує макет"
                                  : "Потрібні дані"}
                            </Badge>
                          </TableCell>
                          <TableCell className="pr-6 text-right align-top font-semibold text-foreground">
                            {formatOrderMoney(record.total, record.currency)}
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </PageCanvasBody>
      ) : (
        <EstimatesKanbanCanvas className="py-3 pb-3">
          {loading ? (
            <div
              ref={desktopKanbanViewportRef}
              className="min-h-0 overflow-hidden"
              style={
                desktopKanbanViewportHeight
                  ? { height: `${desktopKanbanViewportHeight}px` }
                  : undefined
              }
            >
              <KanbanSkeleton
                columns={ORDER_READINESS_COLUMNS.map((column) => ({
                  id: column.id,
                  label: column.label,
                  className: "basis-1/3",
                }))}
              />
            </div>
          ) : error ? (
              <div className="mx-5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : filteredRecords.length === 0 ? (
              <Card className="mx-5 border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
                У затверджених прорахунках поки немає записів для формування замовлень.
              </Card>
            ) : (
              <div
                ref={desktopKanbanViewportRef}
                className="min-h-0 overflow-hidden"
                style={
                  desktopKanbanViewportHeight
                    ? { height: `${desktopKanbanViewportHeight}px` }
                    : undefined
                }
              >
                <KanbanBoard className="h-full pb-2 md:pb-3" rowClassName="h-full items-stretch">
                  {ORDER_READINESS_COLUMNS.map((column) => {
                    const columnRecords = recordsByColumn.get(column.id) ?? [];
                    return (
                      <KanbanColumn
                        key={column.id}
                        className={cn(
                          "kanban-column-surface basis-1/3 shrink-0 flex flex-col h-full"
                        )}
                        bodyClassName="px-2.5 pb-1.5 pt-2.5 space-y-2"
                        header={
                          <div className="kanban-column-header flex items-center justify-between gap-2 px-3.5 py-3 shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", column.dotClass)} />
                              <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground truncate">
                                {column.label}
                              </span>
                            </div>
                            <span className="text-2xs font-semibold tabular-nums text-muted-foreground/80">
                              {columnRecords.length}
                            </span>
                          </div>
                        }
                      >
                        {columnRecords.length === 0 ? (
                          <div className="kanban-empty-state rounded-md border border-dashed border-border/50 px-3 py-6 text-center text-2xs text-muted-foreground/70">
                            {column.description}
                          </div>
                        ) : (
                          columnRecords.map((record) => (
                            <KanbanCard
                              key={record.id}
                              surface="raised"
                              density="roomy"
                              className="overflow-hidden"
                              onClick={() => openRecord(record)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <EntityAvatar
                                    src={record.customerLogoUrl}
                                    name={record.customerName}
                                    fallback={getInitials(record.customerName)}
                                    size={40}
                                  />
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-foreground">
                                      {record.customerName}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground">
                                      <HoverCopyText
                                        value={record.quoteNumber}
                                        textClassName="font-medium"
                                        successMessage="Номер замовлення скопійовано"
                                        copyLabel="Скопіювати номер замовлення"
                                      >
                                        {record.quoteNumber}
                                      </HoverCopyText>{" "}
                                      • {formatOrderMoney(record.total, record.currency)}
                                    </div>
                                  </div>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "shrink-0 rounded-full px-2 py-0.5 text-3xs font-semibold",
                                    record.readinessColumn === "ready"
                                      ? "tone-success"
                                      : record.readinessColumn === "design"
                                        ? "tone-info"
                                        : "tone-warning"
                                  )}
                                >
                                  {record.readinessColumn === "ready" ? "Готово" : "Увага"}
                                </Badge>
                              </div>

                              <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <AvatarBase
                                    src={record.managerAvatarUrl ?? null}
                                    name={record.managerLabel}
                                    fallback={getInitials(record.managerLabel)}
                                    size={20}
                                    className="border-border/60 shrink-0"
                                    fallbackClassName="text-3xs font-semibold"
                                  />
                                  <span className="truncate">{record.managerLabel.trim() || "Менеджер не призначений"}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Wallet className="h-3.5 w-3.5" />
                                  <span className="truncate">{record.paymentRail}</span>
                                </div>
                                <div>{record.itemCount} позицій для переносу в замовлення</div>
                                <div className="flex items-center gap-2">
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  <span className="truncate">
                                    {!record.requiresDesignApproval
                                      ? "Товар без нанесення — дизайн не потрібен"
                                      : record.hasApprovedVisualization && record.hasApprovedLayout
                                        ? "Візуал і макет погоджені"
                                        : "Дизайн потребує підтвердження"}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                {renderDocBadge("Договір", record.docs.contract)}
                                {renderDocBadge("Рахунок", record.docs.invoice)}
                                {renderDocBadge("СП", record.docs.specification)}
                                {renderDocBadge("Техкарта", record.docs.techCard)}
                              </div>

                              {record.blockers.length > 0 ? (
                                <div className="tone-warning-subtle mt-4 rounded-xl border p-3">
                                  <div className="tone-text-warning mb-2 flex items-center gap-2 text-xs font-semibold">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Що блокує переведення у замовлення
                                  </div>
                                  <div className="tone-text-warning space-y-1 text-xs leading-5">
                                    {record.blockers.slice(0, 3).map((blocker) => (
                                      <div key={blocker}>{blocker}</div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="tone-success-subtle tone-text-success mt-4 rounded-xl border p-3 text-xs font-medium">
                                  Умови виконані. Можна створювати пакет документів і переводити в замовлення.
                                </div>
                              )}
                            </KanbanCard>
                          ))
                        )}
                      </KanbanColumn>
                    );
                  })}
                </KanbanBoard>
              </div>
            )}
        </EstimatesKanbanCanvas>
      )}

      <CreateManualOrderDialog
        open={createOrderOpen}
        onOpenChange={setCreateOrderOpen}
        onCreated={({ id }) => {
          void loadOrders();
          navigate(`/orders/production/${id}`);
        }}
      />
    </PageCanvas>
  );
}
