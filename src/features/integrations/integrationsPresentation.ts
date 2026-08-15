import { AlertTriangle, CheckCircle2, CircleDashed, CircleHelp, Clock, Lock, Minus, PlugZap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Tone } from "@/lib/statusTones";

import type { IntegrationState } from "./integrationsStatus";

/**
 * Стан інтеграції → тон і підпис. Один реєстр на картку, шторку й фільтри:
 * саме через розкидані копії тон статусу колись розійшовся між крапкою та
 * бейджем того самого статусу (див. коментар у statusTones.ts).
 */

/**
 * Badge приймає не всі тони реєстру (teal у нього немає), тож звужуємо тут, а
 * не приводимо типи на місці використання — інакше перший же teal проліз би в
 * рантайм і бейдж лишився б без кольору.
 */
type IntegrationTone = Extract<Tone, "neutral" | "info" | "success" | "warning" | "danger">;

/** Тон БЕЙДЖА — маленької пілюлі зі станом. Тут колір доречний: він крихітний. */
export const INTEGRATION_STATE_TONE: Record<IntegrationState, IntegrationTone> = {
  ok: "success",
  warn: "warning",
  broken: "danger",
  partial: "info",
  off: "neutral",
  planned: "neutral",
  no_access: "neutral",
  unknown: "neutral",
};

/**
 * Тон ПЛАШКИ з текстом стану — і він навмисно НЕ такий, як у бейджа.
 *
 * Коли все гаразд, плашка нейтральна: інакше на картці два зелені прямокутники
 * поспіль, а на сторінці — шість таких карток. Суцільне зелене поле нічого не
 * підсвічує, воно просто шумить, і на його тлі справжнє попередження губиться.
 * Колір лишається за тим, що вимагає дії: увага, розрив зв'язку.
 */
export const INTEGRATION_PLATE_TONE: Record<IntegrationState, IntegrationTone> = {
  ok: "neutral",
  warn: "warning",
  broken: "danger",
  partial: "neutral",
  off: "neutral",
  planned: "neutral",
  no_access: "neutral",
  unknown: "neutral",
};

export const INTEGRATION_STATE_LABEL: Record<IntegrationState, string> = {
  ok: "Працює",
  warn: "Потребує уваги",
  broken: "Немає зв'язку",
  partial: "Частково",
  off: "Не підключено",
  planned: "Плануємо",
  no_access: "Немає доступу",
  unknown: "Не вдалося прочитати",
};

export const INTEGRATION_STATE_ICON: Record<IntegrationState, LucideIcon> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  broken: PlugZap,
  partial: CircleDashed,
  off: Minus,
  planned: Clock,
  no_access: Lock,
  unknown: CircleHelp,
};

/** Групи для фільтра над списком. */
export type IntegrationFilter = "all" | "working" | "attention" | "inactive";

export const INTEGRATION_FILTER_LABEL: Record<IntegrationFilter, string> = {
  all: "Усі",
  working: "Працюють",
  attention: "Потребують уваги",
  inactive: "Не підключені",
};

export function matchesIntegrationFilter(state: IntegrationState, filter: IntegrationFilter): boolean {
  if (filter === "all") return true;
  if (filter === "working") return state === "ok" || state === "partial";
  if (filter === "attention") return state === "warn" || state === "broken" || state === "unknown";
  return state === "off" || state === "planned" || state === "no_access";
}
