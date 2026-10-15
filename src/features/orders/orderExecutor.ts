import { ORDER_DOCUMENT_EXECUTOR } from "./config";

/**
 * Наша юрособа на документах замовлення (REQ-322#p1–p3): ТОВ «АВАНПРІНТ» або
 * один із ФОП. Реквізити живуть у довіднику tosho.finance_legal_entities, а на
 * замовлення лягає ЗНІМОК (orders.our_legal_entity): менеджери довідника не
 * читають, і підписаний документ не має мінятися заднім числом, коли реквізити
 * в довіднику поправили. Реквізити ФОП (РНОКПП, адреса) — лише в базі: репозиторій
 * публічний. Чиста логіка, без клієнта Supabase.
 */
export type OrderExecutor = {
  legalEntityId: string | null;
  kind: "llc" | "sole_prop";
  vatPayer: boolean;
  /** Повна назва: «Товариство з обмеженою відповідальністю …» / «Фізична особа-підприємець …». */
  companyName: string;
  shortName: string;
  /** Підписант у родовому відмінку — для «в особі …». */
  signatory: string;
  /** Посада в родовому з малої — «директора», «керівника». */
  signatoryPosition: string;
  /** Посада для підписного рядка — «Директор», «Керівник». */
  signatoryPositionDisplay: string;
  /** На підставі чого діє, у родовому — «Статуту», «Виписки з ЄДР». */
  authority: string;
  address: string;
  phone: string;
  /** «Код ЄДРПОУ» для ТОВ, «РНОКПП» для ФОП. */
  taxIdLabel: string;
  taxId: string;
  /** ІПН платника ПДВ — лише в платника ПДВ. */
  vatId: string | null;
  iban: string;
  bank: string;
  taxStatus: string;
  /** «О.В. Борщ» — під підписом. */
  signatureLabel: string;
};

/** Рядок довідника, як його віддає tosho.list_order_legal_entities(). */
export type LegalEntityRow = {
  id: string;
  name: string;
  kind: string;
  vat_payer: boolean | null;
  tax_group: string | null;
  edrpou: string | null;
  ipn: string | null;
  iban: string | null;
  requisites: Record<string, unknown> | null;
};

export const VAT_RATE = 20;

