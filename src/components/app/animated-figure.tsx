import * as React from "react";
import NumberFlow, { type Format } from "@number-flow/react";

import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Велике число, що міняється розряд за розрядом, і смуга часток, що росте з ним
 * в один такт (REQ-200).
 *
 * ЩО ЛІКУЄ. Підсумок «Витрати» стрибав: число просто ставало іншим. Стрибок
 * читається як підміна («тут було інше значення»), а не як зміна («значення
 * стало таким»), і при перемиканні місяця погляд щоразу починав з нуля.
 *
 * ТЕМП ОДИН НА ЧИСЛО Й СМУГУ, і це не косметика. Дві анімації різної довжини
 * поруч читаються як дві різні події: спершу «щось порахувалось», потім «щось
 * перемалювалось». Тому тривалість і крива живуть тут однією парою констант, а
 * смуга бере їх через `figureRevealTransition`.
 *
 * ЧОМУ АНІМАЦІЯ Є Й ПРИ ВІДКРИТТІ СТОРІНКИ. Інакше вона траплялась би лише
 * тому, хто перемикає місяць, — тобто майже ніколи. `useFigureReveal` дає
 * ПРАПОРЕЦЬ, а не значення: перший кадр малюється з нулями, наступний — зі
 * справжніми числами. Прапорець спільний для числа й смуги саме тому, що вони
 * мусять рушити разом; два незалежні прапорці розійшлись би на кадр.
 *
 * І САМЕ ТОМУ ЦЕ ПРАЦЮЄ З ТЕПЛИМ КЕШЕМ. Прапорець прив'язаний до МОНТУВАННЯ, а
 * не до зміни даних. Якби анімацію запускала зміна значення, при відкритті
 * сторінки з готовими даними React Query не змінилось би нічого — і сторінка
 * відкривалась би мертвим числом рівно в тих випадках, коли працює швидко.
 *
 * ЧОГО ТУТ СВІДОМО НЕМАЄ — ТАБЛИЦЬ. Десятки чисел, що крутяться одночасно,
 * дають не рух, а мигтіння: око не встигає ні за одним. Анімуються лише великі
 * підсумки, заради яких на сторінку й дивляться.
 */

/** Спільний темп: число крутиться стільки ж, скільки росте смуга. */
export const FIGURE_REVEAL_MS = 520;
export const FIGURE_REVEAL_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

/** Готовий рядок `transition` для смуги — щоб крива не розійшлась із числом. */
export const figureRevealTransition = `flex-grow ${FIGURE_REVEAL_MS}ms ${FIGURE_REVEAL_EASING}, min-width ${FIGURE_REVEAL_MS}ms ${FIGURE_REVEAL_EASING}`;

/**
 * Формат за замовчуванням — той самий, що дає `formatOrderMoney` для гривні.
 *
 * Тип `Format` — це `Intl.NumberFormatOptions` без тих записів, яких NumberFlow
 * не вміє розібрати на розряди (наукова й інженерна нотації). Беремо його, а не
 * ширший інтелівський, щоб непідтримане не проїхало мовчки.
 */
export const FIGURE_UAH_FORMAT: Format = {
  style: "currency",
  currency: "UAH",
  maximumFractionDigits: 0,
};

export const FIGURE_LOCALE = "uk-UA";

/**
 * Прапорець «справжні значення можна показувати».
 *
 * ДВА КАДРИ, А НЕ ОДИН. `useEffect` не гарантує, що браузер уже намалював кадр
 * із нулями: React може виконати ефект до промальовування, і тоді нулі й
 * справжнє значення потраплять в один кадр — анімації не буде взагалі, бо
 * рухатись нема від чого. Перший `requestAnimationFrame` доводить нас до
 * найближчого промальовування, другий — до наступного за ним.
 *
 * ПРИ «ЗМЕНШИТИ РУХ» ПРАПОРЕЦЬ ПІДНЯТИЙ ОДРАЗУ. Не заради швидкості: сама
 * анімація там і так вимкнена (`respectMotionPreference` у NumberFlow), тож
 * нуль першого кадру нічим би не змінився на справжнє число — він просто
 * блимнув би нулем. Це гірше за відсутність анімації.
 *
 * І ТАК САМО НА СХОВАНІЙ СТОРІНЦІ — але тут причина серйозніша за красу.
 * `requestAnimationFrame` у схованої вкладки НЕ ВИКЛИКАЄТЬСЯ взагалі: браузер
 * притримує кадри до повернення. Прапорець лишався б опущеним, а на місці
 * підсумку стояв би НУЛЬ — тобто не «анімації немає», а неправильна сума. Для
 * фінансового підсумку це не дрібниця, тому на схованій сторінці розкриття
 * пропускається цілком: показувати рух усе одно нема кому.
 */
