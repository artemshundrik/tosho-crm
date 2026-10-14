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
