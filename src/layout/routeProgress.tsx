import * as React from "react";

/**
 * Смуга прогресу переходів — тонка лінія по нижньому краю шапки застосунку.
 *
 * ЧОМУ ВОНА ТУТ, А НЕ У ФОЛБЕКУ SUSPENSE. Перша спроба (21.08.2026) тримала
 * смугу у фолбеку, а той сидить у колонці вмісту, де відступи різні в різних
 * режимах (полотно / звичайна сторінка) — смуга то з'їжджала з лівого краю, то
 * висіла не згори. Місце смуги визначає МАКЕТ, і живе вона в макеті.
 *
 * ЧОМУ РОЖЕВА. У CRM дві теми: біла смуга губиться на світлій, чорна — на
 * темній. Синій зайнятий активними вкладками й інфо-бейджами (та й це дефолт
 * nprogress — ні про що). Брендовий рожевий працює на обох темах і при цьому
 * наш; прецедент — червона смуга YouTube.
 *
 * КОЛИ ВИДНО. Не «завжди при переході», а «поки щось справді вантажиться»:
 * сигнал піднімає кожен каркас завантаження (див. page-loading.tsx) і фолбек
 * маршруту. Миттєвий перехід із кешу смуги не показує взагалі — інакше на
 * кожен клік по меню кліпало б 50 мс рожевого.
 */

type RouteProgressContextValue = {
  /** Зайняти слот «щось вантажиться». Повертає функцію звільнення. */
  retain: () => () => void;
};

const RouteProgressContext = React.createContext<RouteProgressContextValue | null>(null);
const RouteProgressActiveContext = React.createContext(false);

export function RouteProgressProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState(0);

  const value = React.useMemo<RouteProgressContextValue>(
    () => ({
      retain: () => {
        setPending((count) => count + 1);
        let released = false;
        return () => {
          if (released) return;
          released = true;
          setPending((count) => Math.max(0, count - 1));
        };
      },
    }),
    []
  );

  return (
    <RouteProgressContext.Provider value={value}>
      <RouteProgressActiveContext.Provider value={pending > 0}>
        {children}
      </RouteProgressActiveContext.Provider>
    </RouteProgressContext.Provider>
  );
}

/**
 * Сказати смузі, що зараз щось вантажиться.
 *
 * Кличеться з каркасів, а не зі сторінок: каркас на екрані — і є той факт, про
 * який смуга розповідає. Так жодна сторінка не мусить нічого підключати
 * окремо, і жодна не забуде опустити прапорець.
 */
export function useRouteLoadingSignal(active = true) {
  const ctx = React.useContext(RouteProgressContext);

  React.useEffect(() => {
    if (!active || !ctx) return;
    return ctx.retain();
  }, [active, ctx]);
}

/**
 * Брендовий градієнт, і найнасиченіший колір — СПРАВА.
 *
 * Смуга росте зсувом повнорозмірної стрічки (див. нижче), тобто в кожен момент
 * видно її ПРАВИЙ хвіст. Отже те, що стоїть у градієнті на 100%, і є передній
 * край смуги: на початку переходу видно тільки його. Зі старим порядком там
 * лежав найсвітліший рожевий — смуга починалась блідою й насичувалась аж
 * наприкінці.
 */
const PROGRESS_GRADIENT =
  "linear-gradient(90deg, #ffafd8 0%, #ff77be 22%, #f22397 62%, #e6007e 100%)";

/** Коротший перехід смуги не вартий: інакше на кожен клік кліпало б рожевим. */
const APPEAR_MS = 150;
/** Скидання на нуль перед стартом — кадр без анімації, щоб не їхати назад. */
const RESET_MS = 20;
/** Крок підповзання. Дорівнює тривалості переходу — звідси й безшовність. */
const TICK_MS = 200;
/** Скільки смуга добігає до кінця, коли дані нарешті приїхали. */
const FILL_MS = 180;
/** Мить на повній смузі: без неї «готово» не встигає прочитатись. */
const HOLD_MS = 90;
/** Згасання. */
const FADE_MS = 220;
/** З чого починаємо: нуль читався б як «нічого не відбувається». */
const START = 0.08;
/** Стеля. Скільки триватиме завантаження, ми не знаємо, тож 100% не обіцяємо. */
const CEILING = 0.9;
/** Яку частку залишку з'їдає один крок. */
const TRICKLE = 0.12;

