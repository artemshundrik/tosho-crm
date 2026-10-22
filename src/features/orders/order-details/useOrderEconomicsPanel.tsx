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
import { canViewOrderEconomics } from "@/lib/permissions";

type Accounts = Array<{ id: string; name: string }>;
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
  const [accounts, setAccounts] = useState<Accounts>([]);
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

  // Рахунки списання — гривневі рахунки нашої юрособи замовлення; лише тим, хто оплачує.
  useEffect(() => {
    if (!enabled || !access.edit || !teamId) return;
    let active = true;
    listOrderPaymentAccounts(teamId, legalEntityId, null, "bank")
      .then((result) => {
        if (active) setAccounts(result.accounts);
      })
      .catch(() => {
        if (active) setAccounts([]);
      });
    return () => {
      active = false;
    };
  }, [enabled, access.edit, teamId, legalEntityId]);

  const run = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      setSaving(true);
      try {
        await action();
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
    [reload, onChanged]
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
        onAdd={(itemId) => openEditor(null, items.length === 1 && itemId === undefined ? items[0].id : itemId)}
        onEdit={(purchase) => openEditor(purchase)}
        onDelete={setToDelete}
        onPay={(purchase) => setPayTarget({ mode: "pay", purchase })}
        onCancelPayment={(purchase) => setPayTarget({ mode: "cancel", purchase })}
        onReceive={setReceiptTarget}
        onToggleNone={(value) =>
          void run(() => setOrderPurchasesNone(record.id, value), value ? "Позначку «закупок немає» поставлено" : "Позначку знято")
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
            run(() => saveOrderPurchase(input), input.id ? "Закупку збережено" : "Закупку внесено")
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
            run(() => confirmOrderPurchaseReceipt({ id: purchase.id, ...draft }), "Отримання підтверджено")
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
