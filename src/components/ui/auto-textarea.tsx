import * as React from "react";
import { cn } from "@/lib/utils";

type AutoTextareaProps = React.ComponentProps<"textarea"> & {
  /**
   * Скільки рядків поле займає ПОРОЖНІМ. За замовчуванням один — так воно й
   * задумувалось для коротких полів (адреса, назва точки доставки).
   *
   * Для довгих текстів одиниця шкодить: поле висотою в рядок читається як
   * «сюди пишуть коротко», хоч би що обіцяв підпис. Саме через це ТЗ для
   * дизайнера й виглядало «вузенькою стрічкою» поруч із тим самим полем у
   * прорахунку, де стоїть фіксовані 180px.
   */
  minRows?: number;
  /**
   * Стеля, після якої поле перестає рости й починає прокручуватись усередині.
   *
   * Без неї довгий текст розпихає діалог: він центрований по вертикалі, тож
   * росте симетрично — низ іде вниз, верх угору, — і все, що вище поля, повзе
   * з-під очей, поки набираєш.
   */
  maxRows?: number;
};

/**
 * Текстове поле, що авто-розтягується вниз під вміст — без ручного «вушка» й
 * без внутрішнього скролу, доки не вперлось у `maxRows`. Візуально — той самий
 * стиль, що й <Textarea>, лише без фіксованої min-height.
 */
const AutoTextarea = React.forwardRef<HTMLTextAreaElement, AutoTextareaProps>(
  ({ className, value, rows, minRows = 1, maxRows, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef)
          (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      },
      [forwardedRef]
    );

    const resize = React.useCallback(() => {
      const el = innerRef.current;
      if (!el) return;

      // Спершу знімаємо власну висоту — інакше scrollHeight поверне те, що ми
      // ж і поставили минулого разу, і поле більше ніколи не зменшиться.
      el.style.height = "auto";
      const contentHeight = el.scrollHeight;
      const borders = el.offsetHeight - el.clientHeight;

      const styles = window.getComputedStyle(el);
      // lineHeight буває "normal" — тоді parseFloat дає NaN. 20px це типовий
      // рядок для нашого кегля; помилка тут коштує кілька пікселів, а падіння
      // на NaN зламало б поле повністю.
      const line = Number.parseFloat(styles.lineHeight) || 20;
      const padding =
        Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);

      const min = line * minRows + padding;
      const max = maxRows ? line * maxRows + padding : Number.POSITIVE_INFINITY;
      const next = Math.min(Math.max(contentHeight, min), max);

      el.style.height = `${next + borders}px`;
      // Скрол вмикаємо лише коли справді вперлись у стелю: постійний
      // overflow-y auto лишає смугу-привид у деяких браузерах.
      el.style.overflowY = contentHeight > max ? "auto" : "hidden";
    }, [maxRows, minRows]);

    // Підганяємо висоту після кожної зміни значення (набір, підвантаження картки).
    React.useLayoutEffect(() => {
      resize();
    }, [resize, value]);

    return (
      <textarea
        ref={setRefs}
        // rows дає правильну висоту ще до першого виміру — інакше поле встигає
        // блимнути одним рядком і стрибнути.
        rows={rows ?? minRows}
        value={value}
        className={cn(
          "flex w-full resize-none appearance-none overflow-hidden rounded-[var(--radius-lg)] border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground",
          "transition-colors duration-150",
          "hover:border-foreground/30 hover:bg-muted/20",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 focus-visible:border-primary/60",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        {...props}
      />
    );
  }
);
AutoTextarea.displayName = "AutoTextarea";

export { AutoTextarea };
