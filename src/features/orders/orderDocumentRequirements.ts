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
    label: "Погоджена візуалізація",
    done: record.hasApprovedVisualization,
    help: "СП друкується з погодженим візуалом. Без нього рядок казав «Можна створити», а друк відмовляв.",
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

export type OrderDocumentKind = "contract" | "invoice" | "specification" | "techCard";

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
  >
): OrderDocumentKind[] => {
  if (isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)) {
    return ["contract", "specification", "invoice", "techCard"];
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
export type DocumentActionMode = "blocked" | "create" | "open";

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
    const blockedLabel = contractMissing
      ? "Спочатку створіть Договір — без нього СП недоступна."
      : missing.length > 0
        ? `Не виконано: ${missing.join(", ")}`
        : null;
    const actionMode: DocumentActionMode =
      contractMissing || !ready ? "blocked" : created ? "open" : "create";
    return {
      title: "СП",
      ready,
      created,
      statusLabel: created
        ? "Створено"
        : ready
          ? "Можна створити"
          : contractMissing
            ? "Очікує Договір"
            : "Потрібні умови",
      statusReady: ready,
      blockedLabel,
      checks,
      hint:
        "СП має окремі правила: тільки безготівка, тільки після створення договору, і з умовами оплати та Incoterms із замовлення.",
      actionMode,
      createdDateLabel: formatShortCreatedDate(record.specificationCreatedAt),
      isRequisitesBlocker: false,
    };
  }

  if (kind === "invoice") {
    const checks = getInvoiceRequirementChecks(record);
    const missing = getMissingRequirementLabels(checks);
    const ready = missing.length === 0;
    return {
      title: "Рахунок",
      ready,
      statusLabel: ready ? "Готовий" : "Немає позицій",
      statusReady: ready,
      blockedLabel: missing.length > 0 ? `Не виконано: ${missing.join(", ")}` : null,
      checks,
      hint: "Рахунок формується з товарних позицій замовлення і не потребує створеного договору.",
      actionMode: ready ? "open" : "blocked",
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
