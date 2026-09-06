import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { UploadIllustration } from "@/components/ui/upload-illustration";
import { cn } from "@/lib/utils";

/**
 * Місце, куди кидають файли. Одне на весь застосунок.
 *
 * ЩО ЦЕ ЗВЕЛО. Дропзон було шість, і вони розійшлися так, що спільного не
 * лишилось майже нічого: чотири різні радіуси, дві товщини рамки (1px і 2px),
 * дві мови кольору під файлом (`primary/10` у чотирьох місцях, `muted` у
 * майстрі), значки на 16, 20 і 40 пікселів — і одна зона (імпорт ексельки)
 * взагалі не показувала, що готова прийняти файл. Плюс підпис у трьох місцях
 * жив двома копіями: «Перетягніть або клікніть» окремо, «Відпустіть файли тут»
 * окремо, і міняти доводилось обидві.
 *
 * ДВА РОЗМІРИ, ОДНІ Й ТІ САМІ ЧАСТИНИ. `plate` — коли файл це головний вхід у
 * дію: ілюстрація, підпис, пояснення й типи стоять стовпчиком. `row` — коли
 * файл лише один зі способів (майстер прорахунку, REQ-182#p14): ті самі
 * частини, покладені в рядок. Не два компоненти й не два оформлення — одна
 * розкладка на два боки.
 *
 * ЧОМУ `role="button"` І ПРИХОВАНИЙ INPUT, А НЕ INPUT НА ВСЮ ПЛОЩУ. Прозорий
 * `<input type="file">` поверх плити виглядає простіше, і три з шести місць
 * робили саме так. Але файловий інпут ПРИЙМАЄ кидок сам: файл, відпущений
 * точно над ним, і покладеться в `input.files` (звідти `change`), і долетить
 * до нашого `onDrop` — тобто те саме додається двічі. Прихований інпут такої
 * пари не утворює.
 */
