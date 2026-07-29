import { useEffect, useState, type ReactNode } from "react";
import { Truck, AlertTriangle, Loader2, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { Card } from "@/components/ui/card";
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
  type NovaPoshtaBoxSize,
} from "@/lib/novaPoshtaSettings";

/**
 * Секція аркуша: підпис ліворуч, поля праворуч. Ліва колонка не декоративна —
 * вона зʼїдає ширину, тож на широкому екрані поля не розтягуються в кілометрові
 * інпути, а сторінка має видиму межу замість «полотна».
 */
function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-4 border-b border-border/60 p-5 md:grid-cols-[190px_minmax(0,1fr)] md:gap-6">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const SIDE_LABELS: Record<"length" | "width" | "height", string> = {
  length: "Довж.",
  width: "Шир.",
  height: "Вис.",
};

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
  // Знімок збереженого стану — щоб підвал чесно казав, чи є що зберігати.
  const [baseline, setBaseline] = useState(() => JSON.stringify({ settings: EMPTY_NOVA_POSHTA_SETTINGS, weightText: "" }));

  const update = (patch: Partial<NovaPoshtaSettings>) => setSettings((prev) => ({ ...prev, ...patch }));
  const updateBoxSize = (index: number, patch: Partial<NovaPoshtaBoxSize>) =>
    setSettings((prev) => ({
      ...prev,
      boxSizes: prev.boxSizes.map((box, i) => (i === index ? { ...box, ...patch } : box)),
    }));

  // Team + збережені налаштування + список відправників кабінету.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (teamId) {
          const loaded = await loadNovaPoshtaSettings(teamId);
          if (!cancelled && loaded) {
            const loadedWeight = loaded.defaultWeight != null ? String(loaded.defaultWeight) : "";
            setSettings(loaded);
            setWeightText(loadedWeight);
            setBaseline(JSON.stringify({ settings: loaded, weightText: loadedWeight }));
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
      const saved = { ...settings, defaultWeight: nextWeight };
      await saveNovaPoshtaSettings(teamId, saved);
      setBaseline(JSON.stringify({ settings: saved, weightText }));
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

  const isDirty = JSON.stringify({ settings, weightText }) !== baseline;

  return (
    // pb-10: AppLayout дає сторінці px і pt, але НЕ дає нижнього падінга —
    // без цього кнопка збереження впирається в самий край вікна.
    <div className="mx-auto w-full max-w-5xl pb-10">
      <Card className="overflow-visible">
        {/* Шапка аркуша: назва зліва, відповідь на головне питання — справа. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
              <Truck className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Нова Пошта</h1>
              <p className="text-xs text-muted-foreground">Відправник, дефолти ТТН і власні розміри коробок.</p>
            </div>
          </div>
          {!loading && !notConfigured ? (
            missingRequired.length === 0 ? (
              <span className="tone-success-subtle flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
                <CheckCircle2 className="tone-text-success h-3.5 w-3.5" />
                <span className="tone-text-success">Готово до створення ТТН</span>
              </span>
            ) : (
              <span className="tone-warning-subtle flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
                <AlertTriangle className="tone-text-warning h-3.5 w-3.5" />
                <span className="tone-text-warning">Не вистачає {missingRequired.length}</span>
              </span>
            )
          ) : null}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Завантаження…
          </div>
        ) : (
          <>
            <Section label="Хто і звідки відправляє" hint="Задається раз. Підставляється в кожну накладну без запитань.">
              <div className="grid items-start gap-4 sm:grid-cols-2">
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
              <div className="hidden md:block" />
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
              </div>
            </Section>

            <Section label="Що підставляти в нову ТТН" hint="Стартові значення. Менеджер може змінити їх у кожній накладній.">
              <div className="grid items-start gap-4 sm:grid-cols-2">
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
                <p className="text-xs text-muted-foreground">
                  Запасний варіант. Зазвичай опис береться з категорій товарів у замовленні — «Одяг»,
                  «Посуд». Це поле спрацює лише коли жодна позиція не привʼязана до каталогу.
                </p>
              </div>
              </div>
            </Section>

            {/* Окрема секція, а не поле в дефолтах: це список обʼєктів, і в формі
                ТТН він працює інакше — кнопками, а не підставлянням значення. */}
            <Section
              label="Наші коробки"
              hint="Розміри, у які реально пакуємо. У формі ТТН стають кнопками. НП рахує з них обʼємну вагу (1 м³ = 250 кг) і тарифікує за більшою з двох."
            >
              <div className="grid gap-3">
                <div className="grid gap-2">
                  {settings.boxSizes.map((box, index) => (
                    <div key={index} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2">
                      <Input
                        value={box.label}
                        onChange={(event) => updateBoxSize(index, { label: event.target.value })}
                        placeholder="Назва, напр. Мала"
                        className="h-9"
                      />
                      {(["length", "width", "height"] as const).map((side) => (
                        <Input
                          key={side}
                          value={box[side] ? String(box[side]) : ""}
                          onChange={(event) =>
                            updateBoxSize(index, { [side]: Number(event.target.value.replace(/\D/g, "")) || 0 })
                          }
                          inputMode="numeric"
                          aria-label={SIDE_LABELS[side]}
                          placeholder={SIDE_LABELS[side]}
                          className="h-9 w-20"
                        />
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 text-muted-foreground"
                        aria-label="Прибрати розмір"
                        onClick={() => update({ boxSizes: settings.boxSizes.filter((_, i) => i !== index) })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update({ boxSizes: [...settings.boxSizes, { label: "", length: 0, width: 0, height: 0 }] })
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Додати розмір
                  </Button>
                </div>
              </div>
            </Section>

            {/* sticky: на довгій сторінці кнопка не має тікати за нижній край. */}
            <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-b-[inherit] border-t border-border/60 bg-card/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
              <span className="text-xs text-muted-foreground">
                {isDirty ? "Є незбережені зміни" : "Усе збережено"}
              </span>
              <Button onClick={handleSave} disabled={saving || !teamId || !isDirty}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Зберегти
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
