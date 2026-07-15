import { useEffect, useState } from "react";
import { Truck, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { NpCityCombobox, NpWarehouseCombobox } from "@/components/customers/NovaPoshtaControls";
import {
  getNpSenders,
  getNpContactPersons,
  NovaPoshtaNotConfiguredError,
  type NpSender,
  type NpContactPerson,
} from "@/lib/novaPoshtaApi";
import {
  loadNovaPoshtaSettings,
  saveNovaPoshtaSettings,
  EMPTY_NOVA_POSHTA_SETTINGS,
  type NovaPoshtaSettings,
} from "@/lib/novaPoshtaSettings";

const PAYER_LABELS: Record<string, string> = {
  Recipient: "Отримувач",
  Sender: "Відправник (ми)",
  ThirdPerson: "Третя особа",
};
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

const errMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
};

export default function NovaPoshtaSettingsPage() {
  const { teamId } = useAuth();
  const [settings, setSettings] = useState<NovaPoshtaSettings>(EMPTY_NOVA_POSHTA_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [senders, setSenders] = useState<NpSender[]>([]);
  const [contacts, setContacts] = useState<NpContactPerson[]>([]);
  const [weightText, setWeightText] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const update = (patch: Partial<NovaPoshtaSettings>) => setSettings((prev) => ({ ...prev, ...patch }));

  // Team + збережені налаштування + список відправників кабінету.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (teamId) {
          const loaded = await loadNovaPoshtaSettings(teamId);
          if (!cancelled && loaded) {
            setSettings(loaded);
            setWeightText(loaded.defaultWeight != null ? String(loaded.defaultWeight) : "");
          }
        }
        try {
          const list = await getNpSenders();
          if (!cancelled) setSenders(list);
        } catch (error) {
          if (error instanceof NovaPoshtaNotConfiguredError) {
            if (!cancelled) setNotConfigured(true);
          } else {
            throw error;
          }
        }
      } catch (error) {
        if (!cancelled) toast.error(errMessage(error, "Не вдалося завантажити налаштування"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  // Контактні особи обраного відправника.
  useEffect(() => {
    if (!settings.senderRef || notConfigured) {
      setContacts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await getNpContactPersons(settings.senderRef);
        if (!cancelled) setContacts(list);
      } catch {
        /* тихо — контакти опційні */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.senderRef, notConfigured]);

  const handleSelectSender = (ref: string) => {
    const sender = senders.find((item) => item.ref === ref);
    update({
      senderRef: ref,
      senderName: sender?.name ?? "",
      senderContactRef: "",
      senderContactName: "",
    });
  };

  const handleSelectContact = (ref: string) => {
    const contact = contacts.find((item) => item.ref === ref);
    update({
      senderContactRef: ref,
      senderContactName: contact?.name ?? "",
      senderPhone: contact?.phone || settings.senderPhone,
    });
  };

  const handleSave = async () => {
    if (!teamId) {
      toast.error("Не знайдено команду");
      return;
    }
    setShowErrors(true);
    const missing: string[] = [];
    if (!settings.senderRef) missing.push("контрагент-відправник");
    if (!settings.senderContactRef) missing.push("контактна особа");
    if (!settings.senderPhone) missing.push("телефон відправника");
    if (!settings.senderCityRef) missing.push("місто відправлення");
    if (!settings.senderWarehouseRef) missing.push("відділення відправлення");
    if (missing.length > 0) {
      toast.error(`Для створення ТТН заповніть: ${missing.join(", ")}.`);
      return;
    }

    const parsedWeight = weightText.trim() === "" ? null : Number(weightText);
    const nextWeight =
      parsedWeight != null && Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : null;

    setSaving(true);
    try {
      await saveNovaPoshtaSettings(teamId, { ...settings, defaultWeight: nextWeight });
      toast.success("Налаштування Нової Пошти збережено");
    } catch (error) {
      toast.error(errMessage(error, "Не вдалося зберегти"));
    } finally {
      setSaving(false);
    }
  };

  const missingRequired = [
    !settings.senderRef && "контрагент-відправник",
    !settings.senderContactRef && "контактна особа",
    !settings.senderPhone && "телефон відправника",
    !settings.senderCityRef && "місто відправлення",
    !settings.senderWarehouseRef && "відділення відправлення",
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
          <Truck className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Нова Пошта</h1>
          <p className="text-sm text-muted-foreground">
            Відправник за замовчуванням для створення ТТН із замовлень.
          </p>
        </div>
      </div>

      {notConfigured ? (
        <Card className="border-amber-300/60 bg-amber-50/50 dark:bg-amber-500/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              Ключ API Нової Пошти не налаштований на сервері. Додайте{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">NOVA_POSHTA_API_KEY</code> у змінні
              середовища Netlify й повторно задеплойте функції — тоді список відправників підтягнеться з кабінету.
            </div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Завантаження…
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Відправник</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Контрагент-відправник <span className="text-destructive">*</span></Label>
                <Select value={settings.senderRef} onValueChange={handleSelectSender} disabled={notConfigured}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={senders.length ? "Оберіть відправника" : "Немає відправників у кабінеті"} />
                  </SelectTrigger>
                  <SelectContent>
                    {senders.map((sender) => (
                      <SelectItem key={sender.ref} value={sender.ref}>
                        {sender.name}
                        {sender.edrpou ? ` · ${sender.edrpou}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Контактна особа <span className="text-destructive">*</span></Label>
                <Select
                  value={settings.senderContactRef}
                  onValueChange={handleSelectContact}
                  disabled={notConfigured || !settings.senderRef}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={settings.senderRef ? "Оберіть контакт" : "Спершу відправник"} />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts.map((contact) => (
                      <SelectItem key={contact.ref} value={contact.ref}>
                        {contact.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Телефон відправника <span className="text-destructive">*</span></Label>
                <PhoneInput value={settings.senderPhone} onChange={(senderPhone) => update({ senderPhone })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Точка відправлення</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Місто відправлення <span className="text-destructive">*</span></Label>
                <NpCityCombobox
                  city={settings.senderCityName}
                  onCityChange={(city) => update({ senderCityName: city, senderCityRef: "", senderWarehouseRef: "", senderWarehouseName: "" })}
                  onSelect={(settlement) =>
                    update({
                      senderCityName: settlement.present,
                      senderCityRef: settlement.ref,
                      senderWarehouseRef: "",
                      senderWarehouseName: "",
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Відділення відправлення <span className="text-destructive">*</span></Label>
                <NpWarehouseCombobox
                  cityRef={settings.senderCityRef}
                  postomat={false}
                  value={settings.senderWarehouseName}
                  onValueChange={(warehouse) => update({ senderWarehouseName: warehouse, senderWarehouseRef: "" })}
                  onSelect={(warehouse) => update({ senderWarehouseName: warehouse.description, senderWarehouseRef: warehouse.ref })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Дефолти відправлення</CardTitle>
              <p className="text-sm text-muted-foreground">
                Необовʼязкові — лише підставляються у форму ТТН, де їх можна змінити під кожне відправлення.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Платник доставки</Label>
                <Select value={settings.defaultPayer} onValueChange={(defaultPayer) => update({ defaultPayer })}>
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
                <Label>Тип оплати</Label>
                <Select
                  value={settings.defaultPaymentMethod}
                  onValueChange={(defaultPaymentMethod) => update({ defaultPaymentMethod })}
                >
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
              <div className="grid gap-2">
                <Label>Тип вантажу</Label>
                <Select value={settings.defaultCargoType} onValueChange={(defaultCargoType) => update({ defaultCargoType })}>
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
                <Label>Тип доставки</Label>
                <Select
                  value={settings.defaultServiceType}
                  onValueChange={(defaultServiceType) => update({ defaultServiceType })}
                >
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
              <div className="grid gap-2">
                <Label>Вага за замовчуванням, кг</Label>
                <Input
                  value={weightText}
                  onChange={(event) => {
                    const raw = event.target.value.replace(",", ".");
                    if (/^\d*\.?\d*$/.test(raw)) setWeightText(raw);
                  }}
                  inputMode="decimal"
                  placeholder="напр. 0.5"
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">Якщо порожньо — у ТТН підставиться 0.5 кг.</p>
              </div>
              <div className="grid gap-2">
                <Label>Кількість місць</Label>
                <Input
                  value={String(settings.defaultSeats)}
                  onChange={(event) => update({ defaultSeats: Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1) })}
                  inputMode="numeric"
                  className="h-9"
                />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label>Опис вантажу</Label>
                <Input
                  value={settings.defaultDescription}
                  onChange={(event) => update({ defaultDescription: event.target.value })}
                  placeholder="напр. Друкована продукція"
                  className="h-9"
                />
              </div>
            </CardContent>
          </Card>

          {showErrors && missingRequired.length > 0 ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Щоб можна було створювати ТТН, заповніть: {missingRequired.join(", ")}.
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || !teamId}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Зберегти
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
