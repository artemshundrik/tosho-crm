export const BRIEF_SURFACE_FRAME_CLASS =
  "w-full rounded-[var(--radius-lg)] border border-border/40 bg-muted/[0.03] text-left transition-colors hover:border-foreground/30 hover:bg-muted/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export const BRIEF_SURFACE_TEXT_CLASS = "text-sm leading-7 text-foreground";

export const BRIEF_TEXTAREA_CLASS =
  "resize-none border-border/40 bg-muted/[0.03] px-4 py-4 text-sm leading-7 placeholder:text-muted-foreground/55";

export const BRIEF_DIALOG_PREVIEW_CLASS =
  "min-h-0 rounded-xl border border-border/60 bg-background/70 p-3";

/** Стеля інлайнового поля ТЗ, далі — скрол усередині. */
export const BRIEF_INLINE_TEXTAREA_MAX_HEIGHT = 320;
/** Стеля поля ТЗ у повноекранному редакторі. */
export const BRIEF_DIALOG_TEXTAREA_MAX_HEIGHT = 560;

/**
 * Підганяє висоту поля ТЗ під вміст, у межах від `minHeight` до `maxHeight`.
 *
 * ЧОМУ ТУТ, А НЕ В КОЖНІЙ СТОРІНЦІ. Функція жила двома копіями — у
 * DesignTaskPage і QuoteDetailsPage — і встигла розійтись: перша брала мінімум
 * параметром і за замовчуванням не мала його зовсім, друга тримала зашиті
 * 140px. Тобто однойменна функція давала різну висоту залежно від того, на якій
 * сторінці редагують те саме ТЗ. Тепер вона одна, а мінімум передають явно.
 *
 * Autosize тут ручний, а не через <AutoTextarea>, і це навмисно: поля ТЗ на
 * сторінках задачі й прорахунку мають розмітку форматування (markdown-кнопки,
 * робота з виділенням), тож їм потрібен прямий доступ до вузла.
 */
export function resizeBriefTextarea(
  textarea: HTMLTextAreaElement | null,
  maxHeight: number,
  minHeight = 0
) {
  if (!textarea) return;
  // 0px, а не "auto": після нього scrollHeight гарантовано міряє вміст, а не
  // те, що ми ж і поставили минулого разу.
  textarea.style.height = "0px";
  const naturalHeight = textarea.scrollHeight;
  const clamped = Math.min(naturalHeight, maxHeight);
  const final = minHeight > 0 ? Math.max(clamped, minHeight) : clamped;
  textarea.style.height = `${final}px`;
  // Скрол лише коли справді вперлись у стелю — постійний auto лишає
  // смугу-привид у частині браузерів.
  textarea.style.overflowY = naturalHeight > maxHeight ? "auto" : "hidden";
}
