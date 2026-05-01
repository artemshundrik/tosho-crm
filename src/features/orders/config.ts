export const ORDER_PAYMENT_METHOD_OPTIONS = [
  {
    id: "cash",
    label: "Готівкові",
    description: "Готівка або оплата на карту.",
  },
  {
    id: "bank_uah",
    label: "Безготівкові, грн.",
    description: "ТОВ або ФОП, рахунок у гривні.",
  },
  {
    id: "bank_fx",
    label: "Безготівкові, $ / €",
    description: "Валютний рахунок для ТОВ або ФОП.",
  },
  {
    id: "crypto",
    label: "Криптовалюта",
    description: "USDC або USDT.",
  },
] as const;

export const ORDER_PAYMENT_TERMS_OPTIONS = [
  { id: "50/50", label: "50/50", advance: 50, balance: 50 },
  { id: "70/30", label: "70/30", advance: 70, balance: 30 },
  { id: "100_prepaid", label: "100% передплата", advance: 100, balance: 0 },
  { id: "100_after", label: "100% після готовності", advance: 0, balance: 100 },
] as const;

export const ORDER_INCOTERMS_OPTIONS = [
  { id: "EXW", label: "EXW" },
  { id: "FCA", label: "FCA" },
  { id: "CPT", label: "CPT" },
  { id: "CIP", label: "CIP" },
  { id: "DPU", label: "DPU" },
  { id: "DDP", label: "DDP" },
] as const;

export const ORDER_DOCUMENT_EXECUTOR = {
  companyName: "Товариство з обмеженою відповідальністю «АВАНПРІНТ»",
  shortName: "ТОВ «АВАНПРІНТ»",
  signatory: "Борщ Олена Вікторівна",
  signatoryPosition: "директора",
  authority: "Статуту",
  address: "Україна, 03035, м. Київ, вул. Монастирського Дениса, буд. 3, корпус 3",
  taxId: "43024297",
  vatId: "430242926591",
  iban: "UA233003350000000026006645092",
  bank: "АТ «РАЙФФАЙЗЕН БАНК АВАЛЬ» в м. Києві",
  taxStatus: "Є платником ПДВ на загальних підставах.",
  signatureLabel: "О.В. Борщ",
} as const;

export const ORDER_READINESS_COLUMNS = [
  {
    id: "counterparty",
    label: "Лід / реквізити",
    description: "Ще не вистачає контрагента, контактів або даних для договору.",
    dotClass: "tone-dot-warning",
  },
  {
    id: "design",
    label: "Макет / візуал",
    description: "Контрагент готовий, але немає повного погодження дизайну.",
    dotClass: "tone-dot-info",
  },
  {
    id: "ready",
    label: "Готово до замовлення",
    description: "Прорахунок уже можна переводити в замовлення.",
    dotClass: "tone-dot-success",
  },
] as const;

