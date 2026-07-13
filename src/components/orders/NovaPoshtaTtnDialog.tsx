import { useEffect, useState } from "react";
import { Loader2, PackageCheck, Copy, ExternalLink, Trash2, AlertTriangle, Calculator } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneInput } from "@/components/ui/phone-input";
import { DigitsInput } from "@/components/ui/digits-input";
import { NpCityCombobox, NpWarehouseCombobox } from "@/components/customers/NovaPoshtaControls";
import type { QuoteDeliveryDetails } from "@/components/quotes/QuoteDeliveryFields";
import { listPartyDeliveryPoints, splitContactName, type DeliveryRecipientType } from "@/lib/customerDeliveryPoints";
import {
  saveNpRecipient,
  getNpDocumentPrice,
  getNpDocumentDeliveryDate,
  createNpInternetDocument,
  deleteNpInternetDocument,
  trackNpDocument,
  NovaPoshtaNotConfiguredError,
  type NpTtnResult,
} from "@/lib/novaPoshtaApi";
import { loadNovaPoshtaSettings, type NovaPoshtaSettings } from "@/lib/novaPoshtaSettings";

const RECIPIENT_TYPE_LABELS: Record<string, string> = { organization: "Організація", private: "Приватна особа" };
const PAYER_LABELS: Record<string, string> = { Recipient: "Отримувач", Sender: "Відправник (ми)", ThirdPerson: "Третя особа" };
const PAYMENT_LABELS: Record<string, string> = { Cash: "Готівка", NonCash: "Безготівка" };
const CARGO_LABELS: Record<string, string> = {
  Parcel: "Посилка",
  Cargo: "Вантаж",
  Documents: "Документи",
  Pallet: "Палета",
  TiresWheels: "Шини / диски",
};
const SERVICE_LABELS: Record<string, string> = {
  WarehouseWarehouse: "Відділення → Відділення",
  WarehouseDoors: "Відділення → Адреса",
  DoorsWarehouse: "Адреса → Відділення",
  DoorsDoors: "Адреса → Адреса",
};

const money = (value: number | null | undefined): string =>
  typeof value === "number" && !Number.isNaN(value)
    ? new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 2 }).format(value)
    : "—";

export type ExistingTtn = {
  number: string;
  ref: string | null;
  cost: number | null;
  estimatedDelivery: string | null;
};

type RecipientState = {
  recipientType: DeliveryRecipientType;
  edrpou: string;
  firstName: string;
  lastName: string;
  phone: string;
  cityRef: string;
  cityName: string;
  warehouseRef: string;
  warehouseName: string;
};

type CargoState = {
  weight: string;
  seats: string;
  description: string;
  cost: string;
  payer: string;
  paymentMethod: string;
  cargoType: string;
  serviceType: string;
};

type NovaPoshtaTtnDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  orderId: string;
  delivery: QuoteDeliveryDetails;
  partyType: "customer" | "lead";
  partyId: string | null;
  defaultEdrpou: string;
  orderTotal: number;
  existingTtn: ExistingTtn | null;
  onSaved: (ttn: NpTtnResult | null) => void;
};

