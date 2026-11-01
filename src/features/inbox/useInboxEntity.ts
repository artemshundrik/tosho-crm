import { useCallback, useEffect, useRef, useState } from "react";

import type { DesignTableTask } from "@/components/design/DesignTasksTable";
import type { QuoteKanbanProductPreview } from "@/features/quotes/components/QuoteKanbanProducts";
import { loadQuoteProductPreviews } from "@/features/quotes/quotes-page/quoteProductPreviews";
import type { OrderListRowView } from "@/features/orders/order-list/OrderListRows";
import { getOrderDocMarks, getOrderNextStep, getOrderPaidShare, isMyTurn } from "@/features/orders/orderListStages";
import { loadDerivedOrders, type DerivedOrderRecord } from "@/features/orders/orderRecords";
import type { InboxEntityRef } from "@/features/inbox/inboxThreads";
import { parseDesignTaskProduct } from "@/lib/designTaskProduct";
import { parseDesignTaskType } from "@/lib/designTaskType";
import type { DesignStatus } from "@/lib/designTaskStatus";
import { supabase } from "@/lib/supabaseClient";
import { listQuotesByIds, type QuoteListRow } from "@/lib/toshoApi";

export type InboxDesignTask = DesignTableTask & {
  metadata: Record<string, unknown>;
  quoteNumber: string | null;
  number: string;
  assigneeLabel: string | null;
  assigneeAvatarUrl: string | null;
  designDeadline: string | null;
};

export type InboxEntity =
  | { kind: "quote"; row: QuoteListRow; preview: QuoteKanbanProductPreview | undefined }
  | { kind: "order"; view: OrderListRowView }
  | { kind: "design"; task: InboxDesignTask };

type Loaded = { status: "loading" } | { status: "ready"; entity: InboxEntity } | { status: "missing" };

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * Дизайн-задача одним рядком `activity_log`. Дошка дизайну збирає задачу
 * ширше (добирає прорахунок, логотипи, навантаження) — прев'ю вистачає того,
 * що лежить у metadata, і тягнути заради одного рядка всю дошку не варто.
 */
async function loadDesignTask(teamId: string, id: string): Promise<InboxDesignTask | null> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("id,entity_id,metadata,title")
    .eq("team_id", teamId)
    .eq("action", "design_task")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const metadata = (data.metadata as Record<string, unknown> | null) ?? {};
  const product = parseDesignTaskProduct(metadata.product);
  const ownNumber = text(metadata.design_task_number);
  const quoteNumber = text(metadata.quote_number);
  return {
    id: data.id,
    title: data.title ?? null,
    status: (text(metadata.status) as DesignStatus | null) ?? "new",
    designTaskType: parseDesignTaskType(metadata.design_task_type),
    customerName: text(metadata.customer_name),
    customerLogoUrl: text(metadata.customer_logo_url),
    productName: text(metadata.product_name) ?? text(metadata.quote_item_name) ?? product?.name ?? null,
    productImageUrl: product?.imageUrl ?? null,
    assigneeUserId: text(metadata.assignee_user_id),
    assigneeLabel: text(metadata.assignee_label),
    assigneeAvatarUrl: text(metadata.assignee_avatar_url),
    designDeadline: text(metadata.design_deadline) ?? text(metadata.deadline),
    metadata,
    quoteNumber,
    number: (ownNumber && !/^DZ-/i.test(ownNumber) ? ownNumber : null) ?? quoteNumber ?? "Задача",
  };
}

/**
 * Справа сповіщення для правої панелі «Вхідних». Кешує по справі: J/K туди й
 * назад не перезапитує. Замовлення беруться тим самим `loadDerivedOrders`, що
 * й список — інакше прев'ю розійшлося б зі списком у кроці чи оплаті, — але
 * один раз на сторінку, а не на кожне сповіщення.
 */
export function useInboxEntity(
  ref: InboxEntityRef | null,
  context: { teamId: string | null; userId: string | null; canIssueInvoice: boolean; canApproveLaunch: boolean }
) {
  const { teamId, userId, canIssueInvoice, canApproveLaunch } = context;
  const cacheRef = useRef(new Map<string, Loaded>());
  const ordersRef = useRef<Promise<DerivedOrderRecord[]> | null>(null);
  const [, setVersion] = useState(0);
  const key = ref ? `${ref.kind}:${ref.id}` : null;

  const load = useCallback(
    async (target: InboxEntityRef, cacheKey: string) => {
      if (!teamId) return;
      const settle = (value: Loaded) => {
        cacheRef.current.set(cacheKey, value);
        setVersion((current) => current + 1);
      };
      try {
        if (target.kind === "quote") {
          const [rows, previews] = await Promise.all([
            listQuotesByIds(teamId, [target.id]),
            loadQuoteProductPreviews(teamId, [target.id]),
          ]);
          const row = rows[0];
          settle(row ? { status: "ready", entity: { kind: "quote", row, preview: previews[row.id] } } : { status: "missing" });
        } else if (target.kind === "order") {
          ordersRef.current ??= loadDerivedOrders(teamId, userId);
          const record = (await ordersRef.current).find((item) => item.id === target.id);
          settle(
            record
              ? {
                  status: "ready",
                  entity: {
                    kind: "order",
                    view: {
                      record,
                      step: getOrderNextStep(record),
                      paid: getOrderPaidShare(record),
                      docs: getOrderDocMarks(record),
                      mine: isMyTurn(record, { userId, canIssueInvoice, canApproveLaunch }),
                    },
                  },
                }
              : { status: "missing" }
          );
        } else {
          const task = await loadDesignTask(teamId, target.id);
          settle(task ? { status: "ready", entity: { kind: "design", task } } : { status: "missing" });
        }
      } catch {
        ordersRef.current = null;
        settle({ status: "missing" });
      }
    },
    [canApproveLaunch, canIssueInvoice, teamId, userId]
  );

  useEffect(() => {
    if (!ref || !key || cacheRef.current.has(key)) return;
    cacheRef.current.set(key, { status: "loading" });
    void load(ref, key);
  }, [key, load, ref]);

  /** Справу змінили з прев'ю — наступний показ перечитає її. */
  const invalidate = useCallback(
    (target: InboxEntityRef) => {
      const cacheKey = `${target.kind}:${target.id}`;
      if (target.kind === "order") ordersRef.current = null;
      cacheRef.current.set(cacheKey, { status: "loading" });
      setVersion((current) => current + 1);
      void load(target, cacheKey);
    },
    [load]
  );

  return { loaded: key ? cacheRef.current.get(key) ?? { status: "loading" as const } : null, invalidate };
}