type Motion = "none" | "run" | "fill";

/**
 * Смуга переходу.
 *
 * ЧОМУ ЗСУВ, А НЕ РОЗТЯГ. Тут стояло `scaleX(value)` на стрічці з градієнтом —
 * і разом зі смугою розтягувався сам градієнт: на 8% усі чотири зупинки були
 * стиснуті в кількасот пікселів, далі вони «роз'їжджались», тож смуга по дорозі
 * міняла колір. Те саме робилось із `box-shadow`: масштаб плющив і його, тож
 * сяйво з круглого ставало розмазаним. Тепер стрічка завжди на повну ширину, а
 * росте вона зсувом `translate3d` — геометрія не змінюється взагалі, і колір із
 * сяйвом лишаються такими, як задумані.
 *
 * ЧОМУ КРОК І ПЕРЕХІД ОДНАКОВІ. Було 220 мс крок і 240 мс перехід: кожен новий
 * крок обривав НЕЗАВЕРШЕНУ анімацію попереднього, і замість руху виходило
 * смикання — крива щоразу починалась спочатку. Рівні 200 і 200 дають рівно
 * протилежне: наступний крок підхоплює точно там, де скінчився попередній, а
 * сповільнення до стелі йде саме собою, бо кожен крок з'їдає частку залишку.
 *
 * ЧОМУ ЛІНІЙНО НА ХОДУ Й ПЛАВНО НА ФІНІШІ. Поки чекаємо, смуга не має вдавати,
 * ніби щось знає: рівномірне підповзання чесніше за ease-out, який щоразу
 * прикидається, що ось-ось закінчить. А коли дані приїхали — навпаки, добіг до
 * кінця з гальмуванням, і аж тоді згасання.
 *
 * ЩО БУЛО ЗЛАМАНО НАСПРАВДІ. Другий перехід, початий поки смуга ще гасне,
 * тягнув її НАЗАД: `value` падав з 1 на 0.08 з переходом на 240 мс, і смуга
 * їхала справа наліво. Тому старт тепер завжди скидає стрічку на нуль кадром
 * без анімації.
 */
export function RouteProgressBar() {
  const active = React.useContext(RouteProgressActiveContext);
  const [progress, setProgress] = React.useState(0);
  const [visible, setVisible] = React.useState(false);
  const [motion, setMotion] = React.useState<Motion>("none");
  /** Чи смуга взагалі показувалась: без цього перший же кадр «дозакривав» би її. */
  const shown = React.useRef(false);

  React.useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let ticker: ReturnType<typeof setInterval> | undefined;
    const later = (fn: () => void, ms: number) => {
      timers.push(setTimeout(fn, ms));
    };

    if (active) {
      later(() => {
        shown.current = true;
        setMotion("none");
        setProgress(0);
        setVisible(true);
        later(() => {
          setMotion("run");
          setProgress(START);
          ticker = setInterval(() => {
            setProgress((current) => current + (CEILING - current) * TRICKLE);
          }, TICK_MS);
        }, RESET_MS);
      }, APPEAR_MS);
    } else if (shown.current) {
      setMotion("fill");
      setProgress(1);
      later(() => setVisible(false), FILL_MS + HOLD_MS);
      later(() => {
        shown.current = false;
        setMotion("none");
        setProgress(0);
      }, FILL_MS + HOLD_MS + FADE_MS);
    }

    return () => {
      timers.forEach(clearTimeout);
      if (ticker) clearInterval(ticker);
    };
  }, [active]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden"
      style={{ opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
    >
      <div
        className="h-full w-full will-change-transform"
        style={{
          background: PROGRESS_GRADIENT,
          boxShadow: "0 0 8px 0 rgba(230, 0, 126, 0.55)",
          transform: `translate3d(${(progress - 1) * 100}%, 0, 0)`,
          transition:
            motion === "none"
              ? "none"
              : motion === "run"
                ? `transform ${TICK_MS}ms linear`
                : `transform ${FILL_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      />
    </div>
  );
}
