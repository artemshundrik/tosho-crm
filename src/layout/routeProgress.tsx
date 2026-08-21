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

/** Брендовий градієнт ToSho AI, розтягнутий по горизонталі. */
const PROGRESS_GRADIENT =
  "linear-gradient(90deg, #ff77be 0%, #f22397 28%, #e6007e 62%, #ffafd8 100%)";

export function RouteProgressBar() {
  const active = React.useContext(RouteProgressActiveContext);
  const [visible, setVisible] = React.useState(false);
  const [value, setValue] = React.useState(0);

  React.useEffect(() => {
    if (active) {
      // Та сама затримка, що й у каркасів: коротке очікування смуги не варте.
      const appear = setTimeout(() => {
        setVisible(true);
        setValue(0.08);
      }, 150);
      // Асимптота до 90%: скільки триватиме завантаження, ми не знаємо, тож
      // смуга не має права дійти до кінця раніше за самі дані.
      const tick = setInterval(() => {
        setValue((current) => current + (0.9 - current) * 0.14);
      }, 220);
      return () => {
        clearTimeout(appear);
        clearInterval(tick);
      };
    }

    setValue(1);
    const hide = setTimeout(() => {
      setVisible(false);
      setValue(0);
    }, 260);
    return () => clearTimeout(hide);
  }, [active]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 220ms ease" }}
    >
      <div
        className="h-full w-full origin-left"
        style={{
          background: PROGRESS_GRADIENT,
          boxShadow: "0 0 8px 0 rgba(230, 0, 126, 0.55)",
          transform: `scaleX(${value})`,
          transition: "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </div>
  );
}