export function NovaPoshtaTtnDialog({
  open,
  onOpenChange,
  teamId,
  orderId,
  delivery,
  partyType,
  partyId,
  defaultEdrpou,
  orderTotal,
  existingTtn,
  onSaved,
}: NovaPoshtaTtnDialogProps) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<NovaPoshtaSettings | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [recipient, setRecipient] = useState<RecipientState | null>(null);
  const [cargo, setCargo] = useState<CargoState | null>(null);
  const [preview, setPreview] = useState<{ cost: number; date: string } | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [createdTtn, setCreatedTtn] = useState<ExistingTtn | null>(null);
  const [trackStatus, setTrackStatus] = useState<string | null>(null);

  const shownTtn = createdTtn ?? existingTtn;

  useEffect(() => {
    if (!open) return;
    setCreatedTtn(null);
    setPreview(null);
    if (existingTtn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const loaded = await loadNovaPoshtaSettings(teamId);
        if (cancelled) return;
        setSettings(loaded);

        const book = partyId ? await listPartyDeliveryPoints({ teamId, partyType, partyId }).catch(() => []) : [];
        const point = delivery.deliveryPointId ? book.find((entry) => entry.id === delivery.deliveryPointId) : undefined;
        const name = splitContactName(delivery.contactName ?? "");
        if (cancelled) return;

        setRecipient({
          recipientType: point?.recipientType ?? (defaultEdrpou ? "organization" : "private"),
          edrpou: point?.recipientEdrpou || defaultEdrpou || "",
          firstName: point?.contactFirstName || name.first,
          lastName: point?.contactLastName || name.last,
          phone: delivery.contactPhone || point?.contactPhone || "",
          cityRef: delivery.npCityRef || point?.npCityRef || "",
          cityName: delivery.city || point?.city || "",
          warehouseRef: delivery.npWarehouseRef || point?.npWarehouseRef || "",
          warehouseName: delivery.address || point?.address || "",
        });
        setCargo({
          weight: loaded?.defaultWeight != null ? String(loaded.defaultWeight) : "0.5",
          seats: String(loaded?.defaultSeats ?? 1),
          description: loaded?.defaultDescription || "Друкована продукція",
          cost: String(Math.max(0, Math.round(orderTotal || 0))),
          payer: loaded?.defaultPayer || "Recipient",
          paymentMethod: loaded?.defaultPaymentMethod || "Cash",
          cargoType: loaded?.defaultCargoType || "Parcel",
          serviceType: loaded?.defaultServiceType || "WarehouseWarehouse",
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof NovaPoshtaNotConfiguredError) setNotConfigured(true);
        else toast.error(error instanceof Error ? error.message : "Не вдалося підготувати ТТН");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, existingTtn, teamId, partyId, partyType, delivery, defaultEdrpou, orderTotal]);

  // Живий статус для вже створеної ТТН.
  useEffect(() => {
    if (!open || !shownTtn?.number) {
      setTrackStatus(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await trackNpDocument(shownTtn.number);
        if (!cancelled) setTrackStatus(result?.status || null);
      } catch {
        /* тихо — статус опційний */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, shownTtn?.number]);

  const updateRecipient = (patch: Partial<RecipientState>) =>
    setRecipient((prev) => (prev ? { ...prev, ...patch } : prev));
  const updateCargo = (patch: Partial<CargoState>) => setCargo((prev) => (prev ? { ...prev, ...patch } : prev));

  const senderReady = Boolean(
    settings?.senderRef && settings?.senderContactRef && settings?.senderCityRef && settings?.senderWarehouseRef
  );
  const recipientReady = Boolean(
    recipient?.cityRef &&
      recipient?.warehouseRef &&
      recipient?.firstName.trim() &&
      recipient?.lastName.trim() &&
      recipient?.phone &&
      (recipient.recipientType !== "organization" || recipient.edrpou.trim())
  );

  const handleCalculate = async () => {
    if (!settings || !recipient || !cargo) return;
    setCalculating(true);
    try {
      const [cost, date] = await Promise.all([
        getNpDocumentPrice({
          citySenderRef: settings.senderCityRef,
          cityRecipientRef: recipient.cityRef,
          weight: cargo.weight || "0.5",
          cost: cargo.cost || "0",
          cargoType: cargo.cargoType,
          serviceType: cargo.serviceType,
          seatsAmount: cargo.seats || "1",
        }),
        getNpDocumentDeliveryDate({
          citySenderRef: settings.senderCityRef,
          cityRecipientRef: recipient.cityRef,
          serviceType: cargo.serviceType,
        }),
      ]);
      setPreview({ cost, date });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося розрахувати");
    } finally {
      setCalculating(false);
    }
  };

  const handleCreate = async () => {
    if (!settings || !recipient || !cargo) return;
    if (!senderReady) {
      toast.error("Відправник не налаштований повністю");
      return;
    }
    setCreating(true);
    try {
      const { counterpartyRef, contactRef } = await saveNpRecipient({
        recipientType: recipient.recipientType,
        cityRef: recipient.cityRef,
        firstName: recipient.firstName.trim(),
        lastName: recipient.lastName.trim(),
        phone: recipient.phone,
        edrpou: recipient.edrpou.trim() || undefined,
      });
      const result = await createNpInternetDocument({
        citySenderRef: settings.senderCityRef,
        senderRef: settings.senderRef,
        senderAddressRef: settings.senderWarehouseRef,
        senderContactRef: settings.senderContactRef,
        senderPhone: settings.senderPhone,
        cityRecipientRef: recipient.cityRef,
        recipientRef: counterpartyRef,
        recipientAddressRef: recipient.warehouseRef,
        recipientContactRef: contactRef,
        recipientPhone: recipient.phone,
        payerType: cargo.payer,
        paymentMethod: cargo.paymentMethod,
        cargoType: cargo.cargoType,
        serviceType: cargo.serviceType,
        weight: cargo.weight || "0.5",
        seatsAmount: cargo.seats || "1",
        description: cargo.description || "Друкована продукція",
        cost: cargo.cost || "0",
      });
      const { updateOrderNovaPoshtaTtn } = await import("@/features/orders/orderRecords");
      await updateOrderNovaPoshtaTtn({ teamId, orderId, ttn: result });
      setCreatedTtn({
        number: result.number,
        ref: result.ref,
        cost: result.cost,
        estimatedDelivery: result.estimatedDelivery,
      });
      onSaved(result);
      toast.success(`ТТН ${result.number} створено`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося створити ТТН");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!shownTtn) return;
    setDeleting(true);
    try {
      if (shownTtn.ref) await deleteNpInternetDocument(shownTtn.ref);
      const { updateOrderNovaPoshtaTtn } = await import("@/features/orders/orderRecords");
      await updateOrderNovaPoshtaTtn({ teamId, orderId, ttn: null });
      onSaved(null);
      toast.success("ТТН скасовано");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося скасувати ТТН");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            {shownTtn ? "Експрес-накладна" : "Створити ТТН"}
          </DialogTitle>
          <DialogDescription>
            {shownTtn ? "Накладну створено в Новій Пошті." : "Нова Пошта — відправлення замовлення."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
          </div>
        ) : shownTtn ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Номер ТТН</div>
              <div className="mt-1 font-mono text-2xl font-semibold tracking-wide">{shownTtn.number}</div>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                {shownTtn.estimatedDelivery ? <span>Орієнтовно: {shownTtn.estimatedDelivery}</span> : null}
                {shownTtn.cost != null ? <span>Вартість: {money(shownTtn.cost)}</span> : null}
              </div>
              {trackStatus ? (
                <div className="mt-2 text-sm">
                  <span className="text-muted-foreground">Статус: </span>
                  <span className="font-medium text-foreground">{trackStatus}</span>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(shownTtn.number);
                  toast.success("Номер скопійовано");
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Копіювати номер
              </Button>
              <Button type="button" variant="outline" asChild>
                <a
                  href={`https://novaposhta.ua/tracking/?cargo_number=${encodeURIComponent(shownTtn.number)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" /> Відстежити
                </a>
              </Button>
              <Button type="button" variant="ghost" className="text-destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Скасувати ТТН
              </Button>
            </div>
          </div>
        ) : notConfigured ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50/50 p-4 text-sm dark:bg-amber-500/5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>Ключ API Нової Пошти не налаштований на сервері. Додайте його в env Netlify й задеплойте функції.</div>
          </div>
        ) : !senderReady ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50/50 p-4 text-sm dark:bg-amber-500/5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              Спершу заповни відправника в{" "}
              <Link to="/settings/nova-poshta" className="font-medium underline">
                Налаштування → Нова Пошта
              </Link>{" "}
              (контрагент, контакт, місто й відділення відправлення).
            </div>
          </div>
        ) : recipient && cargo ? (
          <div className="space-y-5">
            {/* Відправник (read-only) */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Відправник</div>
              <div className="mt-1 font-medium">{settings?.senderName || "—"}</div>
              <div className="text-muted-foreground">
                {[settings?.senderCityName, settings?.senderWarehouseName].filter(Boolean).join(", ") || "—"}
              </div>
            </div>

            {/* Отримувач */}
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Отримувач</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Тип отримувача</Label>
                  <Select
                    value={recipient.recipientType}
                    onValueChange={(value) => updateRecipient({ recipientType: value as DeliveryRecipientType })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(RECIPIENT_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {recipient.recipientType === "organization" ? (
                  <div className="grid gap-2">
                    <Label>ЄДРПОУ отримувача</Label>
                    <DigitsInput
                      value={recipient.edrpou}
                      onChange={(edrpou) => updateRecipient({ edrpou })}
                      maxLength={12}
                      placeholder="8 цифр"
                    />
                  </div>
                ) : null}
                <div className="grid gap-2">
                  <Label>Ім'я</Label>
                  <Input
                    value={recipient.firstName}
                    onChange={(event) => updateRecipient({ firstName: event.target.value })}
                    placeholder="Іван"
                    className="h-9"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Прізвище</Label>
                  <Input
                    value={recipient.lastName}
                    onChange={(event) => updateRecipient({ lastName: event.target.value })}
                    placeholder="Петренко"
                    className="h-9"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Телефон</Label>
                  <PhoneInput value={recipient.phone} onChange={(phone) => updateRecipient({ phone })} />
                </div>
                <div className="grid gap-2">
                  <Label>Місто</Label>
                  <NpCityCombobox
                    city={recipient.cityName}
                    onCityChange={(city) => updateRecipient({ cityName: city, cityRef: "", warehouseRef: "", warehouseName: "" })}
                    onSelect={(settlement) =>
                      updateRecipient({ cityName: settlement.present, cityRef: settlement.ref, warehouseRef: "", warehouseName: "" })
                    }
                  />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label>Відділення / поштомат</Label>
                  <NpWarehouseCombobox
                    cityRef={recipient.cityRef}
                    postomat={false}
                    value={recipient.warehouseName}
                    onValueChange={(warehouse) => updateRecipient({ warehouseName: warehouse, warehouseRef: "" })}
                    onSelect={(warehouse) => updateRecipient({ warehouseName: warehouse.description, warehouseRef: warehouse.ref })}
                  />
                </div>
              </div>
            </div>

            {/* Вантаж */}
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Вантаж</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Вага, кг</Label>
                  <Input
                    value={cargo.weight}
                    onChange={(event) => updateCargo({ weight: event.target.value.replace(",", ".") })}
                    inputMode="decimal"
                    className="h-9"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Місць</Label>
                  <Input
                    value={cargo.seats}
                    onChange={(event) => updateCargo({ seats: event.target.value.replace(/\D/g, "") || "1" })}
                    inputMode="numeric"
                    className="h-9"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Оголошена вартість, ₴</Label>
                  <Input
                    value={cargo.cost}
                    onChange={(event) => updateCargo({ cost: event.target.value.replace(/\D/g, "") })}
                    inputMode="numeric"
                    className="h-9"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Тип вантажу</Label>
                  <Select value={cargo.cargoType} onValueChange={(cargoType) => updateCargo({ cargoType })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CARGO_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Платник</Label>
                  <Select value={cargo.payer} onValueChange={(payer) => updateCargo({ payer })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAYER_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Оплата</Label>
                  <Select value={cargo.paymentMethod} onValueChange={(paymentMethod) => updateCargo({ paymentMethod })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label>Тип доставки</Label>
                  <Select value={cargo.serviceType} onValueChange={(serviceType) => updateCargo({ serviceType })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SERVICE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label>Опис вантажу</Label>
                  <Input
                    value={cargo.description}
                    onChange={(event) => updateCargo({ description: event.target.value })}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {preview ? (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm">
                Орієнтовна вартість доставки: <span className="font-semibold">{money(preview.cost)}</span>
                {preview.date ? <> · доставка ≈ {preview.date}</> : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Button type="button" variant="outline" onClick={handleCalculate} disabled={calculating || !recipient.cityRef}>
                {calculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                Розрахувати
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Скасувати
                </Button>
                <Button type="button" onClick={handleCreate} disabled={creating || !recipientReady}>
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
                  Створити ТТН
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
