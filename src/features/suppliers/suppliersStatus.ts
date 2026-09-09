import { AlertTriangle, CheckCircle2, CircleDashed, CircleHelp, Clock, EyeOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatAgo } from "@/lib/formatAgo";
import type { Tone } from "@/lib/statusTones";

import {
  STALE_AFTER_HOURS,
  SUPPLIER_SCHEDULE_LABEL,
  type SupplierDefinition,
} from "./suppliersCatalog";

/**
 * Стан картки постачальника з реєстру й зведення бази.
 *
 * Правило файлу — те саме, що в «Інтеграціях»: нічого не вигадувати. Не
 * прочитали зведення — картка каже «не вдалося прочитати», а не малює нуль:
 * нуль читається як «товари зникли», і за ним підуть шукати поломку фіда.
 */

/** Рядок tosho.supplier_pool_summary(); bigint приходить числом. */
export type SupplierPoolSummaryRow = {
  supplier_slug: string;
  contractor_id: string | null;
  rows_active: number;
  products: number;
  with_price: number;
  with_photo: number;
  categories: number;
  last_observed: string | null;
  first_loaded: string | null;
};

export type SupplierState =
  /** У списку джерел search_supplier_pool, дані свіжі. */
  | "search"
  /** Товари в пулі є, але в пошук прорахунку джерело не пускають. */
  | "hidden"
  /** Прогін не відбувся у свій розклад — ціни тихо старіють. */
  | "stale"
  /** Запис у реєстрі є, рядків у пулі нуль. */
  | "empty"
  /** Ще не під'єднано. */
  | "planned"
  /** Зведення не прочиталось — це помилка запиту, а не стан постачальника. */
  | "unknown";

export type SupplierMetric = { label: string; value: string | null };

export type SupplierStatus = {
  state: SupplierState;
  message: string;
  metrics: [SupplierMetric, SupplierMetric, SupplierMetric];
  summary: SupplierPoolSummaryRow | null;
};

type SupplierTone = Extract<Tone, "neutral" | "info" | "success" | "warning" | "danger">;

export const SUPPLIER_STATE_LABEL: Record<SupplierState, string> = {
  search: "У пошуку прорахунку",
  hidden: "Поза пошуком",
  stale: "Дані застаріли",
  empty: "Немає даних",
  planned: "Плануємо",
  unknown: "Не вдалося прочитати",
};

/** Тон бейджа — маленької пілюлі зі станом. */
export const SUPPLIER_STATE_TONE: Record<SupplierState, SupplierTone> = {
  search: "success",
  hidden: "neutral",
  stale: "warning",
  empty: "neutral",
  planned: "neutral",
  unknown: "neutral",
};

/** Тон плашки з текстом: коли все гаразд — нейтральна, колір лише там, де потрібна дія. */
export const SUPPLIER_PLATE_TONE: Record<SupplierState, SupplierTone> = {
  search: "neutral",
  hidden: "neutral",
  stale: "warning",
  empty: "neutral",
  planned: "neutral",
  unknown: "neutral",
};

export const SUPPLIER_STATE_ICON: Record<SupplierState, LucideIcon> = {
  search: CheckCircle2,
  hidden: EyeOff,
  stale: AlertTriangle,
  empty: CircleDashed,
  planned: Clock,
  unknown: CircleHelp,
};

export const formatInt = (value: number): string => value.toLocaleString("uk-UA");

/** «08.09.2026» */
export const formatDateShort = (iso: string): string =>
  new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });

/** «08.09, 12:20» — точна мітка прогону поруч із відносною. */
export const formatExactDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function isSupplierStale(
  definition: SupplierDefinition,
  lastObserved: string | null | undefined,
  now: Date = new Date()
): boolean {
  const hours = STALE_AFTER_HOURS[definition.intake.schedule];
  if (hours === null || !lastObserved) return false;
  const then = new Date(lastObserved).getTime();
  if (!Number.isFinite(then)) return false;
  return now.getTime() - then > hours * 3_600_000;
}

const EMPTY_METRICS: [SupplierMetric, SupplierMetric, SupplierMetric] = [
  { label: "товарів", value: null },
  { label: "з нашою ціною", value: null },
  { label: "оновлено", value: null },
];

const percent = (part: number, total: number): string | null =>
  total > 0 ? `${Math.round((part / total) * 100)}%` : null;

function priceMessage(definition: SupplierDefinition): string {
  const { summary, agreedOn } = definition.price;
  return agreedOn ? `${summary} Домовлено ${formatDateShort(agreedOn)}.` : summary;
}

/**
 * Пріоритет станів: planned → unknown → empty → stale → hidden → search.
 * Застаріле б'є «у пошуку» навмисно: у пошуку джерело є, але ціни в ньому
 * вже не ті, і саме це людина має побачити першим.
 */
export function supplierStatus(
  definition: SupplierDefinition,
  summary: SupplierPoolSummaryRow | null,
  now: Date = new Date(),
  opts: { unavailable?: boolean } = {}
): SupplierStatus {
  if (definition.planned) {
    return { state: "planned", message: definition.planned.blocker, metrics: EMPTY_METRICS, summary: null };
  }
  if (opts.unavailable) {
    return {
      state: "unknown",
      message: "Стан пулу не прочитався. Натисніть «Оновити»; якщо не допоможе — дивись «Здоров'я».",
      metrics: EMPTY_METRICS,
      summary: null,
    };
  }
  if (!summary || summary.rows_active === 0) {
    return {
      state: "empty",
      message: "У пулі ще немає рядків цього постачальника: фід не заливали або прогін не дійшов до запису.",
      metrics: EMPTY_METRICS,
      summary,
    };
  }

  const metrics: [SupplierMetric, SupplierMetric, SupplierMetric] = [
    { label: "товарів", value: formatInt(summary.products) },
    {
      label: "з нашою ціною",
      // У нашого магазину ціна довідкова: «0%» читалось би як «ціни зникли».
      value: definition.price.basis === "reference" ? null : percent(summary.with_price, summary.rows_active),
    },
    { label: "оновлено", value: formatAgo(summary.last_observed, now) },
  ];

  if (isSupplierStale(definition, summary.last_observed, now)) {
    return {
      state: "stale",
      message: `Останній прогін ${formatExactDateTime(summary.last_observed!)}, за розкладом ${
        SUPPLIER_SCHEDULE_LABEL[definition.intake.schedule]
      }. Дивись прогони supplier-feeds.`,
      metrics,
      summary,
    };
  }
  if (!definition.inQuoteSearch) {
    return { state: "hidden", message: definition.searchNote ?? "Поза пошуком прорахунку.", metrics, summary };
  }
  return { state: "search", message: priceMessage(definition), metrics, summary };
}
