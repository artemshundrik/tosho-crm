import { useCallback, useEffect, useRef } from "react";

import { supabase } from "@/lib/supabaseClient";

/**
 * Доїзд картинок і назв після імпорту (REQ-233, §2 крок 5).
 *
 * ЧОМУ ПОЛІНГ, А НЕ РЕАЛТАЙМ. Подія тут одна й коротка: тридцять сайтів
 * обходяться за пів хвилини-хвилину, після чого дивитись нема на що. Канал
 * реалтайму на такий випадок — це постійна підписка заради разової події, до
 * того ж у сторінці, яка й так тримає їх кілька.
 *
 * Стеля дві хвилини — не оптимізм, а межа: фонова функція має 15 хвилин, але
 * якщо за дві вона не дійшла й до половини, менеджер уже пішов працювати далі,
 * а результат він побачить при наступному відкритті картки.
 */

const POLL_INTERVAL_MS = 5_000;
const POLL_LIMIT_MS = 120_000;

export function useQuoteImportResearch(reload: () => void | Promise<void>) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    async (itemIds: string[]) => {
      await reload();
      if (itemIds.length === 0) return;

      const startedAt = Date.now();
      let lastDone = 0;

      const tick = async () => {
        if (stoppedRef.current) return;
        const { data, error } = await supabase
          .schema("tosho")
          .from("quote_items")
          .select("id, metadata")
          .in("id", itemIds);

        if (!error) {
          const rows = (data ?? []) as Array<{ metadata?: Record<string, unknown> | null }>;
          const done = rows.filter((row) => Boolean(row.metadata?.research)).length;
          // Перемальовуємо лише коли справді щось доїхало: інакше сторінка
          // смикалася б раз на п'ять секунд без причини.
          if (done > lastDone) {
            lastDone = done;
            await reload();
          }
          if (done >= itemIds.length) return;
        }

        if (Date.now() - startedAt > POLL_LIMIT_MS) return;
        timerRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      };

      timerRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    },
    [reload]
  );
}
