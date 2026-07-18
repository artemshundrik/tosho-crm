import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Package, Palette, Plus, Search, Trash2 } from "lucide-react";
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
  QuoteDeliveryFields,
  createEmptyQuoteDeliveryDetails,
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
  type ManualOrderPrintApplication,
} from "@/features/orders/orderRecords";
import { DESIGN_STATUS_LABELS } from "@/lib/designTaskStatus";
import { DESIGN_TASK_TYPE_OPTIONS, type DesignTaskType } from "@/lib/designTaskType";
import type { Json } from "@/lib/database.types";
import { listCustomersBySearch, type CustomerRow } from "@/lib/toshoApi";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
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

const UNIT_OPTIONS = ["шт.", "компл.", "уп.", "пара", "м", "м²", "кг", "год"];

const defaultPaymentMethodForCurrency = (currency: CurrencyCode) =>
  currency === "USD" || currency === "EUR" ? "bank_fx" : "bank_uah";

type DraftItem = { key: string; name: string; qty: string; unit: string; unitPrice: string };
type DraftPrint = { key: string; method: string; position: string; width: string; height: string };

let keySeq = 0;
const nextKey = (prefix: string) => `${prefix}-${(keySeq += 1)}`;
const createDraftItem = (): DraftItem => ({ key: nextKey("item"), name: "", qty: "1", unit: "шт.", unitPrice: "" });
const createDraftPrint = (): DraftPrint => ({ key: nextKey("print"), method: "", position: "", width: "", height: "" });

type SelectedCustomer = { id: string; name: string; logoUrl: string | null };
type MemberOption = { userId: string; label: string; avatarUrl: string | null };
type DesignMode = "existing" | "create" | "none";

