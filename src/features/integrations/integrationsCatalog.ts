import type { ComponentType } from "react";

import { DropboxIcon } from "@/components/icons/DropboxIcon";
import { TelegramIcon } from "@/components/icons/TelegramIcon";

/**
 * Реєстр зовнішніх сервісів, з якими працює CRM.
 *
 * Тут лежить те, що НЕ змінюється від стану підключення: назва, призначення,
 * перелік можливостей, куди веде налаштування. Живий стан рахує
 * `integrationsStatus.ts` — свідомо окремо, бо реєстр читається синхронно при
 * першому кадрі, а стан приходить із мережі.
 */

export type IntegrationId =
  | "nova_poshta"
  | "vchasno"
  | "dropbox"
  | "telegram"
  | "openai"
  | "monobank"
  | "google_calendar"
  | "figma"
  | "google_sheets"
  | "netlify"
  | "supabase";

/**
 * Дві природи сервісів, і плутати їх не можна.
 *
 * `core` — те, чим користується КОМПАНІЯ: пошта, документи, файли, банк.
 * `infra` — те, на чому CRM працює: хостинг, база. Керівнику воно ні до чого,
 * тому група закрита ключем `dev` і стоїть окремим блоком унизу. Живі числа
 * інфраструктури живуть у «Здоров'ї» — тут лише запис у довіднику: що це,
 * де ключі, куди йти дивитись.
 */
export type IntegrationGroup = "core" | "infra";

/**
 * Блок на сторінці. Це не те саме, що `IntegrationGroup`: «Плануємо» — не
 * природа сервісу, а його стан, але в списку воно мусить бути окремим блоком
 * ВНИЗУ. Інакше підключене й неіснуюче стоять упереміш, і сторінка перестає
 * відповідати на головне питання — що зараз працює.
 */
export type IntegrationBlock = IntegrationGroup | "planned";

export const INTEGRATION_BLOCK_ORDER: IntegrationBlock[] = ["core", "infra", "planned"];

export const INTEGRATION_BLOCK_LABEL: Record<IntegrationBlock, string> = {
  core: "Сервіси компанії",
  infra: "На чому працює CRM",
  planned: "Плануємо підключити",
};

export const INTEGRATION_BLOCK_HINT: Record<IntegrationBlock, string> = {
  core: "Зовнішні сервіси, якими користуються в роботі щодня.",
  infra: "Хостинг і база. Живі показники — у розділі «Здоров'я»; тут лише де що лежить.",
  planned: "Ще не підключено. Скажіть, якщо потрібно — це вплине на чергу доробок.",
};

/** Куди картка потрапляє в списку: намір завжди вниз, незалежно від природи. */
export const integrationBlockOf = (definition: IntegrationDefinition): IntegrationBlock =>
  definition.planned ? "planned" : definition.group;

/**
 * Що сервіс уміє в НАШІЙ CRM. `enabled: false` — свідомо не робимо; це не
 * «зламано» й не «колись буде», а межа інтеграції, і людина має бачити її
 * до того, як почне шукати кнопку, якої немає.
 */
export type IntegrationCapability = { label: string; enabled: boolean };

