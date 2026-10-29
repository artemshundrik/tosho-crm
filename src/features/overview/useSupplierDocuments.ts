import { useEffect, useState } from "react";

import { listPendingPurchaseReceipts, type PendingReceipts } from "@/features/orders/orderPurchaseQueries";

/**
 * Дані картки «Документи постачальників». Вантажить лише коли `enabled`, тобто
 * для посад, яким картку показують, - решта RPC не кличе.
 *
 * Збій мовчки лишає `null` і картка просто не з'являється: головна не місце
 * для тосту про закупки (мережа, або в людини немає права - база скаже 42501).
 */
export function useSupplierDocuments(teamId: string | null | undefined, enabled: boolean): PendingReceipts | null {
  // Відповідь пам'ятає свою команду: вимкнено чи команда інша — віддаємо null
  // одразу, без скидання стану ефектом.
  const [loaded, setLoaded] = useState<{ teamId: string; data: PendingReceipts | null } | null>(null);

  useEffect(() => {
    if (!enabled || !teamId) return;
    let cancelled = false;
    listPendingPurchaseReceipts(teamId).then(
      (result) => {
        if (!cancelled) setLoaded({ teamId, data: result });
      },
      () => {
        if (!cancelled) setLoaded({ teamId, data: null });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [teamId, enabled]);

  return enabled && teamId && loaded?.teamId === teamId ? loaded.data : null;
}
