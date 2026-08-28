/**
 * Заголовок, підзаголовок і крихта для кожного розділу — за адресою.
 *
 * ЧОМУ ОКРЕМО. Це чиста функція від `pathname` на 200 рядків, яка не знала
 * нічого про стан і все одно жила в AppLayout. Ратчет розміру
 * (scripts/check-file-growth.mjs) зупинив пуш, коли файл виріс на 13 рядків, і
 * мав рацію: правильна відповідь — не підняти стелю, а винести те, що ніколи
 * не мусило бути всередині оболонки. AppLayout схуд на 220 рядків.
 *
 * ПОРЯДОК ГІЛОК МАЄ ЗНАЧЕННЯ. Перевірки йдуть через `startsWith`, тож
 * конкретніший маршрут мусить стояти ПЕРЕД загальнішим: інакше `/team/:userId`
 * дістанеться гілці «Команди», а `/integrations/nova-poshta` — гілці
 * «Інтеграцій», і крихта загубить, де ми є.
 */

import { WHATS_NEW_FEATURES } from "@/components/app/WhatsNewTabs";
import { DEV_LABELS, DEV_PATHS, DEV_ROOT, resolveDevSurface } from "@/lib/devSection";

import { ROUTES } from "./routes";

export type HeaderConfig = {
  title: string;
  subtitle: string;
  breadcrumbLabel: string;
  breadcrumbTo: string;
  eyebrow?: string;
  showPageHeader?: boolean;
};

