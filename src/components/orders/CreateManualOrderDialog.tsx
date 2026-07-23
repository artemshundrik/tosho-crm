import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Package, Palette, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CatalogModelPicker,
  getVariantOptionValue,
  resolveModelPickerValue,
} from "@/components/catalog/CatalogModelPicker";
import { useCatalogData } from "@/features/catalog/ProductCatalogPage/hooks/useCatalogData";
import {
  QuoteDeliveryFields,
  createEmptyQuoteDeliveryDetails,
  getQuoteDeliveryIssues,
  sanitizeQuoteDeliveryDetails,
  type QuoteDeliveryDetails,
} from "@/components/quotes/QuoteDeliveryFields";
import { ORDER_PAYMENT_METHOD_OPTIONS, ORDER_PAYMENT_TERMS_OPTIONS } from "@/features/orders/config";
import {
  createManualOrder,
  formatOrderMoney,
  listCustomerDesignTasks,
  type CustomerDesignTaskOption,
  type ManualOrderDesignChoice,
  type ManualOrderItemInput,
} from "@/features/orders/orderRecords";
import { DESIGN_STATUS_LABELS } from "@/lib/designTaskStatus";
import { DESIGN_TASK_TYPE_OPTIONS, type DesignTaskType } from "@/lib/designTaskType";
import { listCustomersBySearch, type CustomerRow } from "@/lib/toshoApi";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import type { Json } from "@/lib/database.types";
import { cn } from "@/lib/utils";

type CurrencyCode = "UAH" | "USD" | "EUR";

const CURRENCY_OPTIONS: Array<{ id: CurrencyCode; label: string }> = [
  { id: "UAH", label: "₴ Гривня (UAH)" },
  { id: "USD", label: "$ Долар (USD)" },
  { id: "EUR", label: "€ Євро (EUR)" },
];

const DELIVERY_OPTIONS = [
  { value: "nova_poshta", label: "Нова пошта" },
  { value: "pickup", label: "Самовивіз" },
  { value: "taxi", label: "Таксі / Uklon" },
  { value: "cargo", label: "Вантажне перевезення" },
];

const NO_DELIVERY = "__none__";
const NO_ASSIGNEE = "__none__";
const NO_CATALOG = "__none__";
const UNIT_OPTIONS = ["шт.", "компл.", "уп.", "пара", "м", "м²", "кг", "год"];
const DEFAULT_DESIGN_DEADLINE_TIME = "10:00";

const defaultPaymentMethodForCurrency = (currency: CurrencyCode) =>
  currency === "USD" || currency === "EUR" ? "bank_fx" : "bank_uah";

type DraftPrint = { key: string; methodId: string; positionId: string; width: string; height: string };
type DraftItem = {
  key: string;
  typeId: string;
  kindId: string;
  modelId: string;
  variantId: string | null;
  name: string;
  imageUrl: string | null;
  qty: string;
  unit: string;
  unitPrice: string;
  prints: DraftPrint[];
};

let keySeq = 0;
const nextKey = (prefix: string) => `${prefix}-${(keySeq += 1)}`;
const createDraftItem = (): DraftItem => ({
  key: nextKey("item"),
  typeId: "",
  kindId: "",
  modelId: "",
  variantId: null,
  name: "",
  imageUrl: null,
  qty: "1",
  unit: "шт.",
  unitPrice: "",
  prints: [],
});

type SelectedCustomer = { id: string; name: string; logoUrl: string | null };
type MemberOption = { userId: string; label: string; avatarUrl: string | null };
type DesignMode = "existing" | "create" | "none";

function SectionHeader({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      <span>{children}</span>
    </div>
  );
}

/**
 * Стрічка етапів: Замовлення → Дизайн → Виробництво.
 * Етап «Дизайн» чекає лише коли заводимо нову задачу; готовий дизайн (або його
 * відсутність через брак друку) одразу відкриває шлях до Виробництва.
 */