export const DEFAULT_ORDER_EXECUTOR: OrderExecutor = {
  legalEntityId: null,
  kind: "llc",
  vatPayer: true,
  companyName: ORDER_DOCUMENT_EXECUTOR.companyName,
  shortName: ORDER_DOCUMENT_EXECUTOR.shortName,
  signatory: ORDER_DOCUMENT_EXECUTOR.signatory,
  signatoryPosition: ORDER_DOCUMENT_EXECUTOR.signatoryPosition,
  signatoryPositionDisplay: ORDER_DOCUMENT_EXECUTOR.signatoryPositionDisplay,
  authority: ORDER_DOCUMENT_EXECUTOR.authority,
  address: ORDER_DOCUMENT_EXECUTOR.address,
  phone: ORDER_DOCUMENT_EXECUTOR.phone,
  taxIdLabel: "Код ЄДРПОУ",
  taxId: ORDER_DOCUMENT_EXECUTOR.taxId,
  vatId: ORDER_DOCUMENT_EXECUTOR.vatId,
  iban: ORDER_DOCUMENT_EXECUTOR.iban,
  bank: ORDER_DOCUMENT_EXECUTOR.bank,
  taxStatus: ORDER_DOCUMENT_EXECUTOR.taxStatus,
  signatureLabel: ORDER_DOCUMENT_EXECUTOR.signatureLabel,
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** «Хом'яков Владислав Олегович» → «В.О. Хом'яков». */
export const toInitialsLabel = (fullName: string) => {
  const [last, ...rest] = fullName.trim().split(/\s+/).filter(Boolean);
  if (!last) return "";
  const initials = rest.map((part) => `${part.charAt(0).toLocaleUpperCase("uk-UA")}.`).join("");
  return initials ? `${initials} ${last}` : last;
};

/**
 * Знімок юрособи для замовлення. Порожні поля ТОВ «АВАНПРІНТ» добираються з
 * вшитих реквізитів (довідник їх не має); ФОП бере все з довідника, а посада й
 * підстава мають розумні замовчування.
 */
export const buildExecutorFromLegalEntity = (row: LegalEntityRow): OrderExecutor => {
  const req = row.requisites ?? {};
  const isLlc = row.kind === "llc";
  const vatPayer = row.vat_payer === true;
  const isDefaultLlc = isLlc && text(row.edrpou) === DEFAULT_ORDER_EXECUTOR.taxId;
  const base = isDefaultLlc ? DEFAULT_ORDER_EXECUTOR : null;
  const signatoryName = text(req.signatory_name);
  const pick = (key: string, fallback: string) => text(req[key]) || fallback;

  if (isLlc) {
    return {
      legalEntityId: row.id,
      kind: "llc",
      vatPayer,
      companyName: pick("full_name", base?.companyName ?? row.name),
      shortName: row.name.trim() || base?.shortName || "",
      signatory: pick("signatory_genitive", base?.signatory ?? signatoryName),
      signatoryPosition: pick("signatory_position_genitive", base?.signatoryPosition ?? "директора"),
      signatoryPositionDisplay: pick("signatory_position", base?.signatoryPositionDisplay ?? "Директор"),
      authority: pick("authority", base?.authority ?? "Статуту"),
      address: pick("address", base?.address ?? ""),
      phone: pick("phone", base?.phone ?? ""),
      taxIdLabel: "Код ЄДРПОУ",
      taxId: text(row.edrpou) || base?.taxId || "",
      vatId: vatPayer ? text(row.ipn) || base?.vatId || null : null,
      iban: text(row.iban) || base?.iban || "",
      bank: pick("bank", base?.bank ?? ""),
      taxStatus: vatPayer ? "Є платником ПДВ на загальних підставах." : "Не є платником ПДВ.",
      signatureLabel: pick("signature_label", base?.signatureLabel ?? toInitialsLabel(signatoryName)),
    };
  }

  const group = text(row.tax_group);
  return {
    legalEntityId: row.id,
    kind: "sole_prop",
    vatPayer,
    companyName: pick("full_name", signatoryName ? `Фізична особа-підприємець ${signatoryName}` : row.name),
    shortName: row.name.trim(),
    signatory: pick("signatory_genitive", signatoryName),
    signatoryPosition: pick("signatory_position_genitive", "керівника"),
    signatoryPositionDisplay: pick("signatory_position", "Керівник"),
    authority: pick("authority", "Виписки з Єдиного державного реєстру"),
    address: pick("address", ""),
    phone: pick("phone", ""),
    taxIdLabel: "РНОКПП",
    taxId: text(row.ipn) || text(row.edrpou),
    vatId: null,
    iban: text(row.iban),
    bank: pick("bank", ""),
    taxStatus: vatPayer
      ? "Є платником ПДВ."
      : group
        ? `Платник єдиного податку ${group}-ї групи, не є платником ПДВ.`
        : "Не є платником ПДВ.",
    signatureLabel: pick("signature_label", toInitialsLabel(signatoryName)),
  };
};

/** Знімок із замовлення → виконавець. Немає знімка (старі замовлення) — ТОВ. */
export const executorFromSnapshot = (snapshot: unknown): OrderExecutor => {
  if (!snapshot || typeof snapshot !== "object") return DEFAULT_ORDER_EXECUTOR;
  const raw = snapshot as Record<string, unknown>;
  const kind = raw.kind === "sole_prop" ? "sole_prop" : "llc";
  const field = (key: keyof OrderExecutor) => text(raw[key]) || text(DEFAULT_ORDER_EXECUTOR[key]);
  // ФОП без поля не повинен мовчки отримати реквізити ТОВ — лишаємо порожнім.
  const own = (key: keyof OrderExecutor) => (kind === "llc" ? field(key) : text(raw[key]));
  return {
    legalEntityId: text(raw.legalEntityId) || null,
    kind,
    vatPayer: typeof raw.vatPayer === "boolean" ? raw.vatPayer : kind === "llc",
    companyName: own("companyName"),
    shortName: own("shortName"),
    signatory: own("signatory"),
    signatoryPosition: own("signatoryPosition"),
    signatoryPositionDisplay: own("signatoryPositionDisplay"),
    authority: own("authority"),
    address: own("address"),
    phone: own("phone"),
    taxIdLabel: text(raw.taxIdLabel) || (kind === "llc" ? "Код ЄДРПОУ" : "РНОКПП"),
    taxId: own("taxId"),
    vatId: text(raw.vatId) || null,
    iban: own("iban"),
    bank: own("bank"),
    taxStatus: own("taxStatus"),
    signatureLabel: own("signatureLabel"),
  };
};

/** Чого бракує юрособі, щоб документ від неї був повним (порожньо — усе є). */
export const getExecutorGaps = (executor: OrderExecutor): string[] => {
  const gaps: string[] = [];
  if (!executor.taxId) gaps.push(executor.taxIdLabel);
  if (!executor.iban) gaps.push("IBAN");
  if (!executor.bank) gaps.push("банк");
  if (!executor.address) gaps.push("адреса");
  if (!executor.signatory) gaps.push("підписант");
  return gaps;
};

/**
 * Ціни в замовленні — кінцеві, з ПДВ для платника. Для платника ділимо на 1,2;
 * для ФОП без ПДВ сума та сама, просто без виділеного податку.
 */
export const splitVat = (gross: number, vatPayer: boolean) => {
  const amount = Number(gross) || 0;
  if (!vatPayer) return { net: amount, vat: 0, gross: amount };
  const net = amount / (1 + VAT_RATE / 100);
  return { net, vat: amount - net, gross: amount };
};

/** Підпис юрособи в інтерфейсі: «ТОВ «АВАНПРІНТ» · з ПДВ». */
export const executorBadge = (executor: OrderExecutor) =>
  `${executor.shortName} · ${executor.vatPayer ? "з ПДВ" : "без ПДВ"}`;

export type ClosingDocument = "waybill" | "act";
export const CLOSING_DOCUMENT_LABELS: Record<ClosingDocument, string> = {
  waybill: "Видаткова накладна",
  act: "Акт",
};
export const parseClosingDocument = (value: unknown): ClosingDocument | null =>
  value === "waybill" || value === "act" ? value : null;

/**
 * Вступ документа від імені виконавця. ТОВ діє «в особі директора … на підставі
 * Статуту»; ФОП діє сам — «що діє на підставі Виписки з ЄДР».
 */
export const executorPreamble = (executor: OrderExecutor) =>
  executor.kind === "llc"
    ? `${executor.companyName} (надалі – Виконавець), в особі ${executor.signatoryPosition} ${executor.signatory}, яка діє на підставі ${executor.authority}`
    : `${executor.companyName} (надалі – Виконавець), що діє на підставі ${executor.authority}`;

/** Рядки реквізитів виконавця для блоку «Адреси і реквізити сторін». */
export const executorRequisiteLines = (executor: OrderExecutor, options: { addressLabel?: string } = {}) =>
  [
    executor.shortName,
    executor.address ? `${options.addressLabel ?? ""}${executor.address}` : "",
    executor.taxId ? `${executor.taxIdLabel}: ${executor.taxId}` : "",
    executor.vatId ? `ІПН: ${executor.vatId}` : "",
    executor.iban ? `IBAN: ${executor.iban}` : "",
    executor.bank,
    executor.taxStatus,
  ].filter(Boolean);

/** «код за ЄДРПОУ 43024297, ІПН 430242926591» / «РНОКПП 1234567890». */
export const executorCodesInline = (executor: OrderExecutor) =>
  executor.kind === "llc"
    ? [`код за ЄДРПОУ ${executor.taxId}`, executor.vatId ? `ІПН ${executor.vatId}` : ""].filter(Boolean).join(", ")
    : `${executor.taxIdLabel} ${executor.taxId}`;

/**
 * Що пишемо в orders.our_legal_entity_id. ТОВ «АВАНПРІНТ» — це null, як і на
 * всіх замовленнях до юросіб: інакше «без юрособи» і id ТОВ стали б двома
 * різними виконавцями в ключі договору, відбитку, блокері СП та індексі рахунку.
 */
export const isDefaultExecutor = (executor: Pick<OrderExecutor, "kind" | "taxId">) =>
  executor.kind === "llc" && executor.taxId === DEFAULT_ORDER_EXECUTOR.taxId;

export const storedLegalEntityId = (
  option: { row: { id: string }; executor: Pick<OrderExecutor, "kind" | "taxId"> } | null
): string | null => (option && !isDefaultExecutor(option.executor) ? option.row.id : null);

/**
 * Юрособу не міняють, коли документ від неї вже пішов: рахунок має номер з її
 * бази в BAS, а підписана СП — її реквізити. Інакше той самий номер
 * передрукувався б від іншої юрособи.
 */
export const legalEntityLockReason = (record: {
  invoiceNumber: string | null;
  specificationSignedAt: string | null;
}): string | null => {
  if (record.invoiceNumber?.trim()) return "Рахунок уже виписано від цієї юрособи — змінити її не можна.";
  if (record.specificationSignedAt) return "СП уже підписана від цієї юрособи — змінити її не можна.";
  return null;
};

/** Позиція замовлення: товар закриває видаткова накладна, послугу — акт. */
export type OrderItemKind = "goods" | "service";
export const parseItemKind = (value: unknown): OrderItemKind => (value === "service" ? "service" : "goods");

/** Закривальний документ за замовчуванням: самі послуги — акт, є хоч один товар — ВН. */
export const defaultClosingDocument = (kinds: OrderItemKind[]): ClosingDocument | null => {
  if (kinds.length === 0) return null;
  return kinds.every((kind) => kind === "service") ? "act" : "waybill";
};
