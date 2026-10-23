import { getOrderInvoiceState } from "./orderInvoice";
import { isCashlessPaymentMethod } from "./paymentRules";
import type { DerivedOrderRecord } from "./orderRecords";

/**
 * Що має бути заповнено, щоб сформувати кожен документ замовлення. Винесено зі
 * сторінки замовлення, щоб та не росла (ратчет розміру).
 */
export type RequirementCheck = {
  label: string;
  done: boolean;
  help: string;
};

const hasValue = (value?: string | null) => Boolean(value?.trim());

export const getMissingRequirementLabels = (checks: RequirementCheck[]) =>
  checks.filter((check) => !check.done).map((check) => check.label);

export const getContractRequirementChecks = (record: DerivedOrderRecord): RequirementCheck[] => [
  {
    label: "Замовник створений",
    done: record.partyType === "customer",
    help: "СП і договір не формуються напряму з ліда. Спочатку лід має бути переведений у Замовника.",
  },
  {
    label: "Юр. назва / форма власності",
    done: hasValue(record.legalEntityLabel),
    help: "Береться з картки Замовника, з блоку юридичних осіб.",
  },
  {
    label: "Код / ІПН",
    done: hasValue(record.customerTaxId),
    help: "Потрібен для реквізитів сторін у договорі та СП.",
  },
  {
    label: "IBAN",
    done: hasValue(record.customerIban) || hasValue(record.customerBankDetails),
    help: "Потрібен для реквізитів Замовника. Заповнюється у картці Замовника.",
  },
  {
    label: "Юридична адреса",
    done: hasValue(record.customerLegalAddress),
    help: "Для ФОП це може бути адреса реєстрації, для компанії - юридична адреса.",
  },
  {
    label: "ПІБ підписанта",
    done: hasValue(record.customerSignatoryName),
    help: "ПІБ особи, яка підписує договір зі сторони Замовника.",
  },
  {
    label: "Посада підписанта",
    done: hasValue(record.customerSignatoryPosition),
    help: "Наприклад: Директор, ФОП, Генеральний директор.",
  },
  {
    label: "Підстава підпису",
    done: hasValue(record.customerSignatoryAuthority),
    help: "Наприклад: Статуту, довіреності, виписки з ЄДР. Без цього договір не є коректним.",
  },
  {
    label: "Email і телефон",
    done: hasValue(record.contactEmail) && hasValue(record.contactPhone),
    help: "Контакти потрібні для реквізитів і відправки документів Замовнику.",
  },
];

export const getSpecificationRequirementChecks = (record: DerivedOrderRecord): RequirementCheck[] => [
  {
    label: "Є позиції",
    done: record.items.length > 0,
    help: "СП формується тільки якщо у замовленні є хоча б одна позиція.",
  },
  {
    label: "Безготівковий розрахунок",
    done: isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail),
    help: "За бізнес-правилом СП створюється тільки для безготівкового розрахунку.",
  },
  {
    label: "Договір створено",
    done: Boolean(record.contractCreatedAt),
    help: "Спочатку натисни PDF у рядку Договір. Після відкриття договору CRM позначить його створеним і розблокує СП.",
  },
  {
    label: "Умови оплати",
    done: hasValue(record.paymentTerms),
    help: "Наприклад 50/50 або 70/30. Береться з блоку умов СП у цьому замовленні.",
  },
  {
    label: "Incoterms",
    done: hasValue(record.incotermsCode),
    help: "Для СП використовується Incoterms 2020. За потреби вкажи також місце поставки.",
  },
];

export const getInvoiceRequirementChecks = (record: DerivedOrderRecord): RequirementCheck[] => [
  {
    label: "Є позиції",
    done: record.items.length > 0,
    help: "Рахунок формується з позицій замовлення.",
  },
];

export const getTechCardRequirementChecks = (record: DerivedOrderRecord): RequirementCheck[] => [
  {
    label: "Є позиції",
    done: record.items.length > 0,
    help: "Техкарта описує позиції замовлення.",
  },
  // Товар без нанесення дизайну не потребує — не показуємо вимоги, яких не буде кому закрити.
  ...(record.requiresDesignApproval
    ? [
        {
          label: "Візуал погоджено",
          done: record.hasApprovedVisualization,
          help: "Потрібен затверджений візуал із дизайн-задачі.",
        },
        {
          label: "Макет погоджено",
          done: record.hasApprovedLayout,
          help: "Потрібен затверджений макет із дизайн-задачі.",
        },
      ]
    : []),
];

export type OrderDocumentKind = "contract" | "invoice" | "specification" | "act" | "techCard";

/**
 * Які документи показувати на замовленні. Готівка: договору, СП і рахунку немає
 * (погоджено СЕО 14.10.2026) — лишається техкарта. Але документ, уже створений
 * до цього правила, не ховаємо: виписаний рахунок має відкриватись і далі.
 */
