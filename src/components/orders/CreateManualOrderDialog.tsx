import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { AvatarBase } from "@/components/app/avatar-kit";
import {
  CustomerLeadPicker,
  getCreatedCustomerLeadLabel,
  useCustomerLeadCreate,
  type CustomerLeadOption,
} from "@/components/customers";
import { Loader2 } from "@/components/icons/appIcons";
import {
  QuoteDeliveryFields,
  createEmptyQuoteDeliveryDetails,
  getQuoteDeliveryIssues,
  sanitizeQuoteDeliveryDetails,
  type QuoteDeliveryDetails,
} from "@/components/quotes/QuoteDeliveryFields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UnsavedChangesPrompt } from "@/components/ui/unsaved-guard";
import { DEFAULT_ORDER_EXECUTOR, grossFromNet, netFromGross } from "@/features/orders/orderExecutor";
import {
  findCustomerLastLegalEntityId,
  listOrderLegalEntities,
  type OrderLegalEntityOption,
} from "@/features/orders/orderLegalEntityQueries";
import { OrderPayHowSelect } from "@/features/orders/OrderPayHowSelect";
import { prepaymentPct } from "@/features/orders/orderPayments";
import {
  createManualOrder,
  formatOrderMoney,
  formatOrderMoneyExact,
  listCustomerDesignTasks,
  type CustomerDesignTaskOption,
  type ManualOrderDesignChoice,
} from "@/features/orders/orderRecords";
import {
  bankPaymentMethodFor,
  fromPayHowValue,
  getAllowedPaymentTermsOptions,
  isCashLikePaymentMethod,
  isCashlessPaymentMethod,
  toPayHowValue,
} from "@/features/orders/paymentRules";
import { QuoteItemCommandField } from "@/features/quotes/quote-wizard/QuoteItemCommandField";
import type { Json } from "@/lib/database.types";
import type { DesignTaskType } from "@/lib/designTaskType";
import { listCustomersBySearch, type CustomerRow } from "@/lib/toshoApi";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";

import {
  buildManualOrderItems,
  createManualOrderService,
  findManualOrderIssue,
  type ManualOrderDraftService,
} from "./manual-order/manualOrderDraft";
import { storeItemImages, type StoredItemImage } from "./manual-order/manualOrderImages";
import {
  ManualOrderDesignSection,
  MemberSelectItem,
  NO_ASSIGNEE,
  type DesignMode,
  type MemberOption,
} from "./manual-order/ManualOrderDesignSection";
import { ManualOrderItemRow, ManualOrderServiceRow, amountOf, issueRing } from "./manual-order/ManualOrderItemRow";
import {
  ManualOrderEmptyStart,
  ManualOrderQuickServices,
  ManualOrderServiceDocuments,
} from "./manual-order/ManualOrderServiceEntry";
import { useManualOrderProducts } from "./manual-order/useManualOrderProducts";

type CurrencyCode = "UAH" | "USD" | "EUR";

const CURRENCY_OPTIONS: Array<{ id: CurrencyCode; label: string }> = [
  { id: "UAH", label: "₴ UAH" },
  { id: "USD", label: "$ USD" },
  { id: "EUR", label: "€ EUR" },
];

const DELIVERY_OPTIONS = [
  { value: "nova_poshta", label: "Нова пошта" },
  { value: "pickup", label: "Самовивіз" },
  { value: "taxi", label: "Таксі / Uklon" },
  { value: "cargo", label: "Вантажне перевезення" },
];

const NO_DELIVERY = "__none__";
const DEFAULT_DESIGN_DEADLINE_TIME = "10:00";

const defaultPaymentMethod = (currency: CurrencyCode, customerPaymentType?: string | null) =>
  customerPaymentType === "cash" ? "cash" : bankPaymentMethodFor(currency);

type SelectedCustomer = { id: string; name: string; logoUrl: string | null };

const NUDGE = "animate-control-nudge";

/**
 * Показати поле, до якого привів натиск «Створити»: докрутити, хитнути й поставити
 * курсор. Хитання перезапускаємо вручну, а не через `key`: перемонтування поля
 * забрало б із нього фокус і набране.
 */
