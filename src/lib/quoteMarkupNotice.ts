// Відносні шляхи, а не «@/»: модуль читає й серверна функція, а в неї аліаса немає.
import { formatCurrency } from "../features/quotes/currencyLabel";
import { saleAtMarkup } from "./quoteSalePrice";
import { normalizeUnitLabel } from "./units";

/**
 * Що й кому сказати про ціну нижче дна (REQ-149, REQ-182, REQ-325).
 *
 * У цього тексту ДВА автори: перший пінг шле браузер у мить запиту
 * (workflowNotifications.ts), а щоденне нагадування — серверна функція
 * (netlify/functions/quote-markup-reminders.ts, REQ-328). Тримати адресатів і
 * формат ціни в кожному окремо означало б, що нагадування рано чи пізно піде
 * не тим, кого питали, або назве іншу суму, ніж стоїть на картці.
 *
 * Тому модуль чистий: жодного клієнта бази, лише числа й рядки на вході.
 */

export type MarkupApproverCandidate = {
  user_id?: string | null;
  access_role?: string | null;
  job_role?: string | null;
};

const normalizeRole = (value?: string | null) => (value ?? "").trim().toLowerCase();

const idsOf = (rows: MarkupApproverCandidate[], keep: (access: string, job: string) => boolean) =>
  rows
    .filter((row) => keep(normalizeRole(row.access_role), normalizeRole(row.job_role)))
    .map((row) => row.user_id)
    .filter((value): value is string => !!value);

/**
 * Хто отримує запит на погодження ціни нижче дна.
 *
 * МЕРЧ (рішення СЕО 30.08.2026): двоє СЕО і головний бухгалтер; підтвердити
 * або відхилити може будь-хто з них. Власник тут не як окрема роль
 * погоджувача, а як наскрізний доступ — він і так бачить усе.
 *
 * ПОЛІГРАФІЯ (REQ-182): призначений погоджувач, а якщо його не призначили —
 * СЕО. Падати на загальний перелік не можна: у ньому головбух, а він
 * поліграфію не затверджує (вимога Артема 01.09.2026), тож лист про рішення,
 * якого він не може ухвалити, був би просто шумом.
 *
 * Дзеркала цього переліку: canApproveQuoteMarkup (src/lib/permissions.ts) і
 * tosho.is_quote_markup_approver у базі.
 */
export function resolveMarkupApproverIds(params: {
  members: MarkupApproverCandidate[];
  /** Прорахунок поліграфії — той, у якого є тип угоди (resolveQuoteDealType). */
  isPrint: boolean;
  printApproverUserId?: string | null;
}): string[] {
  const ids = params.isPrint
    ? params.printApproverUserId
      ? [params.printApproverUserId]
      : idsOf(params.members, (_access, job) => job === "seo")
    : idsOf(
        params.members,
        (access, job) => access === "owner" || job === "seo" || job === "chief_accountant"
      );
  return Array.from(new Set(ids));
}

/** Тираж для людини: «Банер · 16 шт.», без назви — лише кількість. */
export function formatMarkupRunLabel(params: {
  itemTitle?: string | null;
  quantity: number;
  unit?: string | null;
}): string {
  const qty = Math.max(0, Number(params.quantity) || 0);
  const unit = normalizeUnitLabel(params.unit ?? "шт");
  const title = params.itemTitle?.trim();
  return title ? `${title} · ${qty} ${unit}` : `${qty} ${unit}`;
}

/**
 * Ціна для сповіщення: сума, а в дужках штука й відсоток (REQ-325).
 *
 * Погоджувач вирішує про гроші клієнта, і Влад після першого живого
 * погодження попросив прибрати «накрутку» з того, що він підписує. Рахуємо
 * тією самою `saleAtMarkup`, що й велике число на картці, — інакше в
 * Telegram прийшла б сума, якої на екрані немає.
 */
export function formatMarkupPrice(params: {
  quantity: number;
  costTotal: number;
  markupRate: number;
  unit?: string | null;
  currency?: string | null;
}): { total: string; label: string } {
  const sale = saleAtMarkup({
    quantity: Number(params.quantity) || 0,
    costTotal: params.costTotal,
    markupRate: params.markupRate,
  });
  const unit = normalizeUnitLabel(params.unit ?? "шт");
  // До сотих: у сховищі відсоток без округлення (30,840579…), і сирим
  // числом лист виглядав би як збій.
  const rate = `${(Math.round((Number(params.markupRate) || 0) * 100) / 100).toLocaleString("uk-UA")} %`;
  const total = formatCurrency(sale.saleTotal, params.currency);
  const perUnit =
    sale.saleUnitPrice === null ? "" : `${formatCurrency(sale.saleUnitPrice, params.currency)}/${unit}, `;
  return { total, label: `${total} (${perUnit}${rate})` };
}
