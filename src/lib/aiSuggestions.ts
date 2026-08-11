import {
  AlertTriangle,
  BarChart3,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Factory,
  Image,
  ListChecks,
  Mail,
  Package,
  Palette,
  Receipt,
  Send,
  Target,
  Timer,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Підказки «що можна спитати» для палітри команд.
 *
 * ЧОМУ НЕ ОДИН СПИСОК ДЛЯ ВСІХ. Дизайнеру байдуже до сум по менеджерах, а
 * бухгалтеру — до черги візуалів. Три однакові рядки для всіх читаються як
 * вітрина й перестають помічатись за тиждень.
 *
 * ЧОМУ КОШИКИ, А НЕ ПОСАДИ. У jobRoles.ts двадцять ключів, але питання
 * різняться не по кожному: молодшому й старшому менеджеру потрібне те саме.
 * Тому набори живуть на шести кошиках, а посада лише мапиться в кошик.
 */

export type AiSuggestion = {
  key: string;
  /** Коротка назва — те, за що чіпляється око. */
  title: string;
  /** Повний текст, який піде в ToSho AI. */
  question: string;
  icon: LucideIcon;
  /**
   * Сторінки, де підказка доречніша за решту. Збіг піднімає її наверх, але
   * НЕ ховає інші: людина може стояти в дизайні й питати про гроші.
   */
  paths?: string[];
};

export type AiSuggestionBucket =
  | "sales"
  | "design"
  | "production"
  | "finance"
  | "chief"
  | "marketing"
  | "general";

export const AI_BUCKET_LABELS: Record<AiSuggestionBucket, string> = {
  sales: "для менеджера",
  design: "для дизайнера",
  production: "для виробництва",
  finance: "для бухгалтерії",
  chief: "для керівництва",
  marketing: "для маркетингу",
  general: "",
};

/** job_role → кошик. Ключі — з JOB_ROLE_NAMES (src/lib/jobRoles.ts). */
const BUCKET_BY_JOB_ROLE: Record<string, AiSuggestionBucket> = {
  manager: "sales",
  sales_manager: "sales",
  junior_sales_manager: "sales",
  pm: "sales",
  designer: "design",
  head_of_production: "production",
  head_of_logistics: "production",
  printer: "production",
  logistics: "production",
  packer: "production",
  accountant: "finance",
  junior_accountant: "finance",
  chief_accountant: "finance",
  seo: "chief",
  top_manager: "chief",
  marketer: "marketing",
  smm: "marketing",
};

export function resolveAiBucket(params: {
  accessRole?: string | null;
  jobRole?: string | null;
}): AiSuggestionBucket {
  const access = (params.accessRole ?? "").trim().toLowerCase();
  const job = (params.jobRole ?? "").trim().toLowerCase();
  // Власник і адмін дивляться на компанію згори — навіть якщо в картці
  // співробітника стоїть якась вужча посада.
  if (access === "owner" || access === "admin") return "chief";
  return BUCKET_BY_JOB_ROLE[job] ?? "general";
}

const SALES: AiSuggestion[] = [
  { key: "sales-silent", title: "Хто не відповів", question: "Які мої прорахунки висять без відповіді понад тиждень?", icon: Clock, paths: ["/orders/estimates"] },
  { key: "sales-deadlines", title: "Мої дедлайни", question: "Що в мене горить сьогодні й завтра?", icon: CalendarDays },
  { key: "sales-month", title: "Мій місяць", question: "Скільки прорахунків я закрив цього місяця і на яку суму?", icon: BarChart3, paths: ["/orders/estimates"] },
  { key: "sales-customers", title: "Мої замовники", question: "У кого із замовників найбільше зараз у роботі?", icon: Building2, paths: ["/orders/customers"] },
  { key: "sales-design-stuck", title: "Застрягло в дизайні", question: "Які мої прорахунки чекають на дизайн довше за три дні?", icon: Palette, paths: ["/design"] },
  { key: "sales-letter", title: "Написати замовнику", question: "Склади лист-нагадування по прорахунку, який висить найдовше", icon: Mail },
  { key: "sales-orders", title: "Мої замовлення", question: "Які мої замовлення зараз у виробництві?", icon: Factory, paths: ["/orders/production"] },
  { key: "sales-unpaid", title: "Неоплачене", question: "Хто з моїх замовників ще не оплатив?", icon: Wallet },
  { key: "sales-week", title: "Тиждень", question: "Що я зробив за цей тиждень?", icon: TrendingUp },
];

const DESIGN: AiSuggestion[] = [
  { key: "design-now", title: "Що в мене зараз", question: "Які дизайн-задачі в мене в роботі просто зараз?", icon: Palette, paths: ["/design"] },
  { key: "design-week", title: "Мій тиждень", question: "Скільки візуалів і макетів я здав цього тижня?", icon: BarChart3 },
  { key: "design-overdue", title: "Прострочене", question: "Які мої дизайн-задачі вже прострочені?", icon: AlertTriangle, paths: ["/design"] },
  { key: "design-timer", title: "Мій таймер", question: "Скільки годин у таймері за цей тиждень?", icon: Timer },
  { key: "design-changes", title: "Черга правок", question: "Які правки чекають на мене й від кого?", icon: ListChecks, paths: ["/design"] },
  { key: "design-norm", title: "Норма на сьогодні", question: "Скільки мені лишилось до денної норми?", icon: Target },
  { key: "design-next", title: "Що брати далі", question: "Яка з моїх задач найближча за дедлайном?", icon: CalendarDays },
  { key: "design-month", title: "Мій місяць", question: "Скільки задач я закрив цього місяця і яких типів?", icon: TrendingUp },
];

const PRODUCTION: AiSuggestion[] = [
  { key: "prod-now", title: "У виробництві", question: "Що у виробництві просто зараз і на якому етапі?", icon: Factory, paths: ["/orders/production"] },
  { key: "prod-ship", title: "Відвантаження", question: "Що має поїхати сьогодні й завтра?", icon: Truck, paths: ["/orders/production"] },
  { key: "prod-no-ttn", title: "Без ТТН", question: "Які замовлення готові, але без накладної?", icon: Receipt },
  { key: "prod-stock", title: "Склад під тиждень", question: "Чого не вистачає на складі під замовлення цього тижня?", icon: Package, paths: ["/stock/samples"] },
  { key: "prod-late", title: "Прострочене", question: "Які замовлення вибиваються з термінів виробництва?", icon: AlertTriangle },
  { key: "prod-contractors", title: "Підрядники", question: "Хто з підрядників зараз щось для нас робить?", icon: Users, paths: ["/contractors"] },
  { key: "prod-week", title: "Тиждень попереду", question: "Скільки замовлень треба зробити цього тижня?", icon: CalendarDays },
];

const FINANCE: AiSuggestion[] = [
  { key: "fin-payments", title: "Платежі тижня", question: "Які платежі треба зробити цього тижня?", icon: CalendarDays, paths: ["/finances"] },
  { key: "fin-costs", title: "Витрати місяця", question: "Скільки витрат цього місяця й за якими статтями?", icon: BarChart3, paths: ["/finances"] },
  { key: "fin-unpaid", title: "Неоплачене", question: "Хто із замовників ще не оплатив і на скільки?", icon: Wallet },
  { key: "fin-close", title: "Закриття місяця", question: "Що лишилось внести до закриття місяця?", icon: CheckCircle2, paths: ["/finances"] },
  { key: "fin-payroll", title: "Виплати команді", question: "Скільки виходить виплат команді цього місяця?", icon: Banknote, paths: ["/finances"] },
  { key: "fin-compare", title: "Порівняти місяці", question: "Порівняй витрати цього місяця з минулим", icon: TrendingUp },
  { key: "fin-subscriptions", title: "Підписки", question: "Скільки ми платимо за підписки щомісяця?", icon: Receipt },
];

const CHIEF: AiSuggestion[] = [
  { key: "chief-month", title: "Місяць у цифрах", question: "Скільки прорахунків прийняли цього місяця й на яку суму?", icon: BarChart3, paths: ["/orders/estimates"] },
  { key: "chief-load", title: "Завантаження", question: "Хто з дизайнерів перевантажений, а хто вільний?", icon: Users, paths: ["/design"] },
  { key: "chief-stuck", title: "Що зависло", question: "Що стоїть без руху довше за тиждень?", icon: Clock },
  { key: "chief-week", title: "Тиждень до тижня", question: "Як цей тиждень порівняно з минулим?", icon: TrendingUp },
  { key: "chief-absent", title: "Хто відсутній", question: "Хто сьогодні у відпустці чи на лікарняному?", icon: CalendarDays, paths: ["/team"] },
  { key: "chief-money", title: "Куди йдуть гроші", question: "Скільки витрат цього місяця й на що найбільше?", icon: Wallet, paths: ["/finances"] },
  { key: "chief-managers", title: "По менеджерах", question: "Скільки в роботі в кожного менеджера?", icon: Building2 },
  { key: "chief-production", title: "Виробництво", question: "Що зараз у виробництві й чи все встигаємо?", icon: Factory, paths: ["/orders/production"] },
];

const MARKETING: AiSuggestion[] = [
  { key: "mkt-gallery", title: "Нове в галереї", question: "Які візуали додали цього тижня?", icon: Image, paths: ["/marketing"] },
  { key: "mkt-portfolio", title: "Для портфоліо", question: "Що з робіт цього місяця можна показати в портфоліо?", icon: Send, paths: ["/marketing"] },
  { key: "mkt-sleeping", title: "Сплячі замовники", question: "Хто давно не замовляв, хоча раніше замовляв часто?", icon: Building2, paths: ["/orders/customers"] },
  { key: "mkt-creative", title: "Хто робив креатив", question: "Хто з дизайнерів робив креатив цього місяця?", icon: Palette, paths: ["/design"] },
  { key: "mkt-industry", title: "Приклади під галузь", question: "Підбери наші роботи для агросектору", icon: ListChecks },
  { key: "mkt-volume", title: "Обсяг за місяць", question: "Скільки робіт зробили цього місяця і яких типів?", icon: BarChart3 },
];

const GENERAL: AiSuggestion[] = [
  { key: "gen-work", title: "Що в роботі", question: "Скільки прорахунків і замовлень зараз у роботі?", icon: BarChart3 },
  { key: "gen-absent", title: "Хто відсутній", question: "Хто сьогодні у відпустці чи на лікарняному?", icon: CalendarDays, paths: ["/team"] },
  { key: "gen-deadlines", title: "Дедлайни тижня", question: "Що має бути готове цього тижня?", icon: Clock },
  { key: "gen-design", title: "Черга дизайну", question: "Скільки дизайн-задач зараз у роботі?", icon: Palette, paths: ["/design"] },
  { key: "gen-week", title: "Тиждень у CRM", question: "Що змінилось у CRM за цей тиждень?", icon: TrendingUp },
];

const BY_BUCKET: Record<AiSuggestionBucket, AiSuggestion[]> = {
  sales: SALES,
  design: DESIGN,
  production: PRODUCTION,
  finance: FINANCE,
  chief: CHIEF,
  marketing: MARKETING,
  general: GENERAL,
};

/** Скільки підказок показуємо у вікні. Шість = три рядки у дві колонки. */
export const AI_SUGGESTIONS_LIMIT = 6;

/**
 * Зсув добової ротації. Набір більший за вікно, тож показуємо не завжди
 * початок списку: інакше «хвіст» не побачить ніхто, а голова за тиждень
 * стане шпалерами. День береться з ключа дати, а не з Date.now() — так
 * функція лишається чистою й перевіряється тестом.
 */
function dayOffset(dayKey: string, size: number): number {
  if (size <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < dayKey.length; i += 1) sum += dayKey.charCodeAt(i);
  return sum % size;
}

export function resolveAiSuggestions(params: {
  accessRole?: string | null;
  jobRole?: string | null;
  pathname: string;
  dayKey: string;
  limit?: number;
}): AiSuggestion[] {
  const limit = params.limit ?? AI_SUGGESTIONS_LIMIT;
  const bucket = resolveAiBucket({ accessRole: params.accessRole, jobRole: params.jobRole });
  const all = BY_BUCKET[bucket] ?? GENERAL;

  const onPage = all.filter((item) => (item.paths ?? []).some((path) => params.pathname.startsWith(path)));
  const rest = all.filter((item) => !onPage.includes(item));

  // Обертаємо ЛИШЕ хвіст: те, що доречне на цій сторінці, має стояти на місці,
  // інакше підказка про дизайн зникала б із дизайну через день.
  const offset = dayOffset(params.dayKey, rest.length);
  const rotated = [...rest.slice(offset), ...rest.slice(0, offset)];

  return [...onPage, ...rotated].slice(0, limit);
}

/** Скільки ще лишилось у наборі понад показані — для рядка «ще N питань». */
export function countRemainingSuggestions(params: {
  accessRole?: string | null;
  jobRole?: string | null;
  limit?: number;
}): number {
  const bucket = resolveAiBucket({ accessRole: params.accessRole, jobRole: params.jobRole });
  const all = BY_BUCKET[bucket] ?? GENERAL;
  return Math.max(0, all.length - (params.limit ?? AI_SUGGESTIONS_LIMIT));
}
