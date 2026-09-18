import * as React from "react";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Каркас таблиці «Виплати команді»: липка шапка + тіло, що їде вбік,
 * притиснуті «Співробітник» ліворуч і «Підсумок» праворуч.
 *
 * ЧОМУ ДВІ ТАБЛИЦІ, А НЕ ОДНА. Від таблиці тут треба дві речі, які в одному
 * елементі несумісні:
 *
 * — шапка липне до верху ПАНЕЛІ фінансів (під смугою місяця), поки гортаєш
 *   сторінку. Sticky рахується від найближчого предка з `overflow`, тож між
 *   шапкою й панеллю не може стояти жодного скрол-контейнера;
 * — відомість ширша за панель (1290px проти ~950 на 1440), і прокручуватись
 *   убік мусить сама таблиця, а не панель: інакше разом із нею їде смуга місяця.
 *   А прокрутка вбік — це `overflow-x`, і за специфікацією він робить елемент
 *   скрол-контейнером по ОБОХ осях.
 *
 * До REQ-272 бокс таблиці мав `overflow-auto` + `max-h` і сам був липким. Це
 * давало подвійну прокрутку (спершу рядки в боксі, потім панель), а липка
 * шапка `Table stickyHeader` брала відступ сторінки (57px) від верху БОКСУ і
 * висіла між першим і другим рядком.
 *
 * Тепер: шапка — окрема таблиця в липкому боксі без вертикальної прокрутки;
 * тіло — друга таблиця в боксі, що прокручується лише вбік. Зсув убік тіло
 * передає шапці. Колонки збігаються, бо обидві таблиці `table-fixed` однакової
 * ширини з тим самим `<colgroup>`.
 *
 * ШИРИНИ — В `<colgroup>`, А НЕ В КЛІТИНКАХ ПЕРШОГО РЯДКА (REQ-284). Над
 * колонками тепер стоїть рядок груп («Нараховано», «Утримано», …) з
 * `colSpan`, а `table-fixed` бере ширини з першого рядка: клітинка на кілька
 * колонок розмазала б ширину порівну, і «АЗП» з датою вийшла б вужчою за
 * «Ставку». `<col>` задає ширину кожній колонці напряму, незалежно від рядків.
 *
 * Усі колонки, крім «Співробітника», в пікселях. Причина — притиснутий підсумок:
 * його клітинки `sticky` з `right: N`, де N — сума ширин колонок правіше, і ці
 * суми мусять бути сталими. Зайву ширину на широкій панелі забирає єдина
 * колонка без ширини — «Співробітник» (у fixed-розкладці саме так: колонки з
 * шириною тримають своє, решта ділить залишок). На мінімальній ширині вона
 * 142px — рівно стільки, скільки просив Артем (було 15% ≈ 188).
 *
 * Для читача з екрана справжні заголовки живуть у ТІЛІ (нульової висоти), а
 * видима шапка прихована `aria-hidden` — інакше таблиця з полями вводу лишилась
 * би без заголовків колонок.
 */

export type PayrollFrameColumn = {
  key: string;
  /** Повна назва — для читача з екрана й підписів полів. */
  label: string;
  /** Видима шапка у два рядки: великий підпис і дрібний уточнювальний. Без `short` — `label`. */
  short?: string;
  sub?: string;
  /** Ширина колонки (`w-[96px]`). Порожній рядок — колонка без ширини, забирає залишок. */
  width: string;
  align: string;
  /** Підпис лишається для читача з екрана, але в шапці не малюється. */
  srOnly?: boolean;
  /** Притиснута до краю: ліва — «Співробітник», праві — підсумок. */
  frozen?: "left" | "right";
  /** Для правих притиснутих: зсув від правого краю (`right-[194px]`) — сума ширин колонок правіше. */
  offset?: string;
  /** Перша права притиснута: малює роздільник, коли під неї заїхав вміст. */
  edge?: boolean;
};

