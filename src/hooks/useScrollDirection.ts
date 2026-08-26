import { useEffect, useState } from "react";

/**
 * Куди людина крутить сторінку — і чи ховати верхню обв'язку.
 *
 * ПАТЕРН НАЗИВАЄТЬСЯ «headroom» (він же hide-on-scroll app bar у Material).
 * Крутиш униз — шапка й смуга дій їдуть угору й звільняють екран; крутиш угору —
 * повертаються миттєво, не чекаючи, поки долистаєш до самого верху. Сенс у
 * тому, що намір «хочу назад до пошуку» людина висловлює саме рухом угору, і
 * жест уже є — не треба ні кнопки, ні дороги до початку списку.
 *
 * ЧОМУ НЕ ПРОСТО `sticky`. Липка смуга чесно віддає місце, але забирає його
 * НАЗАВЖДИ: на ноутбуці це 57 + 90 px екрана, які видно й тоді, коли вони не
 * потрібні. Тут вони потрібні рівно в мить, коли по них тягнешся.
 *
 * ТРИ ЗАПОБІЖНИКИ, БЕЗ ЯКИХ ПАТЕРН ДРАТУЄ:
 *
 * 1. `threshold` — поки не від'їхав від верху далі, ніж на цю відстань, нічого
 *    не ховаємо. Інакше шапка зникала б від найменшого руху на початку списку.
 *
 * 2. `delta` — зміна напрямку зараховується лише після кількох пікселів у новий
 *    бік. Без цього смуга миготіла б на інерційній прокрутці тачпада, де знак
 *    зміщення стрибає туди-сюди по кілька разів на секунду.
 *
 * 3. Прокрутка вгору ЗАВЖДИ показує, навіть у межах порога — це половина
 *    патерна, і затримувати її не можна.
 */
export type ScrollChrome = "shown" | "hidden";

export function useScrollDirection({
  threshold = 120,
  delta = 8,
}: { threshold?: number; delta?: number } = {}): ScrollChrome {
  const [chrome, setChrome] = useState<ScrollChrome>("shown");

  useEffect(() => {
    // Точка відліку — там, де сторінка стоїть у мить підписки: після переходу
    // між маршрутами прокрутка може бути будь-якою, і нуль тут дав би хибний
    // «рух угору» на першому ж кадрі.
    let last = window.scrollY;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const now = window.scrollY;
      const moved = now - last;

      // Рух менший за поріг чутливості — це тремтіння, а не намір.
      if (Math.abs(moved) < delta) return;
      last = now;

      if (now <= threshold || moved < 0) setChrome("shown");
      else setChrome("hidden");
    };

    const onScroll = () => {
      // Один замір на кадр: подія scroll приходить десятками разів за кадр, а
      // зміна стану React коштує рендера всієї обв'язки.
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold, delta]);

  return chrome;
}
