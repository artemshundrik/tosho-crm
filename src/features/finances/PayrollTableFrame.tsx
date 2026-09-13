import * as React from "react";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Каркас таблиці «Виплати команді»: липка шапка + тіло, що їде вбік.
 *
 * ЧОМУ ДВІ ТАБЛИЦІ, А НЕ ОДНА. Від таблиці тут треба дві речі, які в одному
 * елементі несумісні:
 *
 * — шапка липне до верху ПАНЕЛІ фінансів (під смугою місяця), поки гортаєш
 *   сторінку. Sticky рахується від найближчого предка з `overflow`, тож між
 *   шапкою й панеллю не може стояти жодного скрол-контейнера;
 * — відомість ширша за панель (1000px проти ~918 на 1440), і прокручуватись
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
 * ширини з тими самими класами ширини в першому рядку.
 *
 * Для читача з екрана справжні заголовки живуть у ТІЛІ (нульової висоти), а
 * видима шапка прихована `aria-hidden` — інакше таблиця з полями вводу лишилась
 * би без заголовків колонок.
 */

export type PayrollFrameColumn = {
  key: string;
  label: string;
  width: string;
  align: string;
  /** Підпис лишається для читача з екрана, але в шапці не малюється. */
  srOnly?: boolean;
};

/** Нижче цієї ширини колонки перестають тиснутись і їдуть під прокрутку вбік. */
const TABLE_MIN_WIDTH = "min-w-[1000px]";

/**
 * Зсув липкої шапки — під смугу місяця (FinanceMonthBar: ~49px заввишки).
 *
 * На lg панель сама скрол-контейнер із падінгом p-6, і Chrome рахує `top` від
 * межі падінга; смуга там зміщена на -24px, тож лишається 24px. Нижче lg
 * прокручується документ: смуга стоїть під фіксованою шапкою застосунку, а
 * шапка таблиці — ще на 48px нижче.
 */
const STICKY_HEAD_BOX =
  "sticky top-[calc(var(--app-header-height)+3rem)] z-10 overflow-hidden bg-background lg:top-6";

const HEAD_CELL = "border-b border-border/40 bg-background";

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
 * Кут шапки. Шари всередині таблиці мусять лишатись НИЖЧЕ за смугу місяця
 * (z-20), інакше рядки малюються поверх неї: заморожена колонка 5 → липка
 * шапка 10 → смуга місяця 20.
 */
const FROZEN_PERSON_HEAD = "z-[15]";

type PayrollTableFrameProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  columns: readonly PayrollFrameColumn[];
  /** Вміст <tbody>: рядки таблиці. */
  children: React.ReactNode;
};

export function PayrollTableFrame({ columns, children, className, ...boxProps }: PayrollTableFrameProps) {
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
   */
  React.useEffect(() => {
    const box = boxRef.current;
    const head = headRef.current;
    const body = bodyRef.current;
    if (!box || !head || !body) return;
    const sync = () => {
      head.scrollLeft = body.scrollLeft;
      box.toggleAttribute("data-scrolled-x", body.scrollLeft > 0);
    };
    const forwardWheel = (event: WheelEvent) => {
      const delta = event.deltaX !== 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      if (delta !== 0) body.scrollLeft += event.deltaMode === 1 ? delta * 16 : delta;
    };
    sync();
    body.addEventListener("scroll", sync, { passive: true });
    head.addEventListener("wheel", forwardWheel, { passive: true });
    return () => {
      body.removeEventListener("scroll", sync);
      head.removeEventListener("wheel", forwardWheel);
    };
  }, []);

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
        <Table size="sm" bare className={cn("table-fixed", TABLE_MIN_WIDTH)}>
          <TableHeader>
            <TableRow>
              {/* Колонки з полями вводу вирівняні ліворуч: поле займає всю
                  ширину клітинки, тож заголовок мусить стояти над його лівим
                  краєм. Праворуч лишається тільки «До виплати» — там у
                  клітинці звичайне число, притиснуте вправо. */}
              {columns.map((column, index) => (
                <TableHead
                  key={column.key}
                  className={cn(
                    HEAD_CELL,
                    column.width,
                    column.align,
                    index === 0 && cn(FROZEN_PERSON, FROZEN_PERSON_HEAD)
                  )}
                >
                  {column.srOnly ? null : column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        </Table>
      </div>

      {/* Лише вбік: вертикальна прокрутка тут і дала б другий скрол. */}
      <div ref={bodyRef} className="overflow-x-auto overflow-y-hidden">
        <Table size="sm" bare className={cn("table-fixed", TABLE_MIN_WIDTH)}>
          {/* Заголовки для читача з екрана. Нульова висота, але ті самі класи
              ширини й бічні падінги, що й у видимій шапці, — у table-fixed
              розкладку колонок задає саме перший рядок, і в обох таблицях він
              мусить бути однаковим. */}
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={cn("relative !h-0 border-0 !py-0", column.width)}>
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
