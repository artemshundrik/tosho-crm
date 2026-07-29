import * as React from "react";
import { Star } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DELIVERY_POINT_TYPE_ICONS,
  pointTypeToNpDeliveryType,
  type CustomerDeliveryPoint,
} from "@/lib/customerDeliveryPoints";
import { NpCityCombobox, NpStreetCombobox, NpWarehouseCombobox } from "@/components/customers/NovaPoshtaControls";

/**
 * Знімок доставки, що зберігається у quotes.delivery_details (jsonb).
 * contactName/contactPhone — отримувач для майбутньої ТТН; deliveryPointId —
 * м'яке посилання на точку в книзі клієнта (сам знімок лишається незмінним,
 * навіть якщо адресу в книзі потім відредагують чи видалять).
 */
export type QuoteDeliveryDetails = {
  region: string;
  city: string;
  address: string;
  street: string;
  npDeliveryType: string;
  payer: string;
  /** Отримувач: НП вимагає ім'я та прізвище нарізно. contactName — похідна склейка. */
  contactFirstName?: string;
  contactLastName?: string;
  contactName?: string;
  contactPhone?: string;
  deliveryPointId?: string;
  /** НП refs довідника (заповнюються автокомплітом) — для збереження в книгу й ТТН. */
  npCityRef?: string;
  npWarehouseRef?: string;
  npSettlementRef?: string;
};

export const createEmptyQuoteDeliveryDetails = (): QuoteDeliveryDetails => ({
  region: "",
  city: "",
  address: "",
  street: "",
  npDeliveryType: "",
  payer: "",
  contactFirstName: "",
  contactLastName: "",
  contactName: "",
  contactPhone: "",
  deliveryPointId: "",
  npCityRef: "",
  npWarehouseRef: "",
  npSettlementRef: "",
});

const trimDelivery = (value?: string | null) => value?.trim() ?? "";

/** "Іван" + "Петренко" → "Іван Петренко". Похідне поле для старих читачів. */
const joinContactName = (first?: string, last?: string) =>
  [trimDelivery(first), trimDelivery(last)].filter(Boolean).join(" ");

/**
 * Обовʼязкові поля логістики за типом доставки. Спільне джерело правди для
 * прорахунку і замовлення — щоб вимоги не розʼїхались між формами.
 * Повертає текст проблеми або null, якщо все заповнено.
 */
export const getQuoteDeliveryIssues = (
  deliveryType?: string | null,
  details?: QuoteDeliveryDetails | null
): string | null => {
  const deliveryDetails = details ?? createEmptyQuoteDeliveryDetails();
  const hasRegion = trimDelivery(deliveryDetails.region).length > 0;
  const hasCity = trimDelivery(deliveryDetails.city).length > 0;
  const hasAddress = trimDelivery(deliveryDetails.address).length > 0;
  const hasStreet = trimDelivery(deliveryDetails.street).length > 0;
  const hasNpDeliveryType = trimDelivery(deliveryDetails.npDeliveryType).length > 0;

  if (deliveryType === "nova_poshta") {
    if (!hasCity) return "для Нової пошти заповніть місто";
    if (!hasNpDeliveryType) return "для Нової пошти оберіть тип доставки";
    if (deliveryDetails.npDeliveryType === "address" && !hasStreet) return "для адресної доставки заповніть вулицю";
    if (deliveryDetails.npDeliveryType !== "address" && !hasAddress) return "для Нової пошти оберіть відділення / поштомат";
  }
  if (deliveryType === "taxi") {
    if (!hasCity) return "для таксі / Uklon заповніть місто";
    if (!hasAddress) return "для таксі / Uklon заповніть адресу";
  }
  if (deliveryType === "cargo") {
    if (!hasRegion) return "для вантажного перевезення заповніть область";
    if (!hasCity) return "для вантажного перевезення заповніть місто";
    if (!hasAddress) return "для вантажного перевезення заповніть адресу";
  }
  return null;
};

