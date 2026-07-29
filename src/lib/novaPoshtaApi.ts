import { supabase } from "@/lib/supabaseClient";

/**
 * Клієнт довідника адрес Нової Пошти (Phase 1). Усі виклики йдуть через
 * серверну функцію `/.netlify/functions/nova-poshta` (там живе секретний ключ і
 * білий список методів). Парсинг відповіді НП зосереджений ТУТ — якщо форма
 * полів відрізнятиметься при першому живому виклику, правимо в одному місці.
 */

const FUNCTION_URL = "/.netlify/functions/nova-poshta";

/** true → ключ НП не налаштований на сервері; UI має відкотитись на ручне введення. */
export class NovaPoshtaNotConfiguredError extends Error {
  constructor() {
    super("Nova Poshta API key is not configured");
    this.name = "NovaPoshtaNotConfiguredError";
  }
}

async function callNovaPoshta(
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, unknown>
): Promise<Array<Record<string, unknown>>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Не авторизовано");

  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ modelName, calledMethod, methodProperties }),
  });

  const body = (await response.json().catch(() => null)) as
    | { data?: unknown[]; error?: string }
    | null;

  if (!response.ok) {
    const message = body?.error ?? "Нова Пошта: помилка запиту";
    if (message.toLowerCase().includes("api key is not configured")) {
      throw new NovaPoshtaNotConfiguredError();
    }
    throw new Error(message);
  }
  return Array.isArray(body?.data) ? (body!.data as Array<Record<string, unknown>>) : [];
}

const str = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));

export type NpSettlement = {
  /** Ref для getWarehouses / майбутньої ТТН (CityRef, з фолбеком на SettlementRef). */
  ref: string;
  settlementRef: string;
  present: string;
  area: string;
  warehouses: number;
};

/** Автокомпліт населеного пункту (Address.searchSettlements). */
export async function searchNpSettlements(query: string, limit = 20): Promise<NpSettlement[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const data = await callNovaPoshta("Address", "searchSettlements", { CityName: trimmed, Limit: String(limit) });
  const addresses = Array.isArray(data[0]?.Addresses) ? (data[0].Addresses as Array<Record<string, unknown>>) : [];
  return addresses
    .map((address) => {
      const cityRef = str(address.DeliveryCity);
      const settlementRef = str(address.Ref);
      return {
        ref: cityRef || settlementRef,
        settlementRef,
        present: str(address.Present) || str(address.MainDescription),
        area: str(address.Area),
        warehouses: Number(address.Warehouses ?? 0),
      };
    })
    .filter((settlement) => settlement.ref && settlement.present);
}

export type NpWarehouse = {
  ref: string;
  description: string;
  number: string;
  isPostomat: boolean;
};

/** Відділення/поштомати населеного пункту (Address.getWarehouses). */
export async function listNpWarehouses(params: {
  cityRef: string;
  settlementRef?: string;
  query?: string;
  /** true — лише поштомати; false — лише відділення; undefined — усе. */
  postomat?: boolean;
  limit?: number;
}): Promise<NpWarehouse[]> {
  if (!params.cityRef && !params.settlementRef) return [];
  const props: Record<string, unknown> = { Limit: String(params.limit ?? 50), Page: "1" };
  if (params.cityRef) props.CityRef = params.cityRef;
  else if (params.settlementRef) props.SettlementRef = params.settlementRef;
  if (params.query?.trim()) props.FindByString = params.query.trim();

  const data = await callNovaPoshta("Address", "getWarehouses", props);
  const parsed = data
    .map((warehouse) => {
      const category = str(warehouse.CategoryOfWarehouse).toLowerCase();
      const typeCode = str(warehouse.TypeOfWarehouse).toLowerCase();
      return {
        ref: str(warehouse.Ref),
        description: str(warehouse.Description),
        number: str(warehouse.Number),
        isPostomat: category.includes("postomat") || typeCode.includes("postomat"),
      };
    })
    .filter((warehouse) => warehouse.ref && warehouse.description);

  if (params.postomat === undefined) return parsed;
  return parsed.filter((warehouse) => warehouse.isPostomat === params.postomat);
}

export type NpStreet = {
  ref: string;
  /** Готове "вул. Хрещатик" — саме це підставляється в поле. */
  present: string;
};

/**
 * Автокомпліт вулиці в межах населеного пункту (Address.searchSettlementStreets).
 * ⚠️ Потрібен саме SettlementRef (Ref із searchSettlements), а не CityRef.
 * Глобального пошуку вулиці НП не має — без міста метод не працює.
 */