function SectionHeader({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      <span>{children}</span>
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

  // Позиції / друк
  const [items, setItems] = useState<DraftItem[]>(() => [createDraftItem()]);
  const [prints, setPrints] = useState<DraftPrint[]>([]);

  // Дизайн
  const [designMode, setDesignMode] = useState<DesignMode>("create");
  const [designTasks, setDesignTasks] = useState<CustomerDesignTaskOption[]>([]);
  const [designTasksLoading, setDesignTasksLoading] = useState(false);
  const [selectedDesignTaskId, setSelectedDesignTaskId] = useState<string>("");
  const [createDesignType, setCreateDesignType] = useState<DesignTaskType>("visualization");
  const [createDesignBrief, setCreateDesignBrief] = useState<string>("");

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
    setPrints([]);
    setDesignMode("create");
    setDesignTasks([]);
    setSelectedDesignTaskId("");
    setCreateDesignType("visualization");
    setCreateDesignBrief("");
    setError(null);
    setSubmitting(false);
    setManagerUserId(userId ?? "");
  }, [userId]);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  // Менеджери воркспейсу.
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

  // Пошук Замовників.
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

  const hasPrint = useMemo(
    () => prints.some((p) => p.method.trim() || p.position.trim() || p.width.trim() || p.height.trim()),
    [prints]
  );

  // Готові дизайни Замовника — вантажимо, коли є друк і обрано Замовника.
  useEffect(() => {
    if (!open || !teamId || !selectedCustomer || !hasPrint) return;
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
  }, [open, teamId, selectedCustomer, hasPrint]);

  const handleCurrencyChange = (next: CurrencyCode) => {
    setCurrency(next);
    if (!paymentMethodTouched.current) setPaymentMethodId(defaultPaymentMethodForCurrency(next));
  };

  const updateItem = (key: string, patch: Partial<DraftItem>) =>
    setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const addItem = () => setItems((cur) => [...cur, createDraftItem()]);
  const removeItem = (key: string) =>
    setItems((cur) => (cur.length <= 1 ? cur : cur.filter((it) => it.key !== key)));

  const updatePrint = (key: string, patch: Partial<DraftPrint>) =>
    setPrints((cur) => cur.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const addPrint = () => setPrints((cur) => [...cur, createDraftPrint()]);
  const removePrint = (key: string) => setPrints((cur) => cur.filter((p) => p.key !== key));

  const lineTotal = (item: DraftItem) => (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
  const orderTotal = useMemo(() => items.reduce((sum, it) => sum + lineTotal(it), 0), [items]);
  const managerLabel = useMemo(
    () => members.find((m) => m.userId === managerUserId)?.label ?? null,
    [members, managerUserId]
  );

  const hasValidItem = items.some((it) => it.name.trim().length > 0);
  const canSubmit = Boolean(teamId && selectedCustomer && hasValidItem && !submitting);

  const handleSubmit = async () => {
    if (!teamId || !selectedCustomer) {
      setError("Оберіть Замовника для замовлення.");
      return;
    }
    const payloadItems: ManualOrderItemInput[] = items
      .filter((it) => it.name.trim().length > 0)
      .map((it) => ({ name: it.name.trim(), qty: Number(it.qty) || 0, unit: it.unit, unitPrice: Number(it.unitPrice) || 0 }));
    if (payloadItems.length === 0) {
      setError("Додайте хоча б одну позицію з назвою.");
      return;
    }

    const printApplications: ManualOrderPrintApplication[] = prints
      .map((p) => ({ method: p.method.trim(), position: p.position.trim(), width: p.width.trim(), height: p.height.trim() }))
      .filter((p) => p.method || p.position || p.width || p.height);

    let design: ManualOrderDesignChoice = { mode: "none" };
    if (printApplications.length > 0) {
      if (designMode === "existing") {
        if (!selectedDesignTaskId) {
          setError("Оберіть готовий дизайн або перемкніться на створення нового.");
          return;
        }
        const picked = designTasks.find((t) => t.id === selectedDesignTaskId) ?? null;
        design = { mode: "existing", designTaskId: selectedDesignTaskId, designTaskNumber: picked?.number ?? null };
      } else if (designMode === "create") {
        design = { mode: "create", designTaskType: createDesignType, brief: createDesignBrief.trim() || null };
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
        deliveryDetails: deliveryType ? (deliveryDetails as unknown as Json) : null,
        packaging: packaging.trim() || null,
        printApplications,
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
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle>Замовлення без прорахунку</DialogTitle>
          <DialogDescription>
            Замовлення → Дизайн → Виробництво. Пряме замовлення для наявного Замовника, ціни задаються вручну.
          </DialogDescription>
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
                          <AvatarBase src={member.avatarUrl} name={member.label} fallback={member.label.slice(0, 1).toUpperCase()} size={18} className="border-border/60" fallbackClassName="text-[9px] font-semibold" />
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

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>
                  Товари <span className="text-destructive">*</span>
                </Label>
                <span className="text-xs text-muted-foreground">{items.length} шт.</span>
              </div>

              {items.map((item, index) => (
                <div key={item.key} className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Товар {index + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {formatOrderMoney(lineTotal(item), currency)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="iconSm"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={items.length <= 1}
                        aria-label={`Видалити Товар ${index + 1}`}
                        onClick={() => removeItem(item.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Назва</Label>
                    <Input
                      value={item.name}
                      onChange={(e) => updateItem(item.key, { name: e.target.value })}
                      placeholder="Напр.: Футболка Malfini біла, L"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Кількість</Label>
                      <Input
                        value={item.qty}
                        onChange={(e) => updateItem(item.key, { qty: e.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                      />
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
                      <Input
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.key, { unitPrice: e.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" size="md" onClick={addItem} className="w-full gap-2 border-dashed">
                <Plus className="h-4 w-4" /> Додати товар
              </Button>
            </div>
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

          {/* ── Нанесення (друк) ── */}
          <section className="space-y-3 border-t border-border/50 pt-5">
            <div className="flex items-center justify-between">
              <SectionHeader icon={<Palette className="h-3.5 w-3.5" />}>Нанесення (друк)</SectionHeader>
              <Button type="button" variant="outline" size="xs" onClick={addPrint}>
                <Plus className="h-3.5 w-3.5" /> {prints.length > 0 ? "Ще нанесення" : "Додати нанесення"}
              </Button>
            </div>
            {prints.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/60 px-4 py-3 text-xs text-muted-foreground">
                Без друку — блок дизайну прихований. Додайте нанесення, щоб привʼязати або створити дизайн.
              </p>
            ) : (
              <div className="space-y-2">
                {prints.map((p) => (
                  <div key={p.key} className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-[1fr_1fr_80px_80px_32px] sm:border-0 sm:p-0">
                    <Input value={p.method} onChange={(e) => updatePrint(p.key, { method: e.target.value })} placeholder="Метод (напр.: DTF)" />
                    <Input value={p.position} onChange={(e) => updatePrint(p.key, { position: e.target.value })} placeholder="Позиція (напр.: груди)" />
                    <Input value={p.width} onChange={(e) => updatePrint(p.key, { width: e.target.value })} inputMode="decimal" placeholder="Ш, мм" />
                    <Input value={p.height} onChange={(e) => updatePrint(p.key, { height: e.target.value })} inputMode="decimal" placeholder="В, мм" />
                    <Button type="button" variant="ghost" size="iconSm" className="text-muted-foreground hover:text-destructive" aria-label="Видалити нанесення" onClick={() => removePrint(p.key)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Дизайн (лише коли є друк) ── */}
          {hasPrint ? (
            <section className="space-y-3 border-t border-border/50 pt-5">
              <SectionHeader icon={<Palette className="h-3.5 w-3.5" />}>Дизайн</SectionHeader>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: "create", label: "Створити новий" },
                    { id: "existing", label: "Обрати готовий" },
                    { id: "none", label: "Без дизайну" },
                  ] as Array<{ id: DesignMode; label: string }>
                ).map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    variant={designMode === option.id ? "primary" : "outline"}
                    size="xs"
                    onClick={() => setDesignMode(option.id)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>

              {designMode === "existing" ? (
                <div className="space-y-2">
                  <Label>Готовий дизайн Замовника</Label>
                  <Select value={selectedDesignTaskId} onValueChange={setSelectedDesignTaskId} disabled={designTasksLoading || designTasks.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder={designTasksLoading ? "Завантаження…" : designTasks.length === 0 ? "У Замовника немає дизайн-задач" : "Оберіть дизайн-задачу"} />
                    </SelectTrigger>
                    <SelectContent>
                      {designTasks.map((task) => (
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
                </div>
              ) : null}

              {designMode === "create" ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Тип дизайн-задачі</Label>
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
                  <div className="space-y-2">
                    <Label>ТЗ на дизайн (необовʼязково)</Label>
                    <Textarea value={createDesignBrief} onChange={(e) => setCreateDesignBrief(e.target.value)} placeholder="Короткий бриф для дизайнера…" rows={3} />
                  </div>
                  <p className="text-xs text-muted-foreground">Нова дизайн-задача створиться на цього Замовника й привʼяжеться до замовлення.</p>
                </div>
              ) : null}
            </section>
          ) : null}

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
                  <Loader2 className={cn("h-4 w-4 animate-spin")} /> Створюємо…
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
