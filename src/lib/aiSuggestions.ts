import {
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Image,
  ListChecks,
  Mail,
  Palette,
  Target,
  TrendingUp,
  Users,
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

/**
 * ПРАВИЛО НАБОРУ: пропонуємо ЛИШЕ те, на що помічник уміє відповідати.
 *
 * Його вміння перелічені списком у netlify/functions/tosho-ai.ts
 * (SUPPORTED_ANALYTICS_INTENTS): прорахунки й КП, замовники та ліди, дизайн-
 * задачі, склад команди за ролями, гігієна логотипів, стан системи, особистий
 * фокус — і синтез поверх цих даних (скласти лист, пояснити, порівняти).
 *
 * Чого він НЕ вміє сьогодні: відсутності й лікарняні, фінанси й платежі,
 * виробництво, склад, ТТН, маркетинг і галерею. Замовлення та логістика
 * позначені в самій функції як «limited» — тобто відповідь буде про обмеження
 * модуля, а не про справу.
 *
 * Перша версія цього реєстру про це не знала: у ній були і платежі, і склад, і
 * «хто сьогодні на лікарняному». Останнє й спіймали — питання про відсутності
 * збіглося зі словом «сьогодні» в правилі особистого фокуса, і помічник видав
 * «Фокус менеджера» замість відповіді. Пропонувати те, чого система не вміє,
 * дорожче, ніж не пропонувати нічого: одна порожня відповідь коштує довіри
 * більше, ніж десять непоказаних підказок.
 *
 * Розширювати набір можна рівно тоді, коли в помічника з'явиться відповідне
 * вміння — див. картку про навчання ToSho AI новим темам.
 */

const SALES: AiSuggestion[] = [
  { key: "sales-focus", title: "Що робити далі", question: "Що мені робити далі за моїми прорахунками?", icon: Target, paths: ["/orders/estimates"] },
  { key: "sales-silent", title: "Хто не відповів", question: "Які прорахунки висять без відповіді понад тиждень?", icon: Clock, paths: ["/orders/estimates"] },
  { key: "sales-month", title: "Мій місяць", question: "Скільки прорахунків я закрив цього місяця і на яку суму?", icon: BarChart3 },
  { key: "sales-customers", title: "Мої замовники", question: "У кого із замовників найбільше прорахунків?", icon: Building2, paths: ["/orders/customers"] },
  { key: "sales-managers", title: "По менеджерах", question: "Скільки прорахунків у кожного менеджера?", icon: Users },
  { key: "sales-letter", title: "Написати замовнику", question: "Склади лист-нагадування по прорахунку, який висить найдовше", icon: Mail },
  { key: "sales-logos", title: "Без логотипів", question: "У яких замовників і лідів немає логотипа?", icon: Image, paths: ["/orders/customers"] },
];

const DESIGN: AiSuggestion[] = [
  { key: "design-now", title: "Що в мене зараз", question: "Які дизайн-задачі в мене в роботі просто зараз?", icon: Palette, paths: ["/design"] },
  { key: "design-month", title: "Мій місяць", question: "Скільки дизайн-задач я закрив за останні 30 днів?", icon: BarChart3, paths: ["/design"] },
  { key: "design-ranking", title: "Хто скільки закрив", question: "Хто з дизайнерів закрив найбільше задач за місяць?", icon: TrendingUp },
  { key: "design-load", title: "Завантаження", question: "Хто з дизайнерів перевантажений, а хто вільний?", icon: Users, paths: ["/design"] },
  { key: "design-team", title: "Хто в дизайні", question: "Хто в нас дизайнери?", icon: ListChecks },
  { key: "design-focus", title: "Що робити далі", question: "Що мені робити далі за моїми задачами?", icon: Target },
];

const CHIEF: AiSuggestion[] = [
  { key: "chief-month", title: "Місяць у цифрах", question: "Скільки прорахунків прийняли цього місяця й на яку суму?", icon: BarChart3, paths: ["/orders/estimates"] },
  { key: "chief-managers", title: "По менеджерах", question: "Скільки прорахунків у кожного менеджера?", icon: Users, paths: ["/orders/estimates"] },
  { key: "chief-load", title: "Завантаження дизайну", question: "Хто з дизайнерів перевантажений, а хто вільний?", icon: Palette, paths: ["/design"] },
  { key: "chief-design-month", title: "Дизайн за місяць", question: "Скільки дизайн-задач завершили за останні 30 днів?", icon: TrendingUp, paths: ["/design"] },
  { key: "chief-customers", title: "Найактивніші замовники", question: "У кого із замовників найбільше прорахунків?", icon: Building2, paths: ["/orders/customers"] },
  { key: "chief-team", title: "Хто в команді", question: "Хто в нас менеджери, а хто дизайнери?", icon: ListChecks, paths: ["/team"] },
  { key: "chief-health", title: "Стан системи", question: "Як почувається система: бекапи, помилки, місце?", icon: CheckCircle2, paths: ["/dev"] },
  { key: "chief-logos", title: "Без логотипів", question: "У яких замовників і лідів немає логотипа?", icon: Image },
];

/**
 * Набір для всіх, кому окремого ще немає: виробництво, склад, логістика,
 * бухгалтерія, маркетинг. Питання їхніх доменів помічник поки не тягне, тож
 * пропонуємо те, що працює для будь-якої посади.
 */
const GENERAL: AiSuggestion[] = [
  { key: "gen-focus", title: "Що робити далі", question: "Що мені робити далі?", icon: Target },
  { key: "gen-quotes", title: "Прорахунки в роботі", question: "Скільки прорахунків зараз у роботі й на яку суму?", icon: BarChart3, paths: ["/orders/estimates"] },
  { key: "gen-design", title: "Черга дизайну", question: "Скільки дизайн-задач завершили за останні 30 днів?", icon: Palette, paths: ["/design"] },
  { key: "gen-team", title: "Хто в команді", question: "Хто в нас дизайнери, менеджери й логісти?", icon: ListChecks, paths: ["/team"] },
  { key: "gen-customers", title: "Активні замовники", question: "У кого із замовників найбільше прорахунків?", icon: Building2, paths: ["/orders/customers"] },
];

const BY_BUCKET: Record<AiSuggestionBucket, AiSuggestion[]> = {
  sales: SALES,
  design: DESIGN,
  // Виробництво, фінанси й маркетинг поки беруть загальний набір: власних
  // питань у них досить, але помічник на них не відповідає (див. правило
  // набору вище). Щойно навчиться — тут з'являться свої масиви.
  production: GENERAL,
  finance: GENERAL,
  chief: CHIEF,
  marketing: GENERAL,
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