export const getOrderDocumentKinds = (
  record: Pick<
    DerivedOrderRecord,
    | "paymentMethodId"
    | "paymentRail"
    | "contractCreatedAt"
    | "specificationCreatedAt"
    | "invoiceCreatedAt"
    | "invoiceNumber"
    | "closingDocument"
  >
): OrderDocumentKind[] => {
  if (isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)) {
    // Рахунок перед СП: СП створюється після виписаного рахунку (REQ-322#p15).
    // Закривальний: акт друкує CRM; видаткову виписує бухгалтерія в BAS (REQ-322#p3).
    return ["contract", "invoice", "specification", ...(record.closingDocument === "act" ? (["act"] as const) : []), "techCard"];
  }
  return [
    ...(record.contractCreatedAt ? (["contract"] as const) : []),
    ...(record.specificationCreatedAt ? (["specification"] as const) : []),
    ...(record.invoiceCreatedAt || record.invoiceNumber ? (["invoice"] as const) : []),
    "techCard",
  ];
};

// Коротка дата для бейджа «Створено · 12.05».
export const formatShortCreatedDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
};

// actionMode керує кнопкою рядка:
//  'blocked' — даних/умов не вистачає, дії нема (лише причина);
//  'create'  — все готово, документ ще не створено → кнопка «Створити»;
//  'open'    — документ створено / готовий до генерації → кнопка «Відкрити PDF».
//  'pending' — документ у когось іншого (рахунок у бухгалтерії) → дії нема, лише стан.
export type DocumentActionMode = "blocked" | "create" | "open" | "pending";