/** Рядок груп над колонками. Групи йдуть підряд за колонками після «Співробітника». */
export type PayrollFrameGroup = {
  key: string;
  label: string;
  /** Скільки колонок накриває. */
  span: number;
  /** Група притиснута праворуч разом зі своїми колонками. */
  frozen?: "right";
};

/**
 * Нижче цієї ширини колонки перестають тиснутись і їдуть під прокрутку вбік.
 * 142 («Співробітник») + 856 (вісім колонок середини) + 292 (підсумок).
 */
const TABLE_MIN_WIDTH = "min-w-[1290px]";

/**
 * Зсув липкої шапки — рівно під смугу місяця, на її висоту
 * (--finance-bar-height, index.css). Сталим числом тут бути не може: смуга
 * росте з дрібним контролом, а він різний до md і від md.
 *
 * На lg панель сама скрол-контейнер із падінгом p-6, і Chrome рахує `top` від
 * межі падінга; смуга там зміщена на -24px, тож від висоти смуги віднімаємо ті
 * самі 24px. Нижче lg прокручується документ: смуга стоїть під фіксованою
 * шапкою застосунку, а шапка таблиці — ще на висоту смуги нижче.
 */
const STICKY_HEAD_BOX =
  "sticky top-[calc(var(--app-header-height)_+_var(--finance-bar-height))] z-10 overflow-hidden bg-background " +
  "lg:top-[calc(var(--finance-bar-height)_-_1.5rem)]";

/**
 * `whitespace-nowrap` — бо колонки підсумку підігнані впритул до підписів:
 * «ДО ВИПЛАТИ» на пів пікселя ширший за свою клітинку й без цього ламався на
 * два рядки. Пів пікселя заходить у відступ клітинки, оком цього не видно.
 */
const HEAD_CELL = "whitespace-nowrap border-b border-border/40 bg-background";

/**
 * Тринадцять колонок замість дев'яти: відступ у клітинці 8px замість 16
 * (`size="sm"` дає px-4), інакше відомість не вкладається й у 1320.
 * `!` — бо селектор розміру таблиці `[&_td]:px-4` специфічніший за клас
 * на самій клітинці.
 */
const DENSE_CELLS = "[&_th]:!px-2 [&_td]:!px-2";

/** Ліва притиснута: відступ як у звичайної клітинки ліворуч, щоб аватар не липнув до рамки. */
const FROZEN_LEFT_PAD = "!pl-3";

/**
 * Заморожена колонка «Співробітник».
 *
 * `left` рахується від боксу, що прокручується вбік: для тіла це бокс тіла, для
 * шапки — її власний бокс, у якому зсув виставляє синхронізація.
 *
 * Фон суцільний — під колонку заїжджають рядки. Через це підсвітку рядка
 * малюємо псевдоелементом ПОВЕРХ фону, інакше край не підсвічувався б разом
 * з рештою рядка.
 */
export const FROZEN_PERSON =
  "sticky left-0 z-[5] bg-background " +
  FROZEN_LEFT_PAD +
  " " +
  // Дівайдер по правому краю: щоб обрізана колонка читалась як «вміст заїхав
  // під межу», а не як поламаний підпис. З'являється ЛИШЕ коли під колонку
  // справді щось заїхало — доти ділити нема чого. Стан вмикає data-scrolled-x
  // на зовнішньому боксі.
  //
  // Малюємо псевдоелементом, а НЕ через тінь: Tailwind v4 читає слеш
  // усередині hsl(var(--border)/0.35) як модифікатор прозорості, і правило
  // тихо зникає — перевірено, у computed style лишався прозорий box-shadow.
  "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border " +
  "after:opacity-0 after:transition-opacity after:duration-base " +
  "group-data-[scrolled-x]/box:after:opacity-100 " +
  "before:pointer-events-none before:absolute before:inset-0 group-hover/row:before:bg-muted/20";