/** Лишає тільки релевантні для обраного типу доставки поля (решту чистить). */
export const sanitizeQuoteDeliveryDetails = (
  deliveryType?: string | null,
  details?: QuoteDeliveryDetails | null
): QuoteDeliveryDetails | null => {
  if (!deliveryType) return null;
  const deliveryDetails = details ?? createEmptyQuoteDeliveryDetails();
  const sanitized: QuoteDeliveryDetails = createEmptyQuoteDeliveryDetails();
  sanitized.payer = trimDelivery(deliveryDetails.payer);
  if (deliveryType === "nova_poshta") {
    sanitized.region = trimDelivery(deliveryDetails.region);
    sanitized.city = trimDelivery(deliveryDetails.city);
    sanitized.npDeliveryType = trimDelivery(deliveryDetails.npDeliveryType);
    sanitized.street = sanitized.npDeliveryType === "address" ? trimDelivery(deliveryDetails.street) : "";
    sanitized.address = sanitized.npDeliveryType === "address" ? "" : trimDelivery(deliveryDetails.address);
    sanitized.contactFirstName = trimDelivery(deliveryDetails.contactFirstName);
    sanitized.contactLastName = trimDelivery(deliveryDetails.contactLastName);
    sanitized.contactName =
      joinContactName(deliveryDetails.contactFirstName, deliveryDetails.contactLastName) ||
      trimDelivery(deliveryDetails.contactName);
    sanitized.contactPhone = trimDelivery(deliveryDetails.contactPhone);
    sanitized.deliveryPointId = trimDelivery(deliveryDetails.deliveryPointId);
    sanitized.npCityRef = trimDelivery(deliveryDetails.npCityRef);
    sanitized.npWarehouseRef = trimDelivery(deliveryDetails.npWarehouseRef);
    sanitized.npSettlementRef = trimDelivery(deliveryDetails.npSettlementRef);
  }
  if (deliveryType === "taxi") {
    sanitized.city = trimDelivery(deliveryDetails.city);
    sanitized.address = trimDelivery(deliveryDetails.address);
    sanitized.npCityRef = trimDelivery(deliveryDetails.npCityRef);
    sanitized.npSettlementRef = trimDelivery(deliveryDetails.npSettlementRef);
  }
  if (deliveryType === "cargo") {
    sanitized.region = trimDelivery(deliveryDetails.region);
    sanitized.city = trimDelivery(deliveryDetails.city);
    sanitized.address = trimDelivery(deliveryDetails.address);
    sanitized.npCityRef = trimDelivery(deliveryDetails.npCityRef);
    sanitized.npSettlementRef = trimDelivery(deliveryDetails.npSettlementRef);
  }
  return sanitized;
};

export const NOVA_POSHTA_DELIVERY_TYPES = [
  { value: "branch", label: "Відділення" },
  { value: "locker", label: "Поштомат" },
  { value: "address", label: "Адресна" },
];

export const DELIVERY_PAYER_OPTIONS = [
  { value: "company", label: "Ми" },
  { value: "client", label: "Замовник" },
];

/** Заповнення знімка з точки книги клієнта (для пікера та автопідстановки ★). */
export const patchFromDeliveryPoint = (point: CustomerDeliveryPoint): Partial<QuoteDeliveryDetails> => ({
  city: point.city,
  npDeliveryType: pointTypeToNpDeliveryType(point.type),
  address: point.type === "np_courier" ? "" : point.address,
  street: point.type === "np_courier" ? point.address : "",
  contactFirstName: point.contactFirstName,
  contactLastName: point.contactLastName,
  contactName: point.contactName,
  contactPhone: point.contactPhone,
  deliveryPointId: point.id,
  npCityRef: point.npCityRef ?? "",
  npWarehouseRef: point.npWarehouseRef ?? "",
  npSettlementRef: point.npSettlementRef ?? "",
});

const MANUAL_POINT_VALUE = "__manual__";

