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

  /*
    КНОПКА — ОЗДОБА, А НЕ КОНТРОЛ, І ЦЕ НАВМИСНО. Зона вже сама `role="button"`:
    справжня <button> усередині дала б інтерактив в інтерактиві — зайвий
    Tab-стоп, який робить рівно те саме, що й натиск на зону, а читалка
    оголосила б два різні входи в одну дію. Тому це <span> у вигляді кнопки
    (`asChild` віддає лише оформлення) з `aria-hidden`: око бачить звичну
    кнопку, клік по ній ловить зона.

    Навіщо взагалі: «клікніть» у підписі помічають не всі, а знайомий
    прямокутник читається як вхід одразу.

    У плиті вона стоїть під підписом, у рядку — праворуч, після плашок із
    типами. На вузькому екрані ховається разом із ними: у рядок, що вже
    впритул, кнопку не втиснути.
  */
  const action = busy ? null : (
    <Button
      asChild
      className={cn(plate ? "mt-1" : "hidden shrink-0 sm:inline-flex")}
      size="sm"
      variant="secondary"
    >
      <span aria-hidden="true">{actionLabel ?? (multiple ? "Обрати файли" : "Обрати файл")}</span>
    </Button>
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
      data-file-drop-zone=""
      aria-disabled={inert || undefined}
      className={cn(
        "cursor-pointer rounded-xl border border-dashed transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        plate ? "flex flex-col items-center gap-2 px-4 py-6 text-center" : "flex items-center gap-3 px-3 py-2.5 text-left",
        over ? "border-foreground/50 bg-foreground/[0.06]" : "border-border hover:border-foreground/40 hover:bg-muted/50",
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
      <span className={cn("grid shrink-0 place-items-center", over ? "text-foreground" : "text-muted-foreground")}>
        {figure}
      </span>

      <span className={cn(plate ? "space-y-0.5" : "min-w-0 flex-1")}>
        <span className={cn("block text-sm font-medium", !plate && "truncate", over && "text-foreground")}>
          {headline}
        </span>
        {hint ? (
          <span className={cn("block text-xs text-muted-foreground", !plate && "truncate")}>{hint}</span>
        ) : null}
      </span>

      {plate ? action : null}

      {chips}

      {plate ? null : action}

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

/**
 * Накладка «сюди можна кинути» на ЦІЛУ панель.
 *
 * ЧИМ ВІДРІЗНЯЄТЬСЯ ВІД `FileDropZone`. Зона — це місце, у яке ціляться:
 * прямокутник, який видно завжди. Накладка — навпаки: у спокої її немає
 * взагалі, а панель під нею (стрічка справи, форма правки, збірник тиражів)
 * зайнята своїм вмістом. Показувати там постійну плиту нема куди, але кидок
 * поверхня приймає — і поки цього ніхто не каже, жест лишається таємним
 * знанням.
 *
 * ЩО ЦЕ ЗВЕЛО. Чотири панелі, чотири різні відповіді на кидок: непрозорий
 * шар з ілюстрацією («Обговорення»), обведення плюс смужка, ВСТАВЛЕНА В
 * ПОТІК і через це зсувала весь вміст униз (стрічка прорахунку), самий лише
 * тінт фону без жодного напису (правки в дизайн-задачі) і підсвітка дрібної
 * плити всередині, хоч кидок ловить уся секція (збірник тиражів).
 *
 * ЧОМУ ВМІСТ `sticky`, А НЕ ПРОСТО ПО ЦЕНТРУ. Стрічка справи буває на кілька
 * екранів. Центр такої панелі — це середина скролу, тобто напис міг опинитись
 * за межами видимого. `sticky` тримає його в тій частині панелі, яку людина
 * справді бачить; на короткій панелі `max-h-full` повертає звичайне
 * центрування.
 *
 * ЧОМУ ТЛО НЕПРОЗОРЕ. Напівпрозорий шар із блюром поверх щільного вмісту
 * виглядав брудно: крізь нього проступали рядки й кнопки, і накладка читалась
 * як помилка рендера, а не як стан.
 */
export function FileDropOverlay({
  active,
  title,
  hint,
  className,
}: {
  active: boolean;
  /** Головний рядок. Типово — «Відпустіть файли тут». */
  title?: string;
  /** Другий рядок: куди файл потрапить. */
  hint?: React.ReactNode;
  /** Тло під накладкою: типово `bg-card`, на сторінковій поверхні — `bg-background`. */
  className?: string;
}) {
  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 z-20 rounded-[inherit] bg-card", className)}
    >
      <div className="sticky top-0 flex h-dvh max-h-full items-center justify-center p-2">
        <div className="absolute inset-2 rounded-xl border-2 border-dashed border-foreground/40 bg-foreground/[0.05]" />
        <div className="relative flex flex-col items-center gap-1.5 text-center">
          <UploadIllustration className="h-12 w-12 text-foreground" />
          <span className="text-sm font-medium text-foreground">{title ?? "Відпустіть файли тут"}</span>
          {hint ? <span className="max-w-[34ch] text-xs text-muted-foreground">{hint}</span> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Обробники кидка для цілої панелі — пара до `FileDropOverlay`.
 *
 * ЧОМУ ХУК, А НЕ ЧОТИРИ КОПІЇ. Панельний кидок має три пастки, і кожне з
 * чотирьох місць наступало щонайменше на одну:
 *
 * 1. `dragleave` стріляє й тоді, коли курсор просто перейшов на ВЛАСНУ дитину
 *    панелі. З наївним прапорцем підсвітка блимає на кожному русі миші —
 *    стрічка справи через це рахувала входи лічильником, збірник тиражів звіряв
 *    `relatedTarget`, а форма правки не робила нічого й гасла посеред жесту.
 * 2. Перетягнути можна не лише файл: текст, посилання, картку канбану. Без
 *    перевірки `types` панель спалахувала на будь-якому жесті.
 * 3. Усередині панелі буває `FileDropZone`, яка забирає кидок собі. Вона
 *    зупиняє спливання, тож панель просто не дізнається, що курсор пішов у
 *    неї, — і два індикатори горіли б одночасно. Звідси перевірка на маркер
 *    `data-file-drop-zone`.
 */
export function useFileDropPanel({
  onFiles,
  disabled = false,
}: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
}) {
  const [over, setOver] = React.useState(false);
  const carriesFiles = (event: React.DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  React.useEffect(() => {
    if (disabled) setOver(false);
  }, [disabled]);

  return {
    over: over && !disabled,
    dropHandlers: {
      onDragOver: (event: React.DragEvent<HTMLElement>) => {
        if (disabled || !carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      },
      onDragLeave: (event: React.DragEvent<HTMLElement>) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) {
          // Курсор лишився в панелі. Гасимо лише коли він зайшов у вкладену
          // зону: далі кидок веде вона й показує власний стан.
          if (next instanceof Element && next.closest("[data-file-drop-zone]")) setOver(false);
          return;
        }
        setOver(false);
      },
      onDrop: (event: React.DragEvent<HTMLElement>) => {
        if (disabled || !carriesFiles(event)) return;
        event.preventDefault();
        setOver(false);
        onFiles(event.dataTransfer.files);
      },
    },
  };
}
