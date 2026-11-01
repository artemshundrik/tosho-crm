import { useCallback, useEffect, useRef, useState } from "react";

import type { FieldWriteResult } from "./partyFieldWrite";

/**
 * Стан збереження кожного поля панелі окремо: «зберігаю», «збережено», «не
 * зберіглось — Повторити».
 *
 * ЛІЧИЛЬНИК ЗАПИТІВ НА ПОЛЕ. Людина клацає «Рахунок → Готівка → Рахунок»
 * швидше, ніж відповідає база. Відповіді приходять у довільному порядку, тож
 * стан поля бере лише відповідь ОСТАННЬОГО запиту цього поля; пізня відповідь
 * старого запиту ігнорується, і індикатор не застрягає на ній.
 *
 * Що саме опиниться в базі при перегоні запитів — вирішує порядок їх приходу
 * на сервер; запити йдуть по черзі кліків, тож останній клік і пишеться
 * останнім.
 */

export type FieldSaveState = "idle" | "saving" | "saved" | "error";
type FieldStatus = { state: FieldSaveState; message: string | null };

const IDLE: FieldStatus = { state: "idle", message: null };
const SAVED_FADE_MS = 1500;

export function usePartyFieldSave<P>(write: (patch: P) => Promise<FieldWriteResult>) {
  const [statuses, setStatuses] = useState<Record<string, FieldStatus>>({});
  const sequence = useRef<Record<string, number>>({});
  const lastPatch = useRef<Record<string, P>>({});
  const fadeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const writeRef = useRef(write);
  writeRef.current = write;

  useEffect(() => {
    const timers = fadeTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const setStatus = useCallback((field: string, status: FieldStatus) => {
    setStatuses((prev) => ({ ...prev, [field]: status }));
  }, []);

  const save = useCallback(
    (field: string, patch: P) => {
      const id = (sequence.current[field] ?? 0) + 1;
      sequence.current[field] = id;
      lastPatch.current[field] = patch;
      clearTimeout(fadeTimers.current[field]);
      setStatus(field, { state: "saving", message: null });
      void writeRef.current(patch).then((result) => {
        if (sequence.current[field] !== id) return;
        if (!result.ok) {
          setStatus(field, { state: "error", message: result.message });
          return;
        }
        setStatus(field, { state: "saved", message: null });
        fadeTimers.current[field] = setTimeout(() => {
          if (sequence.current[field] === id) setStatus(field, IDLE);
        }, SAVED_FADE_MS);
      });
    },
    [setStatus],
  );

  const stateOf = useCallback((field: string): FieldStatus => statuses[field] ?? IDLE, [statuses]);

  const retry = useCallback(
    (field: string) => {
      if (field in lastPatch.current) save(field, lastPatch.current[field]);
    },
    [save],
  );

  return { save, stateOf, retry };
}
