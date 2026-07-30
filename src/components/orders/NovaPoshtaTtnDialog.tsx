import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  PackageCheck,
  Copy,
  ExternalLink,
  Trash2,
  AlertTriangle,
  Printer,
  Plus,
  RefreshCw,
  User,
  Box,
  Tag,
  Wallet,
  type LucideIcon,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/ui/phone-input";
import { DigitsInput } from "@/components/ui/digits-input";
import { NpCityCombobox, NpWarehouseCombobox } from "@/components/customers/NovaPoshtaControls";
import type { QuoteDeliveryDetails } from "@/components/quotes/QuoteDeliveryFields";
import { listPartyDeliveryPoints, splitContactName, type DeliveryRecipientType } from "@/lib/customerDeliveryPoints";
import { listCatalogTypeNamesByModelIds } from "@/lib/toshoApi";
import {
  saveNpRecipient,
  getNpDocumentPrice,
  getNpDocumentDeliveryDate,
  createNpInternetDocument,
  deleteNpInternetDocument,
  trackNpDocument,
  fetchNpMarkingPdfUrl,
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

/**
 * Хто платить за доставку — це домовленість із замовлення, а не дефолт налаштувань.
 * У `delivery.payer` лежить «company» (платимо ми) / «client» (платить замовник).
 * Без цього мапінгу ТТН створювалась із дефолтним «Отримувач», і клієнту прилітав
 * рахунок за доставку, яку ми пообіцяли оплатити.
 */
const npPayerFromDelivery = (payer: string | undefined): string | null => {
  if (payer === "company") return "Sender";
  if (payer === "client") return "Recipient";
  return null;
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

/**
 * Група однакових місць: «2 × велика по 6 кг». НП у OptionsSeat чекає рядок на
 * КОЖНЕ місце, але вбивати шість однакових коробок руками — знущання, тож
 * тримаємо групи й розгортаємо їх перед відправкою.
 */
type CargoSeatGroup = {
  id: string;
  /** Скільки таких коробок. */
  count: string;
  /** Сторони в см. Порожньо — розміри не передаємо, тариф піде лише за вагою. */
  length: string;
  width: string;
  height: string;
  /** Вага ОДНІЄЇ коробки цієї групи, кг. */
  weight: string;
  /** Ключ обраного пресета з налаштувань. Порожньо = розмір введений руками. */
  packRef: string;
};

type CargoState = {
  seatGroups: CargoSeatGroup[];
  description: string;
  cost: string;
  payer: string;
  paymentMethod: string;
  cargoType: string;
  serviceType: string;
};

/** Ціле число без провідних нулів; порожній рядок дозволений, щоб поле можна було стерти. */
const digitsOnly = (value: string) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

/** Десяткове з однією крапкою: «1,5» → «1.5», літери відкидаються, порожнє дозволене. */
const decimalOnly = (value: string) => {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [head, ...rest] = normalized.split(".");
  return rest.length > 0 ? `${head}.${rest.join("")}` : head;
};

type RowKey = "recipient" | "cargo" | "goods" | "payment";

const SIDE_PLACEHOLDERS: Record<"length" | "width" | "height", string> = {
  length: "Д",
  width: "Ш",
  height: "В",
};

const seatsWord = (count: number) => {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return "коробок";
  const last = count % 10;
  if (last === 1) return "коробка";
  if (last >= 2 && last <= 4) return "коробки";
  return "коробок";
};

/**
 * Рядок-факт: згорнутий показує значення й наслідок, розгорнутий — поля.
 * Наслідок у підзаголовку свідомо: менеджер підтверджує документ, а не заповнює
 * форму, тож йому важливіше «тариф піде за обʼємною», ніж саме число в полі.
 */
function FactRow({
  icon: Icon,
  title,
  subtitle,
  incomplete = false,
  warning = false,
  expanded,
  onToggle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  incomplete?: boolean;
  warning?: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(expanded && "bg-muted/20")}>
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon
          className={cn(
            "h-[18px] w-[18px] shrink-0",
            incomplete ? "text-destructive" : expanded ? "text-foreground" : "text-muted-foreground"
          )}
        />
        <div className={cn("min-w-0 flex-1", !expanded && "cursor-pointer")} onClick={expanded ? undefined : onToggle}>
          <div className="truncate text-sm text-foreground">{title}</div>
          <div className={cn("truncate text-xs", incomplete ? "text-destructive" : warning ? "tone-text-warning" : "text-muted-foreground")}>
            {subtitle}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={onToggle}>
          {expanded ? "Згорнути" : incomplete ? "Заповнити" : "Змінити"}
        </Button>
      </div>
      {expanded ? <div className="px-4 pb-4 pl-[46px]">{children}</div> : null}
    </div>
  );
}

const toPositiveNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const groupCount = (group: CargoSeatGroup) => Math.max(1, Math.round(toPositiveNumber(group.count, 1)));
const groupWeight = (group: CargoSeatGroup) => toPositiveNumber(group.weight, 0.5);
const groupHasSides = (group: CargoSeatGroup) =>
  [group.length, group.width, group.height].every((side) => Number(side) > 0);

/**
 * Об'ємна вага за правилом НП: 1 м³ = 250 кг, тобто Д×Ш×В(см) / 4000.
 * Тарифікується більша з двох — фактична чи об'ємна, тож показуємо це наперед.
 * Рахуємо по групах: різні коробки дають різний обʼєм, і саме тому «один розмір
 * на все» давав НП неправдиву картину.
 */
const volumetricWeightKg = (groups: CargoSeatGroup[]) => {
  if (groups.length === 0 || !groups.every(groupHasSides)) return null;
  return groups.reduce(
    (sum, group) =>
      sum + ((Number(group.length) * Number(group.width) * Number(group.height)) / 4000) * groupCount(group),
    0
  );
};

const createSeatGroup = (weight: string): CargoSeatGroup => ({
  id: crypto.randomUUID(),
  count: "1",
  length: "",
  width: "",
  height: "",
  weight,
  packRef: "",
});

type NovaPoshtaTtnDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  orderId: string;
  delivery: QuoteDeliveryDetails;
  partyType: "customer" | "lead";
  partyId: string | null;
  defaultEdrpou: string;
  /** Моделі каталогу з позицій замовлення — з їхніх категорій складається опис вантажу. */
  catalogModelIds: string[];
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
  catalogModelIds,
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
  const [printingMarking, setPrintingMarking] = useState(false);
  const [createdTtn, setCreatedTtn] = useState<ExistingTtn | null>(null);
  const [trackStatus, setTrackStatus] = useState<string | null>(null);
  // Модалка — це підтвердження, а не форма: усе вже прийшло із замовлення, тож
  // показуємо факти рядками й розкриваємо рівно той, який менеджер вирішив чіпати.
  const [expandedRow, setExpandedRow] = useState<RowKey | null>(null);
  const toggleRow = (row: RowKey) => setExpandedRow((current) => (current === row ? null : row));

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

        // Опис вантажу = категорії товарів із каталогу («Одяг», «Одяг, Посуд»).
        // Це те, що реально їде в коробці, а не захардкоджена «друкована продукція».
        const typeNames = await listCatalogTypeNamesByModelIds(catalogModelIds).catch(() => new Map<string, string>());
        const cargoDescription =
          Array.from(new Set(catalogModelIds.map((id) => typeNames.get(id)).filter(Boolean) as string[])).join(", ") ||
          loaded?.defaultDescription ||
          "Друкована продукція";

        const book = partyId ? await listPartyDeliveryPoints({ teamId, partyType, partyId }).catch(() => []) : [];
        const point = delivery.deliveryPointId ? book.find((entry) => entry.id === delivery.deliveryPointId) : undefined;
        // Порядок джерел імені: збережена точка книги → знімок доставки → застаріла склейка.
        // splitContactName тут лишається ЛИШЕ для знімків, збережених до розділення полів:
        // він вгадує (перше слово = ім'я), тож справжні поля мають пріоритет над ним.
        const legacyName = splitContactName(delivery.contactName ?? "");
        if (cancelled) return;

        // Неповного отримувача не ховаємо за згорнутим рядком — одразу відкриваємо,
        // бо це єдине, що заважає створити ТТН.
        const nextRecipientReady = Boolean(
          (delivery.npCityRef || point?.npCityRef) &&
            (delivery.npWarehouseRef || point?.npWarehouseRef) &&
            (delivery.contactPhone || point?.contactPhone)
        );
        setExpandedRow(nextRecipientReady ? null : "recipient");

        setRecipient({
          recipientType: point?.recipientType ?? (defaultEdrpou ? "organization" : "private"),
          edrpou: point?.recipientEdrpou || defaultEdrpou || "",
          firstName: point?.contactFirstName || delivery.contactFirstName || legacyName.first,
          lastName: point?.contactLastName || delivery.contactLastName || legacyName.last,
          phone: delivery.contactPhone || point?.contactPhone || "",
          cityRef: delivery.npCityRef || point?.npCityRef || "",
          cityName: delivery.city || point?.city || "",
          warehouseRef: delivery.npWarehouseRef || point?.npWarehouseRef || "",
          warehouseName: delivery.address || point?.address || "",
        });
        setCargo({
          seatGroups: [
            {
              ...createSeatGroup(loaded?.defaultWeight != null ? String(loaded.defaultWeight) : "0.5"),
              count: String(loaded?.defaultSeats ?? 1),
            },
          ],
          description: cargoDescription,
          cost: String(Math.max(0, Math.round(orderTotal || 0))),
          payer: npPayerFromDelivery(delivery.payer) ?? loaded?.defaultPayer ?? "Recipient",
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
  }, [open, existingTtn, teamId, partyId, partyType, delivery, defaultEdrpou, catalogModelIds, orderTotal]);

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
  // Стару ціну не гасимо одразу — ефект нижче сам перерахує; поки він у роботі,
  // підвал показує попереднє число притухлим із позначкою «перерахунок».
  const updateCargo = (patch: Partial<CargoState>) => setCargo((prev) => (prev ? { ...prev, ...patch } : prev));

  // Поля можна лишати порожніми під час набору — до НП летять уже нормалізовані значення.
  const seatGroups = cargo?.seatGroups ?? [];
  const seatsCount = seatGroups.reduce((sum, group) => sum + groupCount(group), 0) || 1;
  const totalWeight =
    Math.round(seatGroups.reduce((sum, group) => sum + groupWeight(group) * groupCount(group), 0) * 100) / 100 || 0.5;
  const declaredCost = String(Math.max(0, Math.round(toPositiveNumber(cargo?.cost ?? "", 0))));
  const volumetric = volumetricWeightKg(seatGroups);

  const updateSeatGroup = (id: string, patch: Partial<CargoSeatGroup>) =>
    updateCargo({ seatGroups: seatGroups.map((group) => (group.id === id ? { ...group, ...patch } : group)) });
  const addSeatGroup = () =>
    updateCargo({ seatGroups: [...seatGroups, createSeatGroup(seatGroups.at(-1)?.weight ?? "0.5")] });
  const removeSeatGroup = (id: string) =>
    updateCargo({ seatGroups: seatGroups.filter((group) => group.id !== id) });
  // Тип доставки із замовлення: поштомат шукається окремим довідником, а адресна
  // доставка тут ще не підтримується (їй потрібен Address.save, а не ref відділення).
  const isPostomatDelivery = delivery.npDeliveryType === "locker";
  const isAddressDelivery = delivery.npDeliveryType === "address";
  // Свої коробки з налаштувань команди. Каталог НП сюди не годиться — це те, що
  // вони продають у відділенні, а ми возимо у власних і постачальницьких коробах.
  const boxSizes = settings?.boxSizes ?? [];
  const boxSizeLabel = (box: (typeof boxSizes)[number]) =>
    box.label ? `${box.label} · ${box.length}×${box.width}×${box.height}` : `${box.length}×${box.width}×${box.height}`;
  /** «2 × Велика 60×40×40» — коротко, для згорнутого рядка. */
  const describeSeatGroup = (group: CargoSeatGroup) => {
    const preset = boxSizes.find((box) => `${box.length}x${box.width}x${box.height}` === group.packRef)?.label;
    const dims = groupHasSides(group) ? `${group.length}×${group.width}×${group.height}` : "розмір не вказано";
    return `${groupCount(group)} × ${preset ? `${preset} ${dims}` : dims}`;
  };

  // Розгортаємо групи в рядок на кожне місце — саме цього чекає OptionsSeat.
  // Розміри передаємо, лише коли ВСІ групи мають три сторони: часткові дані НП
  // прийме, але порахує обʼєм не по всьому відправленню.
  const optionsSeat =
    volumetric !== null
      ? seatGroups.flatMap((group) =>
          Array.from({ length: groupCount(group) }, () => ({
            volumetricLength: group.length,
            volumetricWidth: group.width,
            volumetricHeight: group.height,
            weight: groupWeight(group).toFixed(2),
          }))
        )
      : undefined;

  const senderReady = Boolean(
    settings?.senderRef && settings?.senderContactRef && settings?.senderCityRef && settings?.senderWarehouseRef
  );
  // Список, а не просто boolean: сіра кнопка без пояснення — найгірше, що можна
  // показати менеджеру, коли не заповнене одне поле десь угорі форми.
  const missingRecipientFields: string[] = [
    !recipient?.cityRef && "місто",
    !recipient?.warehouseRef && "відділення",
    !recipient?.firstName.trim() && "ім'я",
    !recipient?.lastName.trim() && "прізвище",
    !recipient?.phone && "телефон",
    recipient?.recipientType === "organization" && !recipient.edrpou.trim() && "ЄДРПОУ",
  ].filter((entry): entry is string => typeof entry === "string");
  const recipientReady = Boolean(recipient) && missingRecipientFields.length === 0;

  // Свіжі значення для ефекту цін — щоб він залежав лише від «відбитка» вводу,
  // а не від масивів і обʼєктів, що народжуються заново на кожен рендер.
  const priceInputs = { settings, recipient, cargo, optionsSeat, totalWeight, declaredCost, seatsCount };
  const priceInputsRef = useRef(priceInputs);
  priceInputsRef.current = priceInputs;

  const canPrice = Boolean(!shownTtn && settings?.senderCityRef && recipient?.cityRef && cargo);
  const priceKey = canPrice
    ? [
        recipient?.cityRef,
        cargo?.cargoType,
        cargo?.serviceType,
        totalWeight,
        seatsCount,
        declaredCost,
        // Групи в ключі цілком: зміна розміру однієї коробки міняє тариф.
        seatGroups.map((g) => `${g.count}/${g.length}x${g.width}x${g.height}/${g.weight}`).join(","),
      ].join("|")
    : "";

  // Ціна рахується сама — кнопки «Розрахувати» немає. Дебаунс, бо інакше кожне
  // натискання в полі ваги стріляло б запитом у НП.
  useEffect(() => {
    if (!open || !priceKey) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setCalculating(true);
    const timer = window.setTimeout(() => {
      const { settings: s, recipient: r, cargo: c, optionsSeat: seats, totalWeight: w, declaredCost: dc, seatsCount: n } =
        priceInputsRef.current;
      if (!s || !r || !c) return;
      void Promise.all([
        getNpDocumentPrice({
          citySenderRef: s.senderCityRef,
          cityRecipientRef: r.cityRef,
          weight: String(w),
          cost: dc,
          cargoType: c.cargoType,
          serviceType: c.serviceType,
          seatsAmount: String(n),
          optionsSeat: seats,
        }),
        getNpDocumentDeliveryDate({
          citySenderRef: s.senderCityRef,
          cityRecipientRef: r.cityRef,
          serviceType: c.serviceType,
        }),
      ])
        .then(([cost, date]) => {
          if (!cancelled) setPreview({ cost, date });
        })
        .catch(() => {
          // Тихо: прорахунок — підказка, а не умова відправки. Реальну помилку
          // менеджер побачить при створенні ТТН.
          if (!cancelled) setPreview(null);
        })
        .finally(() => {
          if (!cancelled) setCalculating(false);
        });
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, priceKey]);

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
        weight: String(totalWeight),
        seatsAmount: String(seatsCount),
        description: cargo.description.trim() || "Друкована продукція",
        cost: declaredCost,
        optionsSeat,
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

  const handlePrintMarking = async () => {
    if (!shownTtn?.ref) return;
    setPrintingMarking(true);
    try {
      const url = await fetchNpMarkingPdfUrl(shownTtn.ref);
      window.open(url, "_blank", "noopener,noreferrer");
      // Вкладка вже тримає документ; URL звільняємо, щоб blob не висів у памʼяті.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося відкрити маркування");
    } finally {
      setPrintingMarking(false);
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
      {/* Шапка й кнопки зафіксовані, скролиться лише тіло форми — вона довга. */}
      <DialogContent className="max-w-2xl max-h-[90vh] gap-0 p-0 sm:gap-0 sm:p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            {shownTtn ? "Експрес-накладна" : "Створити ТТН"}
          </DialogTitle>
          {/* Відправник не змінюється ніколи — йому досить рядка в шапці, а не картки. */}
          <DialogDescription>
            {shownTtn
              ? "Накладну створено в Новій Пошті."
              : senderReady
                ? `Від ${settings?.senderName ?? "—"} · ${[settings?.senderCityName, settings?.senderWarehouseName].filter(Boolean).join(", ")}`
                : "Нова Пошта — відправлення замовлення."}
          </DialogDescription>
        </DialogHeader>
        {/* overscroll-contain: дійшовши до краю, прокрутка не перекидається на сторінку позаду. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">

        {loading ? (
          <div className="flex items-center gap-2 px-5 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
          </div>
        ) : shownTtn ? (
          <div className="space-y-4 px-5 py-4">
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
              {shownTtn.ref ? (
                <Button type="button" onClick={handlePrintMarking} disabled={printingMarking}>
                  {printingMarking ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Printer className="mr-2 h-4 w-4" />
                  )}
                  Друкувати наліпку
                </Button>
              ) : null}
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
          <div className="tone-warning-subtle m-5 flex items-start gap-3 rounded-xl border p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 tone-text-warning" />
            <div>Ключ API Нової Пошти не налаштований на сервері. Додайте його в env Netlify й задеплойте функції.</div>
          </div>
        ) : !senderReady ? (
          <div className="tone-warning-subtle m-5 flex items-start gap-3 rounded-xl border p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 tone-text-warning" />
            <div>
              Спершу заповни відправника в{" "}
              <Link to="/settings/nova-poshta" className="font-medium underline">
                Налаштування → Нова Пошта
              </Link>{" "}
              (контрагент, контакт, місто й відділення відправлення).
            </div>
          </div>
        ) : recipient && cargo ? (
          <div className="divide-y divide-border/60">
            {isAddressDelivery ? (
              <div className="tone-warning-subtle flex items-start gap-3 border-b border-border/60 p-3 text-sm">
                <AlertTriangle className="tone-text-warning mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  У замовленні вказана <b>адресна доставка</b>, а тут поки можна оформити лише на відділення чи
                  поштомат. Обери відділення нижче — або створи адресну ТТН у кабінеті Нової Пошти.
                </div>
              </div>
            ) : null}

            {/* Отримувач */}
            <FactRow
              icon={User}
              title={
                [recipient.lastName, recipient.firstName].filter(Boolean).join(" ") ||
                (recipient.phone ? recipient.phone : "Отримувач не вказаний")
              }
              subtitle={
                missingRecipientFields.length > 0
                  ? `не вистачає: ${missingRecipientFields.join(", ")}`
                  : [
                      recipient.phone,
                      [recipient.cityName, recipient.warehouseName].filter(Boolean).join(" · "),
                      recipient.recipientType === "organization" && recipient.edrpou
                        ? `ЄДРПОУ ${recipient.edrpou}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")
              }
              incomplete={missingRecipientFields.length > 0}
              expanded={expandedRow === "recipient"}
              onToggle={() => toggleRow("recipient")}
            >
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
                  <Label>{isPostomatDelivery ? "Поштомат" : "Відділення"}</Label>
                  <NpWarehouseCombobox
                    cityRef={recipient.cityRef}
                    postomat={isPostomatDelivery}
                    value={recipient.warehouseName}
                    onValueChange={(warehouse) => updateRecipient({ warehouseName: warehouse, warehouseRef: "" })}
                    onSelect={(warehouse) => updateRecipient({ warehouseName: warehouse.description, warehouseRef: warehouse.ref })}
                  />
                </div>
              </div>
            </FactRow>

            {/* Вантаж */}
            <FactRow
              icon={Box}
              title={`${seatGroups.map(describeSeatGroup).join(" + ") || "Немає місць"} · разом ${totalWeight} кг`}
              subtitle={
                volumetric !== null && volumetric > totalWeight
                  ? `обʼємна вага ${volumetric.toFixed(1)} кг — тариф піде за нею`
                  : volumetric !== null
                    ? `обʼємна вага ${volumetric.toFixed(1)} кг — тариф за фактичною`
                    : "розміри не вказані — тариф лише за вагою"
              }
              warning={volumetric !== null && volumetric > totalWeight}
              expanded={expandedRow === "cargo"}
              onToggle={() => toggleRow("cargo")}
            >
              <div className="grid gap-2 sm:max-w-[220px]">
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

              {/* Рядок на кожен тип коробки, як у кабінеті НП. «2 великі + 1 мала»
                  тепер їде своїми розмірами, а не трьома усередненими. */}
              <div className="mt-4 grid gap-2">
                <Label>Місця</Label>
                {seatGroups.map((group, index) => (
                  <div key={group.id} className="rounded-lg border border-border/60 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={group.count}
                        onChange={(event) => updateSeatGroup(group.id, { count: digitsOnly(event.target.value) })}
                        inputMode="numeric"
                        aria-label="Скільки коробок"
                        className="h-8 w-12 text-center"
                      />
                      <span className="text-xs text-muted-foreground">×</span>
                      <div className="flex items-center gap-1">
                        {(["length", "width", "height"] as const).map((side, sideIndex) => (
                          <div key={side} className="flex items-center gap-1">
                            {sideIndex > 0 ? <span className="text-2xs text-muted-foreground">×</span> : null}
                            <Input
                              value={group[side]}
                              onChange={(event) =>
                                updateSeatGroup(group.id, { [side]: digitsOnly(event.target.value), packRef: "" })
                              }
                              inputMode="numeric"
                              placeholder={SIDE_PLACEHOLDERS[side]}
                              aria-label={`${SIDE_PLACEHOLDERS[side]}, см`}
                              className="h-8 w-14 text-center text-xs"
                            />
                          </div>
                        ))}
                        <span className="text-2xs text-muted-foreground">см</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Input
                          value={group.weight}
                          onChange={(event) => updateSeatGroup(group.id, { weight: decimalOnly(event.target.value) })}
                          inputMode="decimal"
                          placeholder="0.5"
                          aria-label="Вага однієї коробки, кг"
                          className="h-8 w-16 text-center text-xs"
                        />
                        <span className="text-2xs text-muted-foreground">кг / шт</span>
                      </div>
                      {seatGroups.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-8 w-8 p-0 text-muted-foreground"
                          aria-label={`Прибрати місце ${index + 1}`}
                          onClick={() => removeSeatGroup(group.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    {boxSizes.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {boxSizes.map((box, boxIndex) => {
                          const key = `${box.length}x${box.width}x${box.height}`;
                          return (
                            <Button
                              key={`${key}-${boxIndex}`}
                              type="button"
                              variant={group.packRef === key ? "secondary" : "outline"}
                              size="sm"
                              className="h-6 rounded-full px-2 text-2xs font-normal"
                              onClick={() =>
                                updateSeatGroup(group.id, {
                                  packRef: key,
                                  length: String(box.length),
                                  width: String(box.width),
                                  height: String(box.height),
                                })
                              }
                            >
                              {boxSizeLabel(box)}
                            </Button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ))}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addSeatGroup}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Ще коробка іншого розміру
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Разом {seatsCount} {seatsWord(seatsCount)} · {totalWeight} кг
                    {volumetric !== null ? ` · обʼємна ${volumetric.toFixed(1)} кг` : ""}
                  </span>
                </div>

                {boxSizes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Свої часті розміри можна завести в{" "}
                    <Link to="/settings/nova-poshta" className="underline">
                      Налаштуваннях
                    </Link>
                    — тоді вони зʼявляться тут кнопками.
                  </p>
                ) : null}
              </div>
            </FactRow>

            {/* Товар і оголошена вартість */}
            <FactRow
              icon={Tag}
              title={`${cargo.description.trim() || "Без опису"} · оголошено ${declaredCost} ₴`}
              subtitle="опис підставлено з категорій каталогу; оголошена вартість впливає на страховий збір"
              expanded={expandedRow === "goods"}
              onToggle={() => toggleRow("goods")}
            >
              <div className="grid items-start gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Опис вантажу</Label>
                  <Input
                    value={cargo.description}
                    onChange={(event) => updateCargo({ description: event.target.value })}
                    className="h-9"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Оголошена вартість, ₴</Label>
                  <Input
                    value={cargo.cost}
                    onChange={(event) => updateCargo({ cost: digitsOnly(event.target.value) })}
                    inputMode="numeric"
                    placeholder="0"
                    className="h-9"
                  />
                </div>
              </div>
            </FactRow>

            {/* Оплата й доставка */}
            <FactRow
              icon={Wallet}
              title={`${cargo.payer === "Sender" ? "Платимо ми" : PAYER_LABELS[cargo.payer] ?? cargo.payer} · ${
                PAYMENT_LABELS[cargo.paymentMethod] ?? cargo.paymentMethod
              }`}
              subtitle={
                npPayerFromDelivery(delivery.payer)
                  ? `${SERVICE_LABELS[cargo.serviceType] ?? cargo.serviceType} · платника взято з домовленості в замовленні`
                  : SERVICE_LABELS[cargo.serviceType] ?? cargo.serviceType
              }
              expanded={expandedRow === "payment"}
              onToggle={() => toggleRow("payment")}
            >
              <div className="grid items-start gap-3 md:grid-cols-2">
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
              </div>
            </FactRow>
          </div>
        ) : null}
        </div>

        {!loading && !shownTtn && !notConfigured && senderReady && recipient && cargo ? (
          <div className="shrink-0 border-t border-border/60 bg-muted/20 px-5 py-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                {preview ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className={cn("text-2xl font-semibold leading-none", calculating && "text-muted-foreground")}>
                        {money(preview.cost)}
                      </span>
                      {calculating ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          перерахунок…
                        </span>
                      ) : preview.date ? (
                        <span className="text-xs text-muted-foreground">доставка ≈ {preview.date}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {cargo.payer === "Sender" ? "платимо ми" : "платить отримувач"}
                      {volumetric !== null && volumetric > totalWeight
                        ? ` · тариф за обʼємною вагою ${volumetric.toFixed(1)} кг`
                        : ""}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {missingRecipientFields.length > 0
                      ? `Ціна буде після заповнення: ${missingRecipientFields.join(", ")}`
                      : calculating
                        ? "Рахуємо вартість…"
                        : "Вартість зʼявиться, щойно НП відповість"}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
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