export function useFigureReveal(enabled: boolean = true): boolean {
  const [ready, setReady] = React.useState(
    () => prefersReducedMotion() || (typeof document !== "undefined" && document.visibilityState === "hidden")
  );

  React.useEffect(() => {
    if (!enabled) return;
    if (typeof requestAnimationFrame !== "function") {
      setReady(true);
      return;
    }
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReady(true));
    });

    // Страхувальний таймер — на випадок, коли кадрів немає, а сторінка при
    // цьому вважається видимою. Так буває у вікна, повністю перекритого іншим:
    // `visibilityState` каже «visible», а `requestAnimationFrame` не
    // викликається. Без цієї страховки на місці підсумку лишався б НУЛЬ —
    // тобто неправильна сума, а не просто відсутній рух.
    //
    // Чверть секунди — свідомо багато. Два кадри на будь-якій живій машині це
    // десятки мілісекунд, тож у нормальному житті таймер завжди програє
    // кадрам і на анімацію не впливає; він потрібен рівно там, де кадрів
    // немає взагалі.
    const fallback = setTimeout(() => setReady(true), 250);

    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      clearTimeout(fallback);
    };
    // Залежність одна — `enabled`. Перевірки «а раптом уже готово» тут навмисно
    // немає: повторний `setReady(true)` React відкидає сам, зате без неї ефекту
    // не потрібен `ready` у залежностях — а з ним довелось би або глушити
    // правило хуків, або перезапускати відлік на кожному підйомі прапорця.
  }, [enabled]);

  return ready;
}

/**
 * Спільний прапорець для картки, у якої число й смуга — різні компоненти.
 *
 * Картка підсумку в «Огляді» складається з `HeroShell` (число) і `SplitBar`
 * (смуга), і кожен міг би завести свій прапорець. Два прапорці ЗАЗВИЧАЙ
 * піднялись би одночасно — обидва ефекти в одному коміті, обидва кадри ті
 * самі, — але саме «зазвичай» тут і не годиться: розбіжність на один кадр
 * читається як два окремі рухи, а спіймати її можна лише оком і не щоразу.
 * Тому прапорець заводить картка, а частини його читають.
 */
const FigureRevealContext = React.createContext<boolean | null>(null);

export function FigureRevealProvider({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return <FigureRevealContext.Provider value={ready}>{children}</FigureRevealContext.Provider>;
}

/** Прапорець картки, а без картки — власний: смуга буває й сама по собі. */
export function useSharedFigureReveal(): boolean {
  const shared = React.useContext(FigureRevealContext);
  const own = useFigureReveal(shared === null);
  return shared ?? own;
}

/**
 * Велике число, що перекручується розряд за розрядом.
 *
 * `ready` приходить ЗЗОВНІ, а не заводиться тут: у картці підсумку число й
 * смуга мусять рушити одночасно, а для цього прапорець у них має бути один.
 *
 * Де браузер не вміє потрібних анімацій, NumberFlow сам малює звичайний текст
 * тим самим `Intl.NumberFormat` — тобто рядок виходить точнісінько той, що був
 * до цієї задачі.
 */
export function AnimatedFigure({
  value,
  ready,
  format = FIGURE_UAH_FORMAT,
  prefix,
  suffix,
  className,
}: {
  value: number;
  ready: boolean;
  format?: Format;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <NumberFlow
      value={ready ? value : 0}
      locales={FIGURE_LOCALE}
      format={format}
      prefix={prefix}
      suffix={suffix}
      transformTiming={{ duration: FIGURE_REVEAL_MS, easing: FIGURE_REVEAL_EASING }}
      // `willChange` тримає шар під час анімації. Без нього довге число на
      // слабкій машині смикається на старті — це рекомендація самої бібліотеки
      // для чисел, які міняються нечасто, а наші підсумки саме такі.
      willChange
      className={cn("figure", className)}
    />
  );
}
