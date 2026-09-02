/**
 * Рядки картки людини. Жили всередині `PersonProfilePage`, поки її читав лише
 * той самий файл. Тепер частину «Огляду» редагує окремий компонент, і рядок
 * потрібен обом: у режимі перегляду й у режимі редагування таблиця має бути
 * ОДНА, інакше поля з'їдуть на пів рядка й це буде видно оком.
 */

import type React from "react";

/**
 * Рядок «підпис → значення» з трьома рівнями ваги.
 *
 * ЧОМУ САМЕ ТАК. Спершу підпис був великими літерами того ж кеглю, що й
 * значення, — око не знало, куди дивитись, і рядок читався як суцільна сіра
 * смуга. Тепер ваги три: підпис дрібний і приглушений, значення на 15 px
 * напівжирним, а `hint` — уточнення просто за ним («266 днів» після дати).
 * `meta` притискається праворуч: третій за важливістю факт, який не має
 * розривати пару підпис→значення.
 */
export function Row({
  label,
  value,
  hint,
  meta,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-border/40 py-2 first:border-t-0">
      <span className="w-[8.5rem] shrink-0 text-2xs leading-5 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
        {value}
        {hint ? <span className="ml-1.5 text-2xs font-normal text-muted-foreground">{hint}</span> : null}
      </span>
      {meta ? <span className="text-2xs text-muted-foreground">{meta}</span> : null}
    </div>
  );
}

/**
 * Компактний рядок рейки. Вужчий за `Row` у змісті: у 19 rem підпис на 9.5 rem
 * не лишає значенню місця, а обрізана пошта в рейці — це рейка без сенсу.
 */
export function RailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border/40 py-1.5 last:border-b-0">
      <span className="w-[5.5rem] shrink-0 text-2xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">{value}</span>
    </div>
  );
}