export // --- Header Logic ---
const getHeaderConfig = (pathname: string): HeaderConfig => {
  if (pathname === ROUTES.overview)
    return {
      title: "Огляд",
      subtitle: "Пульс команди, найближчі події та швидкі дії.",
      breadcrumbLabel: "Огляд",
      breadcrumbTo: ROUTES.overview,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.ordersEstimates))
    return {
      // «Прорахунки», а не «Прорахунки замовлень»: у сайдбарі, у смузі вкладок
      // і в розмові розділ зветься одним словом, і на телефоні довга назва
      // з'їдала пів шапки.
      title: "Прорахунки",
      subtitle: "Підготовка розрахунків і комерційних пропозицій.",
      breadcrumbLabel: "Прорахунки",
      breadcrumbTo: ROUTES.ordersEstimates,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.ordersCustomers))
    return {
      title: "Замовники",
      subtitle: "База компаній, реквізитів та контактної інформації.",
      breadcrumbLabel: "Замовники",
      breadcrumbTo: ROUTES.ordersCustomers,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.ordersProduction))
    return {
      title: "Замовлення",
      subtitle: "Черга оформлення, оплати, виробництва та відвантаження.",
      breadcrumbLabel: "Замовлення",
      breadcrumbTo: ROUTES.ordersProduction,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.ordersReadyToShip))
    return {
      title: "Готові до відвантаження",
      subtitle: "Замовлення, що готові до логістики.",
      breadcrumbLabel: "Готові до відвантаження",
      breadcrumbTo: ROUTES.ordersReadyToShip,
    };
  if (pathname.startsWith(ROUTES.catalogProducts))
    return {
      title: "Каталог продукції",
      subtitle: "Довідники типів, видів, моделей та методів нанесення.",
      breadcrumbLabel: "Каталог продукції",
      breadcrumbTo: ROUTES.catalogProducts,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.logistics))
    return {
      title: "Логістика",
      subtitle: "Доставка, маршрути та статуси відвантаження.",
      breadcrumbLabel: "Логістика",
      breadcrumbTo: ROUTES.logistics,
    };
  if (pathname.startsWith(ROUTES.design))
    return {
      title: "Дизайн",
      subtitle: "Макети, правки та задачі на дизайн.",
      breadcrumbLabel: "Дизайн",
      breadcrumbTo: ROUTES.design,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.contractors))
    return {
      title: "Підрядники",
      subtitle: "",
      breadcrumbLabel: "Підрядники",
      breadcrumbTo: ROUTES.contractors,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.sampleStock))
    return {
      title: "Склад",
      subtitle: "Залишки товарів, резерви та складські рухи.",
      breadcrumbLabel: "Склад",
      breadcrumbTo: ROUTES.sampleStock,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.finances))
    return {
      title: "Фінанси",
      subtitle: "Рахунки, видаткові накладні, акти, звірки та витрати компанії.",
      breadcrumbLabel: "Фінанси",
      breadcrumbTo: ROUTES.finances,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.marketing))
    return {
      title: "Маркетинг",
      subtitle: "Галерея дизайн-візуалів для зйомки та промо.",
      breadcrumbLabel: "Маркетинг",
      breadcrumbTo: ROUTES.marketing,
      showPageHeader: false,
    };
  // Картка людини — перед загальною гілкою «Команди», інакше startsWith забере
  // підмаршрут собі й крихта скаже «Команда» там, де відкрито конкретну людину.
  if (pathname.startsWith(`${ROUTES.team}/`))
    return {
      title: "Картка людини",
      subtitle: "Профіль, доступи, оплата й активність співробітника.",
      breadcrumbLabel: "Команда",
      breadcrumbTo: ROUTES.team,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.team))
    return {
      title: "Команда",
      subtitle: "Статуси команди, присутність і найближчі події.",
      breadcrumbLabel: "Команда",
      breadcrumbTo: ROUTES.team,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.notifications))
    return {
      title: "Сповіщення",
      subtitle: "Всі події та оновлення в одному місці.",
      breadcrumbLabel: "Сповіщення",
      breadcrumbTo: ROUTES.notifications,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.activity))
    return {
      title: "Активність",
      subtitle: "Останні дії команди та зміни в системі.",
      breadcrumbLabel: "Активність",
      breadcrumbTo: ROUTES.activity,
      // Сторінка малює власний UnifiedPageToolbar — типовий заголовок задвоївся б.
      showPageHeader: false,
    };
  // Чотири окремі пункти меню — отже чотири власні заголовки, а не один на розділ.
  if (pathname.startsWith(DEV_ROOT)) {
    const surface = resolveDevSurface(pathname);
    const subtitle =
      surface === "releases"
        ? "Скільки роботи зроблено — по днях і за період."
        : surface === "health"
          ? "Щоденні snapshots по базі, storage і важких SQL-шляхах."
          : surface === "stack"
            ? "З чого зроблена CRM і що з цим не так."
            : "Що просить команда і що ми вирішили зробити.";
    return {
      title: DEV_LABELS[surface],
      subtitle,
      breadcrumbLabel: DEV_LABELS[surface],
      breadcrumbTo: DEV_PATHS[surface],
      showPageHeader: false,
    };
  }
  if (pathname.startsWith(ROUTES.membersAccess))
    return {
      title: "Люди та доступи",
      subtitle: "Люди, матриця доступів, посади, Пульс і запрошення.",
      breadcrumbLabel: "Люди та доступи",
      breadcrumbTo: ROUTES.membersAccess,
      showPageHeader: false,
    };
  // Налаштування конкретного сервісу — перед загальною гілкою, інакше
  // startsWith нижче забере підмаршрут собі й крихта загубить, де ми є.
  if (pathname.startsWith(`${ROUTES.integrations}/nova-poshta`))
    return {
      title: "Нова Пошта",
      subtitle: "Відправник, дефолти ТТН і власні розміри коробок.",
      breadcrumbLabel: "Нова Пошта",
      breadcrumbTo: `${ROUTES.integrations}/nova-poshta`,
      showPageHeader: false,
    };
  // Без власної гілки сторінка падала у fallback і показувала шапку «Огляд ·
  // Пульс команди», ще й із зайвим блоком заголовка, що зсував контент униз.
  if (pathname.startsWith(ROUTES.integrations))
    return {
      title: "Інтеграції",
      subtitle: "Зовнішні сервіси, підключені до CRM.",
      breadcrumbLabel: "Інтеграції",
      breadcrumbTo: ROUTES.integrations,
      showPageHeader: false,
    };
if (pathname === ROUTES.profile)
    return {
      title: "Мій профіль",
      subtitle: "Керуй своїм обліковим записом та налаштуваннями.",
      breadcrumbLabel: "Профіль",
      breadcrumbTo: ROUTES.profile,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.whatsNew)) {
    const onFeatures = pathname.startsWith(WHATS_NEW_FEATURES);
    const onHandbook = pathname.startsWith(`${ROUTES.whatsNew}/handbook`);
    return {
      title: "Що нового",
      subtitle: onHandbook
        ? "Домовленості, яких не видно з інтерфейсу."
        : onFeatures
          ? "Що вміє CRM і що з цього ти ще не пробував."
          : "Історія змін у CRM.",
      breadcrumbLabel: onHandbook ? "Як ми працюємо" : onFeatures ? "Можливості" : "Оновлення",
      breadcrumbTo: ROUTES.whatsNew,
      showPageHeader: false,
    };
  }
  // fallback
  return {
    title: "Огляд",
    subtitle: "Пульс команди, найближчі події та швидкі дії.",
    breadcrumbLabel: "Огляд",
    breadcrumbTo: ROUTES.overview,
  };
};
