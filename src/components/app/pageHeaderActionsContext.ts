import * as React from "react";

/** Дії разом із поверхнею, якій вони належать. */
export type PageHeaderActionsState = {
  node: React.ReactNode;
  surfaceId: string | null;
};

/**
 * Те саме, але БЕЗ вузла: лише факт наявності дій і поверхня, якій вони
 * належать. Рівно це — і нічого більше — потрібно оболонці застосунку, щоб
 * вирішити, чи є смуга дій і чи тримати замість неї каркас.
 */
export type PageHeaderActionsPresence = {
  hasActions: boolean;
  surfaceId: string | null;
};

export type PageHeaderActionsSetter = React.Dispatch<
  React.SetStateAction<PageHeaderActionsState | null>
>;

const NO_ACTIONS: PageHeaderActionsPresence = { hasActions: false, surfaceId: null };

/**
 * ТРИ КОНТЕКСТИ, А НЕ ОДИН — І ЦЕ НЕ ПРИКРАСА (REQ-135).
 *
 * Спершу значення й сеттер їхали одним об'єктом `{ actions, setActions }`.
 * Об'єкт створювався новим на кожен рендер провайдера, тобто на кожну зміну
 * дій, — і перемальовувались УСІ підписані. Підписана на нього була не лише
 * шапка: `usePageHeaderActions` теж читає контекст, тож кожна сторінка була
 * підписана на власні ж оновлення. Сеттер винесено окремо (коміт afb20ae): він
 * приходить із `useState` і стабільний назавжди, тож його контекст не міняється
 * НІКОЛИ.
 *
 * Лишалась друга половина. AppLayout читав САМ ВУЗОЛ дій, а вузол — новий на
 * кожну літеру в пошуку. Заміряно на дошці дизайну, серія з 14 літер, зібраний
 * прод локально:
 *
 *   шапка оновлюється     — 60 рендерів сторінки, 1998 мс роботи тіла
 *   шапка не оновлюється  — 36 рендерів,          1251 мс
 *
 * Тобто 24 рендери з 60 (40%) додавав саме шлях через шапку — на кожній із 15
 * сторінок, які реєструють дії, а не лише на дизайні.
 *
 * Тепер вузол читають ЛИШЕ маленькі слоти (`PageHeaderActionsSlot`), а оболонка
 * підписана на присутність — об'єкт із двох примітивів, який міняється тільки
 * коли сторінка приходить, іде або міняє поверхню.
 */
export const PageHeaderActionsValueContext = React.createContext<PageHeaderActionsState | null>(
  null
);
export const PageHeaderActionsPresenceContext =
  React.createContext<PageHeaderActionsPresence>(NO_ACTIONS);
export const PageHeaderActionsSetterContext = React.createContext<PageHeaderActionsSetter | null>(
  null
);

/**
 * Чи є в шапці дії саме цієї поверхні.
 *
 * ЧОМУ ЗВІРКА ПО ПОВЕРХНІ. Дії знімає прибирання ефекту, а воно виконується вже
 * ПІСЛЯ того, як адреса змінилась і новий маршрут відрендерився. Тобто існує
 * кадр, у якому шлях уже новий, а в контексті ще висять кнопки попередньої
 * сторінки. Без звірки смуга дій на мить показує чужий тулбар чужої висоти —
 * рівно той стрибок, від якого ми позбуваємось (REQ-19). Порівнюємо id поверхні,
 * а не шлях: у межах однієї поверхні адреса міняється (інший `:id`), а сторінка
 * лишається та сама.
 */
export function usePageHeaderActionsPresence(surfaceId: string | null) {
  const presence = React.useContext(PageHeaderActionsPresenceContext);
  return presence.hasActions && presence.surfaceId === surfaceId;
}

/** Вузол дій саме цієї поверхні. Читають лише слоти — оболонка його не бачить. */
export function usePageHeaderActionsNode(surfaceId: string | null) {
  const state = React.useContext(PageHeaderActionsValueContext);
  return state && state.surfaceId === surfaceId ? state.node : null;
}
