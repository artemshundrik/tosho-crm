import { useEffect, useState } from "react";

/**
 * `true`, коли `active` тримається довше за `ms` без перерви.
 *
 * Потрібен там, де очікування може не скінчитись НІКОЛИ. Приклад із REQ-19:
 * макет резервує смугу дій за реєстром, але сторінка під тим самим маршрутом
 * може й не змонтуватись — гейт доступу покаже «потрібен доступ», обгортка —
 * «немає команди». Тоді кнопок не буде взагалі, і без цього запобіжника над
 * повідомленням вічно мерехтів би каркас тулбара.
 *
 * Пороги показу самих каркасів живуть окремо, у loadingHandoff.ts: там затримка
 * належить ПЕРЕХОДУ, а не компоненту, інакше кожна фаза завантаження відміряє
 * свої 150 мс і між ними лишається порожній кадр.
 */
export function useTimeoutFlag(active: boolean, ms: number) {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) {
      setElapsed(false);
      return;
    }
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);

  return elapsed;
}