type QuoteDeliveryFieldsProps = {
  deliveryType: string;
  details: QuoteDeliveryDetails;
  onChange: (patch: Partial<QuoteDeliveryDetails>) => void;
  /** НП-адреси з книги обраного замовника/ліда (порожньо — пікер не показується). */
  savedPoints: CustomerDeliveryPoint[];
  /** Чи зберігати введену вручну адресу в картку клієнта при збереженні форми. */
  saveToCard: boolean;
  onSaveToCardChange: (value: boolean) => void;
  /** Замовника обрано — можна пропонувати збереження в картку. */
  canSaveToCard: boolean;
};

export function QuoteDeliveryFields({
  deliveryType,
  details,
  onChange,
  savedPoints,
  saveToCard,
  onSaveToCardChange,
  canSaveToCard,
}: QuoteDeliveryFieldsProps) {
  const isNovaPoshta = deliveryType === "nova_poshta";
  const npPoints = React.useMemo(
    () => savedPoints.filter((point) => point.type !== "other"),
    [savedPoints]
  );
  const selectedPoint = details.deliveryPointId
    ? npPoints.find((point) => point.id === details.deliveryPointId) ?? null
    : null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {isNovaPoshta && npPoints.length === 0 && canSaveToCard ? (
        <div className="md:col-span-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          У клієнта ще немає збережених адрес доставки. Заповніть нову нижче — вона додасться в картку клієнта
          (Логістика) і наступного разу підтягнеться сюди автоматично.
        </div>
      ) : null}

      {isNovaPoshta && npPoints.length > 0 ? (
        <div className="space-y-1 md:col-span-2">
          <div className="text-sm text-muted-foreground">Адреса з картки клієнта</div>
          <Select
            value={selectedPoint ? selectedPoint.id : MANUAL_POINT_VALUE}
            onValueChange={(value) => {
              if (value === MANUAL_POINT_VALUE) {
                onChange({ deliveryPointId: "" });
                return;
              }
              const point = npPoints.find((entry) => entry.id === value);
              if (point) onChange(patchFromDeliveryPoint(point));
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Оберіть збережену адресу" />
            </SelectTrigger>
            <SelectContent>
              {npPoints.map((point) => {
                const Icon = DELIVERY_POINT_TYPE_ICONS[point.type];
                return (
                  <SelectItem key={point.id} value={point.id}>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {[point.city, point.address].filter(Boolean).join(", ") || "Без адреси"}
                      {point.isDefault ? <Star className="h-3 w-3 fill-star text-star" /> : null}
                    </span>
                  </SelectItem>
                );
              })}
              <SelectItem value={MANUAL_POINT_VALUE}>Ввести нову адресу вручну</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {isNovaPoshta ? (
        <>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Область{selectedPoint ? "" : " *"}</div>
            <Input
              value={details.region}
              onChange={(e) => onChange({ region: e.target.value })}
              placeholder="Київська"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Місто *</div>
            <NpCityCombobox
              city={details.city}
              onCityChange={(city) =>
                onChange({ city, npCityRef: "", npWarehouseRef: "", npSettlementRef: "" })
              }
              onSelect={(settlement) =>
                onChange({
                  city: settlement.present,
                  npCityRef: settlement.ref,
                  npSettlementRef: settlement.settlementRef,
                  region: settlement.area || details.region,
                  address: "",
                  npWarehouseRef: "",
                })
              }
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Тип доставки *</div>
            <Select
              value={details.npDeliveryType}
              onValueChange={(value) =>
                onChange({ npDeliveryType: value, street: value === "address" ? details.street : "" })
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Оберіть тип доставки" />
              </SelectTrigger>
              <SelectContent>
                {NOVA_POSHTA_DELIVERY_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Хто платить</div>
            <Select value={details.payer} onValueChange={(value) => onChange({ payer: value })}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Оберіть варіант" />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_PAYER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {details.npDeliveryType === "address" ? (
            <div className="space-y-1 md:col-span-2">
              <div className="text-sm text-muted-foreground">Вулиця *</div>
              <NpStreetCombobox
                settlementRef={details.npSettlementRef ?? ""}
                value={details.street}
                onValueChange={(street) => onChange({ street })}
                onSelect={(street) => onChange({ street: `${street.present}, ` })}
              />
            </div>
          ) : (
            <div className="space-y-1 md:col-span-2">
              <div className="text-sm text-muted-foreground">Відділення / поштомат</div>
              <NpWarehouseCombobox
                cityRef={details.npCityRef ?? ""}
                postomat={details.npDeliveryType === "locker"}
                value={details.address}
                onValueChange={(address) => onChange({ address, npWarehouseRef: "" })}
                onSelect={(warehouse) =>
                  onChange({ address: warehouse.description, npWarehouseRef: warehouse.ref })
                }
              />
            </div>
          )}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Ім'я отримувача</div>
            <Input
              value={details.contactFirstName ?? ""}
              onChange={(e) => onChange({ contactFirstName: e.target.value })}
              placeholder="Іван"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Прізвище отримувача</div>
            <Input
              value={details.contactLastName ?? ""}
              onChange={(e) => onChange({ contactLastName: e.target.value })}
              placeholder="Петренко"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Телефон отримувача</div>
            <PhoneInput
              value={details.contactPhone ?? ""}
              onChange={(contactPhone) => onChange({ contactPhone })}
            />
          </div>
          {canSaveToCard && !details.deliveryPointId ? (
            <label className="flex cursor-pointer items-center gap-2 md:col-span-2">
              <Checkbox
                checked={saveToCard}
                onCheckedChange={(checked) => onSaveToCardChange(checked === true)}
              />
              <span className="text-sm text-muted-foreground">
                Зберегти адресу в картку клієнта (Логістика)
              </span>
            </label>
          ) : null}
        </>
      ) : null}

      {deliveryType === "taxi" ? (
        <>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Місто *</div>
            <NpCityCombobox
              city={details.city}
              onCityChange={(city) => onChange({ city, npCityRef: "", npSettlementRef: "" })}
              onSelect={(settlement) =>
                onChange({
                  city: settlement.present,
                  npCityRef: settlement.ref,
                  npSettlementRef: settlement.settlementRef,
                  address: "",
                })
              }
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Хто платить</div>
            <Select value={details.payer} onValueChange={(value) => onChange({ payer: value })}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Оберіть варіант" />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_PAYER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <div className="text-sm text-muted-foreground">Адреса *</div>
            <NpStreetCombobox
              settlementRef={details.npSettlementRef ?? ""}
              value={details.address}
              onValueChange={(address) => onChange({ address })}
              onSelect={(street) => onChange({ address: `${street.present}, ` })}
            />
          </div>
        </>
      ) : null}

      {deliveryType === "cargo" ? (
        <>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Область *</div>
            <Input
              value={details.region}
              onChange={(e) => onChange({ region: e.target.value })}
              placeholder="Київська"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Місто *</div>
            <NpCityCombobox
              city={details.city}
              onCityChange={(city) => onChange({ city, npCityRef: "", npSettlementRef: "" })}
              onSelect={(settlement) =>
                onChange({
                  city: settlement.present,
                  npCityRef: settlement.ref,
                  npSettlementRef: settlement.settlementRef,
                  region: settlement.area || details.region,
                  address: "",
                })
              }
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <div className="text-sm text-muted-foreground">Адреса *</div>
            <NpStreetCombobox
              settlementRef={details.npSettlementRef ?? ""}
              value={details.address}
              onValueChange={(address) => onChange({ address })}
              onSelect={(street) => onChange({ address: `${street.present}, ` })}
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Хто платить</div>
            <Select value={details.payer} onValueChange={(value) => onChange({ payer: value })}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Оберіть варіант" />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_PAYER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : null}

      {deliveryType === "pickup" ? (
        <div className="text-sm text-muted-foreground md:col-span-2">
          Самовивіз з нашого офісу — додаткові дані не потрібні.
        </div>
      ) : null}
    </div>
  );
}