export type IntegrationDefinition = {
  id: IntegrationId;
  name: string;
  group: IntegrationGroup;
  /** Одне речення про користь для людини, а не про будову інтеграції. */
  what: string;
  /**
   * Інлайновий знак — коли ми впевнені у бренді: не залежить від мережі й
   * лишається чітким на будь-якому розмірі.
   */
  Mark?: ComponentType<{ className?: string }>;
  /**
   * Домен для фавікона — коли інлайнового знака немає. Той самий трюк, що й
   * для лого підписок у Фінансах. Малювати бренд «на око» гірше за обидва.
   */
  domain?: string;
  capabilities: IntegrationCapability[];
  /** Сторінка налаштувань усередині CRM. */
  settingsPath?: string;
  /** Кабінет сервісу назовні. */
  externalUrl?: string;
  /** Куди в CRM іти по живі числа (для інфраструктури — «Здоров'я»). */
  monitorPath?: string;
  /**
   * Ключ постачальника у Фінансах (`finance_expenses.vendor_key`). Через нього
   * картка показує, скільки ми за сервіс платимо, — щоб не лазити в кабінет
   * кожного сервісу за сумою, яку бухгалтерія вже й так завела.
   */
  vendorKey?: string;
  /** Сервісу ще немає в CRM — картка лише показує намір. */
  planned?: boolean;
};

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    id: "nova_poshta",
    name: "Нова Пошта",
    group: "core",
    what: "ТТН і адреси відділень у замовленні",
    domain: "novaposhta.ua",
    vendorKey: "novaposhta",
    settingsPath: "/integrations/nova-poshta",
    externalUrl: "https://new.novaposhta.ua/",
    capabilities: [
      { label: "Підказка міст і відділень у формах", enabled: true },
      { label: "Створення ТТН із замовлення", enabled: true },
      { label: "Маркування посилок", enabled: true },
      // Функція трекінгу в novaPoshtaApi.ts є, але її ніхто не викликає:
      // статус доставки менеджер ставить руками на дошці замовлень.
      { label: "Автоматичне оновлення статусу доставки", enabled: false },
    ],
  },
  {
    id: "vchasno",
    name: "Вчасно.ЕДО",
    group: "core",
    what: "Рахунки й акти йдуть контрагенту з CRM",
    domain: "vchasno.ua",
    vendorKey: "vchasno",
    externalUrl: "https://edo.vchasno.ua/",
    capabilities: [
      { label: "Надсилання рахунків і актів", enabled: true },
      { label: "Статус підпису в картці документа", enabled: true },
      { label: "Кілька кабінетів під різні юрособи", enabled: true },
      // Рішення власника: КЕП лишається в руках бухгалтерії.
      { label: "Підписання КЕП із CRM", enabled: false },
      { label: "Вхідні документи від контрагентів", enabled: false },
    ],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    group: "core",
    what: "Тека замовника й архів макетів",
    Mark: DropboxIcon,
    vendorKey: "dropbox",
    externalUrl: "https://www.dropbox.com/home",
    capabilities: [
      { label: "Тека замовника одним кліком", enabled: true },
      { label: "Прив'язати наявну теку", enabled: true },
      { label: "Тека проєкту під замовлення", enabled: true },
      { label: "Синхронізація в обидва боки", enabled: false },
    ],
  },
  {
    id: "telegram",
    name: "Telegram",
    group: "core",
    what: "Сповіщення й щоденні звіти просто в чаті",
    Mark: TelegramIcon,
    settingsPath: "/profile",
    externalUrl: "https://t.me/ToShoCRM_bot",
    capabilities: [
      { label: "Сповіщення в особистий чат", enabled: true },
      { label: "Заведення задач із бота", enabled: true },
      { label: "Питання про дизайн-задачі", enabled: true },
      { label: "Відповідь на коментар прямо з чату", enabled: false },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    group: "core",
    // Назва сервісу — OpenAI; «ToSho AI» — наша обгортка над ним, а не
    // окремий постачальник. У картці має стояти те, з чим ми справді
    // з'єднані й за що приходить рахунок.
    what: "API за токени: пошук, диктування, бот",
    domain: "openai.com",
    monitorPath: "/dev/health",
    externalUrl: "https://platform.openai.com/usage",
    capabilities: [
      { label: "Пошук і відповіді по даних CRM", enabled: true },
      { label: "Диктування ТЗ і коментарів", enabled: true },
      { label: "Переказ тем комітів для звіту", enabled: true },
      { label: "Облік вартості кожного запиту", enabled: true },
    ],
  },
  {
    id: "monobank",
    name: "monobank",
    group: "core",
    what: "Виписка сама лягає у витрати й оплати",
    domain: "monobank.ua",
    planned: true,
    capabilities: [
      { label: "Виписка підтягується у Фінанси", enabled: false },
      { label: "Оплата замовлення бачиться автоматично", enabled: false },
    ],
  },
  {
    id: "google_calendar",
    name: "Google Календар",
    group: "core",
    what: "Дедлайни задач поруч зі зустрічами",
    domain: "calendar.google.com",
    planned: true,
    capabilities: [
      { label: "Дедлайни задач поруч зі зустрічами", enabled: false },
      { label: "Відпустки команди в календарі", enabled: false },
    ],
  },
  {
    id: "figma",
    name: "Figma",
    group: "core",
    what: "Прев'ю макета прямо в дизайн-задачі",
    domain: "figma.com",
    planned: true,
    capabilities: [
      { label: "Прев'ю макета в задачі", enabled: false },
      { label: "Версії макета підтягуються самі", enabled: false },
    ],
  },
  {
    id: "google_sheets",
    name: "Google Таблиці",
    group: "core",
    what: "Звіти вивантажуються для бухгалтерії",
    domain: "google.com",
    planned: true,
    capabilities: [
      { label: "Вивантаження звітів за розкладом", enabled: false },
      { label: "Таблиця оновлюється на місці", enabled: false },
    ],
  },
  {
    id: "netlify",
    name: "Netlify",
    group: "infra",
    what: "Хостинг CRM; деплої йдуть у «Релізи»",
    domain: "netlify.com",
    vendorKey: "netlify",
    monitorPath: "/dev/releases",
    externalUrl: "https://app.netlify.com/",
    capabilities: [
      { label: "Автозапис релізу після деплою", enabled: true },
      { label: "AI-переказ теми коміта для звіту", enabled: true },
      { label: "Відкат релізу з CRM", enabled: false },
    ],
  },
  {
    id: "supabase",
    name: "Supabase",
    group: "infra",
    what: "База, файли й вхід у систему",
    domain: "supabase.com",
    vendorKey: "supabase",
    monitorPath: "/dev/health",
    externalUrl: "https://supabase.com/dashboard",
    capabilities: [
      { label: "База даних і права доступу", enabled: true },
      { label: "Сховище вкладень і аватарів", enabled: true },
      { label: "Вхід у систему й запрошення", enabled: true },
      { label: "Щотижневий бекап у Dropbox", enabled: true },
    ],
  },
];

export const getIntegration = (id: IntegrationId): IntegrationDefinition | undefined =>
  INTEGRATIONS.find((item) => item.id === id);

/** Лого домену — тим самим сервісом фавіконів, що й бренди підписок. */
export const integrationFaviconUrl = (domain: string): string =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
