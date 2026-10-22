import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Loader2 } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { economicsAccess, OrderEconomicsTab } from "@/features/orders/order-details/OrderEconomicsTab";
import { OrderPurchaseDialog } from "@/features/orders/order-details/OrderPurchaseDialog";
import { OrderPurchasePayDialog } from "@/features/orders/order-details/OrderPurchasePayDialog";
import { OrderPurchaseReceiptDialog } from "@/features/orders/order-details/OrderPurchaseReceiptDialog";
import { ORDER_PURCHASE_EVENT, orderPurchaseEventTitle } from "@/features/orders/orderPurchaseEvents";
import { listOrderPaymentAccounts } from "@/features/orders/orderPaymentQueries";
import {
  cancelOrderPurchasePayment,
  confirmOrderPurchaseReceipt,
  deleteOrderPurchase,
  getOrderPurchasesNone,
  listOrderPurchases,
  listSupplierNameHints,
  setOrderPurchasesNone,
  payOrderPurchase,
  saveOrderPurchase,
  type SavePurchaseInput,
} from "@/features/orders/orderPurchaseQueries";
import { summarizeOrderEconomics, waybillBlockers, type OrderPurchase } from "@/features/orders/orderPurchases";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { logActivity } from "@/lib/activityLogger";
import { canViewOrderEconomics } from "@/lib/permissions";

type Accounts = Array<{ id: string; name: string }>;
/** Рахунки списання, завантажені для ключа «команда:юрособа». */
type AccountsState = { key: string; accounts: Accounts };
type EditorState = { key: number; purchase: OrderPurchase | null; itemId?: string | null };

const errorText = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "Не вдалося виконати дію із закупкою. Спробуйте ще раз.";

/**
 * Усе про «Економіку» замовлення в одному місці (як `useOrderPaymentPanel`):
 * закупки, позначка «закупок немає», віконця й записи. Сторінка лише кладе
 * `tab` у список вкладок і `content` у тіло вкладки. Права перевіряє база;
 * тут — що показати посаді.
 */
