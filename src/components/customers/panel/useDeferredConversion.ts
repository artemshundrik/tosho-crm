import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Відкладене переведення ліда в замовника: «Перевести» лише заводить
 * годинник, у базу йде через `delayMs` — до того «Скасувати» нічого не
 * відкочує, бо нічого ще не записано.
 *
 * ЗАКРИЛИ ПОСЕРЕД ОЧІКУВАННЯ (панель, сторінка) — переведення виконується
 * одразу, а не губиться: людина натиснула «Перевести» й не скасувала.
 *
 * `run` береться найсвіжіший на момент спрацювання — з тими полями, що є
 * зараз, а не на момент натискання.
 */
export function useDeferredConversion(run: () => Promise<void>, delayMs = 6000) {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, setPending] = useState(false);

  const start = useCallback(() => {
    if (timerRef.current !== null) return;
    setPending(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setPending(false);
      void runRef.current();
    }, delayMs);
  }, [delayMs]);

  const cancel = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    setPending(false);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current === null) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      void runRef.current();
    },
    [],
  );

  return { start, cancel, pending };
}