/**
 * Притиснутий підсумок («До виплати», «Загальна ЗП», нотатка, статус) —
 * дзеркало FROZEN_PERSON: суцільний фон, підсвітка рядка псевдоелементом,
 * а зсув `right-*` кожна колонка додає свій.
 */
const FROZEN_SUMMARY =
  "sticky z-[5] bg-background " +
  "before:pointer-events-none before:absolute before:inset-0 group-hover/row:before:bg-muted/20";

/**
 * Роздільник по лівому краю першої притиснутої колонки підсумку. Видно, лише
 * поки праворуч від вікна ще є вміст (data-more-right): докрутив до кінця —
 * межа зникає, бо ділити більше нема чого.
 */
const FROZEN_SUMMARY_EDGE =
  "after:pointer-events-none after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-border " +
  "after:opacity-0 after:transition-opacity after:duration-base " +
  "group-data-[more-right]/box:after:opacity-100";

/**
 * Кут шапки. Шари всередині таблиці мусять лишатись НИЖЧЕ за смугу місяця
 * (z-20), інакше рядки малюються поверх неї: заморожена колонка 5 → липка
 * шапка 10 → смуга місяця 20.
 */
const FROZEN_HEAD = "z-[15]";

/** Класи клітинки ТІЛА для колонки: притиснуті отримують sticky, решта — нічого. */
export function frameCellClass(column: PayrollFrameColumn): string | undefined {
  if (column.frozen === "left") return FROZEN_PERSON;
  if (column.frozen === "right") {
    return cn(FROZEN_SUMMARY, column.offset, column.edge && FROZEN_SUMMARY_EDGE);
  }
  return undefined;
}

const GROUP_CELL =
  "!h-[30px] border-b border-border/40 bg-background text-center text-3xs font-semibold uppercase " +
  "tracking-caps text-muted-foreground/70 whitespace-nowrap";

type PayrollTableFrameProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  columns: readonly PayrollFrameColumn[];
  /** Рядок груп над колонками. Без нього шапка — один рядок. */
  groups?: readonly PayrollFrameGroup[];
  /** Вміст <tbody>: рядки таблиці. */
  children: React.ReactNode;
};