function revealIssueField(root: HTMLElement | null, id: string) {
  const node = root?.querySelector<HTMLElement>(`[data-issue="${CSS.escape(id)}"]`);
  if (!node) return;
  node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  node.classList.remove(NUDGE);
  void node.offsetWidth;
  node.classList.add(NUDGE);
  node.addEventListener("animationend", () => node.classList.remove(NUDGE), { once: true });

  // Колір обирають плитками, а сторінку товару читає сайт: курсору там нема куди стати.
  if (id.startsWith("color:") || id.startsWith("pending:") || id === "customer" || id === "design") return;
  const fields = node.matches("input,textarea,button")
    ? [node]
    : Array.from(node.querySelectorAll<HTMLElement>("input,textarea,button,[role='combobox']"));
  const target = fields.find((field) => field instanceof HTMLInputElement && !field.value) ?? fields[0];
  target?.focus({ preventScroll: true });
}

function SideSection({ title, hidden, children }: { title: string; hidden?: boolean; children: ReactNode }) {
  if (hidden) return null;
  return (
    <section className="space-y-2.5 border-b border-border/60 px-4 py-3.5 last:border-b-0">
      <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Куди піде замовлення після створення: етап «Дизайн» чекає лише нову задачу. */
function stageLine(hasPrint: boolean, designMode: DesignMode) {
  const designPending = hasPrint && designMode === "create";
  const design = !hasPrint || designMode === "none" ? "не потрібен" : designPending ? "буде створено" : "готовий";
  return `Замовлення → Дизайн: ${design} → Виробництво: ${designPending ? "після дизайну" : "далі"}`;
}

export type CreateManualOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: { id: string; orderNumber: string }) => void;
};