export const ORDER_STATUS_SECTIONS = [
  {
    id: "primary",
    label: "Статус замовлення",
    description: "Основний життєвий цикл замовлення від створення до закриття.",
    items: [
      { id: "new", label: "Нове", description: "Замовлення створене, але ще не опрацьоване.", tone: "neutral" },
      {
        id: "on_calculation",
        label: "На прорахунку",
        description: "Проміжний статус, якщо замовлення створили без окремого прорахунку.",
        tone: "info",
      },
      {
        id: "in_progress",
        label: "В роботі",
        description: "Менеджер збирає дані, уточнює параметри і готує пакет документів.",
        tone: "info",
      },
      {
        id: "approved",
        label: "Погоджено",
        description: "Замовник погодив замовлення, можна рухатись до оплати й запуску.",
        tone: "success",
      },
      {
        id: "send_to_production",
        label: "Відправити у виробництво",
        description: "Ключова дія менеджера перед запуском у виробництво.",
        tone: "warning",
      },
      {
        id: "production_started",
        label: "Запущено у виробництво",
        description: "PM підтвердив запуск, закупівлі й переміщення матеріалів почались.",
        tone: "warning",
      },
      {
        id: "in_production",
        label: "У виробництві",
        description: "Замовлення вже в роботі й зміни недоступні.",
        tone: "warning",
      },
      {
        id: "ready",
        label: "Готово",
        description: "Продукція готова до видачі або відвантаження.",
        tone: "success",
      },
      {
        id: "shipped",
        label: "Відвантажено",
        description: "Вантаж передано логістиці або службі доставки.",
        tone: "info",
      },
      {
        id: "completed",
        label: "Виконано / Завершено",
        description: "Замовлення закрите документально, підписана ВН отримана.",
        tone: "success",
      },
    ],
  },
  {
    id: "payment",
    label: "Статус оплати",
    description: "Окремий блок для бухгалтерії, менеджера і PM.",
    items: [
      {
        id: "awaiting_payment",
        label: "Очікує оплату",
        description: "Замовлення погоджене, зміни ще дозволені.",
        tone: "warning",
      },
      {
        id: "partially_paid",
        label: "Частково оплачено",
        description: "Отримана передоплата, але поріг запуску може бути ще не виконаний.",
        tone: "info",
      },
      {
        id: "fully_paid",
        label: "Отримана 100% оплата",
        description: "Уся сума за умовами СП надійшла.",
        tone: "success",
      },
      {
        id: "awaiting_balance",
        label: "Очікує доплату",
        description: "Фінальний платіж очікується по готовності або перед відвантаженням.",
        tone: "warning",
      },
    ],
  },
  {
    id: "production_flags",
    label: "Дизайн і додаткові стани",
    description: "Паралельні підстатуси, що не повинні губитись усередині основного статусу.",
    items: [
      {
        id: "awaiting_artwork",
        label: "Очікує макет",
        description: "Без макету не можна рухатись далі.",
        tone: "warning",
      },
      {
        id: "design_adapting",
        label: "Виконується адаптація дизайну",
        description: "Дизайнер готує адаптації під тираж і носій.",
        tone: "info",
      },
      {
        id: "artwork_review",
        label: "Макет на погодженні",
        description: "Візуал або макет уже на стороні замовника.",
        tone: "info",
      },
      {
        id: "awaiting_materials",
        label: "Очікує надходження матеріалів",
        description: "Замовлення залежить від постачальника або зовнішнього виробника.",
        tone: "warning",
      },
      {
        id: "paused",
        label: "Пауза / Заморожено",
        description: "Тимчасова зупинка без скасування замовлення.",
        tone: "neutral",
      },
      {
        id: "cancelled",
        label: "Скасовано",
        description: "Замовлення зупинене або не буде виконуватись.",
        tone: "danger",
      },
    ],
  },
  {
    id: "delivery",
    label: "Статус доставки",
    description: "Окремий статусний ряд для логістики та відстеження ТТН.",
    items: [
      { id: "not_shipped", label: "Не відвантажено", description: "Логістика ще не стартувала.", tone: "neutral" },
      {
        id: "preparing_shipment",
        label: "Готується до відвантаження",
        description: "Комплектація, пакування та підготовка відправки.",
        tone: "info",
      },
      { id: "shipped", label: "Відвантажено", description: "Відправка створена, ТТН уже можна прикріпити.", tone: "info" },
      { id: "delivered", label: "Доставлено", description: "Замовник отримав замовлення.", tone: "success" },
      {
        id: "partially_delivered",
        label: "Частково доставлено",
        description: "Замовлення їде кількома партіями або на кілька адрес.",
        tone: "warning",
      },
      {
        id: "unclaimed",
        label: "Не забрано замовником",
        description: "Потрібна реакція менеджера або логіста.",
        tone: "danger",
      },
    ],
  },
] as const;

export const ORDER_TONE_CLASSES = {
  neutral: "border-border bg-muted/30 text-muted-foreground",
  info: "tone-info",
  success: "tone-success",
  warning: "tone-warning",
  danger: "tone-danger",
} as const;