export type FileDropZoneProps = {
  /** Що робити з обраним. Приходить `FileList`, бо його дає і кидок, і діалог. */
  onFiles: (files: FileList | null) => void;
  /**
   * Кидок цілим `DataTransfer`, коли самих файлів мало.
   *
   * НАВІЩО. У «Дизайні» картинку тягнуть просто зі сторінки в браузері — там
   * у `dataTransfer.files` порожньо, а картинка лежить у `items` та в
   * `text/uri-list`/`DownloadURL`. Забери це — і залишиться тост «не вдалося
   * отримати файл» на цілком робочому жесті. Задано — має перевагу над
   * `onFiles` САМЕ для кидка; вибір із діалогу однаково йде в `onFiles`.
   */
  onDropTransfer?: (dataTransfer: DataTransfer) => void;
  /** Назва для читалок: «Обрати файл Excel», «Додати файли замовника». */
  label: string;
  /** Головний рядок у спокої. */
  title: string;
  /** Другий рядок — пояснення, кому й навіщо. */
  hint?: React.ReactNode;
  /** Головний рядок, поки файл висить над зоною. Типово — за `multiple`. */
  dropTitle?: string;
  /**
   * Напис на кнопці всередині плити. Типово — за `multiple`.
   *
   * Кнопка є ЛИШЕ в плиті: у рядку для неї немає місця, а тиснути на сам
   * рядок і так очевидно.
   */
  actionLabel?: string;
  /** Дрібні плашки праворуч (у рядку) або під підписом (у плиті). */
  tags?: string[];
  accept?: string;
  multiple?: boolean;
  size?: "plate" | "row";
  /** Показати крутилку замість ілюстрації, поки файл вантажиться. */
  busy?: boolean;
  disabled?: boolean;
  /**
   * Вставка з буфера (Ctrl+V). Є не скрізь: у «Дизайні» скріншот вставляють
   * прямо в зону, у решті місць це нікому не потрібно.
   */
  onPasteFiles?: (event: React.ClipboardEvent<HTMLDivElement>) => void;
  /** Коли зовнішня кнопка («Інший файл») має відкрити той самий діалог. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
};

export function FileDropZone({
  onFiles,
  onDropTransfer,
  label,
  title,
  hint,
  dropTitle,
  actionLabel,
  tags,
  accept,
  multiple = false,
  size = "plate",
  busy = false,
  disabled = false,
  onPasteFiles,
  inputRef,
  className,
}: FileDropZoneProps) {
  const [over, setOver] = React.useState(false);
  const ownRef = React.useRef<HTMLInputElement | null>(null);
  const ref = inputRef ?? ownRef;
  const plate = size === "plate";
  const inert = disabled || busy;
  const openPicker = () => {
    // Вимкнена зона мовчить і для миші, і для клавіатури. `pointer-events-none`
    // сам по собі закриває лише мишу: з Tab на зону однаково стає фокус, а
    // Enter відкривав би діалог вибору — там, де замовника ще не обрано.
    if (inert) return;
    ref.current?.click();
  };

  const headline = over ? (dropTitle ?? (multiple ? "Відпустіть файли тут" : "Відпустіть файл тут")) : title;

  const figure = busy ? (
    <Loader2 className={cn("animate-spin text-muted-foreground", plate ? "h-8 w-8" : "h-5 w-5")} />
  ) : (
    <UploadIllustration className={cn(plate ? "h-14 w-14" : "h-10 w-10")} />
  );

  const chips =
    tags?.length ? (
      <span
        className={cn(
          "shrink-0 gap-1.5 font-mono text-2xs text-muted-foreground",
          plate ? "flex flex-wrap justify-center" : "hidden sm:flex"
        )}
      >
        {tags.map((tag) => (
          <span key={tag} className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5">
            {tag}
          </span>
        ))}
      </span>
    ) : null;

  return (
    <div
      role="button"
      tabIndex={inert ? -1 : 0}
      aria-label={label}
      aria-disabled={inert || undefined}
      className={cn(
        "cursor-pointer rounded-xl border border-dashed transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        plate ? "flex flex-col items-center gap-2 px-4 py-6 text-center" : "flex items-center gap-3 px-3 py-2.5 text-left",
        over ? "border-primary/70 bg-primary/10" : "border-border hover:border-foreground/40 hover:bg-muted/50",
        inert && "pointer-events-none opacity-50",
        className
      )}
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openPicker();
      }}
      onPaste={onPasteFiles}
      onDragOver={(event) => {
        event.preventDefault();
        // Зупиняємо тут: під зоною бувають поверхні, які теж ловлять кидок
        // (стрічка прорахунку, панель правок). Зона вже взяла файл на себе —
        // другий обробник додав би те саме вдруге.
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={(event) => {
        // Перехід курсора на ВЛАСНУ дитину теж стріляє `dragleave`. Без цієї
        // перевірки підсвітка блимала б під рукою: увімкнулась → курсор
        // опинився над ілюстрацією → згасла.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        if (onDropTransfer) {
          onDropTransfer(event.dataTransfer);
          return;
        }
        onFiles(event.dataTransfer.files);
      }}
    >
      <span className={cn("grid shrink-0 place-items-center", over ? "text-primary" : "text-muted-foreground")}>
        {figure}
      </span>

      <span className={cn(plate ? "space-y-0.5" : "min-w-0 flex-1")}>
        <span className={cn("block text-sm font-medium", !plate && "truncate", over && "text-primary")}>
          {headline}
        </span>
        {hint ? (
          <span className={cn("block text-xs text-muted-foreground", !plate && "truncate")}>{hint}</span>
        ) : null}
      </span>

      {plate && !busy ? (
        /*
          КНОПКА ТУТ — ОЗДОБА, А НЕ КОНТРОЛ, І ЦЕ НАВМИСНО. Плита вже сама
          `role="button"`: справжня <button> усередині дала б інтерактив в
          інтерактиві — зайвий Tab-стоп, який робить рівно те саме, що й
          натиск на плиту, і читалка оголосила б два різні входи в одну дію.
          Тому це <span> у вигляді кнопки (`asChild` віддає лише оформлення) з
          `aria-hidden`: око бачить звичну кнопку, клік по ній ловить плита.

          Навіщо взагалі: «клікніть» у підписі помічають не всі, а знайомий
          прямокутник читається як вхід одразу.
        */
        <Button asChild className="mt-1" size="sm" variant="secondary">
          <span aria-hidden="true">{actionLabel ?? (multiple ? "Обрати файли" : "Обрати файл")}</span>
        </Button>
      ) : null}

      {chips}

      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          const list = event.target.files;
          // Скидаємо значення, інакше повторний вибір ТОГО САМОГО файлу не
          // дасть `change` — і другий кидок того ж прайсу нічого не зробить.
          event.target.value = "";
          onFiles(list);
        }}
      />
    </div>
  );
}