export function useOrderEconomicsPanel({
  record,
  teamId,
  accessRole,
  jobRole,
  onChanged,
}: {
  record: DerivedOrderRecord | null;
  teamId: string | null | undefined;
  userId: string | null | undefined;
  accessRole: string | null | undefined;
  jobRole: string | null | undefined;
  onChanged: () => void;
}): {
  tab: { value: "economics"; label: "Економіка"; badge: string | null } | null;
  content: ReactNode;
  purchases: OrderPurchase[];
  purchasesNone: boolean;
  /** Причини, чому ВН ще не внести; undefined - дані не завантажено (посада без вкладки чи збій читання): не блокуємо, відповість база. */
  waybillBlockers: string[] | undefined;
} {
  const access = economicsAccess(accessRole, jobRole);
  const enabled = record?.source === "stored" && canViewOrderEconomics(accessRole, jobRole);
  const orderId = enabled && record ? record.id : null;
  const legalEntityId = record?.ourLegalEntityId ?? null;

  const [purchases, setPurchases] = useState<OrderPurchase[]>([]);
  const [none, setNone] = useState<{ byName: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [payTarget, setPayTarget] = useState<{ mode: "pay" | "cancel"; purchase: OrderPurchase } | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<OrderPurchase | null>(null);
  const [toDelete, setToDelete] = useState<OrderPurchase | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [accountsState, setAccountsState] = useState<AccountsState | null>(null);
  const accountsRequested = useRef<string | null>(null);
  const hintsRequested = useRef(false);
  const loadToken = useRef(0);

  const reload = useCallback(async () => {
    if (!orderId) return;
    const token = ++loadToken.current;
    try {
      const [list, noneState] = await Promise.all([listOrderPurchases(orderId), getOrderPurchasesNone(orderId)]);
      if (token !== loadToken.current) return;
      setPurchases(list);
      setNone(noneState);
      setLoadedFor(orderId);
    } catch (error) {
      if (token === loadToken.current) toast.error(errorText(error));
    }
  }, [orderId]);

  useEffect(() => {
    setPurchases([]);
    setNone(null);
    setLoadedFor(null);
    if (!orderId) return;
    setLoading(true);
    void reload().finally(() => setLoading(false));
  }, [orderId, reload]);

  // Повернулись у вкладку — перечитуємо: склад міг підтвердити отримання в іншій
  // сесії, і застарілі причини не мають тримати картку ВН закритою до F5.
  useEffect(() => {
    if (!orderId) return;
    // focus і visibilitychange приходять парою — друге перечитування за 2 с зайве.
    let last = 0;
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 2000) return;
      last = Date.now();
      void reload();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [orderId, reload]);

  // Рахунки списання — гривневі рахунки нашої юрособи замовлення. Вантажимо, коли
  // відкрили оплату, а не на кожне відкриття замовлення; на юрособу — один раз.
  const payOpen = payTarget?.mode === "pay";
  const accountsKey = `${teamId ?? ""}:${legalEntityId ?? ""}`;
  useEffect(() => {
    if (!payOpen || !teamId || accountsRequested.current === accountsKey) return;
    accountsRequested.current = accountsKey;
    listOrderPaymentAccounts(teamId, legalEntityId, null, "bank")
      .then((result) => setAccountsState({ key: accountsKey, accounts: result.accounts }))
      .catch((error: unknown) => {
        accountsRequested.current = null; // наступне відкриття спробує ще раз
        toast.error(errorText(error));
        setAccountsState({ key: accountsKey, accounts: [] });
      });
  }, [payOpen, teamId, legalEntityId, accountsKey]);
  // null — ще вантажимо (віконце так і каже); відповідь для іншої юрособи не беремо.
  const accounts = accountsState?.key === accountsKey ? accountsState.accounts : null;

  const recordId = record?.id ?? null;
  const linkedQuoteId = record?.linkedQuoteId ?? null;

  // Рядок у стрічці замовлення: одразу після запису, без сум. Збій логера не ламає дію.
  const logEvent = useCallback(
    (title: string) => {
      if (!teamId || !recordId) return;
      void logActivity({
        teamId,
        action: ORDER_PURCHASE_EVENT,
        entityType: "orders",
        entityId: recordId,
        title,
        href: `/orders/production/${recordId}`,
        metadata: { quote_id: linkedQuoteId ?? recordId, order_id: recordId },
      }).catch(() => undefined);
    },
    [teamId, recordId, linkedQuoteId]
  );

  const run = useCallback(
    async (action: () => Promise<unknown>, success: string, eventTitle?: string) => {
      setSaving(true);
      try {
        await action();
        if (eventTitle) logEvent(eventTitle);
        toast.success(success);
        await reload();
        onChanged();
        return true;
      } catch (error) {
        toast.error(errorText(error));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [reload, onChanged, logEvent]
  );

  const openEditor = (purchase: OrderPurchase | null, itemId?: string | null) => {
    if (!hintsRequested.current && teamId) {
      hintsRequested.current = true;
      void listSupplierNameHints(teamId)
        .then(setHints)
        .catch(() => undefined);
    }
    setEditor((current) => ({ key: (current?.key ?? 0) + 1, purchase, itemId }));
  };

  if (!record || !enabled) return { tab: null, content: null, purchases: [], purchasesNone: false, waybillBlockers: undefined };

  const items = record.items.map((item) => ({ id: item.id, name: item.name, qty: item.qty ?? null, unit: item.unit || null }));
  const invoiceTotal = Number(record.total) || 0;
  const summary = summarizeOrderEconomics(purchases, invoiceTotal, record.currency);
  const badge = !access.amounts
    ? summary.total > 0
      ? `отримано ${summary.received}/${summary.total}`
      : null
    : access.margin && summary.marginPct != null && (summary.total > 0 || none)
      ? `${Math.round(summary.marginPct)}%`
      : summary.total > 0
        ? String(summary.total)
        : null;

  const content = (
    <>
      <OrderEconomicsTab
        items={items}
        purchases={purchases}
        purchasesNone={none}
        invoiceTotal={invoiceTotal}
        currency={record.currency}
        access={access}
        loading={loading}
        saving={saving}
        onAdd={(itemId) => openEditor(null, items.length === 1 && itemId === undefined ? items[0].id : itemId)}
        onEdit={(purchase) => openEditor(purchase)}
        onDelete={setToDelete}
        onPay={(purchase) => setPayTarget({ mode: "pay", purchase })}
        onCancelPayment={(purchase) => setPayTarget({ mode: "cancel", purchase })}
        onReceive={setReceiptTarget}
        onToggleNone={(value) =>
          void run(
            () => setOrderPurchasesNone(record.id, value),
            value ? "Позначку «закупок немає» поставлено" : "Позначку знято",
            value ? orderPurchaseEventTitle.noneSet : orderPurchaseEventTitle.noneUnset
          )
        }
      />
      {access.edit && editor ? (
        <OrderPurchaseDialog
          key={editor.key}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          orderId={record.id}
          items={items}
          purchase={editor.purchase}
          defaultItemId={editor.itemId}
          supplierHints={hints}
          saving={saving}
          onSubmit={(input: SavePurchaseInput) =>
            run(
              () => saveOrderPurchase(input),
              input.id ? "Закупку збережено" : "Закупку внесено",
              input.id ? undefined : orderPurchaseEventTitle.created
            )
          }
        />
      ) : null}
      {access.edit ? (
        <OrderPurchasePayDialog
          target={payTarget}
          accounts={accounts}
          saving={saving}
          onOpenChange={(open) => {
            if (!open) setPayTarget(null);
          }}
          // Рядок у стрічці про оплату й скасування пише сама база, у тій самій транзакції.
          onPay={(purchase, draft) => run(() => payOrderPurchase({ id: purchase.id, ...draft }), "Оплату внесено — витрата у Фінансах")}
          onCancel={(purchase, reason) => run(() => cancelOrderPurchasePayment(purchase.id, reason), "Оплату скасовано")}
        />
      ) : null}
      {access.receive ? (
        <OrderPurchaseReceiptDialog
          purchase={receiptTarget}
          saving={saving}
          onOpenChange={(open) => {
            if (!open) setReceiptTarget(null);
          }}
          onConfirm={(purchase, draft) =>
            run(() => confirmOrderPurchaseReceipt({ id: purchase.id, ...draft }), "Отримання підтверджено", orderPurchaseEventTitle.received)
          }
        />
      ) : null}
      {access.edit ? (
        <Dialog open={toDelete !== null} onOpenChange={(open) => !saving && !open && setToDelete(null)}>
          <DialogContent className="max-w-[420px]">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Видалити закупку?</DialogTitle>
              <DialogDescription>
                {toDelete ? [toDelete.description, toDelete.supplierName].filter(Boolean).join(" · ") : ""}. Рядок зникне із замовлення.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={saving} onClick={() => setToDelete(null)}>
                Не видаляти
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={saving}
                onClick={async () => {
                  if (toDelete && (await run(() => deleteOrderPurchase(toDelete.id), "Закупку видалено"))) setToDelete(null);
                }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Видалити
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );

  return {
    tab: { value: "economics", label: "Економіка", badge },
    content,
    purchases,
    purchasesNone: none !== null,
    waybillBlockers: orderId && loadedFor === orderId ? waybillBlockers(purchases, none !== null) : undefined,
  };
}