export async function searchNpStreets(settlementRef: string, query: string, limit = 20): Promise<NpStreet[]> {
  const trimmed = query.trim();
  if (!settlementRef || trimmed.length < 2) return [];
  const data = await callNovaPoshta("Address", "searchSettlementStreets", {
    SettlementRef: settlementRef,
    StreetName: trimmed,
    Limit: String(limit),
  });
  const addresses = Array.isArray(data[0]?.Addresses) ? (data[0].Addresses as Array<Record<string, unknown>>) : [];
  return addresses
    .map((address) => {
      const description = str(address.SettlementStreetDescription) || str(address.Description);
      const type = str(address.StreetsType) || str(address.StreetsTypeDescription);
      return {
        ref: str(address.SettlementStreetRef) || str(address.Ref),
        present: str(address.Present) || [type, description].filter(Boolean).join(" ").trim(),
      };
    })
    .filter((street) => street.ref && street.present);
}

/* ── Phase 2: відправник ─────────────────────────────────────────────────
   Читання з кабінету НП для налаштування відправника. Побічних ефектів нема —
   лише список твоїх відправників і їхніх контактних осіб. */

export type NpSender = {
  /** Ref контрагента-відправника (потрібен для ТТН як Sender). */
  ref: string;
  name: string;
  edrpou: string;
};

/** Список відправників кабінету (Counterparty.getCounterparties, property=Sender). */
export async function getNpSenders(): Promise<NpSender[]> {
  const data = await callNovaPoshta("Counterparty", "getCounterparties", {
    CounterpartyProperty: "Sender",
    Page: "1",
  });
  return data
    .map((row) => ({
      ref: str(row.Ref),
      name: str(row.Description) || str(row.CounterpartyFullName),
      edrpou: str(row.EDRPOU),
    }))
    .filter((sender) => sender.ref && sender.name);
}

export type NpContactPerson = {
  /** Ref контактної особи (потрібен для ТТН як ContactSender). */
  ref: string;
  name: string;
  phone: string;
};

/** Контактні особи відправника (Counterparty.getCounterpartyContactPersons). */
export async function getNpContactPersons(counterpartyRef: string): Promise<NpContactPerson[]> {
  if (!counterpartyRef) return [];
  const data = await callNovaPoshta("Counterparty", "getCounterpartyContactPersons", {
    Ref: counterpartyRef,
    Page: "1",
  });
  return data
    .map((row) => ({
      ref: str(row.Ref),
      name: str(row.Description),
      phone: str(row.Phones) || str(row.Phone),
    }))
    .filter((contact) => contact.ref && contact.name);
}

/* ── Phase 2: створення ТТН ───────────────────────────────────────────────
   Побічні ефекти (створення контрагента/ТТН у кабінеті) — лише за явною дією
   користувача в діалозі. Розрахунок ціни/дати — без побічних ефектів. */

/** Телефон у формат НП (12 цифр "380XXXXXXXXX"). */
const npPhone = (value: string): string => {
  const digits = str(value).replace(/\D/g, "");
  if (digits.startsWith("380")) return digits.slice(0, 12);
  if (digits.startsWith("0")) return `38${digits}`.slice(0, 12);
  if (digits.length === 9) return `380${digits}`;
  return digits;
};