function StageStrip({ hasPrint, designMode }: { hasPrint: boolean; designMode: DesignMode }) {
  const designPending = hasPrint && designMode === "create";
  const designNote = !hasPrint
    ? "не потрібен"
    : designMode === "create"
      ? "буде створено"
      : designMode === "existing"
        ? "готовий"
        : "не потрібен";

  const stages: Array<{ label: string; note?: string; active: boolean }> = [
    { label: "Замовлення", active: true },
    { label: "Дизайн", note: designNote, active: hasPrint && designMode !== "none" },
    { label: "Виробництво", note: designPending ? "після дизайну" : "далі", active: !designPending },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-2xs">
      {stages.map((stage, index) => (
        <span key={stage.label} className="flex items-center gap-1.5">
          {index > 0 ? <span className="text-muted-foreground/50">→</span> : null}
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 font-medium",
              stage.active
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border/60 bg-muted/20 text-muted-foreground"
            )}
          >
            {stage.label}
            {stage.note ? <span className="font-normal text-muted-foreground"> — {stage.note}</span> : null}
          </span>
        </span>
      ))}
    </div>
  );
}

export type CreateManualOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: { id: string; orderNumber: string }) => void;
};

export function CreateManualOrderDialog({ open, onOpenChange, onCreated }: CreateManualOrderDialogProps) {
  const { teamId, userId } = useAuth();
  const { catalog, catalogLoading, ensureKindModelsLoaded, ensureAllModelsLoaded } = useCatalogData(open ? teamId : null);

  // Замовник
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRow[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);

  // Менеджер / гроші
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [managerUserId, setManagerUserId] = useState<string>("");
  const [currency, setCurrency] = useState<CurrencyCode>("UAH");
  const [paymentMethodId, setPaymentMethodId] = useState<string>(defaultPaymentMethodForCurrency("UAH"));
  const paymentMethodTouched = useRef(false);
  const [paymentTerms, setPaymentTerms] = useState<string>("70/30");

  // Логістика / пакування
  const [deliveryType, setDeliveryType] = useState<string>("");
  const [deliveryDetails, setDeliveryDetails] = useState<QuoteDeliveryDetails>(() => createEmptyQuoteDeliveryDetails());
  const [packaging, setPackaging] = useState<string>("");

  // Товари
  const [items, setItems] = useState<DraftItem[]>(() => [createDraftItem()]);

  // Дизайн
  const [designMode, setDesignMode] = useState<DesignMode>("create");
  const [designTasks, setDesignTasks] = useState<CustomerDesignTaskOption[]>([]);
  const [designTasksLoading, setDesignTasksLoading] = useState(false);
  const [selectedDesignTaskId, setSelectedDesignTaskId] = useState<string>("");
  const [showAllDesigns, setShowAllDesigns] = useState(false);
  const [createDesignType, setCreateDesignType] = useState<DesignTaskType>("visualization");
  const [createDesignBrief, setCreateDesignBrief] = useState<string>("");
  const [createDesignAssignee, setCreateDesignAssignee] = useState<string>(NO_ASSIGNEE);
  const [createDesignDeadline, setCreateDesignDeadline] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setCustomerOpen(false);
    setCustomerSearch("");
    setCustomerResults([]);
    setSelectedCustomer(null);
    setCurrency("UAH");
    setPaymentMethodId(defaultPaymentMethodForCurrency("UAH"));
    paymentMethodTouched.current = false;
    setPaymentTerms("70/30");
    setDeliveryType("");
    setDeliveryDetails(createEmptyQuoteDeliveryDetails());
    setPackaging("");
    setItems([createDraftItem()]);
    setDesignMode("create");
    setDesignTasks([]);
    setSelectedDesignTaskId("");
    setShowAllDesigns(false);
    setCreateDesignType("visualization");
    setCreateDesignBrief("");
    setCreateDesignAssignee(NO_ASSIGNEE);
    setCreateDesignDeadline("");
    setError(null);
    setSubmitting(false);
    setManagerUserId(userId ?? "");
  }, [userId]);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

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

  // Багато видів не мають власних методів/позицій — фолбек на весь каталог (як у прорахунку).
  const allMethods = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const type of catalog) for (const kind of type.kinds) for (const method of kind.methods) map.set(method.id, method);
    return Array.from(map.values());
  }, [catalog]);
  const allPositions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const type of catalog) for (const kind of type.kinds) for (const position of kind.printPositions) map.set(position.id, position);
    return Array.from(map.values());
  }, [catalog]);

  const getItemRefs = useCallback(
    (item: DraftItem) => {
      const type = catalog.find((entry) => entry.id === item.typeId) ?? null;
      const kind = type?.kinds.find((entry) => entry.id === item.kindId) ?? null;
      return {
        type,
        kind,
        models: kind?.models ?? [],
        methods: kind?.methods.length ? kind.methods : allMethods,
        positions: kind?.printPositions.length ? kind.printPositions : allPositions,
      };
    },
    [catalog, allMethods, allPositions]
  );

  const hasPrint = useMemo(
    () => items.some((item) => item.prints.some((p) => p.methodId || p.positionId || p.width.trim() || p.height.trim())),
    [items]
  );

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

  const handleCurrencyChange = (next: CurrencyCode) => {
    setCurrency(next);
    if (!paymentMethodTouched.current) setPaymentMethodId(defaultPaymentMethodForCurrency(next));
  };

  const updateItem = (key: string, patch: Partial<DraftItem>) =>
    setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const addItem = () => setItems((cur) => [...cur, createDraftItem()]);
  const removeItem = (key: string) => setItems((cur) => (cur.length <= 1 ? cur : cur.filter((it) => it.key !== key)));

  /** Скинути вибір товару, лишивши картку на місці (кількість/одиницю не чіпаємо). */
  const clearItemSelection = (item: DraftItem) =>
    updateItem(item.key, {
      typeId: "",
      kindId: "",
      modelId: "",
      variantId: null,
      name: "",
      imageUrl: null,
      unitPrice: "",
      prints: [],
    });

  const handleTypeChange = (item: DraftItem, typeId: string) => {
    if (typeId === NO_CATALOG) {
      clearItemSelection(item);
      return;
    }
    updateItem(item.key, { typeId, kindId: "", modelId: "", variantId: null, name: "", imageUrl: null, prints: [] });
  };

  const handleKindChange = (item: DraftItem, kindId: string) => {
    if (kindId === NO_CATALOG) {
      updateItem(item.key, { kindId: "", modelId: "", variantId: null, name: "", imageUrl: null, prints: [] });
      return;
    }
    void ensureKindModelsLoaded(kindId);
    updateItem(item.key, { kindId, modelId: "", variantId: null, name: "", imageUrl: null, prints: [] });
  };

  const handleModelChange = (item: DraftItem, nextValue: string) => {
    const { models } = getItemRefs(item);
    const resolved = resolveModelPickerValue(models, nextValue);
    if (!resolved) return;
    const model = models.find((entry) => entry.id === resolved.modelId) ?? null;
    // Ціну сідимо з каталогу лише коли вона реально задана: у більшості моделей
    // price = 0 (продажна ціна тут не з каталогу), а «0» у полі виглядає як заповнене.
    const catalogPrice = Number(model?.price ?? 0);
    const seededPrice = catalogPrice > 0 ? String(catalogPrice) : item.unitPrice;
    updateItem(item.key, {
      modelId: resolved.modelId,
      variantId: resolved.variantId,
      // resolved.name вже містить « · варіант» — не склеюємо вдруге.
      name: resolved.name,
      imageUrl: resolved.imageUrl ?? null,
      unitPrice: seededPrice,
    });
  };

  const addPrint = (item: DraftItem) => {
    const { methods, positions } = getItemRefs(item);
    const print: DraftPrint = {
      key: nextKey("print"),
      methodId: methods[0]?.id ?? "",
      positionId: positions[0]?.id ?? "",
      width: "",
      height: "",
    };
    updateItem(item.key, { prints: [...item.prints, print] });
  };
  const updatePrint = (item: DraftItem, printKey: string, patch: Partial<DraftPrint>) =>
    updateItem(item.key, { prints: item.prints.map((p) => (p.key === printKey ? { ...p, ...patch } : p)) });
  const removePrint = (item: DraftItem, printKey: string) =>
    updateItem(item.key, { prints: item.prints.filter((p) => p.key !== printKey) });

  // «Готовий дизайн» = затверджений. Решту показуємо лише за запитом, щоб не було шуму.
  const visibleDesignTasks = useMemo(
    () => (showAllDesigns ? designTasks : designTasks.filter((task) => task.isApproved)),
    [designTasks, showAllDesigns]
  );
  const approvedDesignCount = useMemo(() => designTasks.filter((task) => task.isApproved).length, [designTasks]);
  const selectedDesignTask = useMemo(
    () => designTasks.find((task) => task.id === selectedDesignTaskId) ?? null,
    [designTasks, selectedDesignTaskId]
  );

  /**
   * Підставити товар, для якого робився обраний дизайн. Дизайн-задача сама товар не
   * зберігає — він приходить із її прорахунку, тож доступно не завжди.
   */
  const applyDesignProduct = async () => {
    const product = selectedDesignTask?.product;
    if (!product?.catalogModelId) return;
    await ensureAllModelsLoaded();
    let found: { typeId: string; kindId: string; name: string; imageUrl: string | null; price?: number } | null = null;
    for (const type of catalog) {
      for (const kind of type.kinds) {
        const model = kind.models.find((entry) => entry.id === product.catalogModelId);
        if (model) {
          found = { typeId: type.id, kindId: kind.id, name: model.name, imageUrl: model.imageUrl ?? null, price: model.price };
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      setError("Не вдалося знайти цей товар у каталозі — оберіть вручну.");
      return;
    }
    const target = items.find((it) => !it.modelId) ?? null;
    const patch = {
      typeId: found.typeId,
      kindId: found.kindId,
      modelId: product.catalogModelId,
      variantId: null,
      name: found.name,
      imageUrl: found.imageUrl,
      unitPrice: found.price != null ? String(found.price) : "",
    };
    if (target) updateItem(target.key, patch);
    else setItems((cur) => [...cur, { ...createDraftItem(), ...patch }]);
    setError(null);
  };

  const lineTotal = (item: DraftItem) => (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
  const orderTotal = useMemo(() => items.reduce((sum, it) => sum + lineTotal(it), 0), [items]);
  const managerLabel = useMemo(
    () => members.find((m) => m.userId === managerUserId)?.label ?? null,
    [members, managerUserId]
  );

  const hasValidItem = items.some((it) => it.modelId);
  const canSubmit = Boolean(teamId && selectedCustomer && hasValidItem && !submitting);

  const handleSubmit = async () => {
    if (!teamId || !selectedCustomer) {
      setError("Оберіть Замовника для замовлення.");
      return;
    }
    const payloadItems: ManualOrderItemInput[] = items
      .filter((it) => it.modelId && it.name.trim())
      .map((it) => {
        const { methods, positions } = getItemRefs(it);
        return {
          name: it.name.trim(),
          qty: Number(it.qty) || 0,
          unit: it.unit,
          unitPrice: Number(it.unitPrice) || 0,
          catalogModelId: it.modelId,
          imageUrl: it.imageUrl,
          thumbUrl: it.imageUrl,
          printApplications: it.prints
            .filter((p) => p.methodId || p.positionId || p.width.trim() || p.height.trim())
            .map((p) => ({
              methodId: p.methodId || null,
              methodLabel: methods.find((m) => m.id === p.methodId)?.name ?? null,
              positionId: p.positionId || null,
              positionLabel: positions.find((pos) => pos.id === p.positionId)?.label ?? null,
              width: p.width,
              height: p.height,
            })),
        };
      });
    if (payloadItems.length === 0) {
      setError("Додайте хоча б один товар із каталогу.");
      return;
    }

    // Логістика: ті самі обовʼязкові поля, що й у прорахунку.
    if (deliveryType) {
      const deliveryIssue = getQuoteDeliveryIssues(deliveryType, deliveryDetails);
      if (deliveryIssue) {
        setError(`Логістика: ${deliveryIssue}.`);
        return;
      }
    }

    let design: ManualOrderDesignChoice = { mode: "none" };
    if (hasPrint) {
      if (designMode === "existing") {
        if (!selectedDesignTaskId) {
          setError("Оберіть готовий дизайн або перемкніться на створення нового.");
          return;
        }
        const picked = designTasks.find((t) => t.id === selectedDesignTaskId) ?? null;
        design = {
          mode: "existing",
          designTaskId: selectedDesignTaskId,
          designTaskNumber: picked?.number ?? null,
          designApproved: picked?.isApproved ?? false,
        };
      } else if (designMode === "create") {
        const assigneeUserId = createDesignAssignee === NO_ASSIGNEE ? null : createDesignAssignee;
        design = {
          mode: "create",
          designTaskType: createDesignType,
          brief: createDesignBrief.trim() || null,
          assigneeUserId,
          assigneeLabel: assigneeUserId ? members.find((m) => m.userId === assigneeUserId)?.label ?? null : null,
          deadline: createDesignDeadline ? `${createDesignDeadline}T${DEFAULT_DESIGN_DEADLINE_TIME}:00` : null,
        };
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await createManualOrder({
        teamId,
        userId,
        managerUserId: managerUserId || userId,
        managerLabel,
        customerId: selectedCustomer.id,
        currency,
        paymentMethodId,
        paymentTerms,
        incotermsCode: "FCA",
        deliveryType: deliveryType || null,
        deliveryDetails: deliveryType
          ? (sanitizeQuoteDeliveryDetails(deliveryType, deliveryDetails) as unknown as Json)
          : null,
        packaging: packaging.trim() || null,
        design,
        items: payloadItems,
      });
      onCreated({ id: result.id, orderNumber: result.orderNumber });
      onOpenChange(false);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "Не вдалося створити замовлення.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[820px]">
        <DialogHeader className="space-y-2 border-b border-border/60 px-6 py-4">
          <DialogTitle>Замовлення без прорахунку</DialogTitle>
          <DialogDescription>
            Пряме замовлення для наявного Замовника. Товари — з каталогу, ціни можна коригувати.
          </DialogDescription>
          <StageStrip hasPrint={hasPrint} designMode={designMode} />
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* ── Замовлення ── */}
          <section className="space-y-4">
            <SectionHeader icon={<Package className="h-3.5 w-3.5" />}>Замовлення</SectionHeader>

            <div className="space-y-2">
              <Label>
                Замовник <span className="text-destructive">*</span>
              </Label>
              <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="md" className="w-full justify-start font-normal" onClick={() => setCustomerOpen(true)}>
                    {selectedCustomer ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <EntityAvatar src={selectedCustomer.logoUrl} name={selectedCustomer.name} fallback={selectedCustomer.name.slice(0, 1).toUpperCase()} size={22} />
                        <span className="truncate">{selectedCustomer.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Оберіть Замовника…</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Пошук за назвою…" leftIcon={<Search className="h-4 w-4" />} value={customerSearch} onValueChange={setCustomerSearch} />
                    <CommandList className="max-h-64">
                      {customerLoading ? (
                        <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Шукаємо…
                        </div>
                      ) : (
                        <CommandEmpty>Нічого не знайдено</CommandEmpty>
                      )}
                      <CommandGroup>
                        {customerResults.map((customer) => {
                          const name = customer.name?.trim() || customer.legal_name?.trim() || "Без назви";
                          const isSelected = selectedCustomer?.id === customer.id;
                          return (
                            <CommandItem
                              key={customer.id}
                              value={customer.id}
                              onSelect={() => {
                                setSelectedCustomer({ id: customer.id, name, logoUrl: customer.logo_url ?? null });
                                setSelectedDesignTaskId("");
                                setCustomerOpen(false);
                              }}
                            >
                              <EntityAvatar src={customer.logo_url ?? null} name={name} fallback={name.slice(0, 1).toUpperCase()} size={24} />
                              <div className="ml-2 flex min-w-0 flex-col">
                                <span className="truncate font-medium">{name}</span>
                                {customer.legal_name?.trim() && customer.legal_name.trim() !== name ? (
                                  <span className="truncate text-xs text-muted-foreground">{customer.legal_name}</span>
                                ) : null}
                              </div>
                              {isSelected ? <Check className="ml-auto h-4 w-4 text-primary" /> : null}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">Реквізити, контакти та підписант підтягнуться з картки Замовника.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Менеджер</Label>
                <Select value={managerUserId} onValueChange={setManagerUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Оберіть менеджера" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        <span className="flex items-center gap-2">
                          <AvatarBase src={member.avatarUrl} name={member.label} fallback={member.label.slice(0, 1).toUpperCase()} size={18} className="border-border/60" fallbackClassName="text-3xs font-semibold" />
                          <span className="truncate">{member.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Валюта</Label>
                <Select value={currency} onValueChange={(value) => handleCurrencyChange(value as CurrencyCode)}>
                  <SelectTrigger>
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Тип оплати</Label>
                <Select
                  value={paymentMethodId}
                  onValueChange={(value) => {
                    paymentMethodTouched.current = true;
                    setPaymentMethodId(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_PAYMENT_METHOD_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Умови оплати</Label>
                <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_PAYMENT_TERMS_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* ── Товари ── */}
          <section className="space-y-3 border-t border-border/50 pt-5">
            <div className="flex items-center justify-between">
              <SectionHeader icon={<Package className="h-3.5 w-3.5" />}>
                Товари <span className="text-destructive">*</span>
              </SectionHeader>
              <span className="text-xs text-muted-foreground">
                {catalogLoading ? "Каталог завантажується…" : `${items.length} шт.`}
              </span>
            </div>

            {items.map((item, index) => {
              const refs = getItemRefs(item);
              return (
                <div key={item.key} className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="h-9 w-9 shrink-0 rounded-lg border border-border/60 object-cover" loading="lazy" />
                      ) : (
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-muted/30 text-muted-foreground">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-2xs font-semibold uppercase tracking-caps text-muted-foreground">Товар {index + 1}</div>
                        <div className="truncate text-sm font-medium text-foreground">{item.name || "Модель не обрана"}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-foreground">{formatOrderMoney(lineTotal(item), currency)}</span>
                      {item.typeId || item.modelId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={`Скинути вибір товару ${index + 1}`}
                          title="Скинути вибір товару"
                          onClick={() => clearItemSelection(item)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button type="button" variant="ghost" size="iconSm" className="text-muted-foreground hover:text-destructive" disabled={items.length <= 1} aria-label={`Видалити Товар ${index + 1}`} onClick={() => removeItem(item.key)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Категорія → Вид → Модель */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Категорія</Label>
                      <Select value={item.typeId || NO_CATALOG} onValueChange={(value) => handleTypeChange(item, value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Оберіть" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_CATALOG}>Не обрано</SelectItem>
                          {catalog.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Вид</Label>
                      <Select value={item.kindId || NO_CATALOG} onValueChange={(value) => handleKindChange(item, value)} disabled={!item.typeId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Оберіть" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_CATALOG}>Не обрано</SelectItem>
                          {(refs.type?.kinds ?? []).map((kind) => (
                            <SelectItem key={kind.id} value={kind.id}>
                              {kind.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Модель</Label>
                      <CatalogModelPicker
                        value={item.modelId ? getVariantOptionValue(item.modelId, item.variantId) : ""}
                        onChange={(value) => handleModelChange(item, value)}
                        models={refs.models}
                        disabled={!item.kindId || refs.models.length === 0}
                        placeholder="Оберіть модель"
                        popoverClassName="w-[420px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Кількість</Label>
                      <Input value={item.qty} onChange={(e) => updateItem(item.key, { qty: e.target.value })} inputMode="decimal" placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Одиниця</Label>
                      <Select value={item.unit} onValueChange={(value) => updateItem(item.key, { unit: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNIT_OPTIONS.map((unit) => (
                            <SelectItem key={unit} value={unit}>
                              {unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1.5 sm:col-span-1">
                      <Label className="text-xs text-muted-foreground">Ціна за од.</Label>
                      <Input value={item.unitPrice} onChange={(e) => updateItem(item.key, { unitPrice: e.target.value })} inputMode="decimal" placeholder="0" />
                    </div>
                  </div>

                  {/* Нанесення цього товару */}
                  <div className="space-y-2 rounded-lg border border-border/50 bg-background/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">Нанесення (друк)</span>
                      <Button type="button" variant="outline" size="xs" onClick={() => addPrint(item)} disabled={!item.kindId}>
                        <Plus className="h-3.5 w-3.5" /> Додати
                      </Button>
                    </div>
                    {item.prints.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Без друку — для цього товару дизайн не потрібен.</p>
                    ) : (
                      item.prints.map((print) => (
                        <div key={print.key} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_72px_72px_32px]">
                          <Select value={print.methodId} onValueChange={(value) => updatePrint(item, print.key, { methodId: value })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Метод" />
                            </SelectTrigger>
                            <SelectContent>
                              {refs.methods.map((method) => (
                                <SelectItem key={method.id} value={method.id}>
                                  {method.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={print.positionId} onValueChange={(value) => updatePrint(item, print.key, { positionId: value })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Позиція" />
                            </SelectTrigger>
                            <SelectContent>
                              {refs.positions.map((position) => (
                                <SelectItem key={position.id} value={position.id}>
                                  {position.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input value={print.width} onChange={(e) => updatePrint(item, print.key, { width: e.target.value })} inputMode="decimal" placeholder="Ш, мм" />
                          <Input value={print.height} onChange={(e) => updatePrint(item, print.key, { height: e.target.value })} inputMode="decimal" placeholder="В, мм" />
                          <Button type="button" variant="ghost" size="iconSm" className="text-muted-foreground hover:text-destructive" aria-label="Видалити нанесення" onClick={() => removePrint(item, print.key)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}

            <Button type="button" variant="outline" size="md" onClick={addItem} className="w-full gap-2 border-dashed">
              <Plus className="h-4 w-4" /> Додати товар
            </Button>
          </section>

          {/* ── Дизайн ── */}
          <section className="space-y-3 border-t border-border/50 pt-5">
            <SectionHeader icon={<Palette className="h-3.5 w-3.5" />}>Дизайн</SectionHeader>
            {!hasPrint ? (
              <p className="rounded-lg border border-dashed border-border/60 px-4 py-3 text-xs text-muted-foreground">
                У жодного товару немає нанесення — дизайн не потрібен, привʼязка дизайн-задачі необовʼязкова.
                Додай нанесення до товару, щоб обрати готовий дизайн або створити нову дизайн-задачу.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Дизайн для цього замовлення</Label>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { id: "create", label: "Треба зробити" },
                        { id: "existing", label: "Вже готовий" },
                        { id: "none", label: "Не потрібен" },
                      ] as Array<{ id: DesignMode; label: string }>
                    ).map((option) => (
                      <Button key={option.id} type="button" variant={designMode === option.id ? "primary" : "outline"} size="xs" onClick={() => setDesignMode(option.id)}>
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {designMode === "create"
                      ? "Замовлення стане в етап «Дизайн» і чекатиме на макет."
                      : designMode === "existing"
                        ? "Етап «Дизайн» вважається пройденим — замовлення рухається до Виробництва."
                        : "Дизайн не потрібен — замовлення рухається до Виробництва."}
                  </p>
                </div>

                {designMode === "existing" ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Готовий дизайн Замовника</Label>
                      <Button type="button" variant="ghost" size="xxs" onClick={() => setShowAllDesigns((v) => !v)}>
                        {showAllDesigns ? `Лише готові (${approvedDesignCount})` : `Показати всі (${designTasks.length})`}
                      </Button>
                    </div>
                    <Select value={selectedDesignTaskId} onValueChange={setSelectedDesignTaskId} disabled={designTasksLoading || visibleDesignTasks.length === 0}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            designTasksLoading
                              ? "Завантаження…"
                              : designTasks.length === 0
                                ? "У Замовника немає дизайн-задач"
                                : visibleDesignTasks.length === 0
                                  ? "Немає затверджених — натисни «Показати всі»"
                                  : `Оберіть із ${visibleDesignTasks.length}`
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {visibleDesignTasks.map((task) => (
                          <SelectItem key={task.id} value={task.id}>
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">{task.number ?? task.id.slice(0, 6)}</span>
                              <span className="truncate">{task.title}</span>
                              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{DESIGN_STATUS_LABELS[task.status]}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedDesignTask?.product ? (
                      <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                        {selectedDesignTask.product.imageUrl ? (
                          <img src={selectedDesignTask.product.imageUrl} alt={selectedDesignTask.product.name} className="h-10 w-10 shrink-0 rounded-lg border border-border/60 object-cover" loading="lazy" />
                        ) : (
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border/60 bg-muted/30 text-muted-foreground">
                            <Package className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-muted-foreground">Цей дизайн робили для</div>
                          <div className="truncate text-sm font-medium text-foreground">{selectedDesignTask.product.name}</div>
                        </div>
                        {selectedDesignTask.product.catalogModelId ? (
                          <Button type="button" variant="outline" size="xs" className="shrink-0" onClick={() => void applyDesignProduct()}>
                            Підставити товар
                          </Button>
                        ) : null}
                      </div>
                    ) : selectedDesignTask ? (
                      <p className="text-xs text-muted-foreground">
                        До цього дизайну не привʼязаний товар — оберіть товар у каталозі вручну.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {designMode === "create" ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Тип задачі</Label>
                        <Select value={createDesignType} onValueChange={(value) => setCreateDesignType(value as DesignTaskType)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DESIGN_TASK_TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Дизайнер</Label>
                        <Select value={createDesignAssignee} onValueChange={setCreateDesignAssignee}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_ASSIGNEE}>Не призначати</SelectItem>
                            {members.map((member) => (
                              <SelectItem key={member.userId} value={member.userId}>
                                <span className="flex items-center gap-2">
                                  <AvatarBase src={member.avatarUrl} name={member.label} fallback={member.label.slice(0, 1).toUpperCase()} size={18} className="border-border/60" fallbackClassName="text-3xs font-semibold" />
                                  <span className="truncate">{member.label}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Дедлайн</Label>
                        <Input type="date" value={createDesignDeadline} onChange={(e) => setCreateDesignDeadline(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">ТЗ на дизайн</Label>
                      <Textarea value={createDesignBrief} onChange={(e) => setCreateDesignBrief(e.target.value)} placeholder="Що треба зробити дизайнеру…" rows={3} />
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>

          {/* ── Логістика ── */}
          <section className="space-y-4 border-t border-border/50 pt-5">
            <SectionHeader>Логістика та пакування</SectionHeader>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Спосіб доставки</Label>
                <Select value={deliveryType || NO_DELIVERY} onValueChange={(value) => setDeliveryType(value === NO_DELIVERY ? "" : value)}>
                  <SelectTrigger>
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
              <div className="space-y-2">
                <Label>Пакування</Label>
                <Input value={packaging} onChange={(e) => setPackaging(e.target.value)} placeholder="Напр.: індивідуальна коробка, плівка…" />
              </div>
            </div>
            {deliveryType ? (
              <QuoteDeliveryFields
                deliveryType={deliveryType}
                details={deliveryDetails}
                onChange={(patch) => setDeliveryDetails((prev) => ({ ...prev, ...patch }))}
                savedPoints={[]}
                saveToCard={false}
                onSaveToCardChange={() => {}}
                canSaveToCard={false}
              />
            ) : null}
          </section>

          {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
        </div>

        <DialogFooter className="items-center justify-between gap-3 border-t border-border/60 px-6 py-4 sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Разом: <span className="text-base font-semibold text-foreground">{formatOrderMoney(orderTotal, currency)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="md" onClick={() => onOpenChange(false)} disabled={submitting}>
              Скасувати
            </Button>
            <Button type="button" size="md" onClick={() => void handleSubmit()} disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Створюємо…
                </>
              ) : (
                "Створити замовлення"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
