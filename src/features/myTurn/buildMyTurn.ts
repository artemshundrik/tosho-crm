import { buildQueue, buildUnassignedQuoteItems, type OverviewSource } from "@/features/overview/buildOverview";
import { daysSince, type OverviewLane, type OverviewQueueItem } from "@/features/overview/overviewModel";
import { resolveOverviewLens, type OverviewLens } from "@/features/overview/overviewRoles";
import { getDocumentApprovalState, getLaunchException } from "@/features/orders/orderApprovals";
import { getOrderInvoiceState } from "@/features/orders/orderInvoice";
import { getOrderNextStep, isMyTurn, type OrderListViewer } from "@/features/orders/orderListStages";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { pluralUk } from "@/lib/lastSeen";
import { canApproveOrderLaunch, canIssueOrderInvoice } from "@/lib/permissions";

/**
 * «Мій хід» (хвиля В3, картка 346): одна особиста черга замість двох неповних.
 *
 * Огляд знав прорахунки й дизайн, а замовлення жили фільтром «Мій хід» на
 * своїй сторінці — менеджер мав дві черги, і жодна не була повною. Тут обидві
 * зведено в одну, тими самими правилами: прорахунки й дизайн — `buildQueue`
 * Огляду, замовлення — `isMyTurn`, що й фільтр на сторінці замовлень. Своїх
 * правил «що горить» цей файл не має, крім одного — скільки чекає замовлення.
 *
 * Особиста — навіть для власника: керівницький погляд Огляду складено зі
 * зведень по команді, а тут потрібні справи, які чекають саме тебе.
 */

/** Замовлення, яке чекає мене стільки днів, уже горить. */
const ORDER_HOT_DAYS = 3;

export const myTurnLens = (lens: OverviewLens): OverviewLens => (lens === "chief" ? "general" : lens);

/**
 * Хід власника й СЕО — не зведення по команді і не погляд рядового працівника.
 *
 * Своє (прорахунки, які ведуть самі) — за звичайними правилами, а зверху те,
 * що, крім них, не зробить ніхто: роздати нічиї прорахунки. Погодження й
 * дозвіл на запуск приходять із замовлень (`isMyTurn`). Чужі прострочення
 * сюди не потрапляють навмисно: на них є виконавці, а картину по людях
 * показує Огляд.
 */
const chiefTurnItems = (source: OverviewSource) => buildUnassignedQuoteItems(source);

/**
 * Що саме від мене хочуть у замовленні. Погодження й рахунок чекають
 * бухгалтера чи СЕО на будь-якому етапі, тож крок замовлення («виготовити»)
 * тут сказав би неправду — називаємо саме прохання.
 */
function orderAsk(record: DerivedOrderRecord, viewer: OrderListViewer): { text: string; since: string | null } {
  if (viewer.canApproveLaunch) {
    const launch = getLaunchException(record);
    if (launch?.status === "pending") return { text: "дозволити запуск без умов", since: launch.requestedAt };
  }
  if (viewer.canIssueInvoice) {
    if (getOrderInvoiceState(record) === "requested") {
      return { text: "внести номер рахунку з BAS", since: record.invoiceRequestedAt };
    }
    for (const [kind, label] of [
      ["contract", "погодити договір"],
      ["specification", "погодити СП"],
    ] as const) {
      const { state, approval } = getDocumentApprovalState(record, kind);
      if (state === "pending") return { text: label, since: approval?.requestedAt ?? null };
    }
  }
  const step = getOrderNextStep(record);
  return { text: step.title.charAt(0).toLowerCase() + step.title.slice(1), since: record.updatedAt ?? record.createdAt };
}

export function buildOrderTurnItems(orders: DerivedOrderRecord[], viewer: OrderListViewer, now: Date): OverviewQueueItem[] {
  return orders
    .filter((record) => isMyTurn(record, viewer))
    .map((record) => {
      const ask = orderAsk(record, viewer);
      const days = daysSince(ask.since, now) ?? 0;
      const lane: OverviewLane = days >= ORDER_HOT_DAYS ? "now" : "today";
      return {
        id: `order-turn:${record.id}`,
        lane,
        chip: "Замовлення",
        chipTone: "info" as const,
        code: record.quoteNumber || null,
        title: record.customerName || "Замовлення без замовника",
        subtitle: ask.text,
        when: days > 0 ? `чекає ${pluralUk(days, "день", "дні", "днів")}` : "сьогодні",
        whenTone: lane === "now" ? ("danger" as const) : ("warning" as const),
        to: `/orders/production/${record.id}`,
        entityKey: record.id,
        entityName: record.customerName || null,
        entityLogoUrl: record.customerLogoUrl,
        rank: -days,
      };
    });
}

const LANE_WEIGHT: Record<OverviewLane, number> = { now: 0, today: 1, later: 2 };

export function buildMyTurn(
  source: Omit<OverviewSource, "lens"> & { lens: OverviewLens; orders: DerivedOrderRecord[]; viewer: OrderListViewer }
): OverviewQueueItem[] {
  const queue = buildQueue({ ...source, lens: myTurnLens(source.lens), personal: true });
  const chief = source.lens === "chief" ? chiefTurnItems(source) : [];
  const orders = buildOrderTurnItems(source.orders, source.viewer, source.now);
  return [...queue, ...chief, ...orders].sort(
    (a, b) => LANE_WEIGHT[a.lane] - LANE_WEIGHT[b.lane] || a.rank - b.rank || a.title.localeCompare(b.title, "uk")
  );
}

export type TurnSummary = {
  now: number;
  today: number;
  later: number;
  /** Найгостріша справа — те, про що спитати людину першим. */
  top: OverviewQueueItem | null;
};

/** Хід однієї людини в чотири числа — для таблиці «По людях» в Огляді. */
export function summarizeTurn(items: OverviewQueueItem[]): TurnSummary {
  const count = (lane: OverviewLane) => items.filter((item) => item.lane === lane).length;
  return { now: count("now"), today: count("today"), later: count("later"), top: items[0] ?? null };
}

/**
 * Чиїми очима скласти хід: погляд і права беруться з посади ТІЄЇ людини.
 *
 * Одна точка для «Мого ходу», «Чийого ходу» й таблиці «По людях» — інакше
 * хід Ірини в перемикачі й рядок Ірини в Огляді рахувались би за різними
 * правилами й розходились би в числах.
 */
export function turnSubject(person: { userId: string | null; accessRole: string | null; jobRole: string | null }): {
  lens: OverviewLens;
  viewer: OrderListViewer;
} {
  return {
    lens: resolveOverviewLens(person),
    viewer: {
      userId: person.userId,
      canIssueInvoice: canIssueOrderInvoice(person.accessRole, person.jobRole),
      canApproveLaunch: canApproveOrderLaunch(person.jobRole),
    },
  };
}