/** Сьогоднішня дата "dd.mm.yyyy" (дата відправлення за замовчуванням). */
const todayDdMmYyyy = (): string => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${now.getFullYear()}`;
};

export type NpRecipientResult = { counterpartyRef: string; contactRef: string };

/**
 * Створити/знайти отримувача в кабінеті НП і повернути Ref контрагента та
 * контактної особи (потрібні для ТТН). Організація — за ЄДРПОУ + окремий
 * контакт; приватна особа — один виклик повертає і контрагента, і контакт.
 */
export async function saveNpRecipient(params: {
  recipientType: "organization" | "private";
  cityRef: string;
  firstName: string;
  lastName: string;
  phone: string;
  edrpou?: string;
}): Promise<NpRecipientResult> {
  const phone = npPhone(params.phone);
  if (params.recipientType === "organization") {
    if (!params.edrpou) throw new Error("Для організації потрібен ЄДРПОУ отримувача");
    const orgData = await callNovaPoshta("Counterparty", "save", {
      CityRef: params.cityRef,
      CounterpartyType: "Organization",
      CounterpartyProperty: "Recipient",
      EDRPOU: params.edrpou,
    });
    const counterpartyRef = str(orgData[0]?.Ref);
    if (!counterpartyRef) throw new Error("НП не повернула контрагента-організацію");
    const contactData = await callNovaPoshta("ContactPerson", "save", {
      CounterpartyRef: counterpartyRef,
      FirstName: params.firstName,
      LastName: params.lastName,
      Phone: phone,
    });
    return { counterpartyRef, contactRef: str(contactData[0]?.Ref) };
  }

  const data = await callNovaPoshta("Counterparty", "save", {
    CityRef: params.cityRef,
    CounterpartyType: "PrivatePerson",
    CounterpartyProperty: "Recipient",
    FirstName: params.firstName,
    LastName: params.lastName,
    Phone: phone,
  });
  const row = data[0] ?? {};
  const counterpartyRef = str(row.Ref);
  const contactPersons = (row.ContactPerson as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
  return { counterpartyRef, contactRef: str(contactPersons[0]?.Ref) };
}

/**
 * Одне місце (коробка) у форматі НП: розміри в САНТИМЕТРАХ, вага в кілограмах.
 * Якщо передати — НП рахує об'ємну вагу сама й тарифікує за більшою з двох.
 */
export type NpSeatOption = {
  volumetricWidth: string;
  volumetricLength: string;
  volumetricHeight: string;
  weight: string;
};

/** До чого належить позиція каталогу пакування — щоб фільтрувати за типом вантажу. */
export type NpPackKind = "box" | "envelope" | "bag" | "pallet" | "tube" | "other";

/** Готова коробка з довідника пакування НП. Сторони — у сантиметрах. */
export type NpPackType = {
  ref: string;
  description: string;
  kind: NpPackKind;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

/**
 * У каталозі пакування НП більшість позицій — витратка (скотч, плівка, наповнювач).
 * Розміри в них або відсутні, або означають рулон — у полях ТТН їм не місце.
 * Список чорний, а не білий: незнайома позиція краще залишиться, ніж зникне.
 */
const NP_PACK_CONSUMABLE_RE =
  /скотч|стрейч|плівк|плëнк|наповнювач|пупирк|бабл|повітряно|маркер|ножиц|стрічк|ярлик|наклейк|шпагат|мотузк|обмотк|пломб/i;

const NP_PACK_KIND_RULES: Array<{ re: RegExp; kind: NpPackKind }> = [
  { re: /конверт/i, kind: "envelope" },
  { re: /палет|паллет|піддон/i, kind: "pallet" },
  { re: /тубус|труб/i, kind: "tube" },
  { re: /пакет|мішок|мешок/i, kind: "bag" },
  { re: /коробк|ящик|бокс|короб/i, kind: "box" },
];

const classifyNpPack = (description: string): NpPackKind =>
  NP_PACK_KIND_RULES.find((rule) => rule.re.test(description))?.kind ?? "other";

/**
 * Довідник пакування Нової Пошти (Common.getPackList) — ті самі коробки, що в них
 * на сайті. Каталог довгий і повторюваний, тож ріжемо витратку й склеюємо позиції
 * з однаковими сторонами: для полів ТТН має значення лише сам розмір.
 */
export async function listNpPackTypes(): Promise<NpPackType[]> {
  const data = await callNovaPoshta("Common", "getPackList", {});
  const bySize = new Map<string, NpPackType>();

  for (const row of data) {
    const ref = str(row.Ref);
    const description = str(row.Description);
    if (!ref || NP_PACK_CONSUMABLE_RE.test(description)) continue;

    const sides = [Number(row.Length), Number(row.Width), Number(row.Height)];
    if (!sides.every((side) => Number.isFinite(side) && side > 0)) continue;
    // НП віддає сторони то в сантиметрах, то в міліметрах. Коробок понад 2 м
    // у пакуванні не буває, тож завеликі значення трактуємо як міліметри.
    const divisor = sides.some((side) => side > 200) ? 10 : 1;
    const [lengthCm, widthCm, heightCm] = sides.map((side) => Math.round(side / divisor));
    if ([lengthCm, widthCm, heightCm].some((side) => side <= 0)) continue;

    const kind = classifyNpPack(description);
    const key = `${kind}:${lengthCm}x${widthCm}x${heightCm}`;
    const existing = bySize.get(key);
    // Один розмір трапляється в кількох позиціях каталогу — лишаємо з найкоротшою
    // назвою, вона зазвичай і найзрозуміліша («Коробка 40x30x26» проти артикула).
    if (existing && existing.description.length <= description.length) continue;
    bySize.set(key, { ref, description: description || `${lengthCm}×${widthCm}×${heightCm} см`, kind, lengthCm, widthCm, heightCm });
  }

  return Array.from(bySize.values()).sort(
    (a, b) => a.lengthCm * a.widthCm * a.heightCm - b.lengthCm * b.widthCm * b.heightCm
  );
}

/**
 * Яке пакування показувати під обраний тип вантажу. Порожній список = вибір
 * ховаємо (для шин готового пакування НП не має).
 */
export const npPackKindsForCargoType = (cargoType: string): NpPackKind[] => {
  switch (cargoType) {
    case "Documents":
      return ["envelope", "bag"];
    case "Pallet":
      return ["pallet"];
    case "TiresWheels":
      return [];
    case "Cargo":
      return ["box", "pallet", "other"];
    default:
      return ["box", "bag", "tube", "other"];
  }
};

/** Розрахунок вартості доставки (без побічних ефектів). */
export async function getNpDocumentPrice(params: {
  citySenderRef: string;
  cityRecipientRef: string;
  weight: string;
  cost: string;
  cargoType: string;
  serviceType: string;
  seatsAmount: string;
  optionsSeat?: NpSeatOption[];
}): Promise<number> {
  const data = await callNovaPoshta("InternetDocument", "getDocumentPrice", {
    CitySender: params.citySenderRef,
    CityRecipient: params.cityRecipientRef,
    Weight: params.weight,
    ServiceType: params.serviceType,
    Cost: params.cost,
    CargoType: params.cargoType,
    SeatsAmount: params.seatsAmount,
    ...(params.optionsSeat?.length ? { OptionsSeat: params.optionsSeat } : {}),
  });
  return Number(data[0]?.Cost ?? 0) || 0;
}

/** Орієнтовна дата доставки (без побічних ефектів). Повертає рядок як від НП. */
export async function getNpDocumentDeliveryDate(params: {
  citySenderRef: string;
  cityRecipientRef: string;
  serviceType: string;
}): Promise<string> {
  const data = await callNovaPoshta("InternetDocument", "getDocumentDeliveryDate", {
    CitySender: params.citySenderRef,
    CityRecipient: params.cityRecipientRef,
    ServiceType: params.serviceType,
    DateTime: todayDdMmYyyy(),
  });
  const dd = data[0]?.DeliveryDate;
  const raw = typeof dd === "string" ? dd : str((dd as { date?: unknown } | undefined)?.date);
  return raw ? raw.slice(0, 10) : "";
}

export type NpTtnResult = {
  ref: string;
  number: string;
  cost: number;
  estimatedDelivery: string;
};

/** Створити ТТН (InternetDocument.save). Побічна дія — лише за кнопкою користувача. */
export async function createNpInternetDocument(params: {
  citySenderRef: string;
  senderRef: string;
  senderAddressRef: string;
  senderContactRef: string;
  senderPhone: string;
  cityRecipientRef: string;
  recipientRef: string;
  recipientAddressRef: string;
  recipientContactRef: string;
  recipientPhone: string;
  payerType: string;
  paymentMethod: string;
  cargoType: string;
  serviceType: string;
  weight: string;
  seatsAmount: string;
  description: string;
  cost: string;
  dateTime?: string;
  optionsSeat?: NpSeatOption[];
}): Promise<NpTtnResult> {
  const data = await callNovaPoshta("InternetDocument", "save", {
    PayerType: params.payerType,
    PaymentMethod: params.paymentMethod,
    DateTime: params.dateTime || todayDdMmYyyy(),
    CargoType: params.cargoType,
    Weight: params.weight,
    ServiceType: params.serviceType,
    SeatsAmount: params.seatsAmount,
    ...(params.optionsSeat?.length ? { OptionsSeat: params.optionsSeat } : {}),
    Description: params.description,
    Cost: params.cost,
    CitySender: params.citySenderRef,
    Sender: params.senderRef,
    SenderAddress: params.senderAddressRef,
    ContactSender: params.senderContactRef,
    SendersPhone: npPhone(params.senderPhone),
    CityRecipient: params.cityRecipientRef,
    Recipient: params.recipientRef,
    RecipientAddress: params.recipientAddressRef,
    ContactRecipient: params.recipientContactRef,
    RecipientsPhone: npPhone(params.recipientPhone),
  });
  const row = data[0] ?? {};
  const number = str(row.IntDocNumber);
  if (!number) throw new Error("НП не повернула номер ТТН");
  return {
    ref: str(row.Ref),
    number,
    cost: Number(row.CostOnSite ?? 0) || 0,
    estimatedDelivery: str(row.EstimatedDeliveryDate),
  };
}

/** Скасувати (видалити) ще не проскановану ТТН. */
export async function deleteNpInternetDocument(ref: string): Promise<void> {
  if (!ref) return;
  await callNovaPoshta("InternetDocument", "delete", { DocumentRefs: ref });
}

export type NpTrackStatus = {
  status: string;
  statusCode: string;
  /** Фактична дата отримання, якщо вже доставлено (рядок як від НП). */
  actualDelivery: string;
};

/** Поточний статус ТТН (TrackingDocument.getStatusDocuments, read-only). */
export async function trackNpDocument(documentNumber: string, phone?: string): Promise<NpTrackStatus | null> {
  const number = str(documentNumber).trim();
  if (!number) return null;
  const data = await callNovaPoshta("TrackingDocument", "getStatusDocuments", {
    Documents: [{ DocumentNumber: number, Phone: phone ? npPhone(phone) : "" }],
  });
  const row = data[0];
  if (!row) return null;
  return {
    status: str(row.Status),
    statusCode: str(row.StatusCode),
    actualDelivery: str(row.ActualDeliveryDate) || str(row.RecipientDateTime),
  };
}