export function PayrollTableFrame({ columns, groups, children, className, ...boxProps }: PayrollTableFrameProps) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const headRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  /**
   * Прокрутка вбік: тіло веде, шапка слідує.
   *
   * Пишемо прямо в DOM, а не в стан: прокрутка стріляє десятками подій на жест,
   * і кожна перемальовувала б таблицю з вісімнадцятьма рядками полів вводу.
   *
   * Шапка сама не прокручується (`overflow-hidden`), тож колесо вбік над нею
   * переказуємо тілу. Двосторонньої синхронізації свідомо немає: при інерційній
   * прокрутці дві сторони перетягували б позицію одна в одної й смикались.
   *
   * Два прапорці на боксі — для роздільників притиснутих колонок: ліва межа
   * з'являється, щойно щось заїхало під «Співробітника», права — поки праворуч
   * ще є що докручувати. Ширина вікна теж їх міняє, тому ще й ResizeObserver.
   */
  React.useEffect(() => {
    const box = boxRef.current;
    const head = headRef.current;
    const body = bodyRef.current;
    if (!box || !head || !body) return;
    const sync = () => {
      head.scrollLeft = body.scrollLeft;
      box.toggleAttribute("data-scrolled-x", body.scrollLeft > 0);
      box.toggleAttribute("data-more-right", body.scrollLeft + body.clientWidth < body.scrollWidth - 1);
    };
    const forwardWheel = (event: WheelEvent) => {
      const delta = event.deltaX !== 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      if (delta !== 0) body.scrollLeft += event.deltaMode === 1 ? delta * 16 : delta;
    };
    sync();
    body.addEventListener("scroll", sync, { passive: true });
    head.addEventListener("wheel", forwardWheel, { passive: true });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    resize?.observe(body);
    return () => {
      body.removeEventListener("scroll", sync);
      head.removeEventListener("wheel", forwardWheel);
      resize?.disconnect();
    };
  }, []);

  const colgroup = (
    <colgroup>
      {columns.map((column) => (
        <col key={column.key} className={column.width || undefined} />
      ))}
    </colgroup>
  );

  const personColumn = columns[0];
  // Групи накривають усе після «Співробітника»; він у рядку груп стоїть на два рядки.
  const headColumns = groups ? columns.slice(1) : columns;

  const headCell = (column: PayrollFrameColumn, extra?: string) => (
    <TableHead
      key={column.key}
      className={cn(
        HEAD_CELL,
        column.align,
        column.frozen === "left" && cn(FROZEN_PERSON, FROZEN_HEAD),
        column.frozen === "right" && cn(FROZEN_SUMMARY, column.offset, column.edge && FROZEN_SUMMARY_EDGE, FROZEN_HEAD),
        extra
      )}
      rowSpan={groups && column.frozen === "left" ? 2 : undefined}
    >
      {column.srOnly ? null : column.sub ? (
        <>
          <span className="block leading-tight">{column.short ?? column.label}</span>
          <span className="block text-3xs font-medium normal-case leading-tight tracking-normal text-muted-foreground/70">
            {column.sub}
          </span>
        </>
      ) : (
        (column.short ?? column.label)
      )}
    </TableHead>
  );

  return (
    // `overflow-clip`, а НЕ hidden: clip обрізає вміст по заокругленій рамці, але
    // не робить бокс скрол-контейнером — тож липка шапка всередині рахується від
    // панелі, а не від нього.
    <div
      ref={boxRef}
      className={cn("group/box overflow-clip rounded-xl border border-border/60", className)}
      {...boxProps}
    >
      <div ref={headRef} className={STICKY_HEAD_BOX} aria-hidden="true">
        <Table size="sm" bare className={cn("table-fixed", TABLE_MIN_WIDTH, DENSE_CELLS)}>
          {colgroup}
          <TableHeader>
            {groups ? (
              <TableRow>
                {headCell(personColumn)}
                {groups.map((group, index) => (
                  <TableHead
                    key={group.key}
                    colSpan={group.span}
                    className={cn(
                      GROUP_CELL,
                      index > 0 && "border-l border-border/40",
                      group.frozen === "right" && cn(FROZEN_SUMMARY, "right-0", FROZEN_SUMMARY_EDGE, FROZEN_HEAD)
                    )}
                  >
                    {group.label}
                  </TableHead>
                ))}
              </TableRow>
            ) : null}
            <TableRow>
              {/* Колонки з полями вводу вирівняні ліворуч: поле займає всю
                  ширину клітинки, тож заголовок мусить стояти над його лівим
                  краєм. Праворуч лишаються підсумки — там у клітинці звичайне
                  число, притиснуте вправо. Роздільник між групами — на першій
                  колонці кожної, як і в рядку груп. */}
              {headColumns.map((column, index) =>
                headCell(
                  column,
                  groups && index > 0 && isGroupStart(groups, index) ? "border-l border-border/40" : undefined
                )
              )}
            </TableRow>
          </TableHeader>
        </Table>
      </div>

      {/* Лише вбік: вертикальна прокрутка тут і дала б другий скрол. */}
      <div ref={bodyRef} className="overflow-x-auto overflow-y-hidden">
        <Table size="sm" bare className={cn("table-fixed", TABLE_MIN_WIDTH, DENSE_CELLS)}>
          {colgroup}
          {/* Заголовки для читача з екрана. Нульова висота; ширини колонок
              задає той самий <colgroup>, що й у видимій шапці. */}
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className="relative !h-0 border-0 !py-0">
                  <span className="sr-only">{column.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <TableBody>{children}</TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Чи колонка з індексом `index` (серед колонок після «Співробітника») відкриває нову групу. */
function isGroupStart(groups: readonly PayrollFrameGroup[], index: number): boolean {
  let start = 0;
  for (const group of groups) {
    if (start === index) return true;
    start += group.span;
  }
  return false;
}
