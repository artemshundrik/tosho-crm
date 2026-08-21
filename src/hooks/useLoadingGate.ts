import { useEffect, useRef, useState } from "react";

type LoadingGateOptions = {
  /** Скільки чекати, перш ніж показати каркас узагалі. */
  delayMs?: number;
  /** Скільки каркас мусить провисіти, якщо вже показався. */
  minMs?: number;
};

/**
 * Чи показувати каркас завантаження.
 *
 * Два пороги замість одного, бо блимання буває двох різновидів і лікуються вони
 * по-різному:
 *
 * ЗАТРИМКА 150 мс. Дані з кешу або швидка мережа віддають сторінку за 30-60 мс.
 * Каркас, показаний на цей час, людина сприймає не як «швидко», а як зайвий
 * кадр: щось сіре кліпнуло й зникло. Тому перші 150 мс не показуємо нічого —
 * лишається попередній кадр, і перехід виглядає миттєвим.
 *
 * МІНІМУМ 250 мс. Якщо каркас усе-таки з'явився, він мусить провисіти стільки,
 * щоб око встигло його прочитати. Без цього порогу відповідь, що прийшла на
 * 160-й мілісекунді, дає той самий блимкий кадр, тільки з іншого боку.
 *
 * Значення з рішення по картці REQ-19 (стенд 21.08.2026).
 */
export function useLoadingGate(loading: boolean, options?: LoadingGateOptions) {
  const delayMs = options?.delayMs ?? 150;
  const minMs = options?.minMs ?? 250;
  const [visible, setVisible] = useState(false);
  // Коли каркас реально з'явився на екрані. null — зараз не показується.
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (loading) {
      // Уже показуємо — нового відліку не починаємо, інакше довге завантаження
      // з кількома перемиканнями прапорця зсувало б поріг мінімуму вперед.
      if (shownAtRef.current === null) {
        timer = setTimeout(() => {
          shownAtRef.current = Date.now();
          setVisible(true);
        }, delayMs);
      }
      return () => {
        if (timer) clearTimeout(timer);
      };
    }

    const shownAt = shownAtRef.current;
    if (shownAt === null) {
      // Встигли до порога — каркаса не було взагалі.
      setVisible(false);
      return;
    }

    timer = setTimeout(
      () => {
        shownAtRef.current = null;
        setVisible(false);
      },
      Math.max(minMs - (Date.now() - shownAt), 0)
    );

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loading, delayMs, minMs]);

  return visible;
}

/**
 * Той самий поріг затримки, але без зовнішнього прапорця: `true` через
 * `delayMs` після монтування.
 *
 * Потрібен там, де ми не володіємо станом завантаження й не можемо дізнатись,
 * коли воно скінчиться, — у фолбеку Suspense. Мінімум показу там не діє
 * фізично: фолбек прибирає React у момент готовності чанка, і затримати це
 * зсередини неможливо.
 */
export function useDelayedFlag(delayMs = 150) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return ready;
}

/**
 * `true`, коли `active` тримається довше за `ms` без перерви.
 *
 * Потрібен там, де очікування може не скінчитись НІКОЛИ. Приклад із REQ-19:
 * макет резервує смугу дій за реєстром, але сторінка під тим самим маршрутом
 * може й не змонтуватись — гейт доступу покаже «потрібен доступ», обгортка —
 * «немає команди». Тоді кнопок не буде взагалі, і без цього запобіжника над
 * повідомленням вічно мерехтів би каркас тулбара.
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
