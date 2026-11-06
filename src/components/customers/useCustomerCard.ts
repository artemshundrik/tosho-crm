import { useCallback, useEffect, useState } from "react";

import { readEntityLock, sectionLockType, type EntityLockResult } from "@/lib/entityLock";
import type { CustomerFormState } from "./partyFormTypes";
import { customerRowToForm, loadCustomerRow, type CustomerRecord } from "./customerCardLoad";
import { loadPartyLinkedRecords, type PartyLinkedRecords } from "./partyLinkedRecords";

/**
 * Картка замовника для панелі й сторінки: рядок, форма з нього, повʼязані
 * прорахунки/замовлення/задачі й чужий замок реквізитів.
 *
 * Стани: `loading` → `ready`; `gone` — рядка немає (видалили або RLS не
 * пускає); `error` — запит упав, `retry()` пробує ще. Повʼязані записи
 * догружаються ПІСЛЯ `ready`: назва й «чого бракує» не чекають на 20
 * прорахунків.
 *
 * Замок лише ЧИТАЄТЬСЯ: брати його має сторінка в момент «Змінити», а не
 * будь-хто, хто відкрив картку.
 */

export type CustomerCardState = "loading" | "ready" | "error" | "gone";

const EMPTY_RECORDS: PartyLinkedRecords = { calculations: [], orders: [], designTasks: [], ltvEntry: null };

export function useCustomerCard(params: { teamId: string | null; userId: string | null; customerId: string }) {
  const { teamId, userId, customerId } = params;
  const [state, setState] = useState<CustomerCardState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [row, setRow] = useState<CustomerRecord | null>(null);
  const [form, setForm] = useState<CustomerFormState | null>(null);
  const [records, setRecords] = useState<PartyLinkedRecords>(EMPTY_RECORDS);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [foreignLock, setForeignLock] = useState<EntityLockResult | null>(null);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    setState("loading");
    setRecordsLoading(true);
    void (async () => {
      try {
        const { data, error } = await loadCustomerRow(teamId, customerId);
        if (cancelled) return;
        if (error) throw error;
        if (!data) {
          setState("gone");
          return;
        }
        setRow(data);
        setForm(customerRowToForm(data, data.manager ?? ""));
        setState("ready");

        readEntityLock({ teamId, entityType: sectionLockType("customer", "requisites"), entityId: customerId })
          .then((found) => {
            const live = found && found.lockedBy !== userId && (!found.expiresAt || new Date(found.expiresAt) > new Date());
            if (!cancelled) setForeignLock(live ? found : null);
          })
          .catch(() => undefined);

        const linked = await loadPartyLinkedRecords({
          teamId,
          userId,
          target: { kind: "customer", id: customerId, names: [data.name, data.legal_name] },
          onCalculations: (calculations) => {
            if (!cancelled) setRecords((current) => ({ ...current, calculations }));
          },
        });
        if (!cancelled) setRecords(linked);
      } catch {
        if (!cancelled) setState((current) => (current === "ready" ? current : "error"));
      } finally {
        if (!cancelled) setRecordsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, customerId, teamId, userId]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const update = useCallback(
    (patch: Partial<CustomerFormState>) => setForm((current) => (current ? { ...current, ...patch } : current)),
    [],
  );

  return { state, row, form, setForm, update, records, recordsLoading, foreignLock, retry };
}
