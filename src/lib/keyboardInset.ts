/**
 * Висота екранної клавіатури в змінній `--keyboard-inset` і `data-keyboard="open"`
 * на <html>.
 *
 * НАВІЩО. На iOS клавіатура не стискає вікно сторінки — лише visualViewport.
 * Вікна, приклеєні до низу (`fixed bottom-0`), лишались під клавіатурою, а
 * сторінка їхала вгору, і з-під вікна визирав список. Тепер вікна піднімаються
 * на висоту клавіатури, а смуга вкладок і кнопка AI ховаються.
 *
 * Поріг 120px: менші зсуви — це панель підказок Safari, а не клавіатура.
 */
const OPEN_THRESHOLD = 120;

export function installKeyboardInset() {
  if (typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let last = -1;

  const update = () => {
    const inset = Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height)));
    if (inset === last) return;
    last = inset;
    root.style.setProperty("--keyboard-inset", `${inset}px`);
    const open = inset > OPEN_THRESHOLD;
    if (open) root.dataset.keyboard = "open";
    else delete root.dataset.keyboard;
    if (open) {
      // Поле у фокусі могло опинитись під клавіатурою вже після підйому вікна.
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches("input, textarea, select, [contenteditable]")) {
        requestAnimationFrame(() => active.scrollIntoView({ block: "nearest" }));
      }
    }
  };

  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
}

/** autoFocus лише там, де є миша: на дотику фокус викликає клавіатуру й зум. */
export function canAutoFocus() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
