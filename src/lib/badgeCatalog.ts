export type BadgeCatalogTone =
  | "neutral"
  | "info"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "destructive";

export type BadgeCatalogItem = {
  label: string;
  previewLabel?: string;
  note: string;
  source: string[];
  renderAs?: "badge" | "chip" | "tag";
  tone?: BadgeCatalogTone;
  className?: string;
  variant?: "default" | "secondary" | "destructive" | "outline";
  active?: boolean;
};

export type BadgeCatalogGroup = {
  id: string;
  label: string;
  description: string;
  items: BadgeCatalogItem[];
};

export type BadgeCatalogTab = {
  id: string;
  label: string;
  description: string;
  groups: BadgeCatalogGroup[];
};

export const BADGE_CATALOG_TABS: BadgeCatalogTab[] = [
  {
    id: "quotes",
    label: "Quotes",
    description: "Статуси, дедлайни та типи прорахунків, які використовуються в quote flows.",
    groups: [
      {
        id: "quote-status",
        label: "Quote Status",
        description: "Основна мапа статусів прорахунків, яку вже видно на overview, списках і деталях.",
        items: [
          { label: "Новий", note: "Початковий стан", tone: "neutral", source: ["src/pages/OverviewPage.tsx", "src/pages/QuoteDetailsPage.tsx"] },
          { label: "На прорахунку", note: "Активний робочий етап", tone: "info", source: ["src/pages/OverviewPage.tsx", "src/pages/QuotesPage.tsx"] },
          { label: "Пораховано", note: "Quote вже підготовлено", tone: "info", source: ["src/pages/OverviewPage.tsx", "src/pages/QuotesPage.tsx"] },
          {
            label: "На погодженні",
            note: "Потребує уваги або рішення",
            className: "bg-warning-soft text-warning-foreground border-warning-soft-border",
            variant: "outline",
            source: ["src/pages/OverviewPage.tsx", "src/pages/QuotesPage.tsx"],
          },
          { label: "Затверджено", note: "Позитивне завершення", tone: "success", source: ["src/pages/OverviewPage.tsx", "src/pages/QuoteDetailsPage.tsx"] },
          { label: "Скасовано", note: "Негативне завершення", tone: "danger", source: ["src/pages/OverviewPage.tsx", "src/pages/QuoteDetailsPage.tsx"] },
        ],
      },
      {
        id: "quote-deadline",
        label: "Quote Deadline",
        description: "Спеціалізований badge для дедлайнів клієнта й внутрішніх дедлайнів.",
        items: [
          { label: "Без дедлайну", note: "Нейтральний дедлайн", className: "quote-neutral-badge", variant: "outline", source: ["src/features/quotes/components/QuoteDeadlineBadge.tsx", "src/index.css"] },
          { label: "Майбутній", note: "Є запас по часу", className: "quote-neutral-badge", variant: "outline", source: ["src/features/quotes/components/QuoteDeadlineBadge.tsx", "src/index.css"] },
          { label: "Скоро", note: "Наближається дедлайн", className: "quote-warning-badge", variant: "outline", source: ["src/features/quotes/components/QuoteDeadlineBadge.tsx", "src/index.css"] },
          { label: "Сьогодні", note: "Потрібна увага сьогодні", className: "quote-warning-badge", variant: "outline", source: ["src/features/quotes/components/QuoteDeadlineBadge.tsx", "src/index.css"] },
          { label: "Прострочено", note: "Дедлайн порушено", className: "quote-danger-badge", variant: "outline", source: ["src/features/quotes/components/QuoteDeadlineBadge.tsx", "src/index.css"] },
        ],
      },
      {
        id: "quote-kind",
        label: "Quote Kind",
        description: "Маркування КП і наборів.",
        items: [
          { label: "КП", note: "Комерційна пропозиція", className: "quote-kind-badge-kp", variant: "outline", source: ["src/features/quotes/components/QuoteKindBadge.tsx", "src/index.css"] },
          { label: "Набір", note: "Групування кількох КП", className: "quote-kind-badge-set", variant: "outline", source: ["src/features/quotes/components/QuoteKindBadge.tsx", "src/index.css"] },
        ],
      },
      {
        id: "quote-type",
        label: "Quote Type And Ownership",
        description: "Тип прорахунку і юридичні форми, які теж сприймаються як маркери.",
        items: [
          { label: "Мерч", note: "Quote type для мерчу", renderAs: "chip", active: true, source: ["src/features/quotes/quotes-page/config.ts", "src/features/catalog/ProductCatalogPage/components/ContentHeader.tsx"] },
          { label: "Поліграфія", note: "Quote type для друку", renderAs: "chip", active: true, source: ["src/features/quotes/quotes-page/config.ts", "src/features/catalog/ProductCatalogPage/components/ContentHeader.tsx"] },
          { label: "Інше", note: "Fallback quote type", renderAs: "chip", source: ["src/features/quotes/quotes-page/config.ts"] },
          { label: "ТОВ", note: "Поширений ownership type", renderAs: "tag", className: "rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground", source: ["src/lib/customerLegalEntities.ts", "src/components/customers/CustomerDialog.tsx"] },
          { label: "ФОП", note: "Ownership type для фізичної особи-підприємця", renderAs: "tag", className: "rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground", source: ["src/lib/customerLegalEntities.ts", "src/components/customers/CustomerDialog.tsx"] },
        ],
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    description: "Badge families для design board, design task і навантаження команди.",
    groups: [
      {
        id: "design-status",
        label: "Design Status",
        description: "Основний статусний набір design board і design task.",
        items: [
          { label: "Новий", note: "Початковий стан задачі", className: "design-status-badge-new", variant: "outline", source: ["src/pages/DesignPage.tsx", "src/pages/DesignTaskPage.tsx", "src/index.css"] },
          { label: "Правки", note: "Задача повернулась із фідбеком", className: "design-status-badge-changes", variant: "outline", source: ["src/pages/DesignPage.tsx", "src/pages/DesignTaskPage.tsx", "src/index.css"] },
          { label: "В роботі", note: "Активне виконання", className: "design-status-badge-in-progress", variant: "outline", source: ["src/pages/DesignPage.tsx", "src/pages/DesignTaskPage.tsx", "src/index.css"] },
          { label: "На перевірці", note: "Внутрішній review", className: "design-status-badge-pm-review", variant: "outline", source: ["src/pages/DesignPage.tsx", "src/pages/DesignTaskPage.tsx", "src/index.css"] },
          { label: "На погодженні", note: "Очікує рішення клієнта", className: "design-status-badge-client-review", variant: "outline", source: ["src/pages/DesignPage.tsx", "src/pages/DesignTaskPage.tsx", "src/index.css"] },
          { label: "Затверджено", note: "Фінальний успішний стан", className: "design-status-badge-approved", variant: "outline", source: ["src/pages/DesignPage.tsx", "src/pages/DesignTaskPage.tsx", "src/index.css"] },
          { label: "Скасовано", note: "Фінальний негативний стан", className: "design-status-badge-cancelled", variant: "outline", source: ["src/pages/DesignPage.tsx", "src/pages/DesignTaskPage.tsx", "src/index.css"] },
        ],
      },
      {
        id: "design-workload",
        label: "Workload And Capacity",
        description: "Окремий набір для оцінки навантаження і доступної ємності.",
        items: [
          { label: "Спокійно", note: "Низьке поточне навантаження", className: "border-border/60 bg-background/80 text-muted-foreground", variant: "outline", source: ["src/pages/DesignPage.tsx"] },
          { label: "Норма", note: "Збалансований workload", className: "border-info-soft-border bg-info-soft text-info-foreground", variant: "outline", source: ["src/pages/DesignPage.tsx"] },
          { label: "Щільно", note: "Навантаження вище норми", className: "border-warning-soft-border bg-warning-soft text-warning-foreground", variant: "outline", source: ["src/pages/DesignPage.tsx"] },
          { label: "Перевантаження", note: "Критичний рівень задач", className: "border-danger-soft-border bg-danger-soft text-danger-foreground", variant: "outline", source: ["src/pages/DesignPage.tsx"] },
          { label: "Низьке", previewLabel: "Capacity: Low", note: "Можна додавати нові задачі", className: "border-success-soft-border bg-success-soft text-success-foreground", variant: "outline", source: ["src/pages/DesignPage.tsx", "src/pages/DesignTaskPage.tsx"] },
          { label: "Середнє", previewLabel: "Capacity: Medium", note: "Робочий рівень завантаження", className: "border-info-soft-border bg-info-soft text-info-foreground", variant: "outline", source: ["src/pages/DesignPage.tsx", "src/pages/DesignTaskPage.tsx"] },
          { label: "Високе", previewLabel: "Capacity: High", note: "Потрібна обережність із новими задачами", className: "border-warning-soft-border bg-warning-soft text-warning-foreground", variant: "outline", source: ["src/pages/DesignPage.tsx", "src/pages/DesignTaskPage.tsx"] },
          { label: "Критичне", previewLabel: "Capacity: Critical", note: "Ресурс майже вичерпано", className: "border-danger-soft-border bg-danger-soft text-danger-foreground", variant: "outline", source: ["src/pages/DesignPage.tsx", "src/pages/DesignTaskPage.tsx"] },
        ],
      },
      {
        id: "design-type-and-output",
        label: "Design Type, Deadlines, Outputs",
        description: "Тип задачі, дедлайни та ознаки погодження матеріалів.",
        items: [
          { label: "Візуалізація", note: "Тип дизайн-задачі", variant: "outline", source: ["src/lib/designTaskType.ts", "src/pages/DesignTaskPage.tsx", "src/components/customers/CustomerLeadQuickViewDialog.tsx"] },
          { label: "Креатив", note: "Окремий тип дизайн-задачі", variant: "outline", source: ["src/lib/designTaskType.ts", "src/pages/DesignTaskPage.tsx", "src/components/customers/CustomerLeadQuickViewDialog.tsx"] },
          { label: "Візуал", note: "Design output kind", variant: "default", className: "text-[10px]", source: ["src/pages/DesignTaskPage.tsx"] },
          { label: "Макет", note: "Design output kind", variant: "outline", className: "text-[10px]", source: ["src/pages/DesignTaskPage.tsx"] },
          { label: "Погоджено: 2", note: "Кількість погоджених матеріалів", variant: "outline", className: "text-[10px] border-success/40 bg-success/10 text-success-foreground", source: ["src/pages/DesignTaskPage.tsx"] },
          { label: "У добірці для клієнта", note: "Матеріал обраний для відправки клієнту", variant: "outline", className: "h-5 border-primary/30 bg-primary/10 text-[10px] text-primary", source: ["src/pages/DesignTaskPage.tsx"] },
          { label: "Дедлайн: сьогодні", note: "Header deadline marker у design task", renderAs: "tag", className: "inline-flex h-7 items-center gap-1 rounded-full border border-warning-soft-border bg-warning-soft px-2.5 py-1 text-xs text-warning-foreground", source: ["src/pages/DesignTaskPage.tsx"] },
        ],
      },
    ],
  },
  {
    id: "team",
    label: "Team",
    description: "Badge families для ролей, доступності, статусів працевлаштування та інвайтів.",
    groups: [
      {
        id: "team-role",
        label: "Access And Role",
        description: "Badge-класи для access role і job role в профілях та списках команди.",
        items: [
          { label: "Owner", note: "Привілейований доступ", className: "tone-accent", variant: "outline", source: ["src/pages/TeamMembersPage.tsx"] },
          { label: "Admin", note: "Адмінський доступ", className: "border-info-soft-border bg-info-soft text-info-foreground", variant: "outline", source: ["src/pages/TeamMembersPage.tsx"] },
          { label: "Base Role", note: "Нейтральний role badge", className: "bg-muted/50 border-border text-muted-foreground", variant: "outline", source: ["src/pages/TeamMembersPage.tsx"] },
          { label: "Job Role", note: "Посада відображається м’якше", className: "bg-muted/30 border-border text-muted-foreground", variant: "outline", source: ["src/pages/TeamMembersPage.tsx"] },
        ],
      },
      {
        id: "team-availability",
        label: "Availability",
        description: "Доступність учасника в team pages і directory.",
        items: [
          { label: "Доступний", note: "Готовий до роботи", className: "bg-success-soft text-success-foreground border-success-soft-border", variant: "outline", source: ["src/lib/teamAvailability.ts", "src/pages/TeamMembersPage.tsx", "src/pages/TeamPage.tsx"] },
          { label: "Відпустка", note: "Тимчасово недоступний", className: "bg-warning-soft text-warning-foreground border-warning-soft-border", variant: "outline", source: ["src/lib/teamAvailability.ts", "src/pages/TeamMembersPage.tsx", "src/pages/TeamPage.tsx"] },
          { label: "Лікарняний", note: "Відсутність через хворобу", className: "bg-danger-soft text-danger-foreground border-danger-soft-border", variant: "outline", source: ["src/lib/teamAvailability.ts", "src/pages/TeamMembersPage.tsx", "src/pages/TeamPage.tsx"] },
          { label: "Поза офісом", note: "Нейтрально приглушений стан", className: "bg-muted text-muted-foreground border-border", variant: "outline", source: ["src/lib/teamAvailability.ts", "src/pages/TeamMembersPage.tsx", "src/pages/TeamPage.tsx"] },
        ],
      },
      {
        id: "team-employment",
        label: "Probation, Employment, Invites",
        description: "Стани випробувального терміну, зайнятості та інвайтів.",
        items: [
          { label: "Випробувальний скоро", note: "Ще не стартував", className: "bg-muted text-muted-foreground border-border", variant: "outline", source: ["src/pages/TeamMembersPage.tsx"] },
          { label: "Випробувальний активний", note: "Потребує контролю", className: "bg-warning-soft text-warning-foreground border-warning-soft-border", variant: "outline", source: ["src/pages/TeamMembersPage.tsx"] },
          { label: "Випробувальний завершено", note: "Успішне проходження", className: "bg-success-soft text-success-foreground border-success-soft-border", variant: "outline", source: ["src/pages/TeamMembersPage.tsx"] },
          { label: "Активний", note: "Стандартний employment state", className: "bg-success-soft text-success-foreground border-success-soft-border", variant: "outline", source: ["src/pages/TeamMembersPage.tsx"] },
          { label: "Пробація", note: "Employment з warning tone", className: "bg-warning-soft text-warning-foreground border-warning-soft-border", variant: "outline", source: ["src/pages/TeamMembersPage.tsx"] },
          { label: "Неактивний", note: "Приглушений state", className: "bg-muted text-muted-foreground border-border", variant: "outline", source: ["src/pages/TeamMembersPage.tsx"] },
          { label: "Відхилено", note: "Негативний результат", className: "bg-danger-soft text-danger-foreground border-danger-soft-border", variant: "outline", source: ["src/pages/TeamMembersPage.tsx"] },
          { label: "Інвайт: pending", note: "Очікує відповіді", variant: "secondary", className: "bg-muted text-muted-foreground hover:bg-muted", source: ["src/pages/TeamMembersPage.tsx"] },
          { label: "Інвайт: declined", note: "Інвайт відхилено", variant: "destructive", className: "bg-danger-soft text-danger-foreground border-danger-soft-border hover:bg-danger-soft", source: ["src/pages/TeamMembersPage.tsx"] },
          { label: "Інвайт: accepted", note: "Інвайт прийнято", variant: "default", className: "bg-success-soft text-success-foreground border-success-soft-border hover:bg-success-soft shadow-none", source: ["src/pages/TeamMembersPage.tsx"] },
        ],
      },
      {
        id: "team-chip-controls",
        label: "Team And People Chips",
        description: "Chip-подібні селектори менеджера, виконавця, контрагента й інших сутностей.",
        items: [
          { label: "SEO-менеджер", note: "Role-like chip із team selector flows", renderAs: "chip", active: true, source: ["src/pages/DesignPage.tsx", "src/components/quotes/NewQuoteDialog.tsx"] },
          { label: "Менеджер", note: "Picker chip для відповідального", renderAs: "chip", source: ["src/pages/DesignPage.tsx", "src/components/quotes/NewQuoteDialog.tsx"] },
          { label: "Виконавець", note: "Picker chip для дизайнера / assignee", renderAs: "chip", source: ["src/pages/DesignPage.tsx", "src/components/quotes/NewQuoteDialog.tsx"] },
          { label: "Замовник / Лід", note: "CustomerLeadPicker використовує chip shell", renderAs: "chip", active: true, source: ["src/components/customers/CustomerLeadPicker.tsx", "src/components/quotes/NewQuoteDialog.tsx"] },
          { label: "Дедлайн", note: "Interactive date chip", renderAs: "chip", source: ["src/pages/DesignPage.tsx", "src/components/quotes/NewQuoteDialog.tsx"] },
        ],
      },
    ],
  },
  {
    id: "ops-admin",
    label: "Ops & Admin",
    description: "Статусні badge-и для адміністрування й операційних підказок.",
    groups: [
      {
        id: "ops-warning",
        label: "Operational And Matching",
        description: "Badge-и для cross-manager warning states, unread flags і debug notes.",
        items: [
          { label: "Лід", note: "Cross-manager duplicate warning", tone: "warning", source: ["src/pages/OrdersCustomersPage.tsx"] },
          { label: "Замовник", note: "Cross-manager duplicate warning", tone: "warning", source: ["src/pages/OrdersCustomersPage.tsx"] },
          { label: "Нове", note: "Unread notification", variant: "secondary", source: ["src/pages/NotificationsPage.tsx"] },
          { label: "Тільки для перевірки", note: "Secondary helper badge", variant: "secondary", className: "bg-background/80", source: ["src/pages/NotificationsPage.tsx"] },
        ],
      },
      {
        id: "legal-and-order-readiness",
        label: "Legal, Payment, Order Readiness",
        description: "Ще одна велика група badge-like маркерів навколо документів, оплат і готовності.",
        items: [
          { label: "Безготівкові, грн.", note: "Payment method option для ТОВ/ФОП", renderAs: "chip", source: ["src/features/orders/config.ts", "src/components/quotes/NewQuoteDialog.tsx"] },
          { label: "Безготівкові, $ / €", note: "FX payment option", renderAs: "chip", source: ["src/features/orders/config.ts", "src/components/quotes/NewQuoteDialog.tsx"] },
          { label: "Лід / реквізити", note: "Order readiness column marker", renderAs: "tag", className: "inline-flex items-center gap-2 rounded-full border border-warning-soft-border bg-warning-soft px-3 py-1 text-xs font-medium text-warning-foreground", source: ["src/features/orders/config.ts"] },
          { label: "Макет / візуал", note: "Order readiness column marker", renderAs: "tag", className: "inline-flex items-center gap-2 rounded-full border border-info-soft-border bg-info-soft px-3 py-1 text-xs font-medium text-info-foreground", source: ["src/features/orders/config.ts"] },
          { label: "Готово до замовлення", note: "Order readiness column marker", renderAs: "tag", className: "inline-flex items-center gap-2 rounded-full border border-success-soft-border bg-success-soft px-3 py-1 text-xs font-medium text-success-foreground", source: ["src/features/orders/config.ts"] },
        ],
      },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    description: "Badge-и з command palette, каталогу моделей та пошукових підказок.",
    groups: [
      {
        id: "command-kinds",
        label: "Command Palette Kinds",
        description: "Маркування типів сутностей у глобальному та каталожному пошуку.",
        items: [
          { label: "Замовник", note: "Сутність customer", className: "cmd-kind-customer", variant: "outline", source: ["src/layout/AppLayout.tsx", "src/pages/ColorPalettePage.tsx"] },
          { label: "Лід", note: "Сутність lead", className: "cmd-kind-lead", variant: "outline", source: ["src/layout/AppLayout.tsx", "src/pages/ColorPalettePage.tsx"] },
          { label: "Прорахунок", note: "Сутність quote", className: "cmd-kind-quote", variant: "outline", source: ["src/layout/AppLayout.tsx", "src/pages/ColorPalettePage.tsx"] },
          { label: "Замовлення", note: "Сутність order", className: "cmd-kind-order", variant: "outline", source: ["src/layout/AppLayout.tsx", "src/pages/ColorPalettePage.tsx"] },
          { label: "Дизайн", note: "Сутність design", className: "cmd-kind-design", variant: "outline", source: ["src/layout/AppLayout.tsx", "src/pages/ColorPalettePage.tsx"] },
        ],
      },
      {
        id: "catalog-models",
        label: "Catalog Model Tags",
        description: "Локальні badges у карточках моделі та пошуку каталогу.",
        items: [
          { label: "3 тиражів", note: "Tier count на зображенні моделі", variant: "secondary", className: "bg-background/90 backdrop-blur-sm shadow-md text-xs font-semibold gap-1 px-2.5 py-1", source: ["src/features/catalog/ProductCatalogPage/components/SimpleModelCard.tsx"] },
          { label: "Шовкодрук", note: "Method tag у карточці моделі", variant: "outline", className: "text-xs px-2 py-0 h-6", source: ["src/features/catalog/ProductCatalogPage/components/SimpleModelCard.tsx"] },
          { label: "+2", note: "Стиснений badge для extra methods", variant: "outline", className: "text-xs px-2 py-0 h-6", source: ["src/features/catalog/ProductCatalogPage/components/SimpleModelCard.tsx"] },
          { label: "Фільтр", note: "Outline badge у пошуковому рядку каталогу", variant: "outline", className: "text-xs px-2.5 py-1 h-9 flex items-center gap-1.5", source: ["src/features/catalog/ProductCatalogPage/components/SearchBar.tsx"] },
        ],
      },
      {
        id: "catalog-method-place-tags",
        label: "Methods And Places",
        description: "Каталожні pills для місць друку та методів нанесення.",
        items: [
          { label: "Рукав", note: "Print position pill", renderAs: "tag", className: "inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground", source: ["src/features/catalog/ProductCatalogPage/components/ContentHeader.tsx"] },
          { label: "Шовкодрук", note: "Method pill", renderAs: "tag", className: "inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary", source: ["src/features/catalog/ProductCatalogPage/components/ContentHeader.tsx"] },
          { label: "Додати місце", note: "Dashed add pill", renderAs: "tag", className: "inline-flex items-center gap-1.5 rounded-full border border-dashed border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground", source: ["src/features/catalog/ProductCatalogPage/components/ContentHeader.tsx"] },
          { label: "Додати метод", note: "Dashed add method pill", renderAs: "tag", className: "inline-flex items-center gap-1.5 rounded-full border border-dashed border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary", source: ["src/features/catalog/ProductCatalogPage/components/ContentHeader.tsx"] },
        ],
      },
    ],
  },
];

export const BADGE_CATALOG_ITEM_COUNT = BADGE_CATALOG_TABS.reduce(
  (total, tab) => total + tab.groups.reduce((groupTotal, group) => groupTotal + group.items.length, 0),
  0,
);
