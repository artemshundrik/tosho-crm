/**
 * Спільні відповіді на питання «чи взагалі рухаємось» і «як швидко».
 *
 * ЧОМУ ОКРЕМИЙ ФАЙЛ. `prefersReducedMotion` уже жив трьома копіями — у
 * перемиканні теми, в обгортці над View Transitions і мав з'явитись четвертою
 * в анімації підсумків. Функція крихітна, але помилитись у ній є де: у
 * середовищі без `matchMedia` (тести, старий вебв'ю) звернення падає, і замість
 * «просто без анімації» виходить біла сторінка.
 *
 * Тут навмисно немає імпортів React: файл читає й `theme.ts`, який працює до
 * першого рендера.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
