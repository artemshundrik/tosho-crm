import { useEffect, useState } from "react";
import { toast } from "sonner";

import { legalEntityLockReason, storedLegalEntityId, type ClosingDocument } from "@/features/orders/orderExecutor";
import {
  listOrderLegalEntities,
  setOrderClosingDocument,
  setOrderLegalEntity,
  type OrderLegalEntityOption,
} from "@/features/orders/orderLegalEntityQueries";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";

/**
 * Від кого документи замовлення (REQ-322#p1) і чим закриваємо (p3). Зміна
 * юрособи міняє відбиток договору й СП — погоджені документи стають «зміненими»
 * і йдуть на погодження наново.
 */
export function useOrderLegalEntity({
  record,
  teamId,
  onRecordPatch,
}: {
  record: DerivedOrderRecord | null;
  teamId: string | null | undefined;
  onRecordPatch: (patch: (current: DerivedOrderRecord) => DerivedOrderRecord) => void;
}) {
  const [options, setOptions] = useState<OrderLegalEntityOption[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    listOrderLegalEntities(teamId)
      .then((next) => {
        if (!cancelled) setOptions(next);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const run = async (action: () => Promise<void>) => {
    if (!record || !teamId || busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти.");
    } finally {
      setBusy(false);
    }
  };

  const changeEntity = (option: OrderLegalEntityOption) =>
    run(async () => {
      const lockReason = legalEntityLockReason(record!);
      if (lockReason) throw new Error(lockReason);
      await setOrderLegalEntity({ teamId: teamId!, orderId: record!.id, option });
      const hadDocuments = Boolean(record!.contractCreatedAt || record!.specificationCreatedAt);
      onRecordPatch((current) => ({
        ...current,
        ourLegalEntityId: storedLegalEntityId(option),
        executor: option.executor,
        contractSignedAt: null,
        contractSignedVia: null,
      }));
      toast.success(
        hadDocuments
          ? `Документи тепер від ${option.executor.shortName}. Договір і СП перестворіть і погодьте наново.`
          : `Документи тепер від ${option.executor.shortName}`
      );
    });

  const changeClosingDocument = (closingDocument: ClosingDocument) =>
    run(async () => {
      await setOrderClosingDocument({ teamId: teamId!, orderId: record!.id, closingDocument });
      onRecordPatch((current) => ({ ...current, closingDocument }));
    });

  return { options, busy, changeEntity, changeClosingDocument };
}