export const getDocumentActionState = (
  record: DerivedOrderRecord,
  kind: OrderDocumentKind
): {
  title: string;
  ready: boolean;
  created?: boolean;
  statusLabel: string;
  statusReady: boolean;
  blockedLabel: string | null;
  checks: RequirementCheck[];
  hint: string;
  actionMode: DocumentActionMode;
  createdDateLabel: string | null;
  isRequisitesBlocker: boolean;
  /** Підпис кнопки «Створити», коли він інший (рахунок: «Створити рахунок»). */
  createLabel?: string;
  /** Рядок під назвою замість типового «Можна створити». */
  detail?: string | null;
} => {
  if (kind === "contract") {
    const checks = getContractRequirementChecks(record);
    const missing = getMissingRequirementLabels(checks);
    const ready = missing.length === 0;
    const created = Boolean(record.contractCreatedAt);
    const actionMode: DocumentActionMode = !ready ? "blocked" : created ? "open" : "create";
    return {
      title: "Договір",
      ready,
      created,
      statusLabel: created ? "Створено" : ready ? "Можна створити" : "Немає даних",
      statusReady: ready,
      blockedLabel: missing.length > 0 ? `Не вистачає: ${missing.join(", ")}` : null,
      checks,
      hint:
        "Договір використовує реквізити з картки Замовника і контактні дані з замовлення. Якщо тут є жовті пункти, їх треба виправити в картці Замовника або в замовленні.",
      actionMode,
      createdDateLabel: formatShortCreatedDate(record.contractCreatedAt),
      isRequisitesBlocker: !ready,
    };
  }

  if (kind === "specification") {
    const checks = getSpecificationRequirementChecks(record);
    const missing = getMissingRequirementLabels(checks);
    const ready = missing.length === 0;
    // Правило: СП не можна створити без Договору. Якщо саме його не вистачає —
    // показуємо явну й коротку підказку замість списку всіх missing.
    const contractMissing = !record.contractCreatedAt;
    const created = Boolean(record.specificationCreatedAt);
    // СП — лише після виписаного рахунку (REQ-322#p15); створену вже не чіпаємо.
    const invoiceMissing = !created && !record.invoiceNumber;
    const blockedLabel = contractMissing
      ? "Спочатку створіть Договір — без нього СП недоступна."
      : invoiceMissing
        ? "Спочатку рахунок: СП створюється, коли бухгалтерія його випише."
        : missing.length > 0
        ? `Не виконано: ${missing.join(", ")}`
        : null;
    const actionMode: DocumentActionMode =
      contractMissing || invoiceMissing || !ready ? "blocked" : created ? "open" : "create";
    return {
      title: "СП",
      ready,
      created,
      statusLabel: created
        ? "Створено"
        : contractMissing
          ? "Очікує Договір"
          : invoiceMissing
            ? "Очікує рахунок"
            : ready
              ? "Можна створити"
              : "Потрібні умови",
      statusReady: ready && !invoiceMissing,
      blockedLabel,
      checks,
      hint:
        "СП має окремі правила: тільки безготівка, тільки після договору й виписаного рахунку, і з умовами оплати та Incoterms із замовлення.",
      actionMode,
      createdDateLabel: formatShortCreatedDate(record.specificationCreatedAt),
      isRequisitesBlocker: false,
    };
  }

  if (kind === "invoice") {
    const checks = getInvoiceRequirementChecks(record);
    const missing = getMissingRequirementLabels(checks);
    const ready = missing.length === 0;
    // Номер дає бухгалтерія з BAS (REQ-322#p10): менеджер просить, а відкрити
    // може лише виписаний рахунок.
    const state = getOrderInvoiceState(record);
    const issuedDate = formatShortCreatedDate(record.invoiceDate ?? record.invoiceCreatedAt);
    const base = {
      title: "Рахунок",
      ready,
      checks,
      hint: "Рахунок виписує бухгалтер у BAS: менеджер просить, бухгалтер вносить номер і дату, і тоді рахунок можна відкрити й надіслати.",
      createdDateLabel: null,
      isRequisitesBlocker: false,
      blockedLabel: missing.length > 0 ? `Не виконано: ${missing.join(", ")}` : null,
    };
    if (state === "issued") {
      return {
        ...base,
        created: true,
        statusLabel: `№ ${record.invoiceNumber}${issuedDate ? ` від ${issuedDate}` : ""}`,
        statusReady: true,
        actionMode: "open",
      };
    }
    if (state === "requested") {
      return {
        ...base,
        statusLabel: "У бухгалтерії",
        statusReady: false,
        actionMode: "pending",
        detail: "Рахунок у бухгалтерії — відкрити можна, коли внесуть номер з BAS",
      };
    }
    return {
      ...base,
      statusLabel: ready ? "Можна попросити" : "Немає позицій",
      statusReady: ready,
      actionMode: ready ? "create" : "blocked",
      createLabel: "Створити рахунок",
      detail: state === "returned" ? `Бухгалтер повернув: ${record.invoiceReturnNote}` : "Номер і дату внесе бухгалтер з BAS",
    };
  }

  if (kind === "act") {
    // Акт посилається на рахунок, тож без номера рахунку з BAS він не має сенсу.
    const invoiceIssued = getOrderInvoiceState(record) === "issued";
    return {
      title: "Акт",
      ready: invoiceIssued,
      statusLabel: invoiceIssued ? "Можна відкрити" : "Очікує рахунок",
      statusReady: invoiceIssued,
      blockedLabel: invoiceIssued ? null : "Акт — після рахунку з номером з BAS",
      checks: [],
      hint: "Акт здачі-прийняття робіт (надання послуг) — закривальний документ для послуг. Номер акта веде BAS.",
      actionMode: invoiceIssued ? "open" : "blocked",
      createdDateLabel: null,
      isRequisitesBlocker: false,
    };
  }

  const checks = getTechCardRequirementChecks(record);
  const missing = getMissingRequirementLabels(checks);
  const ready = missing.length === 0;
  return {
    title: "Техкарта",
    ready,
    statusLabel: ready ? "Готова" : "Очікує дизайн",
    statusReady: ready,
    blockedLabel: missing.length > 0 ? `Не виконано: ${missing.join(", ")}` : null,
    checks,
    hint: "Техкарта доступна, коли є позиції і затверджені виробничі матеріали: візуал та макет.",
    actionMode: ready ? "open" : "blocked",
    createdDateLabel: null,
    isRequisitesBlocker: false,
  };
};

/**
 * Чи можна створити СП: безготівка, договір і рахунок (REQ-322#p15). Погоджений
 * візуал не вимагаємо: не кожному замовнику він потрібен у СП, і менеджер сам
 * вирішує у вікні параметрів, чи його друкувати (REQ-322#p37).
 */
export const canCreateSpecification = (record: DerivedOrderRecord) =>
  record.items.length > 0 &&
  isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail) &&
  Boolean(record.contractCreatedAt) &&
  Boolean(record.customerVatId?.trim()) &&
  (Boolean(record.specificationCreatedAt) || Boolean(record.invoiceNumber));

/** Чому СП ще не можна друкувати; null — можна. */
export const getSpecificationBlocker = (record: DerivedOrderRecord) => {
  if (record.items.length === 0) return "Немає позицій для СП.";
  if (!isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)) {
    return "СП створюється тільки для безготівкового розрахунку.";
  }
  if (!record.contractCreatedAt) {
    return "Перед СП потрібно створити Договір.";
  }
  // ІПН замовника в СП обов'язковий: без нього документ не створюємо.
  if (!record.customerVatId?.trim()) {
    return "У картці замовника не вказано ІПН — без нього СП не створюється.";
  }
  // REQ-322#p15: СП — після виписаного рахунку; передрук створеної не блокуємо.
  if (!record.specificationCreatedAt && !record.invoiceNumber) {
    return "Спочатку рахунок: СП створюється, коли бухгалтерія його випише.";
  }
  return null;
};