export function CreateManualOrderDialog({ open, onOpenChange, onCreated }: CreateManualOrderDialogProps) {
  const { teamId, userId } = useAuth();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Замовник
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRow[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [selectedCustomerPaymentType, setSelectedCustomerPaymentType] = useState<string | null>(null);

  // Менеджер / гроші
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [managerUserId, setManagerUserId] = useState<string>("");
  const [currency, setCurrency] = useState<CurrencyCode>("UAH");
  const [paymentMethodId, setPaymentMethodId] = useState<string>(defaultPaymentMethod("UAH"));
  const paymentMethodTouched = useRef(false);
  const [paymentTerms, setPaymentTerms] = useState<string>("70/30");
  // Юрособа «За рахунком» (REQ-322#p1, p17): за замовчуванням — з останнього замовлення замовника.
  const [legalEntityOptions, setLegalEntityOptions] = useState<OrderLegalEntityOption[]>([]);
  const [ourLegalEntityId, setOurLegalEntityId] = useState<string>("");
  const legalEntityTouched = useRef(false);
  const legalEntityLookupFor = useRef<string | null>(null);
  // Показане у виборі = те, що піде в замовлення: без вибору це ТОВ.
  const shownLegalEntityId =
    ourLegalEntityId || legalEntityOptions.find((option) => option.executor.kind === "llc")?.row.id || "";

  // Логістика / пакування
  const [deliveryType, setDeliveryType] = useState<string>("");
  const [deliveryDetails, setDeliveryDetails] = useState<QuoteDeliveryDetails>(() => createEmptyQuoteDeliveryDetails());
  const [packaging, setPackaging] = useState<string>("");

  // Товари
  const products = useManualOrderProducts(teamId ?? "", open);
  const { drafts: items, previews, reset: resetProducts } = products;
  const [fieldValue, setFieldValue] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [services, setServices] = useState<ManualOrderDraftService[]>([]);
  // Підтверджено саме цю суму від цієї юрособи: змінилась сума чи юрособа — галочка знімається сама.
  const [confirmedPricesKey, setConfirmedPricesKey] = useState<string | null>(null);
  // Скопійовані фото переживають помилку збереження: вдруге по них не йдемо.
  const storedImages = useRef(new Map<string, StoredItemImage>());

  // Дизайн
  const [designMode, setDesignMode] = useState<DesignMode>("create");
  const [designTasks, setDesignTasks] = useState<CustomerDesignTaskOption[]>([]);
  const [designTasksLoading, setDesignTasksLoading] = useState(false);
  const [selectedDesignTaskId, setSelectedDesignTaskId] = useState<string>("");
  const [designPickerOpen, setDesignPickerOpen] = useState(false);
  const [showAllDesigns, setShowAllDesigns] = useState(false);
  const [createDesignType, setCreateDesignType] = useState<DesignTaskType>("visualization");
  const [createDesignBrief, setCreateDesignBrief] = useState<string>("");
  const [createDesignAssignee, setCreateDesignAssignee] = useState<string>(NO_ASSIGNEE);
  const [createDesignDeadline, setCreateDesignDeadline] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Натиск «Створити» з пропуском. Новий об'єкт на кожен натиск: другий клік хитає поле знову.
  const [attempt, setAttempt] = useState<{ id: string } | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Кожне відкриття — чиста форма. Тіло прямо в ефекті, а не в useCallback: ручна
  // мемоізація тут не збігалась із виведеною компілятором і вимикала його для всього вікна.
  useEffect(() => {
    if (!open) return;
    setCustomerOpen(false);
    setCustomerSearch("");
    setCustomerResults([]);
    setSelectedCustomer(null);
    setSelectedCustomerPaymentType(null);
    setCurrency("UAH");
    setPaymentMethodId(defaultPaymentMethod("UAH"));
    paymentMethodTouched.current = false;
    setPaymentTerms("70/30");
    setDeliveryType("");
    setDeliveryDetails(createEmptyQuoteDeliveryDetails());
    setPackaging("");
    resetProducts();
    setFieldValue("");
    setFieldError(null);
    setServices([]);
    setConfirmedPricesKey(null);
    storedImages.current = new Map();
    setDesignMode("create");
    setDesignTasks([]);
    setSelectedDesignTaskId("");
    setDesignPickerOpen(false);
    setShowAllDesigns(false);
    setCreateDesignType("visualization");
    setCreateDesignBrief("");
    setCreateDesignAssignee(NO_ASSIGNEE);
    setCreateDesignDeadline("");
    setError(null);
    setSubmitting(false);
    setAttempt(null);
    setConfirmingCancel(false);
    setManagerUserId(userId ?? "");
  }, [open, userId, resetProducts]);

  useEffect(() => {
    if (!open || !teamId) return;
    let active = true;
    legalEntityTouched.current = false;
    setOurLegalEntityId("");
    listOrderLegalEntities(teamId)
      .then((rows) => {
        if (active) setLegalEntityOptions(rows);
      })
      .catch(() => {
        if (active) setLegalEntityOptions([]);
      });
    return () => {
      active = false;
    };
  }, [open, teamId]);

  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    void (async () => {
      const workspaceId = await resolveWorkspaceId(userId);
      if (!workspaceId || !active) return;
      const rows = await listWorkspaceMembersForDisplay(workspaceId);
      if (!active) return;
      setMembers(rows.map((row) => ({ userId: row.userId, label: row.label, avatarUrl: row.avatarDisplayUrl ?? null })));
    })();
    return () => {
      active = false;
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open || !teamId) return;
    const term = customerSearch.trim();
    let active = true;
    setCustomerLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const rows = await listCustomersBySearch(teamId, term);
        if (active) setCustomerResults(rows);
      } catch {
        if (active) setCustomerResults([]);
      } finally {
        if (active) setCustomerLoading(false);
      }
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [open, teamId, customerSearch]);

  const customerOptions = useMemo<CustomerLeadOption[]>(
    () =>
      customerResults.map((customer) => ({
        id: customer.id,
        label: customer.name?.trim() || customer.legal_name?.trim() || "Без назви",
        entityType: "customer",
        logoUrl: customer.logo_url ?? null,
        legalName: customer.legal_name ?? null,
      })),
    [customerResults]
  );

  const applyCustomer = (customer: SelectedCustomer | null, paymentType: string | null) => {
    setSelectedCustomer(customer);
    setSelectedCustomerPaymentType(paymentType);
    setSelectedDesignTaskId("");
    legalEntityLookupFor.current = customer?.id ?? null;
    if (!customer) return;
    if (teamId && !legalEntityTouched.current) {
      void findCustomerLastLegalEntityId(teamId, customer.id).then((entityId) => {
        if (legalEntityTouched.current || legalEntityLookupFor.current !== customer.id) return;
        setOurLegalEntityId(entityId ?? "");
      });
    }
    if (!paymentMethodTouched.current) setPaymentMethodId(defaultPaymentMethod(currency, paymentType));
  };

  // Те саме вікно створення, що скрізь: у замовника свої правила, і окрема
  // форма поруч мовчки їх обійшла б.
  const customerCreate = useCustomerLeadCreate({
    teamId,
    defaultManagerLabel: members.find((member) => member.userId === userId)?.label ?? "",
    onCreated: (created) => {
      const name = getCreatedCustomerLeadLabel(created);
      setCustomerSearch(name);
      applyCustomer({ id: created.id, name, logoUrl: created.logoUrl ?? null }, null);
    },
  });

  const hasPrint = items.some((item) => item.imprints.length > 0);
  /** Лише послуги (дизайн, фото): без виробництва, логістики й пакування. */
  const serviceOnly = items.length === 0 && services.length > 0;
  const shownDeliveryType = serviceOnly ? "" : deliveryType;
  const addService = (name = "") => setServices((cur) => [...cur, { ...createManualOrderService(), name }]);

  // Готові дизайни Замовника — щойно обрано замовника (не чекаємо на друк, щоб не «зникали»).
  useEffect(() => {
    if (!open || !teamId || !selectedCustomer) {
      setDesignTasks([]);
      return;
    }
    let active = true;
    setDesignTasksLoading(true);
    void (async () => {
      try {
        const rows = await listCustomerDesignTasks(teamId, selectedCustomer.id);
        if (active) setDesignTasks(rows);
      } catch {
        if (active) setDesignTasks([]);
      } finally {
        if (active) setDesignTasksLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, teamId, selectedCustomer]);

  // На готівці передоплата не менше 50% (погоджено СЕО 14.10.2026), тож «100% після
  // готовності» зникає зі списку, а вже обрана недоступна умова скидається на 70/30 —
  // ще під час рендера (70/30 дозволено завжди, тож це один крок, а не цикл).
  const paymentTermsOptions = useMemo(() => getAllowedPaymentTermsOptions(paymentMethodId), [paymentMethodId]);
  if (!paymentTermsOptions.some((option) => option.id === paymentTerms)) setPaymentTerms("70/30");

  const handleCurrencyChange = (next: CurrencyCode) => {
    setCurrency(next);
    if (!paymentMethodTouched.current) setPaymentMethodId(defaultPaymentMethod(next, selectedCustomerPaymentType));
    // «За рахунком» уже обрано руками — гривня чи валюта йде за полем «Валюта».
    else if (isCashlessPaymentMethod(paymentMethodId, null)) setPaymentMethodId(bankPaymentMethodFor(next));
  };

  const handlePayHowChange = (value: string) => {
    const next = fromPayHowValue(value, currency);
    paymentMethodTouched.current = true;
    setPaymentMethodId(next.methodId);
    if (next.legalEntityId) {
      legalEntityTouched.current = true;
      setOurLegalEntityId(next.legalEntityId);
    }
  };

  // Безготівка: перед створенням менеджер підтверджує суму й ПДВ — від неї підуть СП і рахунок.
  const isCashless = isCashlessPaymentMethod(paymentMethodId, null);
  const shownExecutor =
    legalEntityOptions.find((option) => option.row.id === shownLegalEntityId)?.executor ?? DEFAULT_ORDER_EXECUTOR;
  // Платнику ПДВ ціну вписують БЕЗ ПДВ — так її мислять менеджер і бухгалтерія,
  // а BAS додає податок сам. Замовлення ж зберігає ціну з ПДВ: її рахує CRM (REQ-339).
  const pricesExclVat = isCashless && shownExecutor.vatPayer;
  const storedUnitPrice = (entered: string) => grossFromNet(amountOf(entered), pricesExclVat);
  const lines = [...items, ...services];
  const orderTotal = lines.reduce((sum, line) => sum + amountOf(line.qty) * storedUnitPrice(line.unitPrice), 0);
  const orderNetTotal = lines.reduce((sum, line) => sum + amountOf(line.qty) * amountOf(line.unitPrice), 0);
  const orderVatAmount = pricesExclVat ? orderTotal - orderNetTotal : 0;
  /** Ціна з каталогу — з ПДВ; у поле «без ПДВ» кладемо її нетто. */
  const seedPrice = (catalogPrice: number) => String(netFromGross(catalogPrice, pricesExclVat));
  const updateService = (key: string, patch: Partial<ManualOrderDraftService>) =>
    setServices((cur) => cur.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const pricesKey = `${orderTotal}|${currency}|${shownLegalEntityId}`;
  const pricesConfirmed = confirmedPricesKey === pricesKey;
  const advancePct = prepaymentPct({ paymentTerms });

  const issue = findManualOrderIssue({
    hasCustomer: Boolean(selectedCustomer),
    items,
    services,
    previews,
    amountOf,
    isCashless,
    orderTotal,
    hasPrint,
    designMode,
    selectedDesignTaskId,
    deliveryIssue: shownDeliveryType ? getQuoteDeliveryIssues(shownDeliveryType, deliveryDetails) : null,
    pricesConfirmed,
  });
  // Червоне лише після натиску й лише поки цей пропуск лишається першим.
  const issueId = attempt && issue?.id === attempt.id ? attempt.id : null;

  useEffect(() => {
    if (!attempt) return;
    if (attempt.id === "customer") setCustomerOpen(true);
    if (attempt.id === "design") setDesignPickerOpen(true);
    revealIssueField(rootRef.current, attempt.id);
  }, [attempt]);

  const isDirty = Boolean(
    selectedCustomer ||
      items.length > 0 ||
      services.length > 0 ||
      deliveryType ||
      packaging.trim() ||
      createDesignBrief.trim()
  );

  /** Підставити товар, для якого робився обраний дизайн. Сама задача товар не зберігає. */
  const applyDesignProduct = () => {
    const modelId = designTasks.find((task) => task.id === selectedDesignTaskId)?.product?.catalogModelId;
    if (!modelId) return;
    setError(products.addCatalogModel(modelId, seedPrice) ? null : "Не вдалося знайти цей товар у каталозі: додайте його вручну.");
  };

  const handleSubmit = async () => {
    if (issue) {
      setAttempt({ id: issue.id });
      return;
    }
    if (!teamId || !selectedCustomer) return;

    let design: ManualOrderDesignChoice = { mode: "none" };
    if (hasPrint && designMode === "existing") {
      const picked = designTasks.find((task) => task.id === selectedDesignTaskId) ?? null;
      design = {
        mode: "existing",
        designTaskId: selectedDesignTaskId,
        designTaskNumber: picked?.number ?? null,
        designApproved: picked?.isApproved ?? false,
      };
    } else if (hasPrint && designMode === "create") {
      const assigneeUserId = createDesignAssignee === NO_ASSIGNEE ? null : createDesignAssignee;
      design = {
        mode: "create",
        designTaskType: createDesignType,
        brief: createDesignBrief.trim() || null,
        assigneeUserId,
        assigneeLabel: assigneeUserId ? (members.find((m) => m.userId === assigneeUserId)?.label ?? null) : null,
        deadline: createDesignDeadline ? `${createDesignDeadline}T${DEFAULT_DESIGN_DEADLINE_TIME}:00` : null,
      };
    }

    setSubmitting(true);
    setError(null);
    try {
      const shownImage = (key: string) => {
        const preview = previews[key];
        return preview?.status === "done" ? preview.imageUrl : null;
      };
      // Фото каталогу вже наше; чуже копіюємо, інакше за місяць у картці порвана картинка.
      const copied = await storeItemImages(
        teamId,
        items.flatMap((item) => {
          const url = item.catalog?.modelId ? null : shownImage(item.key);
          return url ? [{ key: item.key, url }] : [];
        }),
        storedImages.current
      );
      const payloadItems = buildManualOrderItems(items, services, {
        amountOf,
        storedUnitPrice,
        methodName: (kindId, methodId) =>
          products.optionsByKind[kindId]?.methods.find((method) => method.id === methodId)?.name ?? null,
        placeLabel: (kindId, positionId) =>
          products.placesByKind[kindId]?.find((place) => place.id === positionId)?.label ?? null,
        images: (key) => {
          const url = shownImage(key);
          return copied.get(key) ?? { imageUrl: url, thumbUrl: url };
        },
      });
      const result = await createManualOrder({
        teamId,
        userId,
        managerUserId: managerUserId || userId,
        managerLabel: members.find((member) => member.userId === managerUserId)?.label ?? null,
        customerId: selectedCustomer.id,
        currency,
        paymentMethodId,
        paymentTerms,
        incotermsCode: "FCA",
        deliveryType: shownDeliveryType || null,
        deliveryDetails: shownDeliveryType
          ? (sanitizeQuoteDeliveryDetails(shownDeliveryType, deliveryDetails) as unknown as Json)
          : null,
        packaging: serviceOnly ? null : packaging.trim() || null,
        design,
        ourLegalEntityId: isCashless ? shownLegalEntityId || null : null,
        items: payloadItems,
      });
      onCreated({ id: result.id, orderNumber: result.orderNumber });
      onOpenChange(false);
    } catch (submitError: unknown) {
      // Помилка бази — не `Error`, а об'єкт із `message`: перевірка на тип її губила.
      const message = (submitError as { message?: unknown } | null)?.message;
      setError(typeof message === "string" && message.trim() ? message : "База не відповіла.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={rootRef}
        isDirty={isDirty}
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1120px] sm:p-0 lg:h-[min(92vh,47.5rem)]"
      >
        <DialogHeader className="flex flex-col gap-1 space-y-0 border-b border-border/60 px-5 py-3 text-left lg:flex-row lg:items-baseline lg:gap-4 lg:pr-12">
          <DialogTitle>Замовлення без прорахунку</DialogTitle>
          <DialogDescription className="sr-only">
            Пряме замовлення: ліворуч замовник, оплата, дизайн і логістика, праворуч товари.
          </DialogDescription>
          <p className="text-xs text-muted-foreground">
            {serviceOnly ? "Замовлення на послуги · без виробництва й доставки" : stageLine(hasPrint, designMode)}
          </p>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <aside className="shrink-0 border-b border-border/60 lg:w-80 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <SideSection title="Замовник">
              <div
                data-issue="customer"
                className={cn("[&>button]:w-full [&>button]:justify-start", issueRing(issueId === "customer"))}
              >
                <CustomerLeadPicker
                  open={customerOpen}
                  onOpenChange={setCustomerOpen}
                  selectedLabel={selectedCustomer?.name ?? ""}
                  selectedType="customer"
                  selectedLogoUrl={selectedCustomer?.logoUrl ?? null}
                  searchValue={customerSearch}
                  onSearchChange={setCustomerSearch}
                  options={customerOptions}
                  loading={customerLoading}
                  chipLabel="Оберіть Замовника"
                  searchPlaceholder="Пошук замовника..."
                  popoverClassName="w-72 p-2"
                  onSelect={(option) => {
                    const row = customerResults.find((customer) => customer.id === option.id);
                    applyCustomer(
                      { id: option.id, name: option.label, logoUrl: option.logoUrl ?? null },
                      row?.payment_type ?? null
                    );
                  }}
                  onCreateCustomer={(name) => customerCreate.openCustomerCreate(name)}
                  onClear={() => applyCustomer(null, null)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Менеджер</Label>
                <Select value={managerUserId} disabled={submitting} onValueChange={setManagerUserId}>
                  <SelectTrigger controlSize="sm">
                    {(() => {
                      const manager = members.find((member) => member.userId === managerUserId);
                      return manager ? (
                        <span className="flex min-w-0 items-center gap-2">
                          <AvatarBase
                            src={manager.avatarUrl}
                            name={manager.label}
                            fallback={manager.label.slice(0, 1).toUpperCase()}
                            size={18}
                            className="border-border/60"
                            fallbackClassName="text-3xs font-semibold"
                          />
                          <span className="truncate">{manager.label}</span>
                        </span>
                      ) : (
                        <SelectValue placeholder="Оберіть менеджера" />
                      );
                    })()}
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <MemberSelectItem key={member.userId} member={member} />
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </SideSection>

            <SideSection title="Оплата">
              <div className="space-y-1">
                <Label htmlFor="manual-order-pay-how" className="text-xs text-muted-foreground">
                  Як платить
                </Label>
                <OrderPayHowSelect
                  id="manual-order-pay-how"
                  value={toPayHowValue(paymentMethodId, shownLegalEntityId)}
                  onChange={handlePayHowChange}
                  legalEntityOptions={legalEntityOptions}
                />
              </div>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs text-muted-foreground">Умови</Label>
                  <Select value={paymentTerms} disabled={submitting} onValueChange={setPaymentTerms}>
                    <SelectTrigger controlSize="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentTermsOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Валюта</Label>
                  <Select
                    value={currency}
                    disabled={submitting}
                    onValueChange={(value) => handleCurrencyChange(value as CurrencyCode)}
                  >
                    <SelectTrigger controlSize="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {isCashless
                  ? `Договір, СП, рахунок і акт підуть від цієї юрособи, ${currency === "UAH" ? "у гривні" : "у валюті"}.`
                  : isCashLikePaymentMethod(paymentMethodId)
                    ? "Без договору, СП і рахунку. Передоплата не менше 50%."
                    : "Без договору, СП і рахунку."}
              </p>
            </SideSection>

            {serviceOnly ? (
              <p className="mx-4 my-3.5 rounded-lg border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
                Дизайн, логістика й пакування сховані: у замовленні лише послуги.
              </p>
            ) : null}

            <SideSection title="Дизайн" hidden={serviceOnly}>
              <ManualOrderDesignSection
                hasPrint={hasPrint}
                mode={designMode}
                onModeChange={setDesignMode}
                disabled={submitting}
                highlighted={issueId === "design"}
                pickerOpen={designPickerOpen}
                onPickerOpenChange={setDesignPickerOpen}
                tasks={designTasks}
                tasksLoading={designTasksLoading}
                selectedTaskId={selectedDesignTaskId}
                onSelectTask={setSelectedDesignTaskId}
                showAll={showAllDesigns}
                onToggleShowAll={() => setShowAllDesigns((value) => !value)}
                onApplyProduct={applyDesignProduct}
                type={createDesignType}
                onTypeChange={setCreateDesignType}
                assignee={createDesignAssignee}
                onAssigneeChange={setCreateDesignAssignee}
                deadline={createDesignDeadline}
                onDeadlineChange={setCreateDesignDeadline}
                brief={createDesignBrief}
                onBriefChange={setCreateDesignBrief}
                members={members}
              />
            </SideSection>

            <SideSection title="Логістика" hidden={serviceOnly}>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Спосіб доставки</Label>
                <Select
                  value={deliveryType || NO_DELIVERY}
                  disabled={submitting}
                  onValueChange={(value) => setDeliveryType(value === NO_DELIVERY ? "" : value)}
                >
                  <SelectTrigger controlSize="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DELIVERY}>Не вказано</SelectItem>
                    {DELIVERY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {deliveryType ? (
                <div data-issue="delivery" className={cn(issueRing(issueId === "delivery"))}>
                  <QuoteDeliveryFields
                    stacked
                    deliveryType={deliveryType}
                    details={deliveryDetails}
                    onChange={(patch) => setDeliveryDetails((prev) => ({ ...prev, ...patch }))}
                    savedPoints={[]}
                    saveToCard={false}
                    onSaveToCardChange={() => {}}
                    canSaveToCard={false}
                  />
                </div>
              ) : null}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Пакування</Label>
                <Input
                  value={packaging}
                  disabled={submitting}
                  controlSize="sm"
                  placeholder="Напр.: індивідуальна коробка"
                  onChange={(event) => setPackaging(event.target.value)}
                />
              </div>
            </SideSection>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 lg:overflow-y-auto">
            <div data-issue="items" className={cn(issueRing(issueId === "items"))}>
              <QuoteItemCommandField
                teamId={teamId ?? ""}
                value={fieldValue}
                onValueChange={(next) => {
                  setFieldValue(next);
                  setFieldError(null);
                }}
                suggestions={products.catalog.suggestions}
                suggestionsLoading={products.catalog.loading}
                disabled={submitting}
                busy={products.busy}
                hasDrafts={items.length > 0}
                onPickCatalog={(suggestion) => products.pickCatalog(suggestion, seedPrice)}
                onAddLinks={(urls) => void products.addLinks(urls)}
                onAddName={products.addName}
                onPickSupplier={products.pickSupplier}
                onAddService={addService}
                onInvalid={setFieldError}
              />
            </div>
            {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
            <ManualOrderQuickServices onAdd={addService} disabled={submitting} />

            {items.length === 0 && services.length === 0 ? (
              <ManualOrderEmptyStart
                disabled={submitting}
                onProduct={() => rootRef.current?.querySelector<HTMLInputElement>('[data-issue="items"] input')?.focus()}
                onService={() => addService()}
              />
            ) : (
              <>
                {items.map((draft) => {
                  const kindId = draft.catalog?.kindId;
                  const options = kindId ? products.optionsByKind[kindId] : undefined;
                  return (
                    <ManualOrderItemRow
                      key={draft.key}
                      draft={draft}
                      preview={previews[draft.key]}
                      currency={currency}
                      pricesExclVat={pricesExclVat}
                      disabled={submitting}
                      issueId={issueId}
                      kindOptions={products.catalog.kinds}
                      imprintOptions={
                        kindId && options
                          ? {
                              methods: options.methods,
                              places: products.placesByKind[kindId] ?? [],
                              directory: products.directoryFor(kindId),
                            }
                          : undefined
                      }
                      onPatch={(patch) => products.patchDraft(draft.key, patch)}
                      onRemove={() => products.removeDraft(draft.key)}
                      onPickColor={(variant) => products.pickColor(draft.key, variant)}
                      onChangeKind={(kind) => products.changeKind(draft.key, kind)}
                      onChangeImprints={(next) => products.changeImprints(draft.key, next)}
                    />
                  );
                })}
                {services.map((service) => (
                  <ManualOrderServiceRow
                    key={service.key}
                    service={service}
                    currency={currency}
                    pricesExclVat={pricesExclVat}
                    disabled={submitting}
                    issueId={issueId}
                    onPatch={(patch) => updateService(service.key, patch)}
                    onRemove={() => setServices((cur) => cur.filter((it) => it.key !== service.key))}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 px-5 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="text-lg font-semibold tabular-nums">
                {formatOrderMoney(pricesExclVat ? orderNetTotal : orderTotal, currency)}
              </span>
              {pricesExclVat && orderTotal > 0 ? (
                <>
                  <span className="text-xs text-muted-foreground">без ПДВ</span>
                  <span className="text-xs font-medium tabular-nums">{formatOrderMoney(orderTotal, currency)} з ПДВ</span>
                </>
              ) : null}
            </div>
            {orderTotal > 0 ? (
              <div className="text-xs text-muted-foreground">
                {advancePct > 0
                  ? `Передоплата ${advancePct}%: ${formatOrderMoney((orderTotal * advancePct) / 100, currency)}`
                  : "Передоплати немає: уся сума після готовності"}
              </div>
            ) : null}
            {serviceOnly ? <ManualOrderServiceDocuments cashless={isCashless} /> : null}
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            {isCashless && orderTotal > 0 ? (
              <label
                data-issue="check"
                className={cn(
                  "flex max-w-80 cursor-pointer items-start gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs",
                  issueRing(issueId === "check")
                )}
              >
                <Checkbox
                  checked={pricesConfirmed}
                  disabled={submitting}
                  onCheckedChange={(value) => setConfirmedPricesKey(value === true ? pricesKey : null)}
                  className="mt-0.5"
                />
                <span>
                  Ціни перевірив:{" "}
                  {pricesExclVat
                    ? `${formatOrderMoneyExact(orderNetTotal, currency)} + ПДВ ${formatOrderMoneyExact(orderVatAmount, currency)} = ${formatOrderMoneyExact(orderTotal, currency)}`
                    : `${formatOrderMoney(orderTotal, currency)} без ПДВ (${shownExecutor.shortName})`}
                </span>
              </label>
            ) : null}
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  data-unsaved-ignore
                  disabled={submitting}
                  onClick={() => (isDirty ? setConfirmingCancel(true) : onOpenChange(false))}
                >
                  Скасувати
                </Button>
                {/* Не вимикається: натиск веде до поля, якого бракує, як у вікні прорахунку. */}
                <Button
                  type="button"
                  size="md"
                  data-unsaved-ignore
                  disabled={submitting || !teamId}
                  onClick={() => void handleSubmit()}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Створюємо…
                    </>
                  ) : (
                    "Створити замовлення"
                  )}
                </Button>
              </div>
              {error ? (
                <p role="alert" className="max-w-md text-right text-xs text-destructive">
                  Не вдалося створити: {error} Нічого не втрачено.
                </p>
              ) : issue ? (
                <p className={cn("max-w-md text-right text-xs", issueId ? "text-destructive" : "text-muted-foreground")}>
                  {issue.text}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Поза смугою, яку хитаємо: вікно створення замовника не мусить тремтіти разом із полем. */}
        {customerCreate.dialogs}
        <UnsavedChangesPrompt
          open={confirmingCancel}
          onDismiss={() => setConfirmingCancel(false)}
          onDiscard={() => {
            setConfirmingCancel(false);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
