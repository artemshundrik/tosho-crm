import { useEffect, useState } from "react";

import { listPendingPurchaseReceipts, type PendingReceipts } from "@/features/orders/orderPurchaseQueries";

/**
 * Дані картки «Документи постачальників». Вантажить лише коли `enabled`, тобто
 * для посад, яким картку показують, - решта RPC не кличе.
 *
 * Збій мовчки лишає `null` і картка просто не з'являється: головна не місце
 * для тосту про закупки (RPC може бути ще не накочений, або в людини немає
 * права - база скаже 42501).
 */
export function useSupplierDocuments(teamId: string | null | undefined, enabled: boolean): PendingReceipts | null {
  const [data, setData] = useState<PendingReceipts | null>(null);

  useEffect(() => {
    if (!enabled || !teamId) {
      setData(null);
      return;
    }
    let cancelled = false;
    listPendingPurchaseReceipts(teamId).then(
      (result) => {
        if (!cancelled) setData(result);
      },
      () => {
        if (!cancelled) setData(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [teamId, enabled]);

  return data;
}
