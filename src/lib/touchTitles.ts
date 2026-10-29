/**
 * Підказки `title` на дотиковому екрані.
 *
 * Браузер показує `title` лише при наведенні мишею, а на iPad і телефоні — ніколи.
 * У CRM на ньому тримається чимало: повна назва обрізаного рядка, пояснення
 * значка. Тепер довге натискання (450 мс) на такий елемент показує ту саму
 * підказку бульбашкою над пальцем; рух пальця скасовує, щоб не заважати гортати.
 */
const HOLD_MS = 450;
const SLOP_PX = 10;

export function installTouchTitles() {
  if (typeof window === "undefined" || !window.matchMedia("(hover: none)").matches) return;
  let timer = 0;
  let startX = 0;
  let startY = 0;
  let bubble: HTMLDivElement | null = null;

  const hide = () => {
    bubble?.remove();
    bubble = null;
  };
  const cancel = () => window.clearTimeout(timer);

  document.addEventListener(
    "touchstart",
    (event) => {
      hide();
      const touch = event.touches[0];
      const target = (event.target as Element | null)?.closest<HTMLElement>("[title]");
      const text = target?.getAttribute("title")?.trim();
      if (!touch || !target || !text) return;
      startX = touch.clientX;
      startY = touch.clientY;
      timer = window.setTimeout(() => {
        bubble = document.createElement("div");
        bubble.setAttribute("role", "tooltip");
        bubble.textContent = text;
        bubble.className =
          "pointer-events-none fixed z-[9999] max-w-[min(320px,90vw)] -translate-x-1/2 -translate-y-full rounded-lg bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg";
        bubble.style.left = `${Math.min(Math.max(startX, 24), window.innerWidth - 24)}px`;
        bubble.style.top = `${Math.max(startY - 16, 40)}px`;
        document.body.appendChild(bubble);
        window.setTimeout(hide, 2500);
      }, HOLD_MS);
    },
    { passive: true }
  );
  document.addEventListener(
    "touchmove",
    (event) => {
      const touch = event.touches[0];
      if (touch && (Math.abs(touch.clientX - startX) > SLOP_PX || Math.abs(touch.clientY - startY) > SLOP_PX)) cancel();
    },
    { passive: true }
  );
  document.addEventListener("touchend", cancel, { passive: true });
  document.addEventListener("touchcancel", cancel, { passive: true });
}
